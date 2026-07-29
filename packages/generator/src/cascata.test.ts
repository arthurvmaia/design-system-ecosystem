import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { lerCssDoBundle } from './cascata.js';

/**
 * Em CSS, ordem é significado. Duas regras de mesma especificidade são decididas
 * por quem vem depois — então ler as folhas de um bundle na ordem errada produz
 * um site que carrega todo o CSS certo e mesmo assim sai errado. É o tipo de
 * falha que ninguém acha lendo o código, porque não falta nada.
 */

const bundleFalso = (arquivos: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cascata-'));
  for (const [caminho, conteudo] of Object.entries(arquivos)) {
    const destino = join(dir, caminho);
    mkdirSync(join(destino, '..'), { recursive: true });
    writeFileSync(destino, conteudo, 'utf8');
  }
  return dir;
};

test('a ordem dos <link> vence a ordem alfabética', () => {
  // O compilador escreve tokens → layout → components → animations. Em ordem
  // alfabética, `animations` viria primeiro e `tokens` por último: as variáveis
  // seriam declaradas depois de quem as usa.
  const dir = bundleFalso({
    'index.html': [
      '<link rel="stylesheet" href="assets/css/tokens.css">',
      '<link rel="stylesheet" href="assets/css/layout.css">',
      '<link rel="stylesheet" href="assets/css/animations.css">',
    ].join('\n'),
    'assets/css/tokens.css': '/*1*/',
    'assets/css/layout.css': '/*2*/',
    'assets/css/animations.css': '/*3*/',
  });
  const r = lerCssDoBundle(dir);
  assert.equal(r.origem, 'links');
  assert.deepEqual(r.css.match(/\d/g), ['1', '2', '3']);
  rmSync(dir, { recursive: true, force: true });
});

test('folha externa de nome hexadecimal entra na posição declarada', () => {
  // O nome hashed não diz nada sobre a posição. Ordenar por nome jogava as
  // folhas externas para o meio do bolo.
  const dir = bundleFalso({
    'index.html': [
      '<link rel="stylesheet" href="assets/css/ff00.css">',
      '<link rel="stylesheet" href="assets/css/00aa.css">',
    ].join('\n'),
    'assets/css/ff00.css': '/*1*/',
    'assets/css/00aa.css': '/*2*/',
  });
  assert.deepEqual(lerCssDoBundle(dir).css.match(/\d/g), ['1', '2']);
  rmSync(dir, { recursive: true, force: true });
});

test('bundle legado com styles.css continua sendo lido', () => {
  // O ternário anterior ignorava o `styles.css` INTEIRO sempre que existisse
  // qualquer arquivo em `assets/css/` — e um componente portátil de site com CSS
  // externo tem essa pasta cheia. Todo o CSS inline da página ia para o lixo.
  const dir = bundleFalso({ 'styles.css': '/*legado*/' });
  const r = lerCssDoBundle(dir);
  assert.equal(r.origem, 'styles.css');
  assert.match(r.css, /legado/);
  rmSync(dir, { recursive: true, force: true });
});

test('index que declara folha ausente devolve o que existe E denuncia a falta', () => {
  const dir = bundleFalso({
    'index.html': [
      '<link rel="stylesheet" href="assets/css/existe.css">',
      '<link rel="stylesheet" href="assets/css/sumiu.css">',
    ].join('\n'),
    'assets/css/existe.css': '/*ok*/',
  });
  const r = lerCssDoBundle(dir);
  assert.match(r.css, /ok/);
  assert.deepEqual(r.faltando, ['assets/css/sumiu.css'], 'silêncio aqui seria site sem estilo');
  rmSync(dir, { recursive: true, force: true });
});

test('href externo e travessia de diretório são ignorados', () => {
  const dir = bundleFalso({
    'index.html': [
      '<link rel="stylesheet" href="https://cdn.exemplo/x.css">',
      '<link rel="stylesheet" href="../../fora.css">',
      '<link rel="stylesheet" href="assets/css/ok.css">',
    ].join('\n'),
    'assets/css/ok.css': '/*ok*/',
  });
  const r = lerCssDoBundle(dir);
  assert.equal(r.css.trim(), '/*ok*/');
  assert.deepEqual(r.faltando, []);
  rmSync(dir, { recursive: true, force: true });
});

test('bundle sem index e sem styles.css cai na pasta, mas declara o chute', () => {
  const dir = bundleFalso({ 'assets/css/a.css': '/*a*/' });
  const r = lerCssDoBundle(dir);
  assert.match(r.css, /a/);
  assert.equal(r.origem, 'vazio', 'o chamador precisa poder avisar que a ordem foi chutada');
  rmSync(dir, { recursive: true, force: true });
});

test('bundle sem CSS nenhum devolve vazio em vez de quebrar', () => {
  const dir = bundleFalso({ 'index.html': '<html></html>' });
  assert.deepEqual(lerCssDoBundle(dir), { css: '', origem: 'vazio', faltando: [] });
  rmSync(dir, { recursive: true, force: true });
});
