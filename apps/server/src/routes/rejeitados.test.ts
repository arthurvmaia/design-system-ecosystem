import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

/**
 * Pendências deixou de ser beco sem saída: recuperar materializa o rejeitado
 * como segmento de verdade (vai para a Galeria) e descartar o remove da lista.
 * Testado em processo com root temporário — sem navegador, sem rede.
 */
test('rejeitados: recuperar vira segmento; descartar limpa a lista', async (t) => {
  const root = join(tmpdir(), `ds-rej-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { rejeitadosRoute } = await import('./rejeitados.js');
  const { Hono } = await import('hono');
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* o SQLite pode segurar o arquivo no Windows — o temp dir fica para o SO limpar */
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
      sourceHash: 'h',
      extractedAt: Date.now(),
      name: 'Teste',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();

  const segId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const manifesto = shared.vaultRejeitadosPath(dsId);
  mkdirSync(dirname(manifesto), { recursive: true });
  writeFileSync(
    manifesto,
    JSON.stringify({
      designSystemId: dsId,
      generatedAt: Date.now(),
      rejeitados: [
        {
          id: segId,
          designSystemId: dsId,
          category: 'nav',
          kind: 'component',
          name: 'Navegação de teste',
          htmlSnippet: '<nav><a href="#">Início</a></nav>',
          position: 3,
          motivos: ['pouco texto visível'],
        },
      ],
    }),
    'utf8',
  );

  const app = new Hono().route('/api/rejeitados', rejeitadosRoute);

  // aparece na listagem
  const lista = (await (await app.request('/api/rejeitados')).json()) as { total: number };
  assert.equal(lista.total, 1);

  // recuperar: vira segmento no banco e sai do manifesto
  const rec = await app.request(`/api/rejeitados/${dsId}/${segId}/recuperar`, { method: 'POST' });
  assert.equal(rec.status, 200);
  const seg = getDb().select().from(tables.segments).all();
  assert.equal(seg.length, 1);
  assert.equal(seg[0]?.id, segId);
  assert.equal(seg[0]?.inLibrary, false);
  assert.equal(JSON.parse(readFileSync(manifesto, 'utf8')).rejeitados.length, 0);

  // recuperar de novo: 404 (já saiu da lista) — idempotência honesta
  const rec2 = await app.request(`/api/rejeitados/${dsId}/${segId}/recuperar`, { method: 'POST' });
  assert.equal(rec2.status, 404);

  // descartar: some da lista sem criar segmento
  const segId2 = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  writeFileSync(
    manifesto,
    JSON.stringify({
      designSystemId: dsId,
      generatedAt: Date.now(),
      rejeitados: [
        {
          id: segId2,
          designSystemId: dsId,
          category: 'other',
          kind: 'component',
          name: 'Orbe decorativa',
          htmlSnippet: '<div class="orb"></div>',
          position: 4,
          motivos: ['efeito visual sem conteúdo'],
        },
      ],
    }),
    'utf8',
  );
  const del = await app.request(`/api/rejeitados/${dsId}/${segId2}`, { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal(JSON.parse(readFileSync(manifesto, 'utf8')).rejeitados.length, 0);
  assert.equal(getDb().select().from(tables.segments).all().length, 1, 'descartar não cria nada');
});
