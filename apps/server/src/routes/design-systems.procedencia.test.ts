import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

/**
 * A listagem da Galeria, nas duas coisas que esta fatia ligou:
 *
 * 1. o pacote de um segmento é resolvido pela IDENTIDADE (o prefixo do hash que
 *    o nome do print carrega), e não pela posição. A pasta do pacote deixou de
 *    ser `seg_<position>` no momento em que a posição passou a ser só ordem de
 *    exibição, e ler pela posição servia o pacote do vizinho com o nome certo;
 * 2. cada item diz de onde vem o que a prévia dele mostra.
 *
 * O acervo é montado em disco com um pacote ISCA na posição do segmento e o
 * pacote de verdade em outra pasta: se a resolução voltar a ser por posição, o
 * teste pega a isca e falha na representação e nas limitações.
 */
test('a listagem resolve o pacote por identidade e declara a procedência', async (t) => {
  const root = join(tmpdir(), `ds-proc-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { designSystemsRoute } = await import('./design-systems.js');
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

  const heroId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const rodapeId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const botaoId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const HASH_DO_HERO = '0123456789abcdef';

  const linhas = [
    { id: heroId, category: 'hero', name: 'Dobra com manchete', position: 0, parentId: null },
    { id: rodapeId, category: 'footer', name: 'Rodapé com links', position: 1, parentId: null },
    { id: botaoId, category: 'button', name: 'Botão principal', position: 2, parentId: heroId },
  ];
  for (const l of linhas) {
    getDb()
      .insert(tables.segments)
      .values({
        id: l.id,
        designSystemId: dsId,
        category: l.category,
        kind: 'component',
        name: l.name,
        htmlSnippet: `<div class="${l.category}">x</div>`,
        previewPath: null,
        position: l.position,
        inLibrary: false,
        parentId: l.parentId,
      })
      .run();
  }

  const manifesto = shared.vaultSegmentsManifest(dsId);
  mkdirSync(dirname(manifesto), { recursive: true });
  const insight = (segmentId: string, framePath?: string) => ({
    segmentId,
    support: 'completo',
    renderMode: 'html',
    fidelity: 90,
    warnings: [],
    capabilities: {},
    interactions: [],
    ...(framePath !== undefined ? { framePath } : {}),
  });
  writeFileSync(
    manifesto,
    JSON.stringify({
      designSystemId: dsId,
      generatedAt: Date.now(),
      segments: linhas.map((l) => ({
        id: l.id,
        designSystemId: dsId,
        category: l.category,
        kind: 'component',
        name: l.name,
        htmlSnippet: `<div class="${l.category}">x</div>`,
        previewPath: null,
        position: l.position,
        inLibrary: false,
        parentId: l.parentId,
      })),
      // Só o hero tem print da dobra, e o print é a única identidade que sobra:
      // o hash completo não é gravado por segmento em lugar nenhum.
      insights: [
        insight(heroId, `frames/secao-${HASH_DO_HERO.slice(0, 10)}-1a2b3c4d.png`),
        insight(rodapeId),
      ],
    }),
    'utf8',
  );

  const escreverPacote = (pasta: string, tipo: string, hash: string, limitacao: string): void => {
    const dir = join(shared.vaultSegmentBundlesDir(dsId), pasta);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'manifest.json'),
      JSON.stringify({
        representation: { type: tipo },
        limitations: [limitacao],
        evidence: { segmentId: hash },
      }),
      'utf8',
    );
  };
  // A isca: mora exatamente onde a leitura por posição procuraria o hero.
  escreverPacote('seg_0', 'capsula-runtime', 'ffffffffffffffff', 'limitação do vizinho');
  escreverPacote('seg_7', 'componente-portatil', HASH_DO_HERO, 'limitação do hero');

  const app = new Hono();
  app.route('/api/design-systems', designSystemsRoute);
  const r = await app.request(`/api/design-systems/${dsId}/segments`);
  assert.equal(r.status, 200);
  const body = (await r.json()) as {
    items: Array<{
      id: string;
      limitacoes?: string[];
      procedencia: { fonte: string; entregavel: string | null; representacao: string | null };
      fidelity: { procedencia?: { fonte: string } } | null;
    }>;
  };
  const por = new Map(body.items.map((i) => [i.id, i]));

  const hero = por.get(heroId);
  assert.equal(hero?.procedencia.fonte, 'entregavel');
  assert.equal(hero?.procedencia.entregavel, 'proprio');
  assert.equal(
    hero?.procedencia.representacao,
    'componente-portatil',
    'a isca em seg_0 é cápsula: pegar ela é ler por posição de novo',
  );
  assert.deepEqual(hero?.limitacoes, ['limitação do hero']);
  // A procedência viaja também dentro do insight, que é onde o schema a declara.
  assert.equal(hero?.fidelity?.procedencia?.fonte, 'entregavel');

  const rodape = por.get(rodapeId);
  assert.equal(rodape?.procedencia.fonte, 'origem');
  assert.equal(rodape?.procedencia.entregavel, null, 'sem pacote não há entregável a prometer');
  assert.equal(
    rodape?.limitacoes,
    undefined,
    '`limitacoes` ausente é como o front vê "sem pacote"',
  );

  const botao = por.get(botaoId);
  // O recorte não tem insight nenhum: se a procedência viajasse só dentro de
  // `fidelity`, ela sumiria justamente onde a prévia é a origem.
  assert.equal(botao?.fidelity, null);
  assert.equal(botao?.procedencia.fonte, 'origem');
  assert.equal(botao?.procedencia.entregavel, 'do-pai');
});
