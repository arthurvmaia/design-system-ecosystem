import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A prévia de um segmento, nas duas pontas da procedência:
 *
 * - COM pacote, ela serve o pacote, e a pasta é achada pela identidade (o
 *   prefixo do hash que o nome do print carrega) e não pela posição;
 * - SEM pacote, ela monta `head da origem + recorte` e precisa DIZER isso.
 *
 * O selo valia só no `?contexto=1`, que é o modo em que a pessoa pediu para ver
 * a página de origem. Ou seja: ele aparecia exatamente onde ninguém precisava
 * dele, e faltava onde a prévia mente calada — a peça sem pacote aparece com o
 * CSS do site inteiro por fora e some no `.zip`.
 */
test('a prévia diz quando o que está na tela não é o arquivo que vai no site', async (t) => {
  const root = join(tmpdir(), `ds-prev-proc-${randomUUID().slice(0, 8)}`);
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
  getDb();
  runMigrations();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as `ds_${string}`;
  getDb()
    .insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: null,
      sourceHash: `h-${randomUUID().slice(0, 8)}`,
      extractedAt: Date.now(),
      name: 'Acervo de teste',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();

  // O documento da origem: é dele que sai o `<head>` da prévia sem pacote.
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  writeFileSync(
    join(shared.vaultExtractedDir(dsId), 'design-system.html'),
    '<!doctype html><html><head><style>body{background:#101014}</style></head><body class="site"><p>origem</p></body></html>',
    'utf8',
  );

  const comPacoteId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const semPacoteId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const HASH = 'abcdef0123456789';
  for (const [id, position] of [
    [comPacoteId, 0],
    [semPacoteId, 1],
  ] as const) {
    getDb()
      .insert(tables.segments)
      .values({
        id,
        designSystemId: dsId,
        category: 'hero',
        kind: 'component',
        name: 'Peça de teste',
        htmlSnippet: '<section><h1>Manchete</h1></section>',
        previewPath: null,
        position,
        inLibrary: false,
        parentId: null,
      })
      .run();
  }

  const manifesto = shared.vaultSegmentsManifest(dsId);
  mkdirSync(shared.vaultSegmentsDir(dsId), { recursive: true });
  writeFileSync(
    manifesto,
    JSON.stringify({
      designSystemId: dsId,
      generatedAt: Date.now(),
      segments: [],
      insights: [
        {
          segmentId: comPacoteId,
          support: 'completo',
          renderMode: 'html',
          fidelity: 90,
          warnings: [],
          capabilities: {},
          interactions: [],
          framePath: `frames/secao-${HASH.slice(0, 10)}-1a2b3c4d.png`,
        },
      ],
    }),
    'utf8',
  );

  // O pacote NÃO mora em `seg_0`: quem resolver por posição não acha nada aqui e
  // cai na composição a partir da origem, que é o defeito que a chave composta
  // conserta.
  const pasta = 'seg_5';
  const dir = join(shared.vaultSegmentBundlesDir(dsId), pasta);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'manifest.json'),
    JSON.stringify({
      representation: { type: 'componente-portatil' },
      limitations: [],
      evidence: { segmentId: HASH },
    }),
    'utf8',
  );
  writeFileSync(
    join(dir, 'index.html'),
    '<!doctype html><html><body><section><h1>Manchete</h1></section></body></html>',
    'utf8',
  );

  const app = new Hono();
  app.route('/api/preview', previewRoute);

  const comPacote = await app.request(`/api/preview/segment/${comPacoteId}`);
  assert.equal(comPacote.status, 302, 'com pacote, a prévia serve o pacote');
  assert.equal(
    comPacote.headers.get('location'),
    `/api/preview/bundle/${dsId}/${pasta}/index.html`,
    'a pasta tem de sair da identidade, não de `seg_<position>`',
  );

  const semPacote = await app.request(`/api/preview/segment/${semPacoteId}`);
  assert.equal(semPacote.status, 200);
  const html = await semPacote.text();
  assert.match(html, /Não existe pacote desta peça/, 'a prévia sem pacote precisa se declarar');
  assert.match(html, /página de origem/);

  // O modo contexto continua com a frase dele, que é outra: ali a pessoa PEDIU a
  // região dentro da página inteira.
  const contexto = await app.request(`/api/preview/segment/${semPacoteId}?contexto=1`);
  assert.match(await contexto.text(), /dentro da página de origem/);
});
