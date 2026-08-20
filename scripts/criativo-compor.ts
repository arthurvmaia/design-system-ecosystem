/**
 * Compõe UMA variação da peça, mede, confere e grava.
 *
 * Uso:
 *   pnpm criativo:compor <job_id> <n> --fundo <arquivo>
 *
 * O `<n>` é o número da variação (1, 2, …). O `--fundo` é o pixel que veio do
 * provedor. Quando o pedido é de UPLOAD, o fundo é o arquivo do cliente e o
 * `--fundo` é recusado se apontar para outro: upload vence geração, e trocar o
 * material dele em silêncio é o contrário do que ele pediu.
 *
 * ## Por que isto é um comando
 *
 * Porque é a parte DETERMINÍSTICA da produção, e ela não pode depender de quem
 * está processando lembrar de fazê-la. Aqui acontecem, na ordem: a composição
 * na dimensão exata, a leitura do texto E DA GEOMETRIA que o navegador
 * entregou, a conferência pelas regras C1..C11 e a gravação da folha junto da
 * peça.
 *
 * O que este comando NÃO faz é gerar imagem. O pixel entra por parâmetro,
 * porque quem fala com o provedor é o agente — e porque separar as duas coisas
 * é o que permite recompor uma peça sem pagar de novo.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { ArquivoDoRazao, comporPeca, coresDerivadas, cssDaFonte, lerRazao } from '@ds/creative';
import {
  PedidoCriativo,
  ResultadoCriativo,
  conferirVariacaoCriativa,
  criativoPedidoPath,
  criativosDir,
  ehJobId,
  rotuloDaPeca,
} from '@ds/shared';
import { chromium } from 'playwright';
import { executadoDireto } from './executado-direto.js';

const USO = 'Uso: pnpm criativo:compor <job_id> <n> [--fundo <arquivo>]';

/**
 * Anotação no LADO ESQUERDO de propósito.
 *
 * O TypeScript só usa uma função que nunca retorna para estreitar o tipo do
 * que vem DEPOIS dela quando a anotação está na variável, não no valor. Com
 * `const morrer = (msg: string): never =>`, a chamada continua sendo só uma
 * chamada: tudo o que vem depois segue "possibly undefined", que é o oposto do
 * que este atalho existe para dizer.
 */
const morrer: (msg: string) => never = (msg) => {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
};

const sha = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 16);

