import assert from 'node:assert/strict';
import { test } from 'node:test';
import { origensDe } from './origem-core.js';

/**
 * O agrupamento por origem — a conta que decide o Confronto.
 *
 * Vale testar isolado porque a tela que o consome não pode ser exercitada
 * enquanto o acervo tiver uma origem só, e o comportamento que mais importa
 * (duas origens disputando a mesma categoria) é justamente o que ainda não
 * existe em disco.
 */

const peca = (id: string, designSystemId: string | null) => ({ id, designSystemId });

test('conta as peças de cada origem', () => {
  const origens = origensDe([peca('a', 'ds_1'), peca('b', 'ds_1'), peca('c', 'ds_2')]);
  assert.deepEqual(origens, [
    { id: 'ds_1', quantas: 2 },
    { id: 'ds_2', quantas: 1 },
  ]);
});

test('a origem com mais peças vem primeiro', () => {
  // Quem tem o vocabulário mais completo aparece na frente: é o candidato mais
  // provável a governar aquela categoria.
  const origens = origensDe([
    peca('a', 'ds_pequena'),
    peca('b', 'ds_grande'),
    peca('c', 'ds_grande'),
    peca('d', 'ds_grande'),
  ]);
  assert.equal(origens[0]?.id, 'ds_grande');
  assert.equal(origens[0]?.quantas, 3);
});

test('empate desempata por id, para a ordem não dançar entre renders', () => {
  const origens = origensDe([peca('a', 'ds_b'), peca('b', 'ds_a')]);
  assert.deepEqual(
    origens.map((o) => o.id),
    ['ds_a', 'ds_b'],
  );
});

test('peça sem origem não some da conta', () => {
  // Componente de extração antiga pode ter `designSystemId` nulo. Descartá-lo
  // faria a soma das origens não bater com o total de peças, e a tela mentiria
  // sobre quantas peças aquela categoria tem.
  const origens = origensDe([peca('a', null), peca('b', 'ds_1')]);
  assert.equal(origens.length, 2);
  assert.ok(origens.some((o) => o.id === 'sem-origem'));
  assert.equal(
    origens.reduce((s, o) => s + o.quantas, 0),
    2,
  );
});

test('lista vazia devolve lista vazia, e não um grupo fantasma', () => {
  assert.deepEqual(origensDe([]), []);
});

test('uma origem só devolve UMA entrada — é o que faz o Confronto se calar', () => {
  const origens = origensDe([peca('a', 'ds_1'), peca('b', 'ds_1')]);
  assert.equal(origens.length, 1);
});
