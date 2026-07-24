import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  countIn,
  isAllSelected,
  isIndeterminate,
  prune,
  toggle,
  toggleAllVisible,
} from './selection.js';

test('toggle: adiciona e remove', () => {
  const a = toggle(new Set(), 'x');
  assert.ok(a.has('x'));
  const b = toggle(a, 'x');
  assert.ok(!b.has('x'));
});

test('isAllSelected / isIndeterminate: cobrem os três estados', () => {
  const visiveis = ['a', 'b', 'c'];
  assert.equal(isAllSelected(new Set(), visiveis), false);
  assert.equal(isIndeterminate(new Set(['a']), visiveis), true, 'parcial → indeterminado');
  assert.equal(isAllSelected(new Set(['a', 'b', 'c']), visiveis), true);
  assert.equal(
    isIndeterminate(new Set(['a', 'b', 'c']), visiveis),
    false,
    'todos → não indeterminado',
  );
  // Vazio nunca é "todos" nem indeterminado.
  assert.equal(isAllSelected(new Set(), []), false);
  assert.equal(isIndeterminate(new Set(), []), false);
});

test('toggleAllVisible: marca todos os visíveis, e desmarca só os visíveis', () => {
  const visiveis = ['a', 'b'];
  const marcados = toggleAllVisible(new Set(['z']), visiveis); // z fora do filtro
  assert.deepEqual([...marcados].sort(), ['a', 'b', 'z'], 'preserva seleção fora do filtro');
  const desmarcados = toggleAllVisible(marcados, visiveis);
  assert.deepEqual([...desmarcados], ['z'], 'remove só os visíveis, mantém z');
});

test('prune: descarta ids que sumiram (após excluir)', () => {
  const podado = prune(new Set(['a', 'b', 'c']), ['a', 'c']);
  assert.deepEqual([...podado].sort(), ['a', 'c']);
});

test('countIn: conta só os visíveis selecionados', () => {
  assert.equal(countIn(new Set(['a', 'z']), ['a', 'b', 'c']), 1);
});
