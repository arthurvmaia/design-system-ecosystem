import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { DesignSystemId } from '@ds/shared';

/**
 * Reprodução de SCROLL no preview em navegador real (itens 7-8): um segmento com
 * um comportamento viewport-reveal é servido com `?scroll=1`; rolar a área revela
 * o alvo (opacity 0→1), e "Reiniciar" restaura. Prova o caminho scroll real →
 * reprodução → reset, sem console sujo.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright/fixture opcional e não tipado
type Any = any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const DESIGN_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0}</style></head><body></body></html>`;

test('preview de scroll: reveal ao rolar + Reiniciar restaura (navegador real)', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  const root = join(tmpdir(), `ds-sc-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.WEB_ORIGIN = 'http://localhost:5173';

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { previewRoute } = await import('./preview.js');
  const { Hono } = await import('hono');
  const { serve } = await import('@hono/node-server');

  ensureDataTree();
  getDb();
  runMigrations();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as DesignSystemId;
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  writeFileSync(join(shared.vaultExtractedDir(dsId), 'design-system.html'), DESIGN_HTML);

  const segId = `seg_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const db = getDb();
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: 'http://x',
      sourceHash: randomUUID(),
      extractedAt: Date.now(),
      name: 'scroll',
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
      htmlSnippet:
        '<section><div id="rev" class="card" style="opacity:0;transition:none">Revelo ao rolar</div></section>',
      previewPath: null,
      position: 0,
      inLibrary: false,
    })
    .run();

  // Comportamento de scroll: reveal do #rev (opacity 0→1 ao entrar na viewport).
  mkdirSync(shared.vaultSegmentScrollDir(dsId), { recursive: true });
  writeFileSync(
    shared.vaultSegmentScroll(dsId, segId),
    JSON.stringify({
      segmentId: segId,
      generatedAt: Date.now(),
      behaviors: [
        {
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
        },
      ],
    }),
  );

  const app = new Hono();
  app.route('/api/preview', previewRoute);
  const { srv, port } = await new Promise<{ srv: Any; port: number }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, (info: Any) =>
      resolve({ srv: s, port: info.port }),
    );
  });
  const base = `http://localhost:${port}`;

  const browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage();
  const erros: string[] = [];
  page.on('console', (m: Any) => m.type() === 'error' && erros.push(m.text()));
  page.on('pageerror', (e: Any) => erros.push(String(e)));

  t.after(async () => {
    await browser.close();
    await new Promise<void>((r) => srv.close(() => r()));
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* ignora */
    }
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  const url = `${base}/api/preview/segment/${segId}?scroll=1`;
  await page.setContent(
    `<!doctype html><iframe id="pf" src="${url}" sandbox="allow-scripts" style="width:900px;height:700px;border:0"></iframe>`,
  );
  const h = await page.waitForSelector('#pf');
  const frame = await h.contentFrame();
  if (!frame) throw new Error('sem frame');
  await frame.waitForSelector('#ds-sc-scroll');
  await frame.waitForSelector('#rev');

  const opacidade = (): Promise<number> =>
    frame.$eval('#rev', (el: Any) => Number(getComputedStyle(el).opacity));

  await t.test('inicial: alvo escondido (opacity 0)', async () => {
    assert.ok((await opacidade()) < 0.1, 'começa escondido');
  });

  await t.test('rolar revela o alvo (opacity → 1)', async () => {
    await frame.evaluate(() => {
      document.getElementById('rev')?.scrollIntoView({ block: 'center' });
    });
    await frame.waitForFunction(
      () => Number(getComputedStyle(document.getElementById('rev') as Any).opacity) > 0.9,
      { timeout: 4000 },
    );
    assert.ok((await opacidade()) > 0.9, 'revelou ao rolar');
  });

  await t.test('Reiniciar restaura o estado inicial', async () => {
    await frame.click('#ds-sc-reset');
    await frame.waitForFunction(
      () => Number(getComputedStyle(document.getElementById('rev') as Any).opacity) < 0.1,
      { timeout: 4000 },
    );
    assert.ok((await opacidade()) < 0.1, 'voltou ao inicial');
  });

  await t.test('sem erros de console', () => {
    assert.deepEqual(erros, [], `console limpo (${erros.slice(0, 2).join(' | ')})`);
  });
});

// Globais do navegador (callbacks de evaluate).
declare const document: Any;
declare const getComputedStyle: (el: Any) => Any;
