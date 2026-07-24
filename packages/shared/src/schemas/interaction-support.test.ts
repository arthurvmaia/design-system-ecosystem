import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SegmentInteraction } from './interaction-support.js';
import {
  melhorStatus,
  recomputarSelo,
  resumirPipeline,
  statusDaInteracao,
} from './interaction-support.js';

test('statusDaInteracao: detected quando nem associada nem capturada', () => {
  assert.equal(
    statusDaInteracao({ kind: 'click', associated: false, hasStates: false }),
    'detected',
  );
});

test('statusDaInteracao: captured quando tem estado mas não foi associada', () => {
  assert.equal(
    statusDaInteracao({ kind: 'click', associated: false, hasStates: true }),
    'captured',
  );
});

test('statusDaInteracao: associated (sem estado) não vira replayable para clique', () => {
  assert.equal(
    statusDaInteracao({ kind: 'click', associated: true, hasStates: false }),
    'associated',
  );
});

test('statusDaInteracao: click associada COM estado é replayable', () => {
  assert.equal(
    statusDaInteracao({ kind: 'click', associated: true, hasStates: true }),
    'replayable',
  );
});

test('statusDaInteracao: hover puro é replayable sem estado (roda pelo CSS)', () => {
  assert.equal(
    statusDaInteracao({ kind: 'hover', associated: true, hasStates: false }),
    'replayable',
  );
});

test('statusDaInteracao: runtime externo vence tudo', () => {
  assert.equal(
    statusDaInteracao({ kind: 'click', associated: true, hasStates: true, runtime: 'lottie' }),
    'external-runtime',
  );
});

test('melhorStatus: o mais avançado no caminho feliz vence', () => {
  assert.equal(melhorStatus('detected', 'replayable'), 'replayable');
  assert.equal(melhorStatus('captured', 'associated'), 'associated');
  // Becos (rank 0) perdem para qualquer estado do caminho feliz.
  assert.equal(melhorStatus('replayable', 'external-runtime'), 'replayable');
  assert.equal(melhorStatus('detected', 'external-runtime'), 'detected');
});

const it = (over: Partial<SegmentInteraction>): SegmentInteraction => ({
  kind: 'click',
  status: 'replayable',
  confidence: 'alta',
  stateIds: [],
  ...over,
});

test('recomputarSelo: completo só quando nada pende', () => {
  const selo = recomputarSelo({ visual: 'completo', estrutura: 'completo', click: 'completo' }, [
    it({ status: 'replayable' }),
  ]);
  assert.equal(selo, 'completo');
});

test('recomputarSelo: interação detectada e não reproduzida derruba para parcial', () => {
  const selo = recomputarSelo({ visual: 'completo' }, [it({ status: 'detected' })]);
  assert.equal(selo, 'parcial');
});

test('recomputarSelo: runtime externo → externo, nunca completo', () => {
  const selo = recomputarSelo({ visual: 'completo', runtime: 'externo' }, [
    it({ status: 'external-runtime', runtime: 'lottie' }),
  ]);
  assert.equal(selo, 'externo');
});

test('recomputarSelo: asset externo impede completo', () => {
  const selo = recomputarSelo({ visual: 'completo', assets: 'externo' }, []);
  assert.equal(selo, 'externo');
});

test('resumirPipeline: conta por estado e junta runtimes', () => {
  const r = resumirPipeline([
    it({ kind: 'click', status: 'replayable' }),
    it({ kind: 'hover', status: 'detected' }),
    it({ kind: 'toggle', status: 'external-runtime', runtime: 'gsap' }),
  ]);
  assert.equal(r.replayable, 1);
  assert.equal(r.detected, 1);
  assert.equal(r.externalRuntime, 1);
  assert.deepEqual(r.runtimes, ['gsap']);
});
