import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ElementDescriptor } from './descriptor.js';
import { ehCandidatoInterativo, inferirInteracoes, probesPara } from './interaction-map.js';

const mkDesc = (over: Partial<ElementDescriptor> = {}): ElementDescriptor => ({
  ref: '0',
  tag: 'div',
  role: null,
  type: null,
  href: null,
  text: 'clique',
  ariaLabel: null,
  classes: [],
  id: null,
  tabindex: null,
  cursor: 'auto',
  hasListeners: false,
  listenerTypes: [],
  disabled: false,
  ariaExpanded: null,
  ariaHaspopup: null,
  ariaControls: null,
  download: false,
  targetBlank: false,
  box: { x: 0, y: 0, w: 100, h: 40 },
  inViewport: true,
  dataAttrs: {},
  ...over,
});

const BASE = 'https://alche.studio/';

test('ehCandidatoInterativo: botão, div com listener, div com cursor pointer', () => {
  assert.equal(ehCandidatoInterativo(mkDesc({ tag: 'button' })), true);
  assert.equal(
    ehCandidatoInterativo(mkDesc({ tag: 'div', hasListeners: true, listenerTypes: ['click'] })),
    true,
  );
  assert.equal(ehCandidatoInterativo(mkDesc({ tag: 'div', cursor: 'pointer' })), true);
  assert.equal(
    ehCandidatoInterativo(mkDesc({ tag: 'div', dataAttrs: { 'data-toggle': 'x' } })),
    true,
  );
  // Div inerte: não é candidato.
  assert.equal(ehCandidatoInterativo(mkDesc({ tag: 'div', cursor: 'auto', text: '' })), false);
});

test('probesPara: hover sempre; focus para focáveis; click só se seguro', () => {
  const botao = probesPara(mkDesc({ tag: 'button', text: 'Abrir', ariaExpanded: 'false' }), BASE);
  assert.deepEqual(botao.map((p) => p.kind).sort(), ['click', 'focus', 'hover']);

  const compra = probesPara(mkDesc({ tag: 'button', text: 'Comprar' }), BASE);
  assert.equal(
    compra.some((p) => p.kind === 'click'),
    false,
    'compra não vira clique',
  );
  assert.equal(
    compra.some((p) => p.kind === 'hover'),
    true,
  );

  const divHover = probesPara(mkDesc({ tag: 'div', cursor: 'pointer', text: '' }), BASE);
  // div não é focável ⇒ sem focus; click seguro ⇒ presente.
  assert.equal(
    divHover.some((p) => p.kind === 'focus'),
    false,
  );
});

test('inferirInteracoes: aria-expanded → toggle; role=tab → tab; listeners', () => {
  assert.ok(inferirInteracoes(mkDesc({ ariaExpanded: 'false' })).includes('toggle'));
  assert.ok(inferirInteracoes(mkDesc({ role: 'tab' })).includes('tab'));
  assert.ok(
    inferirInteracoes(mkDesc({ hasListeners: true, listenerTypes: ['pointerdown'] })).includes(
      'pointer',
    ),
  );
  assert.ok(inferirInteracoes(mkDesc({ classes: ['swiper-slide'] })).includes('carousel'));
});
