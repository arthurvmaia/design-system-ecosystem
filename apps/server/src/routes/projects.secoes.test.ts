import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * A estrutura montada pelo usuário tem de sobreviver ao disco.
 *
 * O wizard grava por `PATCH` a cada etapa e a cada 1,2s de autosave. Se a ordem
 * das seções, a ordem das peças dentro delas ou a âncora da mídia se perdessem
 * nessa ida e volta, o site sairia diferente do que a pessoa montou — e ela só
 * descobriria depois de gerar.
 */
test('estrutura e mídia sobrevivem ao PATCH, inclusive renomear e reordenar', async (t) => {
  const root = join(tmpdir(), `ds-secoes-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { normalizarProjectLayout } = await import('@ds/shared');
  const { projectsRoute } = await import('./projects.js');
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

  const kitId = `kit_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  db.insert(tables.kits)
    .values({ id: kitId, name: 'Kit', description: null, createdAt: 1, updatedAt: 1 })
    .run();

  const app = new Hono().route('/api/projects', projectsRoute);

  const criado = (await (
    await app.request('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Pelina', kitId }),
    })
  ).json()) as { item: { id: string } };
  const id = criado.item.id;

  const secoes = [
    { id: 'sec_1', nome: 'Abertura', papel: 'hero', componentIds: ['cmp_b', 'cmp_a'] },
    { id: 'sec_2', nome: 'Planos', componentIds: [], instrucao: 'não citar preço' },
    { id: 'sec_3', nome: 'Rodapé', papel: 'footer', componentIds: [] },
  ];

  const patch = async (corpo: unknown): Promise<Response> =>
    app.request(`/api/projects/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });

  assert.equal((await patch({ layout: { secoes } })).status, 200);

  const lido = async () => {
    const r = (await (await app.request(`/api/projects/${id}`)).json()) as {
      item: { layoutJson: string | null; mediaManifestJson: string | null };
    };
    return r.item;
  };

  const layout = normalizarProjectLayout((await lido()).layoutJson);
  assert.deepEqual(
    layout.secoes.map((s) => s.id),
    ['sec_1', 'sec_2', 'sec_3'],
    'a ordem das seções é a da página',
  );
  assert.deepEqual(
    layout.secoes[0]?.componentIds,
    ['cmp_b', 'cmp_a'],
    'a ordem DENTRO da seção também é escolha do usuário, não alfabética',
  );
  assert.equal(layout.secoes[1]?.instrucao, 'não citar preço');
  assert.deepEqual(layout.secoes[1]?.componentIds, [], 'seção sem peça continua sem peça');

  // Seção recém-criada, com nome ainda em branco: é o estado que o autosave
  // grava meio segundo depois do clique em "adicionar". Recusar aqui devolveria
  // 400 no meio de uma edição normal.
  assert.equal(
    (await patch({ layout: { secoes: [...secoes, { id: 'sec_4', nome: '', componentIds: [] }] } }))
      .status,
    200,
    'seção sem nome tem de ser gravável; quem exige nome é o gate da etapa',
  );

  // Mídia ancorada na seção, e a seção depois renomeada e movida para o fim.
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'banner.png', { type: 'image/png' }));
  form.append('kind', 'image');
  form.append('secaoId', 'sec_1');
  const enviada = await app.request(`/api/projects/${id}/media`, { method: 'POST', body: form });
  assert.equal(enviada.status, 201);

  await patch({
    layout: {
      secoes: [
        secoes[1],
        secoes[2],
        { id: 'sec_1', nome: 'Comece por aqui', papel: 'hero', componentIds: ['cmp_a'] },
      ],
    },
  });

  const manifest = JSON.parse((await lido()).mediaManifestJson ?? '[]') as {
    secaoId?: string;
  }[];
  assert.equal(
    manifest[0]?.secaoId,
    'sec_1',
    'a mídia se ancora no id, então renomear e reordenar a seção não a desloca',
  );
});
