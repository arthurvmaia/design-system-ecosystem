/**
 * As CAPAS DE COLEÇÃO da marca: as categorias que a vitrine mostra.
 *
 * Uso:
 *   pnpm marca:colecoes <job_id> --prompts      # os prompts, um por coleção
 *   pnpm marca:colecoes <job_id> --montar       # recorta as geradas no formato
 *
 * ## Por que dois passos, e não um
 *
 * O mesmo desenho do símbolo: quem fala com o provedor é o agente, pelo MCP, e
 * quem calcula é o comando. `--prompts` monta o texto EXATO a partir do
 * briefing e o imprime; o agente gera, empenha e baixa; `--montar` recorta o
 * que chegou e grava as peças.
 *
 * Separar é o que permite recortar de novo sem pagar de novo: trocar o formato
 * de redondo para quadrado é rodar `--montar` outra vez sobre os mesmos pixels.
 *
 * ## Quando o Orbis decide
 *
 * Pedido sem coleções declaradas não é pedido sem coleções: é o cliente dizendo
 * "escolha por mim". O comando escolhe a partir do que a marca FAZ, escreve os
 * nomes no resultado e o registro fica — a mesma regra da cor, que pode ser
 * escolhida pelo Orbis e nunca em silêncio.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { recortarCapasDeColecao } from '@ds/creative';
import {
  COLECOES_QUANDO_O_ORBIS_DECIDE,
  type FormatoDaColecao,
  PedidoDeMarca,
  ehJobId,
  marcaDir,
  marcaPedidoPath,
} from '@ds/shared';
import { chromium } from 'playwright';
import { executadoDireto } from './executado-direto.js';

const morrer: (msg: string) => never = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

/** Onde as capas moram, dentro da pasta do job. */
export const pastaDasColecoes = (dir: string): string => join(dir, 'colecoes');

/** O nome vira arquivo sem acento, espaço nem barra: ele é caminho de disco. */
export const arquivoDaColecao = (nome: string): string =>
  `${nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.png`;

/** O nome sem extensão: a parte que identifica a coleção em qualquer arquivo. */
export const slugDaColecao = (nome: string): string => arquivoDaColecao(nome).replace(/\.png$/, '');

/**
 * O ORIGINAL baixado, seja qual for a extensão que o provedor mandou.
 *
 * A saída é sempre `.png` porque a máscara redonda precisa de alfa; a ENTRADA
 * não é nossa. Medido no primeiro lote: pedi 2k e o provedor devolveu um JPEG
 * de 1024. Procurar só por `.png` fazia o comando dizer "faltam as imagens
 * geradas" com as quatro imagens em disco, ao lado — e a saída seria gerar de
 * novo o que já estava pago.
 */
export const acharOriginalDaColecao = (dir: string, nome: string): string | null => {
  const slug = slugDaColecao(nome);
  for (const ext of ['png', 'jpg', 'jpeg', 'webp', 'avif']) {
    const caminho = join(dir, `${slug}.${ext}`);
    if (existsSync(caminho)) return caminho;
  }
  return null;
};

/**
 * O PROMPT de uma capa, montado por regra a partir do briefing.
 *
 * Ele é montado e não escrito à mão pela mesma razão do prompt do símbolo: é
 * ele que fica gravado no resultado, e é o que torna a capa reproduzível.
 * Reescrever transforma "tentar de novo" em "começar de novo".
 *
 * Três exigências não são gosto:
 *
 * - **Quadrada.** O formato final sai por máscara, e uma imagem que já nasce no
 *   enquadramento certo perde menos no recorte central.
 * - **Sem texto.** Modelo erra letra, e o nome da coleção é a grafia do
 *   cliente. Ele entra por composição, onde a régua o mede.
 * - **Assunto ao centro, com respiro.** A máscara redonda come os cantos: um
 *   assunto encostado na borda perde a cabeça no círculo.
 */
