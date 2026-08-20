/**
 * Espelha o algoritmo de derivação da logo para a frente de Lojas.
 *
 * Uso:
 *   pnpm marca:espelhar          # regrava o espelho
 *   pnpm marca:espelhar --seco   # só diz se ele está defasado (sai 1 se estiver)
 *
 * ## Por que um espelho, e não um import
 *
 * As três frentes do portal precisam do MESMO recorte: a logo do site, a da
 * loja e a do criativo têm de ser a mesma logo. O canônico mora no motor
 * (`packages/creative-engine/src/marca/derivar-navegador.ts`) e as duas frentes
 * deste repositório o importam direto.
 *
 * A frente de Lojas não pode importar: ela é um projeto separado, com
 * `package-lock.json` próprio e deploy próprio na Vercel. Fazê-la depender do
 * workspace pnpm mudaria a topologia de build de um app publicado — decisão que
 * não cabe a um refactor.
 *
 * Então o arquivo é COPIADO, e a cópia é verificada. A diferença entre isto e
 * uma duplicação comum é o teste: duas cópias que ninguém compara divergem no
 * primeiro conserto feito de um lado só, e a divergência aparece como "a logo
 * da loja não é a mesma do site". Aqui, divergir REPROVA a suíte.
 *
 * Quando a frente de Lojas entrar no workspace, este script morre e o espelho
 * vira um `import`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { executadoDireto } from './executado-direto.js';

const ORIGEM = join(
  process.cwd(),
  'packages',
  'creative-engine',
  'src',
  'marca',
  'derivar-navegador.ts',
);
const ESPELHO = join(process.cwd(), 'orbis-lojas-shopify', 'lib', 'logo-derivar.ts');

const CABECALHO = `/* ATENÇÃO: ARQUIVO ESPELHADO. NÃO EDITE AQUI.
 *
 * O original mora em \`packages/creative-engine/src/marca/derivar-navegador.ts\`,
 * no motor criativo, porque as três frentes do portal precisam do MESMO recorte:
 * a logo do site, a da loja e a do criativo têm de ser a mesma logo.
 *
 * Para mudar o algoritmo, edite o original e rode \`pnpm marca:espelhar\`.
 * Editar aqui faz a suíte reprovar, de propósito.
 */
`;

/** O conteúdo que o espelho DEVERIA ter. */
export const espelhoEsperado = (fonte: string): string =>
  // A diretiva de DOM sai: no app da frente de Lojas o `lib` já inclui DOM, e
  // uma referência a `lib` num projeto que não a usa é ruído no diff.
  CABECALHO + fonte.replace(/^\/\/\/ <reference lib="dom" \/>\r?\n/, '');

/** A origem e o espelho, lidos. Exportado para o teste não redigitar caminho. */
export const caminhosDoEspelho = (): { origem: string; espelho: string } => ({
  origem: ORIGEM,
  espelho: ESPELHO,
});

const principal = (): void => {
  const seco = process.argv.includes('--seco');
  const fonte = readFileSync(ORIGEM, 'utf8');
  const esperado = espelhoEsperado(fonte);
  let atual = '';
  try {
    atual = readFileSync(ESPELHO, 'utf8');
  } catch {
    atual = '';
  }

  if (atual === esperado) {
    console.log('\n  O espelho da frente de Lojas está em dia.\n');
    return;
  }
  if (seco) {
    console.error('\n  O espelho da frente de Lojas está DEFASADO. Rode `pnpm marca:espelhar`.\n');
    process.exit(1);
  }
  writeFileSync(ESPELHO, esperado, 'utf8');
  console.log(`\n  Espelho regravado em ${ESPELHO}\n`);
};

if (executadoDireto(import.meta.url)) principal();
