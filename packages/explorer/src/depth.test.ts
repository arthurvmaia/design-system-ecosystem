import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decidirProfundidade } from './depth.js';

test('auto: HTML simples não dispara profundidade', () => {
  const d = decidirProfundidade('<section><h1>Oi</h1><p>texto</p></section>');
  assert.equal(d.deep, false);
  assert.deepEqual(d.reasons, []);
});

test('auto: canvas dispara profundidade com motivo', () => {
  const d = decidirProfundidade('<div><canvas id="c"></canvas></div>');
  assert.equal(d.deep, true);
  assert.ok(d.reasons.includes('canvas'));
});

test('auto: sticky dispara', () => {
  const d = decidirProfundidade('<div style="position: sticky; top:0">nav</div>');
  assert.equal(d.deep, true);
  assert.ok(d.reasons.includes('sticky'));
});

test('auto: lottie e gsap são reconhecidos', () => {
  const lottie = decidirProfundidade('<lottie-player src="a.json"></lottie-player>');
  assert.ok(lottie.reasons.includes('lottie'));
  const gsap = decidirProfundidade('<script>gsap.to(x)</script>');
  assert.ok(gsap.reasons.includes('gsap/scrolltrigger'));
});

test('force: sempre profundo; off: sempre raso', () => {
  assert.equal(decidirProfundidade('<p>nada</p>', 'force').deep, true);
  assert.equal(decidirProfundidade('<canvas></canvas>', 'off').deep, false);
});

test('reúne vários motivos quando há vários sinais', () => {
  const d = decidirProfundidade('<canvas></canvas><div class="parallax" data-scroll></div>');
  assert.ok(d.reasons.length >= 2);
});

test('estado interativo descobrível (accordion/tabs/modal) dispara profundidade', () => {
  assert.ok(
    decidirProfundidade('<button aria-expanded="false">P</button>').reasons.includes(
      'estados-interativos',
    ),
  );
  assert.ok(
    decidirProfundidade('<button role="tab" aria-selected="true">Aba</button>').reasons.includes(
      'estados-interativos',
    ),
  );
  assert.ok(decidirProfundidade('<div class="modal-overlay">x</div>').reasons.includes('overlay'));
  assert.ok(
    decidirProfundidade('<script>new IntersectionObserver(fn)</script>').reasons.includes(
      'scroll-reveal',
    ),
  );
});
