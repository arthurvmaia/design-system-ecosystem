import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type ScrollElementSamples,
  type ScrollSample,
  classificarScroll,
  parseBlur,
  parseTransform,
} from './scroll-classify.js';

const sample = (over: Partial<ScrollSample>): ScrollSample => ({
  scrollProgress: 0,
  scrollY: 0,
  visible: true,
  box: { x: 0, y: 100, w: 200, h: 100 },
  opacity: 1,
  tx: 0,
  ty: 0,
  scale: 1,
  blur: 0,
  position: 'static',
  zIndex: 'auto',
  classes: [],
  ...over,
});

/** 5 quadros em progress 0/.25/.5/.75/1 aplicando o override de cada índice. */
const serie = (overrides: Array<Partial<ScrollSample>>): ScrollElementSamples => ({
  match: { id: 'x', classes: ['card'] },
  viewportH: 800,
  samples: overrides.map((o, i) => sample({ scrollProgress: i / (overrides.length - 1), ...o })),
});

test('parseTransform: matrix → translate e escala', () => {
  assert.deepEqual(parseTransform('matrix(1, 0, 0, 1, 12, -40)'), { tx: 12, ty: -40, scale: 1 });
  assert.deepEqual(parseTransform('matrix(1.5, 0, 0, 1.5, 0, 0)'), { tx: 0, ty: 0, scale: 1.5 });
  assert.deepEqual(parseTransform('none'), { tx: 0, ty: 0, scale: 1 });
});

test('parseBlur: extrai px do filter', () => {
  assert.equal(parseBlur('blur(8px)'), 8);
  assert.equal(parseBlur('none'), 0);
});

test('reveal: opacity 0→1 monotônica e fica → viewport-reveal', () => {
  const bs = classificarScroll(
    serie([{ opacity: 0 }, { opacity: 0.2 }, { opacity: 0.6 }, { opacity: 0.9 }, { opacity: 1 }]),
  );
  const rev = bs.find((b) => b.kind === 'viewport-reveal');
  assert.ok(rev, 'classificou como reveal');
  assert.equal(rev?.trigger, 'viewport');
  assert.equal(rev?.scrub, false);
  assert.ok((rev?.keyframes.length ?? 0) >= 2, 'tem keyframes');
});

test('viewport-hide: opacity 1→0 ao sair', () => {
  const bs = classificarScroll(
    serie([{ opacity: 1 }, { opacity: 0.7 }, { opacity: 0.4 }, { opacity: 0.1 }, { opacity: 0 }]),
  );
  assert.ok(bs.some((b) => b.kind === 'viewport-hide'));
});

test('progress-opacity: varia sem revelar/esconder limpo → scrub', () => {
  const bs = classificarScroll(
    serie([{ opacity: 0.3 }, { opacity: 0.6 }, { opacity: 1 }, { opacity: 0.6 }, { opacity: 0.3 }]),
  );
  assert.ok(bs.some((b) => b.kind === 'progress-opacity' && b.scrub === true));
});

test('parallax: translateY variando com o scroll → parallax scrub', () => {
  const bs = classificarScroll(
    serie([{ ty: 0 }, { ty: -10 }, { ty: -20 }, { ty: -30 }, { ty: -40 }]),
  );
  const par = bs.find((b) => b.kind === 'parallax');
  assert.ok(par, 'classificou parallax');
  assert.equal(par?.scrub, true);
  assert.ok((par?.keyframes.length ?? 0) >= 2);
});

test('sticky: position fixed/sticky num intervalo → sticky pin', () => {
  const bs = classificarScroll(
    serie([
      { position: 'static' },
      { position: 'sticky' },
      { position: 'sticky' },
      { position: 'sticky' },
      { position: 'static' },
    ]),
  );
  const st = bs.find((b) => b.kind === 'sticky');
  assert.ok(st, 'classificou sticky');
  assert.equal(st?.pin, true);
  assert.equal(st?.trigger, 'sticky');
});

test('progress-scale: escala variando → progress-scale', () => {
  const bs = classificarScroll(
    serie([{ scale: 1 }, { scale: 1.05 }, { scale: 1.1 }, { scale: 1.15 }, { scale: 1.2 }]),
  );
  assert.ok(bs.some((b) => b.kind === 'progress-scale'));
});

test('progress-blur: blur variando → progress-blur', () => {
  const bs = classificarScroll(
    serie([{ blur: 10 }, { blur: 7.5 }, { blur: 5 }, { blur: 2.5 }, { blur: 0 }]),
  );
  assert.ok(bs.some((b) => b.kind === 'progress-blur'));
});

test('class-toggle: ganha classe num limiar → class-toggle', () => {
  const bs = classificarScroll(
    serie([
      { classes: [] },
      { classes: [] },
      { classes: ['in-view'] },
      { classes: ['in-view'] },
      { classes: ['in-view'] },
    ]),
  );
  const ct = bs.find((b) => b.kind === 'class-toggle');
  assert.ok(ct, 'classificou class-toggle');
  assert.deepEqual(ct?.classesAdicionadas, ['in-view']);
});

test('estático: nada varia → nenhum comportamento', () => {
  const bs = classificarScroll(serie([{}, {}, {}, {}, {}]));
  assert.equal(bs.length, 0);
});

test('combinado: fade + translate → dois comportamentos', () => {
  const bs = classificarScroll(
    serie([
      { opacity: 0, ty: -40 },
      { opacity: 0.3, ty: -30 },
      { opacity: 0.6, ty: -20 },
      { opacity: 0.9, ty: -10 },
      { opacity: 1, ty: 0 },
    ]),
  );
  assert.ok(
    bs.some((b) => b.kind === 'viewport-reveal'),
    'reveal pelo fade',
  );
  assert.ok(
    bs.some((b) => b.kind === 'parallax'),
    'parallax pelo translate',
  );
});
