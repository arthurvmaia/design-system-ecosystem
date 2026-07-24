import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CaptureManifest, CapturedAsset, DesignSystemId } from '@ds/shared';

/**
 * E2E: a Biblioteca preserva CSS externo + fonte + imagem e continua funcionando
 * DEPOIS de a extração ser apagada (objetivo 7 / aceite 13-15). Curte, apaga a
 * extração (vault + banco), abre o preview do componente e comprova que tudo
 * carrega da rota do bundle — nada da origem.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright/servidor opcional e não tipado
type Any = any;
declare const document: Any;
declare const getComputedStyle: (el: Any) => Any;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const ORIGEM = 'https://origem.fake';
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const DESIGN_HTML = `<!doctype html><html><head><link rel="stylesheet" href="${ORIGEM}/main.css"></head><body>
<!-- hero -->
<section class="hero"><h2>Hero com CSS externo</h2><img id="im" src="${ORIGEM}/a.png" width="40" height="40"><div class="bg"></div><span id="txt">Texto</span></section>
<!-- rodape -->
<section><h2>Rodapé</h2><p>Um segundo bloco qualquer.</p></section>
</body></html>`;

// CSS já REESCRITO como o processador produz (refs relativas a css/).
const MAIN_CSS = `@font-face{font-family:'DSTestFont';src:url(../font/f.ttf) format('truetype')}
.bg{background-image:url(../image/bg.png);width:60px;height:60px}
#txt{font-family:'DSTestFont',serif}`;

const asset = (originalUrl: string, localPath: string, kind: Any, mime: string): CapturedAsset => ({
  originalUrl,
  localPath,
  sha256: localPath,
  mimeType: mime,
  ext: localPath.split('.').pop(),
  bytes: 10,
  kind,
  status: 'local',
});

test('Biblioteca: componente com CSS externo funciona após apagar a extração', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  const { minimalTtf } = await import(pathToFileURL(join(REPO, 'fixtures/minimal-font.ts')).href);
  const TTF: Buffer = minimalTtf('DSTestFont');

  const root = join(tmpdir(), `ds-lib-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.WEB_ORIGIN = 'http://localhost:5173';

  const shared = await import('@ds/shared');
  const { ensureDataTree, getDb, runMigrations, tables } = await import('@ds/indexer');
  const { previewRoute } = await import('./preview.js');
  const { assetRoute, libraryAssetRoute } = await import('./asset.js');
  const { libraryRoute } = await import('./library.js');
  const { Hono } = await import('hono');
  const { serve } = await import('@hono/node-server');

  ensureDataTree();
  getDb();
  runMigrations();

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 20)}` as DesignSystemId;
  mkdirSync(shared.vaultExtractedDir(dsId), { recursive: true });
  mkdirSync(shared.vaultCaptureDir(dsId), { recursive: true });
  const ad = shared.vaultCaptureAssetsDir(dsId);
  mkdirSync(join(ad, 'css'), { recursive: true });
  mkdirSync(join(ad, 'image'), { recursive: true });
  mkdirSync(join(ad, 'font'), { recursive: true });
  writeFileSync(join(ad, 'css', 'main.css'), MAIN_CSS);
  writeFileSync(join(ad, 'image', 'a.png'), PNG);
  writeFileSync(join(ad, 'image', 'bg.png'), PNG);
  writeFileSync(join(ad, 'font', 'f.ttf'), TTF);
  writeFileSync(join(shared.vaultExtractedDir(dsId), 'design-system.html'), DESIGN_HTML);
  const manifest: CaptureManifest = {
    version: 1,
    url: ORIGEM,
    capturedAt: Date.now(),
    strategy: 'playwright',
    viewport: { width: 1440, height: 900 },
    stylesheets: [],
    assets: [
      asset(`${ORIGEM}/main.css`, 'css/main.css', 'css', 'text/css'),
      asset(`${ORIGEM}/a.png`, 'image/a.png', 'image', 'image/png'),
      asset(`${ORIGEM}/bg.png`, 'image/bg.png', 'image', 'image/png'),
      asset(`${ORIGEM}/f.ttf`, 'font/f.ttf', 'font', 'font/ttf'),
    ],
    elements: [],
    stats: {
      durationMs: 1,
      elementsAnalyzed: 0,
      interactionsTried: 0,
      statesFound: 0,
      assetsFound: 4,
      assetsSaved: 4,
      assetsBytes: 40,
    },
    warnings: [],
  };
  writeFileSync(shared.vaultCaptureManifest(dsId), JSON.stringify(manifest));

  const db = getDb();
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: ORIGEM,
      sourceHash: randomUUID(),
      extractedAt: Date.now(),
      name: 'lib assets',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();
  // Segmento COESO inserido direto (o teste é da Biblioteca, não da heurística de
  // segmentação): a seção hero com imagem + #txt + .bg, como a Galeria a manteria.
  const heroSeg = {
    id: shared.newSegmentId(),
    designSystemId: dsId,
    category: 'hero' as const,
    kind: 'component' as const,
    name: 'Hero',
    htmlSnippet: `<section class="hero"><h2>Hero com CSS externo</h2><img id="im" src="${ORIGEM}/a.png" width="40" height="40"><div class="bg"></div><span id="txt">Texto</span></section>`,
    previewPath: null,
    position: 0,
    inLibrary: false,
  };
  db.insert(tables.segments).values(heroSeg).run();

  const app = new Hono();
  app.route('/api/preview', previewRoute);
  app.route('/api/asset', assetRoute);
  app.route('/api/library-asset', libraryAssetRoute);
  app.route('/api/library', libraryRoute);
  const { srv, port } = await new Promise<{ srv: Any; port: number }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, (info: Any) =>
      resolve({ srv: s, port: info.port }),
    );
  });
  const base = `http://localhost:${port}`;

  // === CURTIR (roda montarComponente: copia CSS externo + transitivos + head) ===
  const likeRes = await fetch(`${base}/api/library`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ segmentId: heroSeg.id }),
  });
  const likeBody = (await likeRes.json()) as Any;
  const cmpId = likeBody.item?.id as string;
  assert.ok(cmpId?.startsWith('cmp_'), 'componente criado');

  // O bundle tem o CSS externo, a fonte, a imagem e o head portátil.
  const bundleAssets = join(shared.libraryComponentBundleDir(cmpId as `cmp_${string}`), 'assets');
  assert.ok(existsSync(join(bundleAssets, 'css', 'main.css')), 'CSS externo no bundle');
  assert.ok(existsSync(join(bundleAssets, 'image', 'bg.png')), 'imagem interna do CSS no bundle');
  assert.ok(existsSync(join(bundleAssets, 'font', 'f.ttf')), 'fonte no bundle');
  assert.ok(
    existsSync(join(shared.libraryComponentBundleDir(cmpId as `cmp_${string}`), 'head.html')),
    'head portátil no bundle',
  );

  // === APAGA A EXTRAÇÃO (vault + banco) — ambiente isolado de teste ===
  const { eq } = await import('drizzle-orm');
  db.delete(tables.segments).where(eq(tables.segments.designSystemId, dsId)).run();
  db.delete(tables.designSystems).where(eq(tables.designSystems.id, dsId)).run();
  rmSync(shared.vaultDsDir(dsId), { recursive: true, force: true });
  assert.ok(!existsSync(shared.vaultExtractedDir(dsId)), 'extração apagada');

  // === Preview do componente no navegador, SEM a extração ===
  const requisicoes: string[] = [];
  const consoleErros: string[] = [];
  const browser = await pw.chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('request', (r: Any) => requisicoes.push(r.url()));
  page.on('console', (m: Any) => m.type() === 'error' && consoleErros.push(m.text()));
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

  await page.setContent(
    `<!doctype html><iframe id="pf" src="${base}/api/preview/component/${cmpId}" sandbox="allow-scripts" style="width:800px;height:600px;border:0"></iframe>`,
  );
  const h = await page.waitForSelector('#pf');
  const frame = await h.contentFrame();
  if (!frame) throw new Error('sem frame');
  await frame.waitForSelector('#im', { timeout: 5000 });

  await t.test(
    'imagem, CSS externo, background e fonte carregam do bundle (origem apagada)',
    async () => {
      await frame.waitForFunction(
        () => {
          const im = document.querySelector('#im') as Any;
          return im?.complete && im.naturalWidth > 0;
        },
        { timeout: 5000 },
      );
      await frame.evaluate(() => document.fonts.ready);
      assert.equal(
        await frame.evaluate(() => document.fonts.check("16px 'DSTestFont'")),
        true,
        'fonte do bundle',
      );
      const fam = await frame.$eval('#txt', (el: Any) => getComputedStyle(el).fontFamily);
      assert.match(fam, /DSTestFont/);
      const bg = await frame.$eval('.bg', (el: Any) => getComputedStyle(el).backgroundImage);
      assert.match(
        bg,
        /\/api\/library-asset\/cmp_.+\/image\/bg\.png/,
        'background do CSS externo, local',
      );
    },
  );

  await t.test('zero requests para a origem; tudo veio do bundle', () => {
    assert.deepEqual(
      requisicoes.filter((u) => u.startsWith(ORIGEM)),
      [],
    );
    assert.ok(
      requisicoes.some((u) => /\/api\/library-asset\/cmp_.+\/css\//.test(u)),
      'CSS do bundle',
    );
    assert.ok(
      requisicoes.some((u) => /\/api\/library-asset\/cmp_.+\/font\//.test(u)),
      'fonte do bundle',
    );
    assert.deepEqual(consoleErros, [], `console limpo (${consoleErros.slice(0, 2).join(' | ')})`);
  });
});
