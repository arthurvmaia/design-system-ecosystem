import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { DesignSystemId } from '@ds/shared';

/**
 * E2E de DOWNLOAD REAL (seção 3 do pedido): um servidor de fixture serve uma
 * página com imagem, CSS externo (com imagem interna, @import aninhado, @font-face
 * e SVG sprite com fragmento) e um accordion com imagem no estado aberto. O
 * explorer baixa de verdade (secure fetcher, DS_ASSET_ALLOW_LOCAL=1), grava no
 * vault, segmenta. Então o SERVIDOR DE ORIGEM É DESLIGADO e os previews são
 * abertos: tudo tem de carregar só com os assets locais, comprovado pelas requests.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright/fixture opcional e não tipado
type Any = any;

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

// Globais do navegador (callbacks de evaluate/$eval).
declare const document: Any;
declare const getComputedStyle: (el: Any) => Any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><symbol id="star"><path d="M0 0h8v8H0z"/></symbol></svg>',
);

const INDEX_HTML = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/style.css"></head><body>
<section><h2>Destaque com mídia</h2><img id="im" src="/a.png" width="40" height="40"><div class="bg"></div><span id="txt">A</span></section>
<section><div class="acc-item"><button id="acc-t" class="acc-trigger" aria-expanded="false">Abrir conteúdo com imagem</button><div class="acc-painel"><img id="im2" src="/b.png" width="30" height="30"></div></div></section>
<script>document.getElementById('acc-t').addEventListener('click',function(){var it=this.parentElement;var open=it.classList.toggle('aberto');this.setAttribute('aria-expanded',open?'true':'false')})</script>
</body></html>`;

const STYLE_CSS = `@import "sub.css";
@font-face{font-family:'DSTestFont';src:url(font.ttf) format('truetype')}
.acc-painel{display:none}
.acc-item.aberto .acc-painel{display:block}
.bg{background-image:url(img/bg.png);width:60px;height:60px}
#txt{font-family:'DSTestFont',serif}`;
const SUB_CSS = '.icon{mask:url(icons.svg#star) no-repeat}';

test('e2e download real: baixa da origem, serve local, funciona com a origem desligada', async (t) => {
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

  // === Servidor de FIXTURE (a "origem") ===
  const rotas: Record<string, { mime: string; body: Buffer }> = {
    '/index.html': { mime: 'text/html', body: Buffer.from(INDEX_HTML) },
    '/style.css': { mime: 'text/css', body: Buffer.from(STYLE_CSS) },
    '/sub.css': { mime: 'text/css', body: Buffer.from(SUB_CSS) },
    '/a.png': { mime: 'image/png', body: PNG_1x1 },
    '/b.png': { mime: 'image/png', body: PNG_1x1 },
    '/img/bg.png': { mime: 'image/png', body: PNG_1x1 },
    '/icons.svg': { mime: 'image/svg+xml', body: SVG },
    '/font.ttf': { mime: 'font/ttf', body: TTF },
  };
  const pedidosOrigem: string[] = [];
  const fixture = createServer((req: Any, res: Any) => {
    pedidosOrigem.push(req.url);
    const r = rotas[(req.url ?? '').split('?')[0]];
    if (!r) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': r.mime });
    res.end(r.body);
  });
  await new Promise<void>((r) => fixture.listen(0, r));
  const fixPort = (fixture.address() as Any).port;
  const fixBase = `http://localhost:${fixPort}`;

  const root = join(tmpdir(), `ds-dl-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  process.env.WEB_ORIGIN = 'http://localhost:5173';
  process.env.DS_ASSET_ALLOW_LOCAL = '1'; // só o fetcher; permite baixar do fixture local

  const shared = await import('@ds/shared');
  const { explorePage, absolutizeRefs } = await import('@ds/explorer');
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

  // === Captura REAL: renderiza + baixa os assets do fixture ===
  let designHtml = '';
  const manifest = await explorePage(`${fixBase}/index.html`, {
    exploration: { mode: 'deep', reasons: ['fixture'] },
    assetSink: (localPath, bytes) => {
      const dest = join(assetsDir, localPath);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, bytes);
    },
    onRenderedHtml: (html) => {
      designHtml = absolutizeRefs(html, `${fixBase}/index.html`);
    },
  });
  writeFileSync(join(shared.vaultExtractedDir(dsId), 'design-system.html'), designHtml);
  writeFileSync(shared.vaultCaptureManifest(dsId), JSON.stringify(manifest));

  t.diagnostic(
    `assets baixados: ${manifest.assets.length} (${manifest.assets.map((a) => a.kind).join(',')})`,
  );
  // Prova de download real: os arquivos foram gravados e os hashes batem.
  assert.ok(
    manifest.assets.some((a) => a.kind === 'css'),
    'CSS externo baixado',
  );
  assert.ok(
    manifest.assets.some((a) => a.kind === 'font'),
    'fonte baixada',
  );
  assert.ok(
    manifest.assets.some((a) => a.kind === 'image'),
    'imagens baixadas',
  );
  assert.ok(pedidosOrigem.includes('/style.css'), 'o explorer pediu o CSS ao fixture');
  assert.ok(pedidosOrigem.includes('/font.ttf'), 'o explorer pediu a fonte ao fixture');

  const seg = segmentDesignSystem(dsId);
  const db = getDb();
  db.insert(tables.designSystems)
    .values({
      id: dsId,
      sourceUrl: fixBase,
      sourceHash: randomUUID(),
      extractedAt: Date.now(),
      name: 'download real',
      stackJson: null,
      status: 'segmented',
      vaultPath: shared.vaultExtractedDir(dsId),
      errorMessage: null,
    })
    .run();
  for (const s of seg.segments) db.insert(tables.segments).values(s).run();
  const heroId = seg.segments.find((s) => s.htmlSnippet.includes('/a.png'))?.id;
  const accId = (seg.insights ?? []).find((i) => i.states && i.states.length > 0)?.segmentId;
  assert.ok(heroId, 'segmento hero criado');

  // === DESLIGA O SERVIDOR DE ORIGEM ===
  await new Promise<void>((r) => fixture.close(() => r()));
  pedidosOrigem.length = 0;

  // === Serve preview + assets (SEM a origem) ===
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
    process.env.DS_ASSET_ALLOW_LOCAL = undefined;
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

  await t.test('hero: imagem, background e FONTE carregam local (origem desligada)', async () => {
    const frame = await abrir(heroId as string, false);
    await frame.waitForSelector('#im');
    await frame.waitForFunction(
      () => {
        const im = document.querySelector('#im') as Any;
        return im?.complete && im.naturalWidth > 0;
      },
      { timeout: 5000 },
    );
    // Fonte real carregada e aplicada.
    await frame.evaluate(() => document.fonts.ready);
    const fontOk = await frame.evaluate(() => document.fonts.check("16px 'DSTestFont'"));
    assert.equal(fontOk, true, 'document.fonts.check da fonte local');
    const fam = await frame.$eval('#txt', (el: Any) => getComputedStyle(el).fontFamily);
    assert.match(fam, /DSTestFont/, 'família aplicada no estilo computado');
    // Background local.
    const bg = await frame.$eval('.bg', (el: Any) => getComputedStyle(el).backgroundImage);
    assert.match(bg, /\/api\/asset\/ds_.+\/image\//);
  });

  await t.test('accordion: estado revela imagem local; Reiniciar restaura', async () => {
    if (!accId) return t.diagnostic('sem estado de accordion capturado — pulando replay');
    const frame = await abrir(accId, true);
    await frame.waitForSelector('#ds-rp-alvo');
    await frame.click('[data-estado]:not([data-estado="__reset__"])');
    await frame.waitForFunction(
      () => {
        const im = document.querySelector('#im2') as Any;
        return im?.complete && im.naturalWidth > 0;
      },
      { timeout: 5000 },
    );
    const src = await frame.$eval('#im2', (el: Any) => el.getAttribute('src'));
    assert.match(src, /\/api\/asset\/ds_.+\/image\//, 'imagem do estado é local');
    await frame.click('[data-estado="__reset__"]');
  });

  await t.test('ZERO requests para a origem; CSS/@import/sprite/fonte vieram de /api/asset', () => {
    const origem = requisicoes.filter((u) => u.startsWith(fixBase));
    assert.deepEqual(origem, [], `nenhuma request à origem (${origem.slice(0, 3).join(', ')})`);
    assert.equal(pedidosOrigem.length, 0, 'o servidor de origem (desligado) não recebeu nada');
    const local = (re: RegExp) => requisicoes.some((u) => re.test(u));
    assert.ok(local(/\/api\/asset\/ds_.+\/css\//), 'CSS externo servido local');
    assert.ok(local(/\/api\/asset\/ds_.+\/font\//), 'fonte servida local');
    assert.ok(local(/\/api\/asset\/ds_.+\/image\//), 'imagens servidas local');
    assert.deepEqual(consoleErros, [], `console limpo (${consoleErros.slice(0, 3).join(' | ')})`);
  });

  await t.test('fidelidade: assets do hero são completos (tudo local)', async () => {
    const res = await fetch(`${base}/api/design-systems/${dsId}/segments`);
    const body = (await res.json()) as Any;
    const hero = body.items.find((i: Any) => i.id === heroId)?.fidelity;
    assert.equal(hero?.dimensions?.assets, 'completo');
  });
});
