import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { type ServidorFixture, capturarComV2, iniciarServidorFixture } from '@ds/engine-v2';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
let srv: ServidorFixture | null = null;
let tmp = '';

before(async () => {
  process.env.DS_ASSET_ALLOW_LOCAL = '1';
  srv = await iniciarServidorFixture(RAIZ);
  tmp = mkdtempSync(join(tmpdir(), 'prova-cmp-'));
});
after(async () => {
  await srv?.parar?.();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* windows */
  }
});

test('a comparacao de pixel RODA quando ligada', async () => {
  const r = await capturarComV2(`${srv?.url}/v2/convencional.html`, {
    dirCaptura: join(tmp, 'capture'),
    dirBundles: join(tmp, 'bundles'),
    verificarVisual: true,
    limits: { orcamentoTotalMs: 180_000, settleAfterLoadMs: 1_500 },
    maxParadas: 4,
    maxTrajetoriasPorViewport: 1,
  });
  const m = r.manifest as unknown as {
    visualComparisons?: unknown[];
    limitations?: string[];
    telemetry?: { fases?: { nome: string; ms: number; abortada: boolean }[] };
  };
  const fases = (m.telemetry?.fases ?? []).map((f) => f.nome);
  console.log('  fases:', JSON.stringify(fases));
  console.log('  visualComparisons:', (m.visualComparisons ?? []).length);
  console.log(
    '  limitacoes sobre comparacao:',
    JSON.stringify((m.limitations ?? []).filter((l) => /compar|print da dobra/i.test(l))),
  );
  assert.ok(
    fases.some((f) => f.includes('comparar')),
    'a fase de comparacao nao rodou',
  );
});
