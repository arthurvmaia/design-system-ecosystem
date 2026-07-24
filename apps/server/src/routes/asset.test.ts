import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

/**
 * Rota de assets: segurança (path traversal), content-type, 404 e range.
 * Usa `app.request()` do Hono — sem navegador, sem servidor de rede.
 */
test('assetRoute: serve local, bloqueia traversal, 404, range', async (t) => {
  const root = join(tmpdir(), `ds-asset-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  const shared = await import('@ds/shared');
  const { assetRoute } = await import('./asset.js');
  const { Hono } = await import('hono');
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  const dsId = `ds_${randomUUID().replace(/-/g, '').slice(0, 18)}` as `ds_${string}`;
  const assetsDir = shared.vaultCaptureAssetsDir(dsId);
  mkdirSync(join(assetsDir, 'image'), { recursive: true });
  // PNG mínimo (assinatura) só para termos bytes reais.
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
  writeFileSync(join(assetsDir, 'image', 'abc.png'), png);
  // Arquivo secreto FORA de capture/assets, para o traversal tentar alcançar.
  writeFileSync(join(root, 'segredo.txt'), 'nao pode vazar');

  const app = new Hono();
  app.route('/api/asset', assetRoute);
  const req = (p: string, headers?: Record<string, string>) =>
    app.request(`http://x${p}`, headers ? { headers } : undefined);

  await t.test('serve o asset local com content-type e cache imutável', async () => {
    const res = await req(`/api/asset/${dsId}/image/abc.png`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.match(res.headers.get('cache-control') ?? '', /immutable/);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal((await res.arrayBuffer()).byteLength, png.byteLength);
  });

  await t.test('bloqueia path traversal (403), não vaza arquivo de fora', async () => {
    for (const p of [
      `/api/asset/${dsId}/../../segredo.txt`,
      `/api/asset/${dsId}/..%2f..%2fsegredo.txt`,
    ]) {
      const res = await req(p);
      assert.ok(res.status === 403 || res.status === 404, `${p} → ${res.status}`);
      const txt = await res.text();
      assert.ok(!txt.includes('nao pode vazar'), 'não vazou o segredo');
    }
  });

  await t.test('id inválido → 400', async () => {
    const res = await req('/api/asset/naoeds/image/abc.png');
    assert.equal(res.status, 400);
  });

  await t.test('arquivo inexistente → 404 (sem listar diretório)', async () => {
    assert.equal((await req(`/api/asset/${dsId}/image/naoexiste.png`)).status, 404);
    assert.equal((await req(`/api/asset/${dsId}/image`)).status, 404, 'diretório não é servido');
  });

  await t.test('range → 206 com Content-Range', async () => {
    const res = await req(`/api/asset/${dsId}/image/abc.png`, { range: 'bytes=0-3' });
    assert.equal(res.status, 206);
    assert.equal(res.headers.get('content-range'), `bytes 0-3/${png.byteLength}`);
    assert.equal((await res.arrayBuffer()).byteLength, 4);
  });
});
