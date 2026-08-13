import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A rolagem da PRÉVIA não pode subir para a página do app.
 *
 * O dono descreveu assim: *"quando eu clico aqui e scrollo para baixo para ver
 * os kits o scroll fica se mexendo sozinho para baixo e não deixa subir mais"*.
 *
 * A conta:
 *
 * 1. cada cartão de kit traz uma prévia viva num `<iframe>`;
 * 2. o iframe é `allow-same-origin` — e tem de ser, senão o cookie do portão
 *    não acompanha os pedidos de CSS e a prévia chega crua (ver `preview.csp`);
 * 3. `scrollIntoView()` chamado DENTRO dele rola todos os contêineres de
 *    rolagem acima, e o de cima é a página do app;
 * 4. a captura é fiel, então os motores de rolagem da origem viajam junto —
 *    medido nos 276 bundles: 96 com `scrollIntoView`, 54 com `ScrollSmoother`,
 *    18 com `lenis`, 5 com `locomotive`. Essas três TOMAM a rolagem para si;
 * 5. a página é puxada para baixo quadro a quadro e subir vira queda de braço.
 *
 * O sintoma ("o scroll se mexe sozinho") não aponta para a causa ("a prévia
 * alcança o scroll do pai"), e é por isso que a regra fica travada aqui.
 */
test('a prévia contém a própria rolagem — e o guarda entra ANTES da origem', async (t) => {
  const root = join(tmpdir(), `ds-rolagem-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { previewRoute } = await import('./preview.js');
  const { Hono } = await import('hono');
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* o SQLite pode segurar o arquivo no Windows */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  ensureDataTree();
  runMigrations();

  const cmpId = 'cmp_01TESTEROLAGEM00000000000' as `cmp_${string}`;
  const bundle = shared.libraryComponentBundleDir(cmpId);
  mkdirSync(bundle, { recursive: true });
  writeFileSync(
    join(bundle, 'index.html'),
    '<!doctype html><html><head><script>window.__daOrigem=1</script></head><body><p>oi</p></body></html>',
  );
  getDb()
    .insert(tables.libraryComponents)
    .values({
      id: cmpId,
      segmentId: null,
      designSystemId: null,
      category: 'other',
      kind: 'static',
      name: 'peça de teste',
      bundlePath: bundle,
      bundleHash: 'x',
      addedAt: Date.now(),
    })
    .run();

  const app = new Hono();
  app.route('/api/preview', previewRoute);
  const html = await (await app.request(`/api/preview/component/${cmpId}`)).text();

  assert.match(
    html,
    /Element\.prototype\.scrollIntoView\s*=/,
    'o guarda tem de estar no documento',
  );
  assert.match(html, /preventScroll:true/, 'focar também arrasta os ancestrais');

  // ORDEM: um guarda que chega depois do script que ele deveria conter não
  // guarda nada. O `<head>` da origem entra abaixo dele.
  const guarda = html.indexOf('Element.prototype.scrollIntoView');
  const origem = html.indexOf('window.__daOrigem');
  assert.ok(guarda > 0 && origem > 0, 'os dois têm de estar no documento');
  assert.ok(guarda < origem, 'o guarda precisa vir ANTES do script da origem');
});
