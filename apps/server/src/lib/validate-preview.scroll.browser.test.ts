import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DesignSystemId } from '@ds/shared';

/**
 * O validador de produção testa SCROLL REAL (item 9 / critério 8): monta o
 * candidato a partir dos comportamentos de scroll do insight, abre `?scroll=1`,
 * rola o alvo, confere que o efeito aconteceu e que Reiniciar restaurou — e grava
 * o resultado. Prova o caminho reprodução → validação em Chromium.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright opcional, não tipado
type Any = any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const REVEAL: Any = {
  id: 'scb_1',
  kind: 'viewport-reveal',
  trigger: 'viewport',
  target: { id: 'rev', classes: ['card'] },
  scrollContainer: 'window',
  start: 0.2,
  end: 0.6,
  keyframes: [
    { progress: 0, properties: { opacity: '0' } },
    { progress: 1, properties: { opacity: '1' } },
  ],
  scrub: false,
  pin: false,
  confidence: 'alta',
  limitations: [],
};

test('validador: valida scroll real e grava o resultado (navegador)', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  const root = join(tmpdir(), `ds-val-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { validarPreviews } = await import('./validate-preview.js');

  ensureDataTree();
  getDb();
  runMigrations();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as DesignSystemId;
  const segId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  writeFileSync(
    join(shared.vaultExtractedDir(dsId), 'design-system.html'),
    '<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body></body></html>',
  );

  const htmlSnippet =
    '<section><div id="rev" class="card" style="opacity:0;transition:none">Revelo</div></section>';
  const db = getDb();
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: 'http://x',
      sourceHash: randomUUID(),
      extractedAt: Date.now(),
      name: 'val-scroll',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();
  db.insert(tables.segments)
    .values({
      id: segId,
      designSystemId: dsId,
      category: 'hero',
      kind: 'component',
      name: 'Reveal',
      htmlSnippet,
      previewPath: null,
      position: 0,
      inLibrary: false,
    })
    .run();

  // Manifesto de segmentos com o insight carregando o comportamento de scroll.
  const behavior = REVEAL;
  mkdirSync(shared.vaultSegmentsDir(dsId), { recursive: true });
  writeFileSync(
    shared.vaultSegmentsManifest(dsId),
    JSON.stringify({
      designSystemId: dsId,
      generatedAt: Date.now(),
      segments: [
        {
          id: segId,
          designSystemId: dsId,
          category: 'hero',
          kind: 'component',
          name: 'Reveal',
          htmlSnippet,
          previewPath: null,
          position: 0,
          inLibrary: false,
        },
      ],
      insights: [
        {
          segmentId: segId,
          support: 'parcial',
          renderMode: 'html',
          fidelity: 70,
          warnings: [],
          capabilities: {},
          interactions: [],
          dimensions: { visual: 'completo', scroll: 'parcial' },
          scroll: [behavior],
        },
      ],
    }),
  );
  mkdirSync(shared.vaultSegmentScrollDir(dsId), { recursive: true });
  writeFileSync(
    shared.vaultSegmentScroll(dsId, segId),
    JSON.stringify({ segmentId: segId, generatedAt: Date.now(), behaviors: [behavior] }),
  );

  t.after(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  const file = await validarPreviews(dsId);
  const rScroll = file.results.find((r) => r.kind === 'scroll' && r.segmentId === segId);
  assert.ok(rScroll, 'o validador produziu um resultado de scroll');
  assert.equal(rScroll?.ok, true, 'scroll validado: efeito observado e reset restaurou');

  // O arquivo em disco reflete o mesmo.
  const emDisco = JSON.parse(readFileSync(shared.vaultSegmentValidation(dsId), 'utf8'));
  assert.ok(
    (emDisco.results ?? []).some((r: Any) => r.kind === 'scroll' && r.ok === true),
    'validation.json gravado com o scroll validado',
  );
});
