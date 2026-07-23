import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ElementDescriptor } from './descriptor.js';
import { ehSeguroClicar, enviaFormulario, navegaParaFora, sameOrigin } from './safety.js';

const mkDesc = (over: Partial<ElementDescriptor> = {}): ElementDescriptor => ({
  ref: '0',
  tag: 'button',
  role: null,
  type: null,
  href: null,
  text: '',
  ariaLabel: null,
  classes: [],
  id: null,
  tabindex: null,
  cursor: 'pointer',
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

test('sameOrigin: relativa e mesma origem são mesma origem; outro host não', () => {
  assert.equal(sameOrigin('/sobre', BASE), true);
  assert.equal(sameOrigin('https://alche.studio/x', BASE), true);
  assert.equal(sameOrigin('https://outro.com/x', BASE), false);
  assert.equal(sameOrigin('#secao', BASE), true);
});

test('navegaParaFora: download, _blank, host externo e mailto', () => {
  assert.equal(navegaParaFora(mkDesc({ download: true }), BASE), true);
  assert.equal(navegaParaFora(mkDesc({ targetBlank: true }), BASE), true);
  assert.equal(navegaParaFora(mkDesc({ tag: 'a', href: 'https://x.com' }), BASE), true);
  assert.equal(navegaParaFora(mkDesc({ tag: 'a', href: 'mailto:a@b.com' }), BASE), true);
  assert.equal(navegaParaFora(mkDesc({ tag: 'a', href: '/interno' }), BASE), false);
  assert.equal(navegaParaFora(mkDesc({ tag: 'a', href: '#top' }), BASE), false);
});

test('enviaFormulario: submit e button sem type com verbo; toggle não', () => {
  assert.equal(enviaFormulario(mkDesc({ tag: 'input', type: 'submit' })), true);
  assert.equal(enviaFormulario(mkDesc({ tag: 'button', type: null, text: 'Enviar' })), true);
  assert.equal(
    enviaFormulario(
      mkDesc({ tag: 'button', type: null, text: 'Abrir menu', ariaExpanded: 'false' }),
    ),
    false,
  );
});

test('ehSeguroClicar: bloqueia compra, logout, submit, download, externo', () => {
  assert.equal(ehSeguroClicar(mkDesc({ text: 'Comprar agora' }), BASE).safe, false);
  assert.equal(ehSeguroClicar(mkDesc({ text: 'Finalizar compra' }), BASE).safe, false);
  assert.equal(ehSeguroClicar(mkDesc({ text: 'Sair', role: null }), BASE).safe, false);
  assert.equal(ehSeguroClicar(mkDesc({ text: 'Logout' }), BASE).safe, false);
  assert.equal(
    ehSeguroClicar(mkDesc({ tag: 'input', type: 'submit', text: 'Ok' }), BASE).safe,
    false,
  );
  assert.equal(
    ehSeguroClicar(mkDesc({ tag: 'a', href: 'https://x.com', text: ' site' }), BASE).safe,
    false,
  );
  assert.equal(ehSeguroClicar(mkDesc({ download: true, text: 'PDF' }), BASE).safe, false);
  assert.equal(ehSeguroClicar(mkDesc({ disabled: true, text: 'menu' }), BASE).safe, false);
});

test('ehSeguroClicar: permite toggles de UI e fechar', () => {
  assert.equal(
    ehSeguroClicar(mkDesc({ text: 'Perguntas', ariaExpanded: 'false' }), BASE).safe,
    true,
  );
  assert.equal(ehSeguroClicar(mkDesc({ text: 'Aba 2', role: 'tab' }), BASE).safe, true);
  assert.equal(ehSeguroClicar(mkDesc({ text: 'Fechar', role: null }), BASE).safe, true);
  // Verbo perigoso mas é um toggle de UI (menu com haspopup): liberado.
  assert.equal(
    ehSeguroClicar(mkDesc({ text: 'Cancelar', role: 'menuitem', ariaHaspopup: 'menu' }), BASE).safe,
    true,
  );
});
