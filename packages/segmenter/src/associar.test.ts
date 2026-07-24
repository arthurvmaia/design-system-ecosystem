import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CapturedElement, CapturedState, FidelityAssessment } from '@ds/shared';
import { associarElemento, associarManifesto } from './associar.js';

const assess = (caps: FidelityAssessment['capabilities'] = {}): FidelityAssessment => ({
  support: 'parcial',
  renderMode: 'html-js',
  fidelity: 70,
  warnings: [],
  capabilities: caps,
  interactions: [],
});

const estado = (over: Partial<CapturedState> = {}): CapturedState => ({
  id: 'st_1',
  trigger: 'click',
  label: 'aberto',
  signature: 'sig',
  html: '<div class="painel" data-state="aberto">conteúdo</div>',
  ...over,
});

const elemento = (over: Partial<CapturedElement> = {}): CapturedElement => ({
  ref: 'r',
  tag: 'button',
  role: null,
  box: { x: 0, y: 0, w: 10, h: 10 },
  label: '',
  interactions: ['click'],
  states: [estado()],
  assessment: assess(),
  ...over,
});

const seg = (id: string, html: string) => ({ id, htmlSnippet: html });

test('associarElemento: casa por id com confiança alta', () => {
  const el = elemento({ match: { id: 'hero-cta', classes: [] } });
  const r = associarElemento(el, [
    seg('seg_1', '<section><button id="hero-cta">Ver</button></section>'),
    seg('seg_2', '<footer>rodapé</footer>'),
  ]);
  assert.equal(r.segmentId, 'seg_1');
  assert.equal(r.confidence, 'alta');
  assert.equal(r.method, 'id');
});

test('associarElemento: casa por classes distintivas', () => {
  const el = elemento({ match: { id: null, classes: ['accordion-trigger', 'faq-item'] } });
  const r = associarElemento(el, [
    seg('seg_1', '<div class="accordion-trigger faq-item">Pergunta</div>'),
    seg('seg_2', '<p>outro</p>'),
  ]);
  assert.equal(r.segmentId, 'seg_1');
  assert.equal(r.method, 'classes');
  assert.equal(r.confidence, 'media');
});

test('associarElemento: sem correspondência confiável devolve nenhuma', () => {
  const el = elemento({ match: { id: 'fantasma', classes: ['zz'] }, label: 'x' });
  const r = associarElemento(el, [seg('seg_1', '<section>nada a ver</section>')]);
  assert.equal(r.confidence, 'nenhuma');
  assert.equal(r.segmentId, '');
});

test('associarManifesto: liga estados e pipeline ao segmento certo', () => {
  const el = elemento({
    match: { id: 'faq1', classes: [] },
    interactions: ['click', 'toggle'],
  });
  const { porSegmento, naoAssociados } = associarManifesto(
    [el],
    [seg('seg_1', '<div id="faq1" class="accordion">P</div>'), seg('seg_2', '<footer/>')],
  );
  assert.equal(naoAssociados.length, 0);
  const enr = porSegmento.get('seg_1');
  assert.ok(enr, 'seg_1 recebeu enriquecimento');
  assert.equal(enr?.states.length, 1);
  assert.equal(enr?.storedStates.length, 1);
  assert.equal(enr?.storedStates[0]?.html.includes('painel'), true, 'HTML do estado preservado');
  // click + toggle são reproduzíveis e têm estado → replayable.
  const clique = enr?.pipeline.find((i) => i.kind === 'click');
  assert.equal(clique?.status, 'replayable');
  assert.equal(clique?.confidence, 'alta');
});

test('associarManifesto: elemento sem match vira não-associado, não gruda no errado', () => {
  const el = elemento({ match: { id: 'zzz', classes: [] }, label: 'q' });
  const { porSegmento, naoAssociados } = associarManifesto([el], [seg('seg_1', '<p>outro</p>')]);
  assert.equal(porSegmento.size, 0);
  assert.equal(naoAssociados.length, 1);
});

test('associarManifesto: portal captura vira elemento relacionado', () => {
  const el = elemento({
    match: { id: 'abre', classes: [] },
    interactions: ['modal'],
    states: [estado({ trigger: 'click', label: 'modal', portalHtml: '<dialog>oi</dialog>' })],
  });
  const { porSegmento } = associarManifesto(
    [el],
    [seg('seg_1', '<button id="abre">Abrir</button>')],
  );
  const enr = porSegmento.get('seg_1');
  assert.equal(enr?.related.length, 1);
  assert.equal(enr?.related[0]?.kind, 'portal');
  assert.equal(enr?.storedStates[0]?.portalHtml?.includes('dialog'), true);
});

test('associarManifesto: runtime externo (lottie) marca dependência e external-runtime', () => {
  const el = elemento({
    match: { id: 'anim', classes: [] },
    interactions: [],
    states: [],
    assessment: assess({ hasLottie: true }),
  });
  const { porSegmento } = associarManifesto([el], [seg('seg_1', '<div id="anim"></div>')]);
  const enr = porSegmento.get('seg_1');
  assert.ok(enr?.dependencies.some((d) => d.runtime === 'lottie'));
  assert.ok(enr?.pipeline.some((i) => i.status === 'external-runtime'));
});
