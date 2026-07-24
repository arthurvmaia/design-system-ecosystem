import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  PIPELINE_VERSION,
  type SegmentInsight,
  type SegmentValidationFile,
  type SegmentsManifest,
  VALIDATOR_VERSION,
} from '@ds/shared';
import {
  DEFAULT_VALIDATOR_LIMITS,
  agregarStatus,
  planejarValidacao,
  previewHash,
} from './validate-preview.js';

// ── Puro: previewHash ────────────────────────────────────────────────────────

test('previewHash: estável para a mesma entrada, muda quando o HTML/estado muda', () => {
  const a = previewHash('<section>x</section>', '[{"id":"s1"}]', '[]');
  assert.equal(a, previewHash('<section>x</section>', '[{"id":"s1"}]', '[]'));
  assert.notEqual(a, previewHash('<section>y</section>', '[{"id":"s1"}]', '[]'));
  assert.notEqual(a, previewHash('<section>x</section>', '[{"id":"s2"}]', '[]'));
});

// ── Puro: planejarValidacao (cache) ──────────────────────────────────────────

const validacaoExistente = (
  segs: Array<{ segmentId: string; previewHash: string; error?: string }>,
): SegmentValidationFile => ({
  designSystemId: 'ds_x',
  generatedAt: 1,
  status: 'concluida',
  pipelineVersion: PIPELINE_VERSION,
  validatorVersion: VALIDATOR_VERSION,
  durationMs: 0,
  results: [],
  segments: segs.map((s) => ({ ...s, validatedAt: 1, durationMs: 1 })),
});

test('planejarValidacao: reaproveita hash igual, revalida hash diferente', () => {
  const plano = planejarValidacao(
    [
      { segmentId: 'seg_a', previewHash: 'h1' },
      { segmentId: 'seg_b', previewHash: 'h2-novo' },
    ],
    validacaoExistente([
      { segmentId: 'seg_a', previewHash: 'h1' },
      { segmentId: 'seg_b', previewHash: 'h2-velho' },
    ]),
    DEFAULT_VALIDATOR_LIMITS,
  );
  assert.deepEqual(plano.cache, ['seg_a']);
  assert.deepEqual(plano.aValidar, ['seg_b']);
});

test('planejarValidacao: versão do validador diferente invalida tudo', () => {
  const existente = {
    ...validacaoExistente([{ segmentId: 'seg_a', previewHash: 'h1' }]),
    validatorVersion: 999,
  };
  const plano = planejarValidacao(
    [{ segmentId: 'seg_a', previewHash: 'h1' }],
    existente,
    DEFAULT_VALIDATOR_LIMITS,
  );
  assert.deepEqual(plano.aValidar, ['seg_a']);
  assert.deepEqual(plano.cache, []);
});

test('planejarValidacao: segmento que deu erro NÃO entra em cache (é re-tentado)', () => {
  const plano = planejarValidacao(
    [{ segmentId: 'seg_a', previewHash: 'h1' }],
    validacaoExistente([{ segmentId: 'seg_a', previewHash: 'h1', error: 'timeout' }]),
    DEFAULT_VALIDATOR_LIMITS,
  );
  assert.deepEqual(plano.aValidar, ['seg_a']);
});

test('planejarValidacao: respeita maxSegments no que é novo', () => {
  const plano = planejarValidacao(
    Array.from({ length: 10 }, (_, i) => ({ segmentId: `seg_${i}`, previewHash: `h${i}` })),
    null,
    { ...DEFAULT_VALIDATOR_LIMITS, maxSegments: 3 },
  );
  assert.equal(plano.aValidar.length, 3);
});

// ── Puro: agregarStatus ──────────────────────────────────────────────────────

test('agregarStatus: concluida / parcial / falha', () => {
  assert.equal(agregarStatus(0, 0), 'concluida');
  assert.equal(agregarStatus(3, 0), 'concluida');
  assert.equal(agregarStatus(2, 1), 'parcial');
  assert.equal(agregarStatus(0, 2), 'falha');
});

// ── Orquestração com driver INJETADO (sem navegador) ─────────────────────────

const seg = (id: string): SegmentsManifest['segments'][number] => ({
  id,
  designSystemId: 'ds_test000000000000000',
  category: 'accordion',
  kind: 'component',
  name: id,
  htmlSnippet: `<section id="${id}">conteúdo de ${id}</section>`,
  previewPath: null,
  position: 0,
  inLibrary: false,
});

const insight = (id: string): SegmentInsight => ({
  segmentId: id,
  support: 'parcial',
  renderMode: 'html-js',
  fidelity: 70,
  warnings: [],
  capabilities: {},
  interactions: [],
  states: [{ id: `st_${id}`, trigger: 'click', label: 'x' }],
  pipeline: [{ kind: 'toggle', status: 'replayable', confidence: 'alta', stateIds: [`st_${id}`] }],
});

