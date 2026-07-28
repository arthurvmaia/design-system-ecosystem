import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { StructuralNode, VisualLayer } from '@ds/shared';
import { escolherCamadasDePagina } from './camadas-de-pagina.js';

/**
 * O caso real: o Cogni tem um canvas WebGL fixo (duas linhas de luz que
 * atravessam o site inteiro), dois blobs de gradiente e um grão — todos fixos,
 * todos do tamanho da tela, nenhum dentro de uma dobra.
 */

const VIEWPORT = { width: 1440, height: 900 };

const camada = (opts: {
  hash: string;
  role: string;
  w: number;
  h: number;
  tag?: string;
}): VisualLayer =>
  ({
    fingerprint: {
      hash: opts.hash,
      tag: opts.tag ?? 'div',
      role: null,
      aria: {},
      dataAttrs: {},
      text: '',
      stableClasses: [],
      id: null,
      semanticAncestor: null,
      siblingIndex: 0,
      structuralSignature: '',
      box: { x: 0, y: 0, w: 1, h: 1 },
      listeners: [],
      cursor: 'auto',
    },
    role: opts.role,
    ownerSection: null,
    ownerEvidence: [],
    ownerConfidence: 'baixa',
    stacking: { zIndex: 'auto', createsContext: false, contextOwner: null, position: 'fixed' },
    paintOrder: 0,
    pageBox: { x: 0, y: 0, w: opts.w, h: opts.h },
    coveredBy: [],
    covers: [],
    pseudo: [],
    inseparable: false,
  }) as unknown as VisualLayer;

const no = (hash: string, midia: string[] = [], parent: string | null = 'body'): StructuralNode =>
  ({
    fingerprint: {
      hash,
      tag: 'div',
      role: null,
      aria: {},
      dataAttrs: {},
      text: '',
      stableClasses: [],
      id: null,
      semanticAncestor: null,
      siblingIndex: 0,
      structuralSignature: '',
      box: { x: 0, y: 0, w: 1, h: 1 },
      listeners: [],
      cursor: 'auto',
    },
    role: 'decoration',
    realm: 'document',
    parent,
    depth: 1,
    pageBox: { x: 0, y: 0, w: 1440, h: 900 },
    areaShare: 1,
    ownText: '',
    subtreeTextLength: 0,
    mediaTags: midia,
    visible: true,
  }) as StructuralNode;

test('canvas fixo vai para o grupo com runtime; blobs de CSS vão para o outro', () => {
  const camadas = [
    camada({ hash: 'canvas', role: 'fixed', w: 1440, h: 900, tag: 'canvas' }),
    camada({ hash: 'blob1', role: 'fixed', w: 720, h: 720 }),
    camada({ hash: 'blob2', role: 'background', w: 864, h: 864 }),
  ];
  const nos = [no('canvas', ['canvas']), no('blob1'), no('blob2')];
  const r = escolherCamadasDePagina({
    camadas,
    nos,
    viewport: VIEWPORT,
    hashesComRuntime: new Set(['canvas']),
  });
  assert.deepEqual(r.comRuntime, ['canvas']);
  assert.deepEqual(r.soCss, ['blob1', 'blob2']);
});

test('camada pequena não é fundo de página — é enfeite de uma dobra', () => {
  const r = escolherCamadasDePagina({
    camadas: [camada({ hash: 'x', role: 'fixed', w: 200, h: 100 })],
    nos: [no('x')],
    viewport: VIEWPORT,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});

test('faixa larga e fininha é separador, não fundo', () => {
  const r = escolherCamadasDePagina({
    camadas: [camada({ hash: 'faixa', role: 'fixed', w: 1440, h: 6 })],
    nos: [no('faixa')],
    viewport: VIEWPORT,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});

test('conteúdo não vira fundo, por maior que seja', () => {
  const r = escolherCamadasDePagina({
    camadas: [camada({ hash: 'c', role: 'content', w: 1440, h: 900 })],
    nos: [no('c')],
    viewport: VIEWPORT,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});

test('o próprio body/raiz não é uma camada de fundo', () => {
  const r = escolherCamadasDePagina({
    camadas: [
      camada({ hash: 'body', role: 'background', w: 1440, h: 4000, tag: 'body' }),
      camada({ hash: 'raiz', role: 'fixed', w: 1440, h: 900 }),
    ],
    nos: [no('body', [], null), no('raiz', [], null)],
    viewport: VIEWPORT,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});
