import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SegmentValidationFile, geracaoDeSegmentos } from './segment.js';

/**
 * A geração existe porque `validation.json` sobrevivia à reextração fingindo
 * cobrir a captura nova: medido no acervo, 0 de 49 resultados casavam com os
 * segmentos vigentes, e ninguém promovia nem rebaixava nada, em silêncio.
 */

test('a geração é determinística e não depende da ordem dos ids', () => {
  const a = geracaoDeSegmentos(['seg_a', 'seg_b', 'seg_c']);
  const b = geracaoDeSegmentos(['seg_c', 'seg_a', 'seg_b']);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{8}$/);
});

test('capturas diferentes têm gerações diferentes', () => {
  const antiga = geracaoDeSegmentos(['seg_a', 'seg_b']);
  const nova = geracaoDeSegmentos(['seg_x', 'seg_y']);
  assert.notEqual(antiga, nova);
  // Até UM segmento a mais muda a geração: reextração parcial não passa.
  assert.notEqual(antiga, geracaoDeSegmentos(['seg_a', 'seg_b', 'seg_c']));
});

test('arquivo antigo sem geração continua parseável: compatibilidade preservada', () => {
  const file = SegmentValidationFile.parse({
    designSystemId: 'ds_antigo',
    generatedAt: 1,
    results: [],
  });
  assert.equal(file.geracao, undefined);
});

test('arquivo novo carrega a geração', () => {
  const file = SegmentValidationFile.parse({
    designSystemId: 'ds_novo',
    generatedAt: 1,
    geracao: geracaoDeSegmentos(['seg_1']),
    results: [],
  });
  assert.match(file.geracao ?? '', /^[0-9a-f]{8}$/);
});
