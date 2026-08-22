/**
 * Extrai um CATÁLOGO inteiro de sites, pulando o que já está no acervo.
 *
 * Uso: pnpm acervo:lote <manifesto.json>
 *
 * O manifesto é uma lista de `{ path, name }` — o formato que o catálogo da
 * Asimov publica em `gallery-manifest.json`. Cada item vira um job de extração
 * e é processado até o fim (extrair + concluir), um de cada vez.
 *
 * Sequencial de propósito: cada captura abre um navegador de verdade, observa a
 * página no tempo e varre o ponteiro. Dois em paralelo disputam CPU e o
 * orçamento por fase começa a cortar retratos — a captura fica pior, não mais
 * rápida.
 *
 * Site que falha não derruba o lote: o erro é impresso com o nome e a fila
 * segue. É a diferença entre importar 40 de 46 e não importar nenhum.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { getDb, tables } from '@ds/indexer';
import { enqueueJob } from '@ds/shared';

type ItemDoCatalogo = { path: string; name: string };

/**
 * O caminho do manifesto é conferido antes de abrir o arquivo.
 *
 * Sem isto, chamar o comando sem argumento entregava `undefined` ao
 * `readFileSync` e a pessoa recebia um erro de Node cru sobre tipo de
 * parâmetro — que não diz o que fazer. Dizer o uso custa três linhas.
 */
const caminhoDoManifesto = process.argv[2];
if (caminhoDoManifesto === undefined || caminhoDoManifesto.trim() === '') {
  console.error('  Uso: pnpm acervo:lote <manifesto.json>');
  process.exit(1);
}

const manifesto = JSON.parse(readFileSync(caminhoDoManifesto, 'utf8')) as ItemDoCatalogo[];
const db = getDb();
const jaTemos = new Set(
  db
    .select({ u: tables.designSystems.sourceUrl })
    .from(tables.designSystems)
    .all()
    .map((r) => (r.u ?? '').replace(/\/+$/, '')),
);

const faltam = manifesto.filter(
  (m) => !jaTemos.has(`https://ds.asimov.academy/${m.path}/design-system`),
);
console.log(
  `catálogo: ${manifesto.length} | já no acervo: ${manifesto.length - faltam.length} | a extrair: ${faltam.length}`,
);

// `npx` no Windows é um .cmd: precisa de shell, e aí o comando vai como string.
const rodar = (script: string, jobId: string, ms: number): void => {
  execSync(`npx tsx ${script} ${jobId}`, { stdio: 'pipe', timeout: ms });
};

let ok = 0;
let erro = 0;
for (const [i, m] of faltam.entries()) {
  const url = `https://ds.asimov.academy/${m.path}/design-system`;
  const job = enqueueJob('extract', `Extrair — ${m.name}`, { kind: 'url', url });
  console.log(`[${i + 1}/${faltam.length}] ${m.name}`);
  try {
    rodar('scripts/extrair.ts', job.id, 600_000);
    rodar('scripts/fila-concluir.ts', job.id, 900_000);
    ok++;
    console.log('      ok');
  } catch (e) {
    erro++;
    console.log(`      FALHOU: ${(e as Error).message.slice(0, 140)}`);
  }
}
console.log(`\nfim: ${ok} extraído(s), ${erro} falha(s)`);
