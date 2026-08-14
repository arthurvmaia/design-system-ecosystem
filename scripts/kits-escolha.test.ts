import assert from 'node:assert/strict';
import { test } from 'node:test';
import { maisNovoPorNome } from './kits-escolha.js';

/**
 * A regra de desempate do banco de prova.
 *
 * Ela existe porque `pnpm kits` monta e nunca apaga: o acervo chegou a 32 kits
 * para 10 nichos. Provar os 32 custava o triplo do tempo e enchia o placar de
 * kit substituído.
 */

const k = (name: string, createdAt: number, id = `kit_${name}_${createdAt}`) => ({
  id,
  name,
  createdAt,
});

test('de duas levas com o mesmo nome, fica a mais nova', () => {
  const r = maisNovoPorNome([k('Clínica e consultório', 100), k('Clínica e consultório', 300)]);
  assert.equal(r.length, 1);
  assert.equal(r[0]?.createdAt, 300);
});

test('a ordem de entrada nao decide: mais novo primeiro da o mesmo resultado', () => {
  const novo = k('Loja', 300);
  const velho = k('Loja', 100);
  assert.equal(maisNovoPorNome([novo, velho])[0]?.createdAt, 300);
  assert.equal(maisNovoPorNome([velho, novo])[0]?.createdAt, 300);
});

test('nome diferente nao disputa: os dois passam', () => {
  const r = maisNovoPorNome([k('Clínica', 100), k('Loja', 300)]);
  assert.equal(r.length, 2);
});

test('tres levas do mesmo nicho colapsam em uma', () => {
  const r = maisNovoPorNome([k('Portfólio', 100), k('Portfólio', 200), k('Portfólio', 300)]);
  assert.deepEqual(
    r.map((x) => x.createdAt),
    [300],
  );
});

test('o kit feito a mao sobrevive: nome so dele nao empata com a leva', () => {
  const r = maisNovoPorNome([
    k('Software e assinatura', 100),
    k('Software e assinatura', 300),
    k('Sócio torcedor — pertencimento', 200),
  ]);
  assert.deepEqual(
    r.map((x) => x.name),
    ['Sócio torcedor — pertencimento', 'Software e assinatura'],
  );
});

test('a saida sai ordenada por nome, em pt-BR', () => {
  const r = maisNovoPorNome([k('Zapataria', 1), k('Ágora', 1), k('Bistrô', 1)]);
  assert.deepEqual(
    r.map((x) => x.name),
    ['Ágora', 'Bistrô', 'Zapataria'],
  );
});

test('lista vazia devolve lista vazia, sem quebrar', () => {
  assert.deepEqual(maisNovoPorNome([]), []);
});

test('empate exato no createdAt fica com o primeiro, e nao duplica', () => {
  const r = maisNovoPorNome([k('Evento', 100, 'kit_a'), k('Evento', 100, 'kit_b')]);
  assert.equal(r.length, 1);
  assert.equal(r[0]?.id, 'kit_a');
});
