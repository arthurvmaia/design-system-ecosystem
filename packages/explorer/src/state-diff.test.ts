import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type StateSnapshot,
  diffSnapshots,
  registrarEstado,
  stateSignature,
} from './state-diff.js';

const snap = (over: Partial<StateSnapshot> = {}): StateSnapshot => ({
  classes: ['card'],
  attrs: { 'aria-expanded': 'false' },
  computed: { display: 'block', height: '40px', opacity: '1' },
  box: { w: 200, h: 40 },
  childCount: 2,
  textLen: 30,
  visible: true,
  portalSignature: '',
  htmlSig: 'aaaa',
  ...over,
});

test('diffSnapshots: detecta abrir accordion (altura + aria + classes)', () => {
  const antes = snap();
  const depois = snap({
    classes: ['card', 'open'],
    attrs: { 'aria-expanded': 'true' },
    computed: { display: 'block', height: '220px', opacity: '1' },
    box: { w: 200, h: 220 },
  });
  const d = diffSnapshots(antes, depois);
  assert.equal(d.changed, true);
  assert.ok(d.changes.includes('classes'));
  assert.ok(d.changes.some((c) => c.startsWith('atributos')));
  assert.ok(d.changes.includes('altura'));
});

test('diffSnapshots: ignora jitter de 1-2px na caixa', () => {
  const d = diffSnapshots(snap(), snap({ box: { w: 201, h: 41 } }));
  assert.equal(d.changed, false);
});

test('diffSnapshots: detecta portal aberto', () => {
  const d = diffSnapshots(snap(), snap({ portalSignature: 'abc123' }));
  assert.equal(d.abriuPortal, true);
  assert.ok(d.changes.includes('portal'));
});

test('diffSnapshots: detecta reveal em filho pela assinatura de subárvore', () => {
  // O próprio elemento não muda (classes/attrs/box iguais), só a subárvore.
  const d = diffSnapshots(snap(), snap({ htmlSig: 'ffff' }));
  assert.equal(d.changed, true);
  assert.ok(d.changes.includes('subárvore'));
});

test('stateSignature: estável e dedupável; muda com o estado', () => {
  assert.equal(stateSignature(snap()), stateSignature(snap()));
  // Posição/texto não entram na assinatura → mesmo estado.
  assert.equal(
    stateSignature(snap()),
    stateSignature(snap({ textLen: 999, box: { w: 999, h: 40 } })),
  );
  // Classe de estado entra → assinatura diferente.
  assert.notEqual(stateSignature(snap()), stateSignature(snap({ classes: ['card', 'open'] })));
});

test('registrarEstado: novo entra, repetido não, respeita o teto', () => {
  const vistos = new Set<string>();
  assert.equal(registrarEstado(vistos, 'a', 3), true);
  assert.equal(registrarEstado(vistos, 'a', 3), false, 'repetido');
  assert.equal(registrarEstado(vistos, 'b', 3), true);
  assert.equal(registrarEstado(vistos, 'c', 3), true);
  assert.equal(registrarEstado(vistos, 'd', 3), false, 'teto atingido');
});