const montarVault = (dsId: `ds_${string}`, shared: typeof import('@ds/shared')): void => {
  mkdirSync(shared.vaultSegmentsDir(dsId), { recursive: true });
  mkdirSync(shared.vaultSegmentStatesDir(dsId), { recursive: true });
  const manifest: SegmentsManifest = {
    designSystemId: dsId,
    generatedAt: Date.now(),
    segments: [seg('seg_a'), seg('seg_b'), seg('seg_c')].map((s) => ({
      ...s,
      designSystemId: dsId,
    })),
    insights: [insight('seg_a'), insight('seg_b'), insight('seg_c')],
  };
  writeFileSync(shared.vaultSegmentsManifest(dsId), JSON.stringify(manifest));
  for (const id of ['seg_a', 'seg_b', 'seg_c']) {
    writeFileSync(
      shared.vaultSegmentStates(dsId, id),
      JSON.stringify({
        segmentId: id,
        generatedAt: Date.now(),
        states: [
          {
            id: `st_${id}`,
            trigger: 'click',
            label: 'x',
            html: `<section id="${id}">aberto</section>`,
          },
        ],
      }),
    );
  }
};

test('validarPreviews: sucesso parcial, falha isolada e idempotência por hash', async (t) => {
  const root = join(tmpdir(), `ds-val-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  const shared = await import('@ds/shared');
  const { validarPreviews } = await import('./validate-preview.js');
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });

  const dsId = 'ds_test000000000000000' as `ds_${string}`;
  montarVault(dsId, shared);

  const chamadas: string[] = [];
  const driver = async (cand: { segmentId: string }) => {
    chamadas.push(cand.segmentId);
    if (cand.segmentId === 'seg_c') throw new Error('timeout simulado');
    const ok = cand.segmentId === 'seg_a'; // seg_b reproduz mas falha (no-op)
    return {
      results: [
        { segmentId: cand.segmentId, kind: 'toggle', ok, detail: ok ? undefined : 'no-op' },
      ],
      durationMs: 3,
    };
  };

  const file = await validarPreviews(dsId, { driver });

  // seg_c deu erro → parcial; os outros processaram.
  assert.equal(file.status, 'parcial');
  assert.equal(file.results.find((r) => r.segmentId === 'seg_a')?.ok, true);
  assert.equal(file.results.find((r) => r.segmentId === 'seg_b')?.ok, false);
  assert.ok(file.segments.find((s) => s.segmentId === 'seg_c')?.error, 'seg_c registrou o erro');
  assert.deepEqual(chamadas.sort(), ['seg_a', 'seg_b', 'seg_c'], 'todos tentados (falha isolada)');

  // Idempotência: segunda rodada reaproveita seg_a/seg_b (sem erro) e só re-tenta
  // seg_c (que errou).
  chamadas.length = 0;
  const driver2 = async (cand: { segmentId: string }) => {
    chamadas.push(cand.segmentId);
    return { results: [{ segmentId: cand.segmentId, kind: 'toggle', ok: true }], durationMs: 3 };
  };
  const file2 = await validarPreviews(dsId, { driver: driver2 });
  assert.deepEqual(chamadas, ['seg_c'], 'só o que errou (ou mudou) é revalidado');
  // O cache de seg_a/seg_b foi preservado no arquivo.
  assert.ok(file2.results.some((r) => r.segmentId === 'seg_a'));
  assert.equal(file2.status, 'concluida');
});

test('validarPreviews: persiste o arquivo lido de volta pelo schema', async (t) => {
  const root = join(tmpdir(), `ds-val2-${randomUUID().slice(0, 8)}`);
  process.env.DS_ECOSYSTEM_ROOT = root;
  const shared = await import('@ds/shared');
  const { validarPreviews } = await import('./validate-preview.js');
  t.after(() => {
    rmSync(root, { recursive: true, force: true });
    process.env.DS_ECOSYSTEM_ROOT = undefined;
  });
  const dsId = 'ds_test000000000000000' as `ds_${string}`;
  montarVault(dsId, shared);
  await validarPreviews(dsId, {
    driver: async (c: { segmentId: string }) => ({
      results: [{ segmentId: c.segmentId, kind: 'toggle', ok: true }],
      durationMs: 1,
    }),
  });
  const lido = shared.SegmentValidationFile.parse(
    JSON.parse(readFileSync(shared.vaultSegmentValidation(dsId), 'utf8')),
  );
  assert.equal(lido.validatorVersion, VALIDATOR_VERSION);
  assert.equal(lido.pipelineVersion, PIPELINE_VERSION);
  assert.ok(lido.segments.length >= 1);
});
