import assert from 'node:assert/strict';
import { join, sep } from 'node:path';
import { test } from 'node:test';
import { podeApagarDesignSystem } from './paths.js';

/**
 * A guarda que decide se um diretório do vault some do disco.
 *
 * Dois lugares apagam — a rota `DELETE /api/design-systems/:id` e o
 * `pnpm acervo:limpar-orfas` — e antes cada um tinha a sua cópia da regra. Aqui
 * ela é uma só, e é testada onde mora.
 */

// Montado com `join` para o teste valer nos dois separadores de caminho.
const RAIZ = join(sep === '/' ? '/acervo' : 'C:', 'acervo-vault');

test('o caso normal: pasta de design system dentro do vault', () => {
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_01ABC'), RAIZ, 'ds_01ABC'), true);
});

test('NUNCA o próprio vault', () => {
  // O engano que levaria o acervo inteiro de uma vez.
  assert.equal(podeApagarDesignSystem(RAIZ, RAIZ, 'ds_01ABC'), false);
});

test('NUNCA fora do vault', () => {
  assert.equal(podeApagarDesignSystem(join(RAIZ, '..'), RAIZ, 'ds_01ABC'), false);
  assert.equal(podeApagarDesignSystem(join(RAIZ, '..', 'library'), RAIZ, 'ds_01ABC'), false);
});

test('NUNCA por caminho que só PARECE dentro', () => {
  // `/acervo/vault-2` começa com `/acervo/vault` como string, e não está dentro
  // dele. É o erro clássico de comparar prefixo sem o separador.
  assert.equal(podeApagarDesignSystem(`${RAIZ}-2${sep}ds_01ABC`, RAIZ, 'ds_01ABC'), false);
});

test('NUNCA subindo por .. de dentro', () => {
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_01ABC', '..', '..'), RAIZ, 'ds_01ABC'), false);
});

test('o id precisa ser um id de verdade', () => {
  // `String.raw` para a barra invertida ser uma barra de verdade, e não uma
  // sequência de escape — um id com separador de caminho é justamente o caso
  // que precisa reprovar.
  const ids = ['', '.', '..', '*', 'ds_', 'ds_a/b', String.raw`ds_a\b`, 'library', '../ds_x'];
  for (const id of ids) {
    assert.equal(
      podeApagarDesignSystem(join(RAIZ, 'ds_valido'), RAIZ, id),
      false,
      `passou com o id "${id}"`,
    );
  }
});

test('id válido com caminho válido é o ÚNICO caso que passa', () => {
  // As duas condições valem juntas: nem caminho bom com id ruim, nem o
  // contrário.
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_X'), RAIZ, 'ds_X'), true);
  assert.equal(podeApagarDesignSystem(join(RAIZ, 'ds_X'), RAIZ, '..'), false);
  assert.equal(podeApagarDesignSystem(RAIZ, RAIZ, 'ds_X'), false);
});
