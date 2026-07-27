import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Exclusão em lote da Biblioteca: componente EM USO (kit → sites) só sai com
 * confirmação explícita; o resto sai na hora e o segmento volta para a Galeria.
 */
test('excluir-lote: em uso pede confirmação; livre sai e libera o segmento', async (t) => {
  const root = join(tmpdir(), `ds-lote-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { libraryRoute } = await import('./library.js');
  const { Hono } = await import('hono');
  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* SQLite pode segurar o arquivo no Windows */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  ensureDataTree();
  getDb();
  runMigrations();
  const db = getDb();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: null,
      sourceHash: 'h',
      extractedAt: Date.now(),
      name: 'Origem',
      stackJson: null,
      status: 'segmented',
      vaultPath: root,
      errorMessage: null,
    })
    .run();

  const mkSeg = (n: number): string => {
    const id = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    db.insert(tables.segments)
      .values({
        id,
        designSystemId: dsId,
        category: 'hero',
        kind: 'component',
        name: `Seg ${n}`,
        htmlSnippet: '<section><h1>Oi mundo</h1></section>',
        previewPath: null,
        position: n,
        inLibrary: true,
      })
      .run();
    return id;
  };
  const mkCmp = (n: number, segId: string): string => {
    const id = `cmp_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    db.insert(tables.libraryComponents)
      .values({
        id,
        segmentId: segId,
        designSystemId: dsId,
        category: 'hero',
        kind: 'component',
        name: `Cmp ${n}`,
        bundlePath: join(root, 'library', id, 'bundle'),
        bundleHash: 'x',
        tokensJson: null,
        addedAt: Date.now(),
        notes: null,
      })
      .run();
    return id;
  };

  const segLivre = mkSeg(1);
  const cmpLivre = mkCmp(1, segLivre);
  const segUsado = mkSeg(2);
  const cmpUsado = mkCmp(2, segUsado);

  // kit com o componente usado + projeto usando o kit
  const kitId = `kit_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  db.insert(tables.kits)
    .values({ id: kitId, name: 'Kit X', description: null, createdAt: 1, updatedAt: 1 })
    .run();
  db.insert(tables.kitComponents).values({ kitId, componentId: cmpUsado, position: 0 }).run();
  db.insert(tables.projects)
    .values({
      id: `prj_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
      name: 'Site Y',
      createdAt: 1,
      updatedAt: 1,
      kitId,
      contentJson: null,
      brandingJson: null,
      mediaManifestJson: null,
      layoutJson: null,
      status: 'draft',
    })
    .run();

  const app = new Hono().route('/api/library', libraryRoute);
  const chamar = async (ids: string[], confirmar: boolean) =>
    (await (
      await app.request('/api/library/excluir-lote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ componentIds: ids, confirmarEmUso: confirmar }),
      })
    ).json()) as {
      excluidos: string[];
      emUso: { id: string; kits: string[]; projetos: string[] }[];
      faltando: string[];
    };

  // 1ª chamada: o livre sai; o em-uso fica e volta com kits e sites nomeados.
  const r1 = await chamar([cmpLivre, cmpUsado], false);
  assert.deepEqual(r1.excluidos, [cmpLivre]);
  assert.equal(r1.emUso.length, 1);
  assert.deepEqual(r1.emUso[0]?.kits, ['Kit X']);
  assert.deepEqual(r1.emUso[0]?.projetos, ['Site Y']);
  const segRow = db
    .select()
    .from(tables.segments)
    .all()
    .find((s) => s.id === segLivre);
  assert.equal(segRow?.inLibrary, false, 'segmento liberado volta para a Galeria');

  // 2ª chamada, confirmada: o em-uso sai também.
  const r2 = await chamar([cmpUsado], true);
  assert.deepEqual(r2.excluidos, [cmpUsado]);
  assert.equal(db.select().from(tables.libraryComponents).all().length, 0);
});
