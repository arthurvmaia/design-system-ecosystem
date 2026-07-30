import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Exclusão de kits em lote: kit EM USO por projeto só sai com confirmação
 * explícita; kit livre sai na hora. Excluir kit nunca apaga projeto (o kit_id
 * vira null pelo schema) nem peça da Biblioteca (kit é seleção, não pasta).
 */
test('excluir-lote: em uso pede confirmação; projetos e peças sobrevivem', async (t) => {
  const root = join(tmpdir(), `ds-kits-lote-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { kitsRoute } = await import('./kits.js');
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

  // Origem mínima para uma peça de Biblioteca: o kit usado leva um componente
  // dentro, para provar que a peça continua existindo depois do kit sumir.
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
  const segId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  db.insert(tables.segments)
    .values({
      id: segId,
      designSystemId: dsId,
      category: 'hero',
      kind: 'component',
      name: 'Seg 1',
      htmlSnippet: '<section><h1>Oi mundo</h1></section>',
      previewPath: null,
      position: 0,
      inLibrary: true,
    })
    .run();
  const cmpId = `cmp_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  db.insert(tables.libraryComponents)
    .values({
      id: cmpId,
      segmentId: segId,
      designSystemId: dsId,
      category: 'hero',
      kind: 'component',
      name: 'Cmp 1',
      bundlePath: join(root, 'library', cmpId, 'bundle'),
      bundleHash: 'x',
      tokensJson: null,
      addedAt: Date.now(),
      notes: null,
    })
    .run();

  const mkKit = (nome: string): string => {
    const id = `kit_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    db.insert(tables.kits)
      .values({ id, name: nome, description: null, createdAt: 1, updatedAt: 1 })
      .run();
    return id;
  };
  const kitLivre = mkKit('Kit Livre');
  const kitUsado = mkKit('Kit Usado');
  db.insert(tables.kitComponents)
    .values({ kitId: kitUsado, componentId: cmpId, position: 0 })
    .run();

  const prjId = `prj_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  db.insert(tables.projects)
    .values({
      id: prjId,
      name: 'Site Y',
      createdAt: 1,
      updatedAt: 1,
      kitId: kitUsado,
      contentJson: null,
      brandingJson: null,
      mediaManifestJson: null,
      layoutJson: null,
      status: 'draft',
    })
    .run();

  const app = new Hono().route('/api/kits', kitsRoute);
  const chamar = async (ids: string[], confirmar: boolean) =>
    (await (
      await app.request('/api/kits/excluir-lote', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kitIds: ids, confirmarEmUso: confirmar }),
      })
    ).json()) as {
      excluidos: string[];
      emUso: { id: string; name: string; projetos: string[] }[];
      faltando: string[];
    };

  // 1ª chamada: o livre sai; o em-uso fica e volta com os projetos nomeados;
  // o inexistente vai para `faltando` em vez de derrubar o lote.
  const fantasma = 'kit_nao_existe_neste_banco';
  const r1 = await chamar([kitLivre, kitUsado, fantasma], false);
  assert.deepEqual(r1.excluidos, [kitLivre]);
  assert.equal(r1.emUso.length, 1);
  assert.equal(r1.emUso[0]?.id, kitUsado);
  assert.equal(r1.emUso[0]?.name, 'Kit Usado');
  assert.deepEqual(r1.emUso[0]?.projetos, ['Site Y']);
  assert.deepEqual(r1.faltando, [fantasma]);
  const prj1 = db.select().from(tables.projects).all()[0];
  assert.equal(prj1?.kitId, kitUsado, 'sem confirmar, o projeto segue ligado ao kit');

  // 2ª chamada, confirmada: o em-uso sai; o projeto sobrevive solto do kit e
  // a peça da Biblioteca continua onde estava.
  const r2 = await chamar([kitUsado], true);
  assert.deepEqual(r2.excluidos, [kitUsado]);
  assert.equal(db.select().from(tables.kits).all().length, 0);
  const prj2 = db.select().from(tables.projects).all()[0];
  assert.equal(prj2?.name, 'Site Y', 'o projeto não é apagado');
  assert.equal(prj2?.kitId, null, 'o projeto perde só a ligação com o kit');
  assert.equal(db.select().from(tables.kitComponents).all().length, 0);
  assert.equal(
    db.select().from(tables.libraryComponents).all().length,
    1,
    'a peça continua na Biblioteca',
  );
});
