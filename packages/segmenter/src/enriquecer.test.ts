import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AVISO_ASSETS_NA_ORIGEM } from '@ds/explorer';
import type { SegmentInsight } from '@ds/shared';
import { PIPELINE_VERSION } from '@ds/shared';
import type { EnriquecimentoSegmento } from './associar.js';
import { enriquecerInsight, montarDimensoes } from './enriquecer.js';

const baseInsight = (over: Partial<SegmentInsight> = {}): SegmentInsight => ({
  segmentId: 'seg_1',
  support: 'parcial',
  renderMode: 'html-js',
  fidelity: 70,
  warnings: [],
  capabilities: {},
  interactions: [],
  ...over,
});

const enr = (over: Partial<EnriquecimentoSegmento> = {}): EnriquecimentoSegmento => ({
  states: [],
  storedStates: [],
  pipeline: [],
  related: [],
  dependencies: [],
  confidence: 'alta',
  limitations: [],
  ...over,
});

test('montarDimensoes: click reproduzível vira dimensão completa', () => {
  const dims = montarDimensoes(
    baseInsight(),
    enr({
      pipeline: [{ kind: 'click', status: 'replayable', confidence: 'alta', stateIds: ['s'] }],
    }),
  );
  assert.equal(dims.click, 'completo');
  assert.equal(dims.assets, 'completo', 'sem asset externo → completo');
  assert.equal(dims.visual, 'completo');
});

test('montarDimensoes: asset externo derruba assets e portabilidade', () => {
  const dims = montarDimensoes(baseInsight(), enr(), { temAssetExterno: true });
  assert.equal(dims.assets, 'externo');
  assert.equal(dims.portabilidade, 'parcial');
});

test('montarDimensoes: lottie marca animação e runtime externos', () => {
  const dims = montarDimensoes(
    baseInsight({ capabilities: { hasLottie: true } }),
    enr({
      pipeline: [
        {
          kind: 'timer',
          status: 'external-runtime',
          confidence: 'alta',
          stateIds: [],
          runtime: 'lottie',
        },
      ],
    }),
  );
  assert.equal(dims.animacao, 'externo');
  assert.equal(dims.runtime, 'externo');
});

test('enriquecerInsight sem captura só carimba a versão do pipeline', () => {
  const out = enriquecerInsight(baseInsight(), undefined, undefined);
  assert.equal(out.pipelineVersion, PIPELINE_VERSION);
  assert.equal(out.states, undefined);
});

test('enriquecerInsight com clique reproduzível → selo honesto e estados ligados', () => {
  const out = enriquecerInsight(
    baseInsight(),
    enr({
      states: [{ id: 's1', trigger: 'click', label: 'aberto', method: 'swap-html' }],
      storedStates: [
        { id: 's1', trigger: 'click', label: 'aberto', method: 'swap-html', html: '<div/>' },
      ],
      pipeline: [{ kind: 'click', status: 'replayable', confidence: 'alta', stateIds: ['s1'] }],
    }),
    1,
  );
  assert.equal(out.states?.length, 1);
  assert.equal(out.confidence, 'alta');
  assert.equal(out.manifestVersion, 1);
  assert.equal(out.support, 'completo', 'clique reproduzível + dims completas → completo');
});

test('enriquecerInsight: interação só associada (sem estado) não é completo', () => {
  const out = enriquecerInsight(
    baseInsight(),
    enr({ pipeline: [{ kind: 'click', status: 'associated', confidence: 'media', stateIds: [] }] }),
    1,
  );
  assert.notEqual(out.support, 'completo');
});

test('reconciliação: assets todos locais removem o aviso herdado "apontam para a origem"', () => {
  // O `base` vem da avaliação estática (sempre bundledAssets=false), então herda
  // o aviso. Se a localização real prova 0 externos, o aviso é falso e some.
  const out = enriquecerInsight(baseInsight({ warnings: [AVISO_ASSETS_NA_ORIGEM] }), enr(), 1, {
    assetsLocais: 4,
    assetsExternos: 0,
  });
  assert.equal(out.dimensions?.assets, 'completo');
  assert.ok(
    !(out.limitations ?? []).includes(AVISO_ASSETS_NA_ORIGEM),
    'aviso de asset externo não deve sobreviver quando tudo é local',
  );
});

test('reconciliação: com asset ainda externo o aviso permanece (honestidade)', () => {
  const out = enriquecerInsight(baseInsight({ warnings: [AVISO_ASSETS_NA_ORIGEM] }), enr(), 1, {
    assetsLocais: 1,
    assetsExternos: 2,
  });
  assert.equal(out.dimensions?.assets, 'parcial');
  assert.ok(
    (out.limitations ?? []).includes(AVISO_ASSETS_NA_ORIGEM),
    'com externo remanescente, o aviso é verdadeiro e deve ficar',
  );
});
