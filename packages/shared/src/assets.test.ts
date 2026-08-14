import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { listarAssetsFaltando } from './assets.js';

test('link de navegação não é arquivo faltando', () => {
  // O menu de um site aponta para `/home`, `/music`, `/login` — rotas, não
  // arquivos. Contá-las como asset faltando reprovava o site INTEIRO, e as
  // peças dele nunca chegavam à Galeria. O verificador existe para o
  // `<link rel=stylesheet>` que promete um CSS que ninguém gravou.
  const vazio = mkdtempSync(join(tmpdir(), 'assets-'));
  const html = `
<a href="/home">Início</a><a href="/music">Música</a><a href="/login">Entrar</a>
<form action="/buscar"></form>
<link rel="stylesheet" href="assets/css/nao-existe.css">
<img src="assets/image/tambem-nao.png">
`;
  assert.deepEqual(
    listarAssetsFaltando(vazio, html).sort(),
    ['assets/css/nao-existe.css', 'assets/image/tambem-nao.png'],
    'só o que foi prometido como ARQUIVO conta',
  );
});

test('referência externa, data URI e âncora ficam de fora', () => {
  const vazio = mkdtempSync(join(tmpdir(), 'assets-ext-'));
  const html = `
<script src="https://cdn.exemplo.com/lib.js"></script>
<img src="data:image/svg+xml;base64,abc">
<a href="#topo">topo</a>
<link rel="stylesheet" href="//cdn.exemplo.com/estilo.css">
`;
  assert.deepEqual(listarAssetsFaltando(vazio, html), []);
});

test('navegação por onclick não é arquivo faltando', () => {
  // `window.location.href='/home'` é código dentro de um atributo, não um
  // atributo `href`. Um site cujo menu navega assim era reprovado inteiro.
  const vazio = mkdtempSync(join(tmpdir(), 'assets-onclick-'));
  const html = `
<span onclick="window.location.href='/home'">Início</span>
<button onclick="window.location.href='/music'">Música</button>
<link rel="stylesheet" href="assets/css/nao-existe.css">
`;
  assert.deepEqual(listarAssetsFaltando(vazio, html), ['assets/css/nao-existe.css']);
});
