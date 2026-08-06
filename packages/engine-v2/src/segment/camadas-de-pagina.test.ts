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
    pageHeight: 4000,
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
    pageHeight: 4000,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});

test('faixa larga e fininha é separador, não fundo', () => {
  const r = escolherCamadasDePagina({
    camadas: [camada({ hash: 'faixa', role: 'fixed', w: 1440, h: 6 })],
    nos: [no('faixa')],
    viewport: VIEWPORT,
    pageHeight: 4000,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});

test('conteúdo não vira fundo, por maior que seja', () => {
  const r = escolherCamadasDePagina({
    camadas: [camada({ hash: 'c', role: 'content', w: 1440, h: 900 })],
    nos: [no('c')],
    viewport: VIEWPORT,
    pageHeight: 4000,
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
    pageHeight: 4000,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});

// ── Fase 3: camada de PÁGINA se mede contra a página, e fundo não tem texto ──

const noComTexto = (hash: string, texto: number): StructuralNode =>
  ({ ...no(hash), subtreeTextLength: texto }) as StructuralNode;

test('camada absoluta que cobre só o hero NÃO é fundo de página', () => {
  // O caso medido no acervo: {0,0,1440,900} absolute dentro do hero, numa
  // página de 4795 px, colado atrás de todas as dobras como "fundo da página".
  // Das 31 camadas escolhidas pela regra antiga, 22 cobriam menos de 30% da
  // página.
  const soDoHero = camada({ hash: 'hero-bg', role: 'background', w: 1440, h: 900 });
  (soDoHero as { stacking: { position: string } }).stacking.position = 'absolute';
  const r = escolherCamadasDePagina({
    camadas: [soDoHero],
    nos: [no('hero-bg')],
    viewport: VIEWPORT,
    pageHeight: 4795,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});

test('camada absoluta que ATRAVESSA a página é fundo de verdade', () => {
  const atravessa = camada({ hash: 'grad', role: 'background', w: 1440, h: 3600 });
  (atravessa as { stacking: { position: string } }).stacking.position = 'absolute';
  const r = escolherCamadasDePagina({
    camadas: [atravessa],
    nos: [no('grad')],
    viewport: VIEWPORT,
    pageHeight: 4000,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r.soCss, ['grad']);
});

test('fixo CHEIO DE TEXTO é navegação, não pano de fundo', () => {
  // O header fixo do antigravity virou o segmento "Fundo da página" porque
  // `fixed` entrava sem olhar conteúdo. Uma barra com links não é fundo.
  const r = escolherCamadasDePagina({
    camadas: [camada({ hash: 'header', role: 'fixed', w: 1440, h: 900 })],
    nos: [noComTexto('header', 118)],
    viewport: VIEWPORT,
    pageHeight: 11579,
    hashesComRuntime: new Set(),
  });
  assert.deepEqual(r, { comRuntime: [], soCss: [] });
});
