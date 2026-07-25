import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScrollBehavior, SegmentInsight } from '@ds/shared';
import { associarScroll } from './associar.js';
import { enriquecerInsight, nivelScroll } from './enriquecer.js';

const beh = (over: Partial<ScrollBehavior> = {}): ScrollBehavior => ({
  id: 'scb_1',
  kind: 'viewport-reveal',
  trigger: 'viewport',
  target: { id: 'hero', classes: ['card'] },
  scrollContainer: 'window',
  start: 0.2,
  end: 0.6,
  keyframes: [],
  scrub: false,
  pin: false,
  confidence: 'alta',
  limitations: [],
  ...over,
});

const seg = (id: string, html: string) => ({ id, htmlSnippet: html });

test('associarScroll: liga pelo id do alvo ao segmento certo', () => {
  const r = associarScroll(
    [beh({ target: { id: 'hero', classes: [] } })],
    [seg('seg_a', '<section id="hero">x</section>'), seg('seg_b', '<footer>y</footer>')],
  );
  assert.equal(r.porSegmento.get('seg_a')?.length, 1);
  assert.equal(r.naoAssociados.length, 0);
});

test('associarScroll: sem casamento confiável → não associa (fica detectado)', () => {
  const r = associarScroll(
    [beh({ target: { id: 'inexistente', classes: [] } })],
    [seg('seg_a', '<section id="hero">x</section>')],
  );
  assert.equal(r.porSegmento.size, 0);
  assert.equal(r.naoAssociados.length, 1);
});

test('associarScroll: runtime externo (alvo vazio) fica à parte', () => {
  const r = associarScroll(
    [
      beh({
        kind: 'external-scroll-runtime',
        target: { id: null, classes: [] },
        sourceRuntime: 'gsap',
      }),
    ],
    [seg('seg_a', '<section id="hero">x</section>')],
  );
  assert.equal(r.porSegmento.size, 0);
  assert.equal(r.naoAssociados.length, 1);
});

test('associarScroll: confiança vira a PIOR entre comportamento e associação', () => {
  // classe distintiva única casa em 1 segmento com >=2 classes → média; alvo alta.
  const r = associarScroll(
    [beh({ confidence: 'alta', target: { id: null, classes: ['reveal-card'] } })],
    [seg('seg_a', '<div class="reveal-card outro">x</div>')],
  );
  const b = r.porSegmento.get('seg_a')?.[0];
  assert.ok(b);
  assert.notEqual(b?.confidence, 'alta', 'rebaixou para a confiança da associação');
});

test('nivelScroll: reproduzível → parcial (até validar); externo → externo', () => {
  assert.equal(nivelScroll([beh({ kind: 'viewport-reveal' })]), 'parcial');
  assert.equal(nivelScroll([beh({ kind: 'parallax' })]), 'parcial');
  assert.equal(nivelScroll([beh({ kind: 'external-scroll-runtime' })]), 'externo');
  assert.equal(nivelScroll([]), undefined);
});

const baseInsight = (): SegmentInsight => ({
  segmentId: 'seg_1',
  support: 'completo',
  renderMode: 'html',
  fidelity: 95,
  warnings: [],
  capabilities: {},
  interactions: [],
});

test('enriquecerInsight: scroll associado preenche a dimensão e anexa ao insight', () => {
  const out = enriquecerInsight(baseInsight(), undefined, 1, {
    scroll: [beh({ kind: 'viewport-reveal', limitations: ['reveal por IO'] })],
  });
  assert.equal(out.dimensions?.scroll, 'parcial', 'dimensão scroll preenchida');
  assert.equal(out.scroll?.length, 1, 'comportamentos anexados ao insight');
  assert.ok(
    (out.limitations ?? []).includes('reveal por IO'),
    'limitação do comportamento surge no insight',
  );
});

test('enriquecerInsight: só scroll (sem interação/asset) ainda enriquece', () => {
  const out = enriquecerInsight(baseInsight(), undefined, 1, {
    scroll: [beh({ kind: 'sticky' })],
  });
  assert.ok(out.scroll, 'não caiu no early-return: scroll preservado');
  assert.equal(out.dimensions?.scroll, 'parcial');
});
