import assert from 'node:assert/strict';
import { test } from 'node:test';
import { avaliarUrlAsset, mimeCoerente, urlAssetSegura } from './asset-safety.js';

test('avaliarUrlAsset: bloqueia protocolos não-http(s)', () => {
  assert.equal(avaliarUrlAsset('file:///etc/passwd'), 'protocolo');
  assert.equal(avaliarUrlAsset('ftp://host/x'), 'protocolo');
  assert.equal(avaliarUrlAsset('data:image/png;base64,AAAA'), 'protocolo');
  assert.equal(avaliarUrlAsset('gopher://x'), 'protocolo');
});

test('avaliarUrlAsset: bloqueia localhost e rede privada (sem flag)', () => {
  assert.equal(avaliarUrlAsset('http://localhost/x', false), 'host-local');
  assert.equal(avaliarUrlAsset('http://127.0.0.1/x', false), 'ip-privado');
  assert.equal(avaliarUrlAsset('http://10.0.0.5/x', false), 'ip-privado');
  assert.equal(avaliarUrlAsset('http://192.168.1.1/x', false), 'ip-privado');
  assert.equal(avaliarUrlAsset('http://172.16.5.5/x', false), 'ip-privado');
  assert.equal(avaliarUrlAsset('http://foo.internal/x', false), 'host-local');
});

test('avaliarUrlAsset: bloqueia endpoint de metadata (mesmo com flag local)', () => {
  assert.equal(avaliarUrlAsset('http://169.254.169.254/latest/meta-data', false), 'metadata');
  assert.equal(avaliarUrlAsset('http://169.254.169.254/x', true), 'metadata');
  assert.equal(avaliarUrlAsset('http://metadata.google.internal/x', true), 'metadata');
});

test('avaliarUrlAsset: permite host público', () => {
  assert.equal(avaliarUrlAsset('https://cdn.exemplo.com/img.png', false), null);
  assert.equal(avaliarUrlAsset('http://exemplo.com/a.css', false), null);
});

test('avaliarUrlAsset: flag DS_ASSET_ALLOW_LOCAL libera localhost (mas não metadata)', () => {
  assert.equal(avaliarUrlAsset('http://localhost:8080/x', true), null);
  assert.equal(avaliarUrlAsset('http://127.0.0.1:5555/img.png', true), null);
});

test('avaliarUrlAsset: URL inválida', () => {
  assert.equal(avaliarUrlAsset('não é url'), 'url-invalida');
});

test('urlAssetSegura: atalho booleano', () => {
  assert.equal(urlAssetSegura('https://ok.com/a.png', false), true);
  assert.equal(urlAssetSegura('http://127.0.0.1/a.png', false), false);
});

test('mimeCoerente: barra página disfarçada de asset', () => {
  assert.equal(mimeCoerente('text/html', 'image'), false);
  assert.equal(mimeCoerente('image/png', 'image'), true);
  assert.equal(mimeCoerente('font/woff2', 'font'), true);
  assert.equal(mimeCoerente('image/png', 'font'), false);
  // Desconhecido tolera (não sabemos → não barra).
  assert.equal(mimeCoerente('application/octet-stream', 'image'), true);
  assert.equal(mimeCoerente('', 'video'), true);
});
