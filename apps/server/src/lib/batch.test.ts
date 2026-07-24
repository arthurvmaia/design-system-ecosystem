import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planBatchLike } from './batch.js';

const seg = (id: string, inLibrary: boolean) => ({ id, inLibrary });

test('planBatchLike: só o que não está na Biblioteca entra', () => {
  const segs = [seg('seg_a', false), seg('seg_b', true), seg('seg_c', false)];
  const plano = planBatchLike(['seg_a', 'seg_b', 'seg_c'], segs);
  assert.deepEqual(
    plano.toAdd.map((s) => s.id),
    ['seg_a', 'seg_c'],
  );
  assert.deepEqual(plano.already, ['seg_b'], 'já na Biblioteca é pulado (idempotente)');
  assert.deepEqual(plano.missing, []);
});

test('planBatchLike: id inexistente vira "missing", não quebra', () => {
  const plano = planBatchLike(['seg_a', 'seg_x'], [seg('seg_a', false)]);
  assert.deepEqual(
    plano.toAdd.map((s) => s.id),
    ['seg_a'],
  );
  assert.deepEqual(plano.missing, ['seg_x']);
});

test('planBatchLike: ids repetidos no pedido são deduplicados', () => {
  const plano = planBatchLike(['seg_a', 'seg_a', 'seg_a'], [seg('seg_a', false)]);
  assert.equal(plano.toAdd.length, 1, 'não cria três vezes o mesmo');
});

test('planBatchLike: rodar de novo com tudo já curtido não adiciona nada', () => {
  const segs = [seg('seg_a', true), seg('seg_b', true)];
  const plano = planBatchLike(['seg_a', 'seg_b'], segs);
  assert.equal(plano.toAdd.length, 0);
  assert.deepEqual(plano.already.sort(), ['seg_a', 'seg_b']);
});
