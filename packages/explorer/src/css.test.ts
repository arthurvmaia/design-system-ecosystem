import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  animationNamesUsed,
  fontFaceFamilies,
  fontFamiliesUsed,
  intersecao,
  keyframeNames,
  varNamesUsed,
} from './css.js';

const CSS = `
@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
@keyframes naoUsada { from { top: 0 } to { top: 10px } }
@font-face { font-family: "Alche Sans"; src: url(/f.woff2) }
:root { --primary: #c62828; --gap: 8px }
.hero { animation: fadeIn 0.6s ease infinite; font-family: "Alche Sans", sans-serif; color: var(--primary) }
`;

test('keyframeNames: lista os @keyframes declarados', () => {
  assert.deepEqual(keyframeNames(CSS).sort(), ['fadeIn', 'naoUsada']);
});

test('animationNamesUsed: pega o nome, ignora tempo/keyword', () => {
  const usados = animationNamesUsed(CSS);
  assert.ok(usados.has('fadeIn'));
  assert.ok(!usados.has('naoUsada'));
  assert.ok(!usados.has('infinite'));
  assert.ok(!usados.has('ease'));
});

test('intersecao: só o keyframe realmente usado sobrevive', () => {
  const manter = intersecao(keyframeNames(CSS), animationNamesUsed(CSS));
  assert.deepEqual([...manter], ['fadeIn']);
});

test('varNamesUsed: variáveis lidas via var()', () => {
  const usados = varNamesUsed(CSS);
  assert.ok(usados.has('--primary'));
  assert.ok(!usados.has('--gap'), 'gap é declarada mas não usada via var()');
});

test('fontFace vs uso: a família declarada é a mesma usada', () => {
  const declaradas = fontFaceFamilies(CSS);
  const usadas = fontFamiliesUsed(CSS);
  assert.ok(declaradas.has('alche sans'));
  assert.ok(usadas.has('alche sans'));
});
