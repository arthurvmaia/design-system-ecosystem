import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { CaptureManifest, CapturedAsset, DesignSystemId } from '@ds/shared';

/**
 * E2E real (seção 18): prova que o preview carrega os assets pela ROTA DO VAULT,
 * não da origem. Popula o vault (capture/assets + manifesto com índice +
 * design-system.html com refs de origem), segmenta, sobe preview + rota de asset,
 * abre no navegador e INTERCEPTA as requests:
 *   - imagem e background carregam de `/api/asset/...` (200, visível);
 *   - NENHUM request para a origem falsa;
 *   - estado do accordion revela imagem local;
 *   - Reiniciar restaura; console limpo; fidelidade `assets` = completo.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright/servidor opcional e não tipado
type Any = any;

// Globais do NAVEGADOR: só dentro dos callbacks de frame.evaluate/$eval.
declare const document: Any;
declare const getComputedStyle: (el: Any) => Any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

// PNG 1x1 transparente válido (para o navegador carregar de verdade).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const ORIGEM = 'https://origem.fake';

const DESIGN_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
.acc-painel{display:none}.acc-item.aberto .acc-painel{display:block}
.bg{background-image:url(${ORIGEM}/bg.png);width:80px;height:80px}
</style></head><body>
<section><h2>Destaque com mídia</h2><img id="im" src="${ORIGEM}/a.png" width="40" height="40"><div class="bg"></div></section>
<section><div class="acc-item"><button id="acc-t" class="acc-trigger" aria-expanded="false">Abrir conteúdo com imagem</button><div class="acc-painel"><img id="im2" src="${ORIGEM}/b.png" width="30" height="30"></div></div></section>
</body></html>`;

const ACC_ABERTO = `<section><div class="acc-item aberto"><button id="acc-t" class="acc-trigger" aria-expanded="true">Abrir conteúdo com imagem</button><div class="acc-painel"><img id="im2" src="${ORIGEM}/b.png" width="30" height="30"></div></div></section>`;

const asset = (originalUrl: string, localPath: string): CapturedAsset => ({
  originalUrl,
  localPath,
  sha256: localPath,
  mimeType: 'image/png',
  ext: 'png',
  bytes: PNG_1x1.byteLength,
  kind: 'image',
  status: 'local',
});

const manifesto = (): CaptureManifest => ({
  version: 1,
  url: 'http://local/',
  capturedAt: Date.now(),
  strategy: 'playwright',
  exploration: { mode: 'deep', reasons: ['fixture'], durationMs: 1, limitsHit: [], errors: [] },
  viewport: { width: 1440, height: 900 },
  stylesheets: [],
  assets: [
    asset(`${ORIGEM}/a.png`, 'image/aa.png'),
    asset(`${ORIGEM}/b.png`, 'image/bb.png'),
    asset(`${ORIGEM}/bg.png`, 'image/bgbg.png'),
  ],
  elements: [
    {
      ref: 'r1',
      tag: 'button',
      role: null,
      box: { x: 0, y: 0, w: 120, h: 40 },
      label: 'acc-t',
      match: { id: 'acc-t', classes: [] },
      interactions: ['click', 'toggle'],
      states: [
        { id: 'st_acc', trigger: 'click', label: 'aberto', signature: 'a', html: ACC_ABERTO },
      ],
      assessment: {
        support: 'parcial',
        renderMode: 'html-js',
        fidelity: 70,
        warnings: [],
        capabilities: { dependsOnJs: true },
        interactions: [],
      },
    },
  ],
  stats: {
    durationMs: 1,
    elementsAnalyzed: 1,
    interactionsTried: 1,
    statesFound: 1,
    assetsFound: 3,
    assetsSaved: 3,
    assetsBytes: PNG_1x1.byteLength * 3,
  },
  warnings: [],
});

test('e2e assets locais: preview carrega da rota do vault, sem tocar a origem', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  const root = join(tmpdir(), `ds-eassets-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.WEB_ORIGIN = 'http://localhost:5173';

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { segmentDesignSystem } = await import('@ds/segmenter');
  const { previewRoute } = await import('./preview.js');
  const { assetRoute } = await import('./asset.js');
  const { designSystemsRoute } = await import('./design-systems.js');
  const { Hono } = await import('hono');
  const { serve } = await import('@hono/node-server');

  ensureDataTree();
  getDb();
  runMigrations();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as DesignSystemId;
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  mkdirSync(shared.vaultCaptureDir(dsId), { recursive: true });
  const assetsDir = shared.vaultCaptureAssetsDir(dsId);
  mkdirSync(join(assetsDir, 'image'), { recursive: true });
  for (const p of ['aa.png', 'bb.png', 'bgbg.png'])
    writeFileSync(join(assetsDir, 'image', p), PNG_1x1);
  writeFileSync(join(shared.vaultExtractedDir(dsId), 'design-system.html'), DESIGN_HTML);
  writeFileSync(shared.vaultCaptureManifest(dsId), JSON.stringify(manifesto()));

  const seg = segmentDesignSystem(dsId);
  const db = getDb();
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: null,
      sourceHash: randomUUID(),
      extractedAt: Date.now(),
      name: 'e2e assets',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();
  for (const s of seg.segments) db.insert(tables.segments).values(s).run();

  const heroId = seg.segments.find((s) => s.htmlSnippet.includes(`${ORIGEM}/a.png`))?.id;
  const accId = (seg.insights ?? []).find((i) =>
    i.states?.some((x) => x.id === 'st_acc'),
  )?.segmentId;
  assert.ok(heroId && accId, 'segmentos hero e accordion criados');

  const app = new Hono();
  app.route('/api/preview', previewRoute);
  app.route('/api/asset', assetRoute);
  app.route('/api/design-systems', designSystemsRoute);
  const { srv, port } = await new Promise<{ srv: Any; port: number }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, (info: Any) =>
      resolve({ srv: s, port: info.port }),
    );
  });
  const base = `http://localhost:${port}`;

  const requisicoes: string[] = [];
  const consoleErros: string[] = [];
  const browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('request', (r: Any) => requisicoes.push(r.url()));
  page.on('console', (m: Any) => {
    if (m.type() === 'error') consoleErros.push(m.text());
  });
  page.on('pageerror', (e: Any) => consoleErros.push(String(e)));

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

  const abrir = async (segId: string, replay: boolean): Promise<Any> => {
    const u = `${base}/api/preview/segment/${segId}${replay ? '?replay=1' : ''}`;
    await page.setContent(
      `<!doctype html><iframe id="pf" src="${u}" sandbox="allow-scripts" style="width:900px;height:700px;border:0"></iframe>`,
    );
    const h = await page.waitForSelector('#pf');
    const frame = await h.contentFrame();
    if (!frame) throw new Error('sem frame');
    await frame.waitForSelector('body', { timeout: 5000 });
    return frame;
  };

  await t.test('hero: imagem e background carregam da rota do vault (não da origem)', async () => {
    const frame = await abrir(heroId as string, false);
    await frame.waitForSelector('#im');
    // A imagem carregou de verdade (1x1 → naturalWidth 1).
    await frame.waitForFunction(
      () => {
        const im = document.querySelector('#im') as Any;
        return im?.complete && im.naturalWidth > 0;
      },
      { timeout: 4000 },
    );
    // O src aponta para a rota do vault.
    const src = await frame.$eval('#im', (el: Any) => el.getAttribute('src'));
    assert.match(src, /\/api\/asset\/ds_.+\/image\/aa\.png$/);
    // O background aponta para a rota do vault.
    const bg = await frame.$eval('.bg', (el: Any) => getComputedStyle(el).backgroundImage);
    assert.match(bg, /\/api\/asset\/ds_.+\/image\/bgbg\.png/);
  });

  await t.test('accordion: estado revela imagem LOCAL; Reiniciar restaura', async () => {
    const frame = await abrir(accId as string, true);
    await frame.waitForSelector('#ds-rp-alvo');
    await frame.click('[data-estado="st_acc"]');
    await frame.waitForSelector('#acc-t[aria-expanded="true"]', { timeout: 3000 });
    await frame.waitForFunction(
      () => {
        const im = document.querySelector('#im2') as Any;
        return im?.complete && im.naturalWidth > 0;
      },
      { timeout: 4000 },
    );
    const src2 = await frame.$eval('#im2', (el: Any) => el.getAttribute('src'));
    assert.match(src2, /\/api\/asset\/ds_.+\/image\/bb\.png$/, 'estado usa imagem local');
    await frame.click('[data-estado="__reset__"]');
    await frame.waitForSelector('#acc-t[aria-expanded="false"]', { timeout: 3000 });
  });

  await t.test('nenhuma request foi para a origem; assets vieram de /api/asset', () => {
    const origem = requisicoes.filter((u) => u.startsWith(ORIGEM));
    assert.deepEqual(origem, [], `sem request à origem (${origem.join(', ')})`);
    const locais = requisicoes.filter((u) => /\/api\/asset\/ds_.+\/image\//.test(u));
    assert.ok(locais.length >= 3, `assets servidos pela rota do vault (${locais.length})`);
    assert.deepEqual(consoleErros, [], `console limpo (${consoleErros.join(' | ')})`);
  });

  await t.test('fidelidade: dimensão assets = completo (tudo local)', async () => {
    const res = await fetch(`${base}/api/design-systems/${dsId}/segments`);
    const body = (await res.json()) as Any;
    const hero = body.items.find((i: Any) => i.id === heroId)?.fidelity;
    assert.equal(hero?.dimensions?.assets, 'completo', 'assets do hero são completos (locais)');
  });
});