export const promptDaCapa = (opts: {
  readonly nome: string;
  readonly oQueFaz: string;
  readonly tom: string;
  readonly cor: string;
  readonly formato: FormatoDaColecao;
}): string => {
  /**
   * O aviso da borda descreve a MÁSCARA que vai ser aplicada, e não um círculo
   * sempre.
   *
   * Ele dizia "masked into a circle" em todo prompt, inclusive nos quadrados —
   * e o prompt é o que fica gravado no resultado e torna a capa reproduzível.
   * Um prompt que descreve uma máscara que não vai acontecer pede ao modelo um
   * enquadramento mais apertado do que o necessário, e mente para quem o ler
   * depois.
   */
  const daBorda =
    opts.formato === 'redonda'
      ? 'the cover is masked into a circle, so anything touching the edge is cut off'
      : opts.formato === 'arredondada'
        ? 'the cover is masked into a rounded square, so the corners are trimmed'
        : 'the cover is cropped square from the centre, so the sides may be trimmed';
  return [
    `Square photograph for the "${opts.nome}" category cover of a Brazilian business.`,
    `The business: ${opts.oQueFaz}.`,
    /**
     * O ASSUNTO, dito por extenso.
     *
     * Sem esta frase o prompt só dizia que a foto era "para a capa da categoria
     * X" — metadado, não assunto: em lugar nenhum o modelo era mandado
     * RETRATAR a categoria. Medido no primeiro lote do Sorriso Vivo: três das
     * quatro acertaram porque a palavra sozinha já sugere a cena
     * ("Odontopediatria" traz a criança na cadeira), e "Estética" voltou uma
     * pessoa sentada a uma mesa, sem nenhuma pista do que a clínica faz. O
     * acerto era da palavra, não do prompt.
     */
    `The subject of the photograph IS the category: show a scene that a customer would immediately recognise as "${opts.nome}" at this kind of business. A generic portrait of a person does not qualify — the activity, the tool or the result has to be visible in the frame.`,
    opts.tom.trim() === '' ? null : `Tone: ${opts.tom}.`,
    `A single clear subject centred in the frame, with generous empty space around it — ${daBorda}.`,
    `Natural light, shallow depth of field, warm and inviting, consistent with a palette built around ${opts.cor}.`,
    'Absolutely no text, no letters, no numbers, no signage, no logos, no watermark.',
  ]
    .filter((l): l is string => l !== null)
    .join(' ');
};

/**
 * As coleções que o Orbis escolhe quando o cliente não escolheu.
 *
 * Ele NÃO adivinha o nicho a partir de uma tabela: quem sabe o que a marca faz
 * é o briefing, e é ele que o agente lê para nomear. O que este comando garante
 * é o CONTRATO — quantas, e que a decisão fique escrita.
 */
export const quantasOOrbisEscolhe = (): number => COLECOES_QUANDO_O_ORBIS_DECIDE;

