import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escolherSobrevivente } from './deduplicar-biblioteca.js';

/**
 * Qual das cópias fica.
 *
 * A peça é a mesma nas duas linhas — o que muda é o que cada uma ALCANÇA. Linha
 * sem `segmentId` é invisível para as regras de aceite da Galeria; linha sem
 * bundle em disco não monta site nenhum. Escolher a errada troca uma peça viva
 * por uma peça que só existe no banco.
 */

const l = (id: string, segmentId: string | null, addedAt: number) => ({
  id,
  designSystemId: 'ds_a',
  bundleHash: 'h',
  segmentId,
  addedAt,
});

test('vínculo com o segmento vence: é a linha que as regras alcançam', () => {
  const r = escolherSobrevivente([l('a', null, 1), l('b', 'seg_1', 9)], () => true);
  assert.equal(r.id, 'b');
});

test('empatado no vínculo, ganha quem tem bundle em disco', () => {
  const r = escolherSobrevivente([l('a', null, 1), l('b', null, 9)], (id) => id === 'b');
  assert.equal(r.id, 'b');
});

test('empatado em tudo, ganha a mais antiga — é a que os kits já citam', () => {
  const r = escolherSobrevivente([l('nova', 'seg_1', 90), l('velha', 'seg_1', 10)], () => true);
  assert.equal(r.id, 'velha');
});

test('uma cópia só devolve ela mesma', () => {
  assert.equal(escolherSobrevivente([l('a', null, 1)], () => false).id, 'a');
});
