import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScrollViewportPass, TemporalObservation } from '@ds/shared';
import { temporaisDaSecao } from './segment-v2.js';

/**
 * A observação temporal é por PARADA de scroll, não por elemento. O consumo
 * comparava id de viewport com hash de elemento e nunca casava — `temMovimento`
 * era falso em todo segmento de toda extração.
 *
 * Os números vêm da captura real do Cogni: tela de 900px, hero de 741px na
 * posição 86, rodapé de 232px lá embaixo.
 */

const obs = (id: string, target: string): TemporalObservation =>
  ({
    id,
    target,
    timestamps: [0, 250],
    changes: ['pixels'],
    pixelDelta: 0.2,
    domStable: true,
    moving: true,
  }) as TemporalObservation;

const passe = (index: number, scrollY: number, temporalIds: string[]): ScrollViewportPass =>
  ({
    index,
    scrollY,
    progress: 0,
    overlap: 0,
    direction: 'descendo',
    visible: [],
    appeared: [],
    temporalIds,
    pointerPathIds: [],
    assetsLoaded: [],
  }) as ScrollViewportPass;

const TELA = 900;

test('observação dirigida ao próprio elemento sempre conta', () => {
  const r = temporaisDaSecao({
    observacoes: [obs('t1', 'hero')],
    passes: [],
    hashesMembros: new Set(['hero']),
    pageBox: { x: 0, y: 0, w: 1440, h: 200 },
    alturaDaViewport: TELA,
  });
  assert.equal(r.length, 1);
});

test('a dobra que ERA a tela naquela parada herda o movimento', () => {
  // Hero real: 741px de altura a partir de y=86, com a página no topo.
  const r = temporaisDaSecao({
    observacoes: [obs('t1', 'viewport:0')],
    passes: [passe(0, 0, ['t1'])],
    hashesMembros: new Set(['hero']),
    pageBox: { x: 0, y: 86, w: 1440, h: 741 },
    alturaDaViewport: TELA,
  });
  assert.equal(r.length, 1, 'ocupava 82% da tela: o movimento é dela');
});

test('rodapé baixo não herda: o fundo da página se move, não ele', () => {
  const r = temporaisDaSecao({
    observacoes: [obs('t1', 'viewport:4')],
    passes: [passe(4, 2700, ['t1'])],
    hashesMembros: new Set(['rodape']),
    pageBox: { x: 0, y: 3000, w: 1440, h: 232 },
    alturaDaViewport: TELA,
  });
  assert.deepEqual(r, [], 'ocupava 26% da tela');
});

test('dobra grande, mas fora da tela naquela parada, não herda', () => {
  const r = temporaisDaSecao({
    observacoes: [obs('t1', 'viewport:0')],
    passes: [passe(0, 0, ['t1'])],
    hashesMembros: new Set(['secao-4']),
    pageBox: { x: 0, y: 2600, w: 1440, h: 864 },
    alturaDaViewport: TELA,
  });
  assert.deepEqual(r, []);
});

test('sem paradas gravadas (captura antiga) não inventa atribuição', () => {
  const r = temporaisDaSecao({
    observacoes: [obs('t1', 'viewport:0')],
    passes: [],
    hashesMembros: new Set(['hero']),
    pageBox: { x: 0, y: 0, w: 1440, h: 880 },
    alturaDaViewport: TELA,
  });
  assert.deepEqual(r, []);
});
