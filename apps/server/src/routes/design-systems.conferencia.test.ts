import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

/**
 * A conferência de pixel com DONO, a confiança que pode cair e a geração da
 * validação. Os três defeitos são do mesmo acervo real:
 *
 * 1. O manifesto tinha 8 de 10 comparações REPROVADAS e a tela dizia que a
 *    comparação "só roda em captura completa". A associação era pela ordem do
 *    array e exigia `comparações == segmentos com print`, condição falsa em
 *    7 de 7 capturas (item pulado por orçamento não deixa marca). Agora cada
 *    comparação carrega `position`, e o lookup é por identidade — este teste
 *    monta EXATAMENTE o cenário quebrado: mais prints que comparações.
 *
 * 2. `confidence` valia "alta" em 90 de 92 segmentos porque só somava sinais
 *    coletados. Aqui a peça reprovada com delta 0,99 tem de cair para "baixa".
 *
 * 3. `validation.json` de uma captura anterior sobrevivia à reextração e
 *    fingia cobrir a nova (0 de 49 resultados casavam). Com o carimbo de
 *    geração, arquivo de outra geração é tratado como inexistente.
 */
test('a comparação acha o dono por identidade, rebaixa a confiança e respeita a geração', async (t) => {
  const root = join(tmpdir(), `ds-conf-${randomUUID().slice(0, 8)}`);
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
      name: 'Acervo de conferência',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();

  const navId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const heroId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const linhas = [
    { id: navId, category: 'nav', name: 'Navegação', position: 0 },
    { id: heroId, category: 'hero', name: 'Dobra de abertura', position: 1 },
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
        parentId: null,
      })
      .run();
  }

  const manifesto = shared.vaultSegmentsManifest(dsId);
  mkdirSync(dirname(manifesto), { recursive: true });
  const insight = (segmentId: string, framePath: string) => ({
    segmentId,
    support: 'completo',
    renderMode: 'html',
    fidelity: 90,
    warnings: [],
    capabilities: {},
    interactions: [],
    confidence: 'alta',
    framePath,
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
        parentId: null,
      })),
      // OS DOIS têm print. A captura antiga associava por ordem e exigia
      // comparações == prints; aqui há 2 prints e 1 comparação, de propósito.
      insights: [
        insight(navId, 'frames/secao-aaaaaaaaaa-1.png'),
        insight(heroId, 'frames/secao-bbbbbbbbbb-2.png'),
      ],
    }),
    'utf8',
  );

  // O manifesto de captura: UMA comparação, reprovada feio, com o dono escrito.
  const capturaManifest = shared.vaultCaptureV2Manifest(dsId);
  mkdirSync(dirname(capturaManifest), { recursive: true });
  writeFileSync(
    capturaManifest,
    JSON.stringify({
      visualComparisons: [
        {
          a: 'captura',
          b: 'bundle',
          segmentHash: 'bbbbbbbbbbbbbbbb',
          position: 1,
          nature: 'estatica',
          threshold: 0.02,
          delta: 0.99,
          ok: false,
        },
      ],
      limitations: ['8 de 10 bundle(s) não bateram com o print da dobra.'],
    }),
    'utf8',
  );

  const app = new Hono();
  app.route('/api/design-systems', designSystemsRoute);

  type Item = {
    id: string;
    comparacaoVisual?: { delta: number; limiar: number; passou: boolean };
    vereditos: Array<{ canal: string; estado: string; motivo: string }>;
    fidelity: { confidence?: string } | null;
  };
  const pedir = async (): Promise<{ items: Item[]; limitacoesDaCaptura?: string[] }> => {
    const r = await app.request(`/api/design-systems/${dsId}/segments`);
    assert.equal(r.status, 200);
    return (await r.json()) as { items: Item[]; limitacoesDaCaptura?: string[] };
  };

  const corpo = await pedir();
  const por = new Map(corpo.items.map((i) => [i.id, i]));

  // 1. A reprovação chega à peça certa, mesmo com menos comparações que prints.
  const hero = por.get(heroId);
  assert.equal(hero?.comparacaoVisual?.passou, false);
  assert.equal(hero?.comparacaoVisual?.delta, 0.99);
  const pixelDoHero = hero?.vereditos.find((v) => v.canal === 'pixel');
  assert.equal(pixelDoHero?.estado, 'falhou');

  // O nav não foi comparado, e a frase diz isso sem inventar causa.
  const pixelDoNav = por.get(navId)?.vereditos.find((v) => v.canal === 'pixel');
  assert.equal(pixelDoNav?.estado, 'nao-rodou');
  assert.ok(
    !pixelDoNav?.motivo.includes('só roda em captura completa'),
    'a frase falsa foi removida: a comparação RODA em captura parcial',
  );

  // 2. A confiança caiu com a reprovação: delta 0,99 segura em "baixa".
  assert.equal(hero?.fidelity?.confidence, 'baixa');
  // E onde nada reprovou, a confiança medida fica de pé.
  assert.equal(por.get(navId)?.fidelity?.confidence, 'alta');

  // 3. As limitações da captura chegam à resposta, nas palavras do motor.
  assert.deepEqual(corpo.limitacoesDaCaptura, [
    '8 de 10 bundle(s) não bateram com o print da dobra.',
  ]);

  // 4. validation.json de OUTRA geração é tratado como inexistente, mesmo com
  //    os ids atuais dentro (o cenário da reextração que reaproveita ids não
  //    existe, mas o carimbo protege até dele).
  const validacao = shared.vaultSegmentValidation(dsId);
  const resultadoScroll = { segmentId: heroId, kind: 'capsula', ok: false, detail: 'não bateu' };
  writeFileSync(
    validacao,
    JSON.stringify({
      designSystemId: dsId,
      generatedAt: Date.now(),
      geracao: 'ffffffff',
      results: [resultadoScroll],
    }),
    'utf8',
  );
  const comGeracaoErrada = await pedir();
  const heroStale = comGeracaoErrada.items.find((i) => i.id === heroId);
  const navegadorStale = heroStale?.vereditos.find((v) => v.canal === 'navegador');
  assert.equal(
    navegadorStale?.estado,
    'nao-rodou',
    'validação de outra geração não pode reprovar a captura atual',
  );

  // Com a geração CERTA, o mesmo arquivo passa a valer.
  writeFileSync(
    validacao,
    JSON.stringify({
      designSystemId: dsId,
      generatedAt: Date.now(),
      geracao: shared.geracaoDeSegmentos(linhas.map((l) => l.id)),
      results: [resultadoScroll],
    }),
    'utf8',
  );
  const comGeracaoCerta = await pedir();
  const heroVivo = comGeracaoCerta.items.find((i) => i.id === heroId);
  const navegadorVivo = heroVivo?.vereditos.find((v) => v.canal === 'navegador');
  assert.equal(navegadorVivo?.estado, 'falhou');
});
