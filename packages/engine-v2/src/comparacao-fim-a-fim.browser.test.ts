import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { capturarComV2 } from './engine.js';
import { type ServidorFixture, iniciarServidorFixture } from './testing/fixture-server.js';

/**
 * O FIO entre a verificação ligada e o manifesto gravado.
 *
 * As duas pontas já eram testadas — `comparar-bundle.test.ts` mede a comparação
 * e `decidir-comparacao.test.ts` mede a decisão — e o fio entre elas não era,
 * porque o único teste ponta a ponta do motor (`engine.browser.test.ts`) passa
 * `verificarVisual: false` de propósito, para não somar uma aba ao que ele mede.
 *
 * O preço apareceu no acervo: 57 capturas de 57 com `visualComparisons: []`, a
 * fase `v2-comparar` ausente de toda telemetria, e a reprova por divergência da
 * curadoria (`comparacaoVisualOk === false`) sem disparar uma vez sequer. Peças
 * eram testadas; a ligação não.
 *
 * Este teste é caro (abre navegador e captura de verdade) e por isso vive no
 * `pnpm test:navegador`. Ele é o único lugar que responde "ligar a verificação
 * produz comparação no manifesto?" — que é a pergunta que ninguém fazia.
 */
const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '../../..', 'fixtures');

let srv: ServidorFixture | null = null;
let tmp = '';

before(async () => {
  process.env.DS_ASSET_ALLOW_LOCAL = '1';
  srv = await iniciarServidorFixture(RAIZ);
  tmp = mkdtempSync(join(tmpdir(), 'v2-cmp-'));
});
after(async () => {
  await srv?.fechar();
  try {
    rmSync(tmp, { recursive: true, force: true });
  } catch {
    /* o Windows pode segurar o arquivo */
  }
});

test('verificação LIGADA grava comparações no manifesto', async () => {
  const r = await capturarComV2(`${srv?.url}/v2/convencional.html`, {
    dirCaptura: join(tmp, 'ligada', 'capture'),
    dirBundles: join(tmp, 'ligada', 'bundles'),
    verificarVisual: true,
    limits: { orcamentoTotalMs: 120_000, settleAfterLoadMs: 1_200 },
    maxParadas: 3,
    maxTrajetoriasPorViewport: 1,
  });
  const fases = (r.manifesto.telemetry?.fases ?? []).map((f) => f.nome);
  assert.ok(fases.includes('v2-comparar'), `a fase não rodou; fases: ${fases.join(', ')}`);

  const cs = r.manifesto.visualComparisons ?? [];
  assert.ok(cs.length > 0, 'a fase rodou e não gravou comparação nenhuma');

  // Cada comparação carrega o DONO. É por `position` que a Galeria e a
  // curadoria a associam ao segmento; sem isso a associação volta a ser a
  // ordem do array, que já se provou errada em 7 de 7 capturas.
  for (const c of cs) {
    assert.equal(typeof c.position, 'number', 'comparação sem dono não acha o segmento');
  }
});

test('verificação DESLIGADA diz por que não há comparação', async () => {
  const r = await capturarComV2(`${srv?.url}/v2/convencional.html`, {
    dirCaptura: join(tmp, 'desligada', 'capture'),
    dirBundles: join(tmp, 'desligada', 'bundles'),
    verificarVisual: false,
    limits: { orcamentoTotalMs: 120_000, settleAfterLoadMs: 1_200 },
    maxParadas: 3,
    maxTrajetoriasPorViewport: 1,
  });
  assert.equal((r.manifesto.visualComparisons ?? []).length, 0);
  /**
   * A ausência tem de ser DIZÍVEL. Um manifesto com a lista vazia e nenhuma
   * explicação é o que fez o acervo inteiro parecer conferido e aprovado.
   */
  assert.ok(
    (r.manifesto.limitations ?? []).some((l) => /verificação visual estava desligada/.test(l)),
    'a lista veio vazia sem dizer por quê',
  );
});