const principal = async (): Promise<void> => {
  const jobId = process.argv[2];
  if (jobId === undefined || !ehJobId(jobId)) {
    morrer('Uso: pnpm marca:colecoes <job_id> --prompts | --montar');
  }
  const dir = marcaDir(jobId as string);
  const arquivoDoPedido = marcaPedidoPath(jobId as string);
  if (!existsSync(arquivoDoPedido)) morrer(`Não achei o pedido em ${arquivoDoPedido}.`);
  const pedido = PedidoDeMarca.parse(JSON.parse(readFileSync(arquivoDoPedido, 'utf8')));

  const resultado = JSON.parse(readFileSync(join(dir, 'resultado.json'), 'utf8')) as {
    cor: { hex: string };
    colecoes?: { nomes: string[]; formato: FormatoDaColecao; decididoPor: 'cliente' | 'orbis' };
  };

  const pasta = pastaDasColecoes(dir);

  // ── os prompts ────────────────────────────────────────────────────────────
  if (process.argv.includes('--prompts')) {
    /**
     * A DECISÃO vence o pedido.
     *
     * O pedido diz o que o cliente escreveu; o resultado diz o que ficou
     * decidido — inclusive quando fui eu que escolhi. Ler só o pedido fazia o
     * comando pedir para decidir de novo uma coisa que já estava decidida e
     * gravada, e a próxima decisão poderia sair diferente da que a apresentação
     * já mostra.
     */
    const nomes = resultado.colecoes?.nomes ?? pedido.colecoes;
    if (nomes.length === 0) {
      console.log('');
      console.log('  Este pedido NÃO declarou coleções: o cliente pediu que o Orbis escolha.');
      console.log(`  Escolha ${quantasOOrbisEscolhe()} categorias a partir do que a marca faz:`);
      console.log('');
      console.log(`    ${pedido.oQueFaz}`);
      console.log('');
      console.log('  Depois grave a decisão e rode de novo:');
      console.log(
        `    pnpm marca:colecoes ${jobId} --definir "Nome 1" "Nome 2" ... [--formato redonda]`,
      );
      console.log('');
      return;
    }
    console.log('');
    console.log(`  ${nomes.length} capa(s) de coleção. Uma geração cada, quadrada.`);
    for (const nome of nomes) {
      console.log('');
      console.log(`  ── ${nome} ${'─'.repeat(Math.max(0, 60 - nome.length))}`);
      console.log(
        promptDaCapa({
          nome,
          oQueFaz: pedido.oQueFaz,
          tom: pedido.tom,
          cor: resultado.cor.hex,
          // O formato decidido, e não um padrão: é ele que a máscara vai aplicar.
          formato: resultado.colecoes?.formato ?? pedido.formatoDasColecoes ?? 'redonda',
        }),
      );
      console.log(
        `  → baixe para: colecoes/originais/${slugDaColecao(nome)}.<a extensão que vier>`,
      );
    }
    console.log('');
    return;
  }

  // ── a decisão do Orbis, gravada ───────────────────────────────────────────
  const iDefinir = process.argv.indexOf('--definir');
  if (iDefinir >= 0) {
    /**
     * Os nomes param na primeira bandeira, e não filtram as que vierem depois.
     *
     * Filtrar só o que começa com `--` deixava passar o VALOR da bandeira
     * seguinte: `--definir A B --formato quadrada` virava cinco coleções, sendo
     * a quinta chamada "quadrada". O erro só apareceu porque o comando imprime
     * o que gravou — se ele fechasse calado, a marca teria uma capa a mais com
     * o nome de um argumento.
     */
    const apos = process.argv.slice(iDefinir + 1);
    const ateABandeira = apos.findIndex((a) => a.startsWith('--'));
    const nomes = (ateABandeira === -1 ? apos : apos.slice(0, ateABandeira)).filter(
      (a) => a.trim() !== '',
    );
    if (nomes.length === 0) morrer('Passe os nomes: --definir "Nome 1" "Nome 2" ...');
    const iFormato = process.argv.indexOf('--formato');
    const formato = (iFormato >= 0 ? process.argv[iFormato + 1] : undefined) ?? 'redonda';
    const arquivo = join(dir, 'resultado.json');
    const atual = JSON.parse(readFileSync(arquivo, 'utf8')) as Record<string, unknown>;
    atual.colecoes = {
      nomes,
      formato,
      // Quem decidiu fica escrito, como na cor: escolher pelo cliente é
      // legítimo, escolher em silêncio não é.
      decididoPor: pedido.colecoes.length > 0 ? 'cliente' : 'orbis',
    };
    writeFileSync(arquivo, JSON.stringify(atual, null, 2), 'utf8');
    console.log(`\n  ${nomes.length} coleção(ões) gravadas, formato "${formato}":`);
    for (const n of nomes) console.log(`    ${n}  →  colecoes/originais/${slugDaColecao(n)}.<ext>`);
    console.log('');
    return;
  }

  // ── o recorte ─────────────────────────────────────────────────────────────
  if (!process.argv.includes('--montar')) {
    morrer('Uso: pnpm marca:colecoes <job_id> --prompts | --definir ... | --montar');
  }

  const decisao = resultado.colecoes;
  if (decisao === undefined || decisao.nomes.length === 0) {
    morrer(
      [
        'Este job ainda não tem coleções decididas.',
        `Rode antes: pnpm marca:colecoes ${jobId} --prompts`,
      ].join('\n  '),
    );
  }

  const originais = join(pasta, 'originais');
  const arquivos: Record<string, string> = {};
  const faltando: string[] = [];
  for (const nome of decisao.nomes) {
    const caminho = acharOriginalDaColecao(originais, nome);
    if (caminho !== null) arquivos[nome] = caminho;
    else faltando.push(`${nome} (${slugDaColecao(nome)}.*)`);
  }
  if (faltando.length > 0) {
    morrer(
      [
        `Faltam as imagens geradas de: ${faltando.join(', ')}.`,
        `Elas vão em ${originais}.`,
        'Recortar não gasta crédito; gerar gasta, e é o passo que ainda não aconteceu.',
      ].join('\n  '),
    );
  }

  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  try {
    const capas = await recortarCapasDeColecao(navegador, {
      arquivos,
      formato: decisao.formato,
    });
    mkdirSync(pasta, { recursive: true });
    console.log('');
    for (const [nome, bytes] of Object.entries(capas)) {
      const destino = join(pasta, arquivoDaColecao(nome));
      writeFileSync(destino, bytes);
      console.log(`  ${nome.padEnd(24)} → ${arquivoDaColecao(nome)}  (${decisao.formato})`);
    }
    console.log('');
    console.log('  O recorte é geometria: trocar de formato e rodar de novo não gasta crédito.');
    console.log('');
  } finally {
    await navegador.close();
  }
};

if (executadoDireto(import.meta.url)) void principal();
