import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ScrollBehavior, StructuralNode } from '@ds/shared';
import { escolherComportamentos } from './comportamentos.js';

/**
 * O pedido do usuário: "os hovers e a forma que os elementos aparecem quando
 * desce a tela, isso tudo tem que virar componente". Os casos abaixo saem da
 * medição real do site AEX: parallax ×5, class-toggle ×3, sticky ×2.
 */

const comportamento = (
  id: string,
  kind: string,
  alvo: { id?: string | null; classes?: string[] },
): ScrollBehavior =>
  ({
    id,
    kind,
    trigger: kind,
    target: { id: alvo.id ?? null, classes: alvo.classes ?? [] },
    scrollContainer: 'window',
    start: 0,
    end: 1,
    keyframes: [],
    scrub: false,
    pin: false,
    confidence: 'alta',
    limitations: [],
  }) as ScrollBehavior;

const no = (hash: string, id: string | null, classes: string[]): StructuralNode =>
  ({
    fingerprint: {
      hash,
      tag: 'div',
      role: null,
      aria: {},
      dataAttrs: {},
      text: '',
      stableClasses: classes,
      id,
      semanticAncestor: null,
      siblingIndex: 0,
      structuralSignature: '',
      box: { x: 0, y: 0, w: 0.5, h: 0.5 },
      listeners: [],
      cursor: 'auto',
    },
    role: 'card',
    realm: 'document',
    parent: 'body',
    depth: 2,
    pageBox: { x: 0, y: 0, w: 400, h: 300 },
    areaShare: 0.1,
    ownText: '',
    subtreeTextLength: 40,
    mediaTags: [],
    visible: true,
  }) as StructuralNode;

test('reveal e class-toggle caem na mesma família, com contagem', () => {
  const r = escolherComportamentos({
    scroll: [
      comportamento('s1', 'class-toggle', { classes: ['reveal'] }),
      comportamento('s2', 'class-toggle', { classes: ['reveal'] }),
      comportamento('s3', 'reveal', { classes: ['reveal'] }),
    ],
    nos: [no('h1', null, ['reveal'])],
  });
  assert.equal(r.length, 1, `saíram: ${r.map((x) => x.nome).join(', ')}`);
  assert.equal(r[0]?.nome, 'Revelar ao rolar (×3)');
  assert.equal(r[0]?.quantidade, 3);
  assert.deepEqual(r[0]?.scrollIds, ['s1', 's2', 's3']);
});

test('parallax e sticky viram itens separados', () => {
  const r = escolherComportamentos({
    scroll: [
      comportamento('p1', 'parallax', { id: 'camada' }),
      comportamento('k1', 'sticky', { id: 'barra' }),
    ],
    nos: [no('h1', 'camada', []), no('h2', 'barra', [])],
  });
  assert.deepEqual(r.map((x) => x.nome).sort(), ['Fixar ao rolar', 'Parallax ao rolar']);
});

test('sticky de camada fixa não vira comportamento: é o fundo da página', () => {
  const r = escolherComportamentos({
    scroll: [comportamento('s1', 'sticky', { id: 'webgl-bg', classes: ['fixed', '-z-20'] })],
    nos: [no('h1', 'webgl-bg', ['fixed', '-z-20'])],
  });
  assert.deepEqual(r, []);
});

test('comportamento sem alvo resolvível não vira componente', () => {
  const r = escolherComportamentos({
    scroll: [comportamento('s1', 'parallax', { classes: ['nao-existe-no-mapa'] })],
    nos: [no('h1', null, ['outra-coisa'])],
  });
  assert.deepEqual(r, []);
});

test('o alvo só casa quando TODAS as classes batem', () => {
  // Casar por interseção pegaria o elemento errado em site com utilitário.
  const r = escolherComportamentos({
    scroll: [comportamento('s1', 'parallax', { classes: ['relative', 'camada-funda'] })],
    nos: [no('h1', null, ['relative']), no('h2', null, ['relative', 'camada-funda'])],
  });
  assert.deepEqual(r[0]?.hashes, ['h2']);
});
