import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  assetRoutePrefix,
  coletarAssetRefs,
  construirIndiceAssets,
  reescreverParaLocal,
} from './asset-rewrite.js';
import type { CapturedAsset } from './schemas/capture.js';

const asset = (
  originalUrl: string,
  localPath: string,
  over: Partial<CapturedAsset> = {},
): CapturedAsset => ({
  originalUrl,
  localPath,
  sha256: 'x',
  mimeType: 'image/png',
  bytes: 10,
  kind: 'image',
  status: 'local',
  ...over,
});

const P = assetRoutePrefix('ds_1'); // /api/asset/ds_1/

test('construirIndiceAssets: só assets locais entram; inclui resolvedUrl', () => {
  const idx = construirIndiceAssets([
    asset('https://cdn.x/a.png', 'image/aa.png', { resolvedUrl: 'https://cdn.x/a-final.png' }),
    asset('https://cdn.x/b.png', 'image/bb.png', { status: 'failed' }),
  ]);
  assert.equal(idx.get('https://cdn.x/a.png'), 'image/aa.png');
  assert.equal(idx.get('https://cdn.x/a-final.png'), 'image/aa.png');
  assert.equal(idx.has('https://cdn.x/b.png'), false, 'failed não entra');
});

test('reescreve img src para a rota local', () => {
  const idx = construirIndiceAssets([asset('https://cdn.x/a.png', 'image/aa.png')]);
  const r = reescreverParaLocal('<img src="https://cdn.x/a.png" alt="x">', idx, P);
  assert.match(r.text, /src="\/api\/asset\/ds_1\/image\/aa\.png"/);
  assert.equal(r.locais, 1);
  assert.equal(r.externos, 0);
});

test('reescreve srcset (múltiplas URLs)', () => {
  const idx = construirIndiceAssets([
    asset('https://cdn.x/a.png', 'image/aa.png'),
    asset('https://cdn.x/b.png', 'image/bb.png'),
  ]);
  const r = reescreverParaLocal(
    '<img srcset="https://cdn.x/a.png 1x, https://cdn.x/b.png 2x">',
    idx,
    P,
  );
  assert.match(r.text, /\/api\/asset\/ds_1\/image\/aa\.png 1x/);
  assert.match(r.text, /\/api\/asset\/ds_1\/image\/bb\.png 2x/);
  assert.equal(r.locais, 2);
});

test('reescreve url() em CSS, @font-face e @import', () => {
  const idx = construirIndiceAssets([
    asset('https://cdn.x/bg.png', 'image/bg.png'),
    asset('https://cdn.x/f.woff2', 'font/f.woff2', { kind: 'font', mimeType: 'font/woff2' }),
    asset('https://cdn.x/more.css', 'css/more.css', { kind: 'css', mimeType: 'text/css' }),
  ]);
  const css = `.a{background:url(https://cdn.x/bg.png)}
@font-face{font-family:F;src:url(https://cdn.x/f.woff2) format('woff2')}
@import "https://cdn.x/more.css";`;
  const r = reescreverParaLocal(css, idx, P);
  assert.match(r.text, /url\(\/api\/asset\/ds_1\/image\/bg\.png\)/);
  assert.match(r.text, /url\(\/api\/asset\/ds_1\/font\/f\.woff2\)/);
  assert.match(r.text, /@import "\/api\/asset\/ds_1\/css\/more\.css"/);
  assert.equal(r.locais, 3);
});

test('externo (não indexado) fica intacto e conta como externo', () => {
  const idx = construirIndiceAssets([asset('https://cdn.x/a.png', 'image/aa.png')]);
  const r = reescreverParaLocal(
    '<img src="https://cdn.x/a.png"><img src="https://outra.com/z.png">',
    idx,
    P,
  );
  assert.equal(r.locais, 1);
  assert.equal(r.externos, 1);
  assert.deepEqual(r.externosUrls, ['https://outra.com/z.png']);
  assert.match(r.text, /src="https:\/\/outra\.com\/z\.png"/, 'externo não é tocado');
});

test('link de navegação (<a href> não-asset) não é reescrito', () => {
  const idx = construirIndiceAssets([asset('https://cdn.x/a.png', 'image/aa.png')]);
  const r = reescreverParaLocal('<a href="https://site.com/sobre">Sobre</a>', idx, P);
  assert.equal(r.text, '<a href="https://site.com/sobre">Sobre</a>');
  assert.equal(r.locais, 0);
});

test('coletarAssetRefs: pega assets, ignora <a href> e data:', () => {
  const refs = coletarAssetRefs(
    '<a href="https://site/x">n</a><img src="https://cdn/a.png"><image href="https://cdn/b.svg"/><div style="background:url(https://cdn/c.png)"></div><img src="data:image/png;base64,AA">',
  );
  assert.ok(refs.includes('https://cdn/a.png'));
  assert.ok(refs.includes('https://cdn/b.svg'));
  assert.ok(refs.includes('https://cdn/c.png'));
  assert.ok(!refs.includes('https://site/x'), 'navegação fora');
  assert.ok(!refs.some((r) => r.startsWith('data:')), 'data: fora');
});

test('reescreve <image href> e xlink:href de SVG', () => {
  const idx = construirIndiceAssets([asset('https://cdn.x/pic.png', 'image/pic.png')]);
  const r = reescreverParaLocal('<image href="https://cdn.x/pic.png" x="0"/>', idx, P);
  assert.match(r.text, /href="\/api\/asset\/ds_1\/image\/pic\.png"/);
});
