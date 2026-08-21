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
}): string =>
  [
    `Square photograph for the "${opts.nome}" category cover of a Brazilian business.`,
    `The business: ${opts.oQueFaz}.`,
    opts.tom.trim() === '' ? null : `Tone: ${opts.tom}.`,
    'A single clear subject centred in the frame, with generous empty space around it — the cover is masked into a circle, and anything touching the edge is cut off.',
    `Natural light, shallow depth of field, warm and inviting, consistent with a palette built around ${opts.cor}.`,
    'Absolutely no text, no letters, no numbers, no signage, no logos, no watermark.',
  ]
    .filter((l): l is string => l !== null)
    .join(' ');

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
    const nomes = pedido.colecoes;
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
        }),
      );
      console.log(`  → baixe para: colecoes/originais/${arquivoDaColecao(nome)}`);
    }
    console.log('');
    return;
  }

  // ── a decisão do Orbis, gravada ───────────────────────────────────────────
  const iDefinir = process.argv.indexOf('--definir');
  if (iDefinir >= 0) {
    const nomes = process.argv.slice(iDefinir + 1).filter((a) => !a.startsWith('--'));
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
    for (const n of nomes) console.log(`    ${n}  →  colecoes/originais/${arquivoDaColecao(n)}`);
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
    const caminho = join(originais, arquivoDaColecao(nome));
    if (existsSync(caminho)) arquivos[nome] = caminho;
    else faltando.push(`${nome} (${arquivoDaColecao(nome)})`);
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
