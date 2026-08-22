/**
 * Espelha o NÚCLEO do motor criativo para a frente de Lojas.
 *
 * Uso:
 *   pnpm motor:espelhar          # regrava os espelhos
 *   pnpm motor:espelhar --seco   # só diz quais estão defasados (sai 1 se houver)
 *
 * ## Por que espelho, e não import
 *
 * As três frentes do portal precisam do MESMO motor: a logo do site, a da loja
 * e a do criativo têm de ser a mesma logo; o modelo que a loja pede tem de ser
 * o modelo que o produto declarou; e o crédito que ela gasta tem de ser contado
 * pela mesma régua. O canônico mora em `packages/creative-engine` e as duas
 * frentes DESTE repositório o importam direto.
 *
 * A frente de Lojas não pode importar: ela é um projeto separado, com
 * `package-lock.json` próprio e deploy próprio. Fazê-la depender do workspace
 * pnpm mudaria a topologia de build de um app publicado — decisão do dono, e
 * ela continua aberta.
 *
 * Então os arquivos são COPIADOS, e a cópia é verificada. A diferença entre
 * isto e uma duplicação comum é o teste: duas cópias que ninguém compara
 * divergem no primeiro conserto feito de um lado só, e a divergência aparece
 * como "a logo da loja não é a mesma do site" ou, pior, como uma conta de
 * crédito que ninguém sabe explicar.
 *
 * ## Por que o núcleo é ESTE conjunto, e não o pacote inteiro
 *
 * Espelhar só vale para código que não puxa nada atrás dele. Os quatro arquivos
 * abaixo dependem de `zod` (que a loja já tem) e um do outro — nada de
 * `node:fs`, nada de `@ds/shared`, nada de Playwright. O resto do motor abre
 * navegador ou lê disco, e nenhuma das duas coisas existe no workerd.
 *
 * Quando a frente de Lojas entrar no workspace, este script morre e os espelhos
 * viram `import`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { executadoDireto } from './executado-direto.js';

/** Uma peça do núcleo: de onde ela sai, para onde vai, e o que muda no caminho. */
export type PecaDoNucleo = {
  /** Caminho dentro de `packages/creative-engine/src`. */
  readonly origem: string;
  /** Caminho dentro de `orbis-lojas-shopify`. */
  readonly espelho: string;
  /**
   * O que reescrever no texto copiado, em ordem.
   *
   * Só existe por causa dos vizinhos: no motor, `precos/tabela.ts` importa
   * `../catalogo/presets.js`; no espelho os dois moram lado a lado. Sem a
   * reescrita, o espelho não compila — e um espelho que não compila é pior que
   * nenhum, porque só quebra na frente que não tem CI.
   */
  readonly reescritas?: readonly (readonly [RegExp, string])[];
};

/**
 * O NÚCLEO, declarado.
 *
 * A ordem é a de leitura de quem chega: primeiro o que a loja já usava, depois
 * o que ela passou a usar.
 */
export const NUCLEO: readonly PecaDoNucleo[] = [
  {
    /* O recorte que faz as versões da logo serem a MESMA logo. */
    origem: 'marca/derivar-navegador.ts',
    espelho: 'lib/logo-derivar.ts',
    /* A diretiva de DOM sai: no app da frente de Lojas o `lib` já inclui DOM, e
       uma referência a `lib` num projeto que não a usa é ruído no diff. */
    reescritas: [[/^\/\/\/ <reference lib="dom" \/>\r?\n/, '']],
  },
  {
    /* Qual modelo é qual, em cada transporte. É ele que impede a loja de pedir
       um modelo que o produto nunca declarou. */
    origem: 'catalogo/presets.ts',
    espelho: 'lib/motor/presets.ts',
  },
  {
    /* Quanto custa, medido e datado — e a recusa quando ninguém mediu. */
    origem: 'precos/tabela.ts',
    espelho: 'lib/motor/precos.ts',
    reescritas: [[/from '\.\.\/catalogo\/presets\.js'/g, "from './presets'"]],
  },
  {
    /* O razão: empenhar antes de gastar, e parar quando não couber. */
    origem: 'razao.ts',
    espelho: 'lib/motor/razao.ts',
  },
];

const RAIZ_MOTOR = join(process.cwd(), 'packages', 'creative-engine', 'src');
const RAIZ_LOJA = join(process.cwd(), 'orbis-lojas-shopify');

/**
 * O cabeçalho que todo espelho carrega.
 *
 * Ele nomeia o ORIGINAL daquele arquivo, e não o pacote: quem abre o espelho
 * está procurando onde consertar, e "o motor criativo" não é um endereço.
 */
export const cabecalhoDoEspelho = (origem: string): string =>
  `/* ATENÇÃO: ARQUIVO ESPELHADO. NÃO EDITE AQUI.
 *
 * O original mora em \`packages/creative-engine/src/${origem}\`,
 * no motor criativo, porque as três frentes do portal precisam do MESMO motor:
 * a logo do site, a da loja e a do criativo têm de ser a mesma logo, e o modelo
 * que a loja pede tem de ser o modelo que o produto declarou.
 *
 * Para mudar, edite o original e rode \`pnpm motor:espelhar\`.
 * Editar aqui faz a suíte reprovar, de propósito.
 */
`;

/** O conteúdo que aquele espelho DEVERIA ter. */
export const espelhoEsperado = (peca: PecaDoNucleo, fonte: string): string => {
  let corpo = fonte;
  for (const [de, para] of peca.reescritas ?? []) corpo = corpo.replace(de, para);
  return cabecalhoDoEspelho(peca.origem) + corpo;
};

/** Os dois caminhos absolutos de uma peça. Exportado para o teste não redigitar. */
export const caminhosDaPeca = (peca: PecaDoNucleo): { origem: string; espelho: string } => ({
  origem: join(RAIZ_MOTOR, peca.origem),
  espelho: join(RAIZ_LOJA, peca.espelho),
});

/** Está em dia? Devolve a lista do que divergiu, para o comando e para o teste. */
export const espelhosDefasados = (): readonly string[] =>
  NUCLEO.filter((peca) => {
    const { origem, espelho } = caminhosDaPeca(peca);
    const esperado = espelhoEsperado(peca, readFileSync(origem, 'utf8'));
    try {
      return readFileSync(espelho, 'utf8') !== esperado;
    } catch {
      return true;
    }
  }).map((peca) => peca.espelho);

const principal = (): void => {
  const seco = process.argv.includes('--seco');
  const defasados = espelhosDefasados();

  if (defasados.length === 0) {
    console.log(`\n  Os ${NUCLEO.length} espelhos da frente de Lojas estão em dia.\n`);
    return;
  }
  if (seco) {
    console.error('\n  Espelhos DEFASADOS na frente de Lojas. Rode `pnpm motor:espelhar`:');
    for (const alvo of defasados) console.error(`    ${alvo}`);
    console.error('');
    process.exit(1);
  }

  for (const peca of NUCLEO) {
    const { origem, espelho } = caminhosDaPeca(peca);
    mkdirSync(dirname(espelho), { recursive: true });
    writeFileSync(espelho, espelhoEsperado(peca, readFileSync(origem, 'utf8')), 'utf8');
  }
  console.log(`\n  ${NUCLEO.length} espelhos regravados em ${RAIZ_LOJA}\n`);
};

if (executadoDireto(import.meta.url)) principal();
