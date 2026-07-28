import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extrairRegrasHover, montarDemoDeHover } from './hover-demo.js';

/**
 * `:hover` não se aciona por código. A demonstração reescreve as MESMAS
 * declarações do site para uma classe e liga a classe de propósito. Os casos
 * abaixo saem do CSS real dos sites capturados (Tailwind compilado, com
 * seletores escapados e regras dentro de @media).
 */

test('regra simples vira classe, preservando as declarações', () => {
  const r = extrairRegrasHover('.btn:hover{background:#000;color:#fff}');
  assert.equal(r.length, 1);
  assert.equal(r[0]?.demo, '.btn.ds-hv');
  assert.equal(r[0]?.alvo, '.btn');
  assert.equal(r[0]?.declaracoes, 'background:#000;color:#fff');
});

test('quem recebe a classe é o elemento com hover, não o descendente', () => {
  const r = extrairRegrasHover('.card:hover .titulo{opacity:1}');
  assert.equal(r[0]?.alvo, '.card', 'o hover é do card; o título só reage');
  assert.equal(r[0]?.demo, '.card.ds-hv .titulo');
});

test('seletor com vírgula vira uma regra por parte, e a parte sem hover não entra', () => {
  const r = extrairRegrasHover('.a:hover, .b{color:red}');
  assert.equal(r.length, 1);
  assert.equal(r[0]?.alvo, '.a');
});

test('classe escapada do Tailwind é preservada', () => {
  const r = extrairRegrasHover('.hover\\:text-white:hover{color:#fff}');
  assert.equal(r[0]?.demo, '.hover\\:text-white.ds-hv');
});

test('entra em @media, mas ignora impressão', () => {
  const dentro = extrairRegrasHover('@media (min-width:768px){.x:hover{gap:1rem}}');
  assert.equal(dentro.length, 1);
  assert.equal(dentro[0]?.alvo, '.x');
  assert.deepEqual(extrairRegrasHover('@media print{.x:hover{gap:1rem}}'), []);
});

test('`:hover` solto é descartado: casaria com a página inteira', () => {
  assert.deepEqual(extrairRegrasHover(':hover{outline:1px solid red}'), []);
});

test('sem hover nenhum, não há o que demonstrar', () => {
  assert.equal(montarDemoDeHover(['.a{color:red}', '.b{color:blue}']), null);
});

test('a demo junta vários CSS e lista cada alvo uma vez', () => {
  const d = montarDemoDeHover([
    '.btn:hover{color:#fff}',
    '.btn:hover{background:#000}',
    '.card:hover{transform:scale(1.02)}',
  ]);
  assert.ok(d !== null);
  assert.deepEqual(d?.alvos, ['.btn', '.card']);
  assert.match(d?.estilo ?? '', /\.btn\.ds-hv\{color:#fff\}/);
  assert.match(d?.estilo ?? '', /\.card\.ds-hv\{transform:scale\(1\.02\)\}/);
});