const principal = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const jobId = args[0];
  const n = Number(args[1]);
  const iFundo = args.indexOf('--fundo');
  const fundoArg = iFundo >= 0 ? args[iFundo + 1] : undefined;

  if (jobId === undefined || !ehJobId(jobId)) morrer(`Id de job inválido.\n\n${USO}`);
  if (!Number.isInteger(n) || n < 1) morrer(`Número de variação inválido.\n\n${USO}`);

  const dir = criativosDir(jobId as string);
  const arquivoDoPedido = criativoPedidoPath(jobId as string);
  if (!existsSync(arquivoDoPedido)) morrer(`Não achei o pedido em ${arquivoDoPedido}.`);

  const lido = PedidoCriativo.safeParse(JSON.parse(readFileSync(arquivoDoPedido, 'utf8')));
  if (!lido.success) morrer(`O pedido não passa no contrato: ${lido.error.issues[0]?.message}`);
  const pedido = lido.data;

  if (pedido.corPrincipal === null) {
    morrer(
      'Este pedido não traz a cor principal da marca, e eu não escolho cor por ninguém: a peça sairia com uma cor inventada. Peça um envio novo pela tela, que hoje manda a cor.',
    );
  }

  /** Um caminho do pedido ou da linha de comando, resolvido contra a pasta do job. */
  const resolverNoJob = (caminho: string): string =>
    isAbsolute(caminho) ? resolve(caminho) : resolve(join(dir, caminho));

  // O fundo: o do upload quando o pedido é de upload; senão, o que veio no
  // parâmetro. Peça sem imagem nenhuma continua possível — a faixa é o fundo.
  const doUpload =
    pedido.imagem.origem === 'upload' && pedido.imagem.caminhoDoUpload !== null
      ? resolverNoJob(pedido.imagem.caminhoDoUpload)
      : null;
  const doParametro = fundoArg === undefined ? null : resolverNoJob(fundoArg);

  /**
   * `--fundo` NÃO passa por cima do arquivo do cliente.
   *
   * Enquanto o parâmetro vencia, um `--fundo` apontando para outro arquivo
   * trocava o material do cliente e a régua não via: `uploadPreservado`
   * perguntava se ALGUM fundo existia, não se era o dele. C5 ficava verde
   * exatamente no caso que ela existe para pegar, e C7 e C8 passavam junto,
   * porque `houvePixelGerado` continuava falso.
   *
   * Recusar é o lado certo. "Upload vence geração" é a regra que organiza este
   * contrato inteiro, e uma peça derivada do arquivo do cliente (recortada,
   * tratada) é material que precisa de contrato próprio, não de um parâmetro
   * que substitui em silêncio.
   */
  if (doUpload !== null && doParametro !== null && doParametro !== doUpload) {
    morrer(
      `Este pedido tem arquivo do cliente (${pedido.imagem.caminhoDoUpload}) e o --fundo aponta para outro (${fundoArg}).\n  ` +
        'Upload vence geração: trocar o material dele por outro é o contrário do que ele pediu.\n  ' +
        'Componha sem --fundo, ou aponte para o arquivo do próprio upload.',
    );
  }

  const fundo = doUpload ?? doParametro;
  if (fundo !== null && !existsSync(fundo)) morrer(`O fundo não existe: ${fundo}`);

  /**
   * Houve pixel GERADO nesta peça? Sai do próprio pedido, não de uma bandeira:
   * `origem: 'upload'` é material do cliente, e uma bandeira à mão poderia
   * mentir sobre isso justamente onde a régua confia.
   */
  const houvePixelGerado = pedido.imagem.origem === 'gerar' && fundo !== null;
  const houveUpload = pedido.imagem.origem === 'upload';

  /**
   * O logotipo da direção de marca, resolvido contra a pasta do job.
   *
   * Ausência de arquivo não trava a peça — a marca volta a assinar em texto —,
   * mas é AVISO: o pedido declarou um logotipo, e a peça vai sair sem ele.
   * Cair calado para o texto entregaria uma peça diferente da pedida sem que
   * ninguém soubesse.
   */
  const declarado = pedido.direcao.logotipo;
  const caminhoDoLogotipo =
    declarado === null ? null : isAbsolute(declarado) ? declarado : join(dir, declarado);
  const logotipo =
    caminhoDoLogotipo !== null && existsSync(caminhoDoLogotipo) ? caminhoDoLogotipo : null;
  if (caminhoDoLogotipo !== null && logotipo === null) {
    console.warn(
      `\n  AVISO: o pedido declara o logotipo "${declarado}" e ele não está em ${dir}. A marca vai assinar em texto.`,
    );
  }

  const cores = coresDerivadas(pedido.corPrincipal, pedido.direcao.coresDeApoio);
  if (pedido.direcao.coresDeApoio.length > 0 && !cores.acentoVeioDaMarca) {
    console.warn(
      '\n  AVISO: nenhuma cor de apoio se separa da faixa e aceita tinta legível ao mesmo tempo, então o botão saiu na cor derivada. O acento não é da paleta desta marca.',
    );
  }

  /**
   * A fonte da marca, com o arquivo dentro.
   *
   * Ela é buscada uma vez e fica em cache: o Chromium da composição não tem as
   * fontes do mundo instaladas, e um `font-family` sem o arquivo cai no
   * fallback sem avisar. Falhar aqui não trava a peça — ela sai na letra da
   * casa —, mas C11 REPROVA, porque uma peça na tipografia errada não é a peça
   * daquela marca e recompor não gasta crédito nenhum.
   */
  const familiaPedida = pedido.direcao.fonteTitulos;
  const cssFonte = familiaPedida === null ? null : await cssDaFonte(familiaPedida);
  if (familiaPedida !== null && cssFonte === null) {
    console.warn(
      `
  AVISO: não consegui obter a fonte "${familiaPedida}". A peça vai sair na letra da casa, e C11 vai reprovar por isso.`,
    );
  }

  const navegador = await chromium.launch({ args: ['--no-sandbox'] });
  let peca: Awaited<ReturnType<typeof comporPeca>>;
  try {
    peca = await comporPeca(navegador, {
      formato: pedido.formato,
      fundo,
      marca: pedido.marca,
      logotipo,
      headline: pedido.texto.headline,
      cta: pedido.texto.cta,
      assinatura: pedido.direcao.assinatura,
      fonte:
        familiaPedida !== null && cssFonte !== null
          ? { familia: familiaPedida, css: cssFonte }
          : null,
      cores,
    });
  } finally {
    await navegador.close();
  }

  const nome = `v${n}.png`;
  writeFileSync(join(dir, nome), peca.png);

  // As irmãs, para a regra que pega "cobrou duas e entregou uma".
  const hashesIrmas = readdirSync(dir)
    .filter((f) => /^v\d+\.png$/.test(f) && f !== nome)
    .map((f) => sha(readFileSync(join(dir, f))));

  const conferencia = conferirVariacaoCriativa({
    formato: pedido.formato,
    largura: peca.largura,
    altura: peca.altura,
    houvePixelGerado,
    headline: pedido.texto.headline,
    cta: pedido.texto.cta,
    textoRenderizado: peca.textos,
    caixasDosPapeis: peca.caixas,
    marca: pedido.marca,
    menorContraste: peca.menorContraste,
    hash: sha(peca.png),
    hashesIrmas,
    houveUpload,
    /**
     * O upload está na peça? A pergunta é de IDENTIDADE, não de existência.
     *
     * Isto perguntava `fundo !== null` — se ALGUM fundo existia. Com o
     * `--fundo` podendo apontar para outro arquivo, a resposta era "sim" sobre
     * uma peça que tinha trocado o material do cliente por outro, e C5 ficava
     * verde justamente no caso que ela existe para pegar. Hoje o parâmetro é
     * recusado antes de chegar aqui, e esta linha confere a identidade, não a
     * presença: são duas defesas para o mesmo erro, e a segunda mede.
     */
    uploadPreservado: houveUpload ? fundo !== null && fundo === doUpload : null,
    procedencia: {
      modelo: houvePixelGerado ? (pedido.preset ?? 'imagem-padrao') : 'composicao',
      preset: pedido.preset ?? 'imagem-padrao',
    },
    tipografia: { familia: familiaPedida, aplicou: peca.fonteAplicada },
  });

  const rotulo = rotuloDaPeca(conferencia);
  const variacao = {
    caminho: nome,
    estado: rotulo === 'reprovada' ? ('reprovada' as const) : ('aprovada' as const),
    motivo:
      rotulo === 'reprovada'
        ? conferencia.vereditos
            .filter((v) => v.estado === 'reprovou')
            .map((v) => `${v.codigo}: ${v.motivo}`)
            .join(' ')
        : null,
    conferencia: conferencia.vereditos,
  };

  // O resultado cresce variação a variação, sem reescrever as anteriores.
  const arquivoDoResultado = join(dir, 'resultado.json');
  /**
   * Resultado ilegível PARA a composição, em vez de recomeçar do zero.
   *
   * A versão anterior caía num `[variacao]` limpo quando o parse falhava — e
   * uma escrita interrompida bastava para as variações já pagas sumirem da
   * entrega. Os PNG continuavam no disco, e o download respondia
   * "não declarado" para sempre. É a mesma reação que o `criativo:razao` já
   * tem: não continuo por cima de um registro que não consigo ler.
   */
  let anteriores: (typeof variacao)[] = [];
  if (existsSync(arquivoDoResultado)) {
    let lidoAntes: unknown;
    try {
      lidoAntes = JSON.parse(readFileSync(arquivoDoResultado, 'utf8'));
    } catch (err) {
      morrer(
        `resultado.json não é JSON válido (${err instanceof Error ? err.message : String(err)}). Não recomeço por cima dele: as variações já pagas sumiriam da entrega.`,
      );
    }
    const anterior = ResultadoCriativo.safeParse(lidoAntes);
    if (!anterior.success) {
      morrer(
        `resultado.json não passa no contrato: ${anterior.error.issues[0]?.message}. Conserte-o antes de compor mais uma variação.`,
      );
    }
    anteriores = (anterior.success ? anterior.data.variacoes : []).filter(
      (v) => v.caminho !== nome,
    ) as (typeof variacao)[];
  }
  const variacoes = [...anteriores, variacao];
  /**
   * O custo sai do RAZÃO, não de um contador local.
   *
   * Enquanto este arquivo escrevia `0`, o `resultado.json` e o `razao.json`
   * nunca se encontravam: a tela mostrava "0 créditos" numa peça de 150, e a
   * conferência de teto no fechamento comparava `0 > teto` e nunca disparava.
   */
  const arquivoDoRazao = join(dir, 'razao.json');
  let custoGasto = 0;
  if (existsSync(arquivoDoRazao)) {
    try {
      custoGasto = lerRazao(
        ArquivoDoRazao.parse(JSON.parse(readFileSync(arquivoDoRazao, 'utf8'))).lancamentos,
      ).gasto;
    } catch {
      morrer(
        'O razão está ilegível, e sem ele eu não sei quanto esta peça custou. Não gravo entrega com custo inventado.',
      );
    }
  }

  writeFileSync(arquivoDoResultado, JSON.stringify({ variacoes, custoGasto }, null, 2), 'utf8');

  console.log('');
  console.log(`  ${nome} — ${peca.largura}×${peca.altura} — ${rotulo}`);
  for (const v of conferencia.vereditos) {
    const marca = v.estado === 'passou' ? '  ok  ' : v.estado === 'reprovou' ? ' FALHA' : ' pend.';
    console.log(
      `   ${marca} ${v.codigo}  ${v.titulo}${v.motivo === '' ? '' : `\n           ${v.motivo}`}`,
    );
  }
  console.log('');
  console.log('  O custo continua zerado aqui: quem debita é o `pnpm criativo:razao`.');
  console.log('');
};

if (executadoDireto(import.meta.url)) void principal();
