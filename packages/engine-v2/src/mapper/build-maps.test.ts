import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LIMIAR_CONTENCAO,
  construirBackgrounds,
  construirCamadas,
  construirMapaEstrutural,
  construirMidias,
  construirRuntimes,
  contido,
  intersecao,
  ordemDePintura,
  secoesCandidatas,
} from './build-maps.js';
import type {
  BoxPx,
  RawBackground,
  RawColeta,
  RawInstrumentacao,
  RawMedia,
  RawNode,
  RawStacking,
} from './raw.js';

const VP = { width: 1440, height: 900, deviceScaleFactor: 1 };

const stacking = (over: Partial<RawStacking> = {}): RawStacking => ({
  zIndex: 'auto',
  createsContext: false,
  position: 'static',
  opacity: 1,
  transform: 'none',
  filter: 'none',
  backdropFilter: 'none',
  mixBlendMode: 'normal',
  isolation: 'auto',
  mask: 'none',
  clipPath: 'none',
  overflow: 'visible',
  pointerEvents: 'auto',
  ...over,
});

let seq = 0;
const no = (over: Partial<RawNode> & { pageBox: BoxPx }): RawNode => {
  // `pageBox` sai do spread porque as três caixas derivadas dele são calculadas
  // aqui; deixá-lo no `...resto` sobrescreveria o cálculo com o valor cru.
  const { pageBox, ...resto } = over;
  const ref = resto.ref ?? seq++;
  return {
    ref,
    realm: 'document',
    parentRef: null,
    depth: 0,
    tag: 'div',
    role: null,
    aria: {},
    dataAttrs: {},
    id: null,
    classes: [],
    text: '',
    ownText: '',
    subtreeTextLength: 0,
    semanticAncestor: null,
    siblingIndex: 0,
    structuralSignature: '',
    papel: 'unknown',
    camada: 'content',
    visivel: true,
    areaShare: (pageBox.w * pageBox.h) / (VP.width * VP.height),
    box: pageBox,
    pageBox,
    normalizedBox: {
      x: pageBox.x / VP.width,
      y: pageBox.y / VP.height,
      w: pageBox.w / VP.width,
      h: pageBox.h / VP.height,
    },
    midiaTags: [],
    listeners: [],
    cursor: 'auto',
    observadoPorIntersection: false,
    temShadow: false,
    stacking: stacking(),
    pseudo: [],
    animationName: 'none',
    animationDuration: '0s',
    transitionProperty: 'all',
    transitionDuration: '0s',
    ...resto,
  };
};

/**
 * A página que o V1 erra: hero sem embrulho semântico, fundo absoluto, canvas de
 * shader, véu de leitura, título por cima — e um modal `fixed` que no DOM mora no
 * fim do `<body>`, longe da seção que ele cobre.
 */
const paginaDeTeste = (): RawColeta => {
  seq = 0;
  const hero = no({
    ref: 0,
    tag: 'section',
    id: 'hero',
    papel: 'section',
    camada: 'content',
    pageBox: { x: 0, y: 0, w: 1440, h: 900 },
    subtreeTextLength: 60,
  });
  const heroBg = no({
    ref: 1,
    parentRef: 0,
    classes: ['bg'],
    papel: 'decoration',
    camada: 'background',
    stacking: stacking({ position: 'absolute', createsContext: true, zIndex: '0' }),
    pageBox: { x: 0, y: 0, w: 1440, h: 900 },
  });
  const heroCanvas = no({
    ref: 2,
    parentRef: 0,
    tag: 'canvas',
    papel: 'canvas',
    camada: 'background',
    stacking: stacking({ position: 'absolute', zIndex: '1', createsContext: true }),
    pageBox: { x: 0, y: 0, w: 1440, h: 900 },
    midiaTags: ['canvas'],
  });
  const heroVeu = no({
    ref: 3,
    parentRef: 0,
    classes: ['overlay'],
    papel: 'decoration',
    camada: 'overlay',
    stacking: stacking({ position: 'absolute', zIndex: '5', createsContext: true }),
    pageBox: { x: 0, y: 0, w: 1440, h: 900 },
  });
  const h1 = no({
    ref: 4,
    parentRef: 0,
    tag: 'h1',
    papel: 'heading',
    camada: 'content',
    ownText: 'Construa mais rápido',
    text: 'Construa mais rápido',
    subtreeTextLength: 20,
    stacking: stacking({ position: 'relative', zIndex: '10' }),
    pageBox: { x: 120, y: 380, w: 700, h: 120 },
  });
  const features = no({
    ref: 5,
    tag: 'section',
    id: 'features',
    papel: 'section',
    camada: 'content',
    pageBox: { x: 0, y: 900, w: 1440, h: 900 },
    subtreeTextLength: 400,
  });
  // Wrapper irmão cujo conteúdo cai visualmente sobre `features` — o caso em que
  // o DOM não explica a posse.
  const wrapper = no({
    ref: 6,
    papel: 'unknown',
    camada: 'content',
    pageBox: { x: 0, y: 0, w: 1440, h: 1800 },
  });
  const fundoDeFeatures = no({
    ref: 7,
    parentRef: 6,
    classes: ['mesh'],
    papel: 'decoration',
    camada: 'background',
    stacking: stacking({ position: 'absolute', zIndex: '0', createsContext: true }),
    pageBox: { x: 0, y: 950, w: 1440, h: 800 },
  });
  const modal = no({
    ref: 8,
    tag: 'div',
    classes: ['modal'],
    papel: 'unknown',
    camada: 'fixed',
    stacking: stacking({ position: 'fixed', zIndex: '999', createsContext: true }),
    pageBox: { x: 200, y: 100, w: 1040, h: 700 },
    subtreeTextLength: 80,
  });

  const nos = [hero, heroBg, heroCanvas, heroVeu, h1, features, wrapper, fundoDeFeatures, modal];

  const backgrounds: RawBackground[] = [
    {
      ref: 1,
      source: 'css-image',
      cssValue: 'url("https://site.test/hero.jpg")',
      assetUrls: ['https://site.test/hero.jpg'],
      variables: {},
      declaraAnimacao: false,
      cobreSecao: true,
      camada: 'background',
      zIndex: '0',
    },
    {
      ref: 3,
      source: 'css-gradient',
      cssValue: 'linear-gradient(rgba(0,0,0,.7), rgba(0,0,0,.2))',
      assetUrls: [],
      variables: {},
      declaraAnimacao: false,
      cobreSecao: true,
      camada: 'overlay',
      zIndex: '5',
    },
    {
      ref: 2,
      source: 'canvas-element',
      cssValue: '',
      assetUrls: [],
      variables: {},
      declaraAnimacao: false,
      cobreSecao: true,
      camada: 'background',
      zIndex: '1',
    },
    {
      ref: 7,
      source: 'css-gradient',
      cssValue: 'conic-gradient(var(--brand), transparent)',
      assetUrls: [],
      variables: { '--brand': '#7c3aed' },
      declaraAnimacao: true,
      cobreSecao: true,
      camada: 'background',
      zIndex: '0',
    },
  ];

  const midias: RawMedia[] = [
    {
      ref: 2,
      tag: 'canvas',
      kind: 'webgl',
      asBackground: true,
      contextoDetectado: 'webgl',
      intrinsic: { width: 1440, height: 900 },
    },
  ];

  return {
    nos,
    backgrounds,
    midias,
    viewport: VP,
    scroll: { x: 0, y: 0 },
    pageHeight: 1800,
    truncado: false,
  };
};

// ── Geometria ───────────────────────────────────────────────────────────────

test('interseção e contenção medem o que dizem medir', () => {
  const a = { x: 0, y: 0, w: 100, h: 100 };
  const b = { x: 50, y: 50, w: 100, h: 100 };
  assert.equal(intersecao(a, b), 2500);
  assert.equal(contido(a, b), 0.25);
  assert.equal(contido(a, { x: 0, y: 0, w: 200, h: 200 }), 1);
  assert.equal(intersecao(a, { x: 200, y: 200, w: 10, h: 10 }), 0);
  assert.equal(contido({ x: 0, y: 0, w: 0, h: 0 }, a), 0, 'caixa vazia não divide por zero');
});

// ── Mapa estrutural ─────────────────────────────────────────────────────────

test('o mapa inclui o que NÃO tem texto — a exclusão que cegava o V1', () => {
  const { nos } = construirMapaEstrutural(paginaDeTeste());
  const papeis = nos.map((n) => n.role);
  assert.ok(papeis.includes('canvas'), 'o canvas precisa estar no mapa');
  assert.equal(nos.length, 9, 'nenhum nó da composição deve ser descartado');
  const semTexto = nos.filter((n) => n.subtreeTextLength === 0);
  assert.ok(semTexto.length >= 4, 'camadas sem texto continuam no mapa');
});

test('a seção que contém o <h1> é promovida a hero', () => {
  const { nos, porRef } = construirMapaEstrutural(paginaDeTeste());
  assert.equal(porRef.get(0)?.role, 'hero');
  assert.equal(porRef.get(5)?.role, 'section', 'a segunda seção não é hero');
  assert.equal(nos.filter((n) => n.role === 'hero').length, 1);
});

test('o pai é referenciado por hash estável, não por índice de sessão', () => {
  const { porRef } = construirMapaEstrutural(paginaDeTeste());
  const hero = porRef.get(0);
  const bg = porRef.get(1);
  assert.ok(hero && bg);
  assert.equal(bg.parent, hero.fingerprint.hash);
  assert.equal(hero.parent, null);
});

// ── Posse ───────────────────────────────────────────────────────────────────

test('seções candidatas saem ordenadas da menor para a maior', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const secoes = secoesCandidatas(coleta, porRef);
  const areas = secoes.map((s) => s.pageBox.w * s.pageBox.h);
  assert.deepEqual(
    [...areas].sort((a, b) => a - b),
    areas,
  );
  assert.equal(secoes.length, 2, 'só hero e features são seções');
});

test('fundo e véu do hero pertencem ao hero, com confiança alta', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const camadas = construirCamadas(coleta, porRef);
  const heroHash = porRef.get(0)?.fingerprint.hash;
  const bgHash = porRef.get(1)?.fingerprint.hash;
  const veuHash = porRef.get(3)?.fingerprint.hash;

  const bg = camadas.find((c) => c.fingerprint.hash === bgHash);
  const veu = camadas.find((c) => c.fingerprint.hash === veuHash);
  assert.equal(bg?.ownerSection, heroHash);
  assert.equal(bg?.ownerConfidence, 'alta');
  assert.ok(bg?.ownerEvidence.some((e) => /ancestral no DOM/.test(e)));
  assert.ok(bg?.ownerEvidence.some((e) => /contenção geométrica 100%/.test(e)));
  assert.equal(veu?.ownerSection, heroHash);
});

test('o canvas de fundo do hero fica NO hero — não vira item preto avulso', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const camadas = construirCamadas(coleta, porRef);
  const canvas = camadas.find((c) => c.fingerprint.hash === porRef.get(2)?.fingerprint.hash);
  assert.equal(canvas?.ownerSection, porRef.get(0)?.fingerprint.hash);
  assert.equal(canvas?.role, 'background');
});

test('fundo cujo pai no DOM não explica a posse é resolvido pela geometria', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const camadas = construirCamadas(coleta, porRef);
  const fundo = camadas.find((c) => c.fingerprint.hash === porRef.get(7)?.fingerprint.hash);
  // O pai é o wrapper (não é seção); visualmente está sobre `features`.
  assert.equal(fundo?.ownerSection, porRef.get(5)?.fingerprint.hash);
  assert.equal(fundo?.ownerConfidence, 'media');
  assert.ok(fundo?.ownerEvidence.some((e) => /contenção geométrica/.test(e)));
});

test('camada fixa não finge pertencer a uma seção: confiança baixa e evidência explícita', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const camadas = construirCamadas(coleta, porRef);
  const modal = camadas.find((c) => c.fingerprint.hash === porRef.get(8)?.fingerprint.hash);
  assert.equal(modal?.ownerConfidence, 'baixa');
  assert.ok(
    modal?.ownerEvidence.some((e) => /camada fixa/.test(e)),
    `evidência: ${modal?.ownerEvidence.join(' | ')}`,
  );
});

test('a ordem de pintura respeita z-index e desempata pelo documento', () => {
  const semZ = ordemDePintura(no({ pageBox: { x: 0, y: 0, w: 1, h: 1 } }), 5);
  const comZ = ordemDePintura(
    no({
      pageBox: { x: 0, y: 0, w: 1, h: 1 },
      stacking: stacking({ zIndex: '10', position: 'absolute' }),
    }),
    0,
  );
  assert.ok(comZ > semZ, 'z-index maior pinta na frente');
  const a = ordemDePintura(no({ pageBox: { x: 0, y: 0, w: 1, h: 1 } }), 1);
  const b = ordemDePintura(no({ pageBox: { x: 0, y: 0, w: 1, h: 1 } }), 2);
  assert.ok(b > a, 'empate no z-index vai para a ordem no documento');
});

test('quem cobre quem: o véu cobre o fundo, o título cobre o véu', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const camadas = construirCamadas(coleta, porRef);
  const h = (ref: number): string => porRef.get(ref)?.fingerprint.hash ?? '';
  const veu = camadas.find((c) => c.fingerprint.hash === h(3));
  const fundo = camadas.find((c) => c.fingerprint.hash === h(1));
  assert.ok(veu?.covers.includes(h(1)), 'o véu (z=5) deve cobrir o fundo (z=0)');
  assert.ok(fundo?.coveredBy.includes(h(3)));
  const titulo = camadas.find((c) => c.fingerprint.hash === h(4));
  assert.ok(titulo?.covers.includes(h(3)), 'o título (z=10) deve cobrir o véu (z=5)');
});

test('fundo que cobre a seção e tem conteúdo por cima é marcado inseparável', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const camadas = construirCamadas(coleta, porRef);
  const fundo = camadas.find((c) => c.fingerprint.hash === porRef.get(1)?.fingerprint.hash);
  assert.equal(fundo?.inseparable, true, 'o fundo do hero é parte da experiência do hero');
});

// ── Backgrounds ─────────────────────────────────────────────────────────────

test('backgrounds viram entidades explícitas com dono e assets', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const camadas = construirCamadas(coleta, porRef);
  const bgs = construirBackgrounds(coleta, porRef, camadas);
  assert.equal(bgs.length, 4);
  const imagem = bgs.find((b) => b.source === 'css-image');
  assert.equal(imagem?.ownerSection, porRef.get(0)?.fingerprint.hash);
  assert.deepEqual(imagem?.assetUrls, ['https://site.test/hero.jpg']);
  const canvas = bgs.find((b) => b.source === 'canvas-element');
  assert.ok(canvas, 'canvas de fundo é uma entidade de background');
});

test('`animated` NÃO sai do CSS: declarar animation não prova movimento', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const bgs = construirBackgrounds(coleta, porRef, construirCamadas(coleta, porRef));
  const conico = bgs.find((b) => b.cssValue.includes('conic-gradient'));
  assert.equal(conico?.animated, false, 'só a observação temporal decide isso');
  assert.ok(
    conico?.animationEvidence.some((e) => /CSS declara animation/.test(e)),
    'a declaração fica registrada como indício',
  );
});

test('variável CSS usada no fundo é resolvida e preservada', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const bgs = construirBackgrounds(coleta, porRef, construirCamadas(coleta, porRef));
  const conico = bgs.find((b) => b.cssValue.includes('conic-gradient'));
  assert.equal(conico?.variables['--brand'], '#7c3aed');
});

test('cor sólida que não cobre área não é promovida a background', () => {
  const coleta = paginaDeTeste();
  coleta.backgrounds.push({
    ref: 4,
    source: 'css-color',
    cssValue: 'rgb(124, 58, 237)',
    assetUrls: [],
    variables: {},
    declaraAnimacao: false,
    cobreSecao: false,
    camada: 'content',
    zIndex: 'auto',
  });
  const { porRef } = construirMapaEstrutural(coleta);
  const bgs = construirBackgrounds(coleta, porRef, construirCamadas(coleta, porRef));
  assert.ok(!bgs.some((b) => b.source === 'css-color'), 'a cor de um botão não é um fundo');
});

// ── Mídia ───────────────────────────────────────────────────────────────────

test('canvas com contexto WebGL observado é registrado como webgl', () => {
  const coleta = paginaDeTeste();
  const { porRef } = construirMapaEstrutural(coleta);
  const midias = construirMidias(coleta, porRef, construirCamadas(coleta, porRef));
  assert.equal(midias[0]?.kind, 'webgl');
  assert.equal(midias[0]?.asBackground, true);
  assert.equal(midias[0]?.animated, false, 'movimento é medido, não presumido');
});

test('canvas sem contexto observado declara a limitação em vez de calar', () => {
  const coleta = paginaDeTeste();
  coleta.midias = [{ ref: 2, tag: 'canvas', kind: 'canvas-2d', asBackground: true }];
  const { porRef } = construirMapaEstrutural(coleta);
  const midias = construirMidias(coleta, porRef, construirCamadas(coleta, porRef));
  assert.ok(
    midias[0]?.limitations.some((l) => /sem contexto observado/.test(l)),
    `limitações: ${midias[0]?.limitations.join(' | ')}`,
  );
});

test('iframe cross-origin declara a limitação de origem', () => {
  const coleta = paginaDeTeste();
  coleta.nos.push(
    no({ ref: 20, tag: 'iframe', papel: 'iframe', pageBox: { x: 0, y: 1000, w: 600, h: 400 } }),
  );
  coleta.midias = [
    {
      ref: 20,
      tag: 'iframe',
      kind: 'iframe',
      asBackground: false,
      mesmaOrigem: false,
      src: 'https://x.test/e',
    },
  ];
  const { porRef } = construirMapaEstrutural(coleta);
  const midias = construirMidias(coleta, porRef, construirCamadas(coleta, porRef));
  assert.ok(midias[0]?.limitations.some((l) => /outra origem/.test(l)));
});

test('webp/avif por extensão não afirmam animação', () => {
  const coleta = paginaDeTeste();
  coleta.nos.push(
    no({ ref: 21, tag: 'img', papel: 'image', pageBox: { x: 0, y: 1000, w: 300, h: 200 } }),
  );
  coleta.midias = [
    {
      ref: 21,
      tag: 'img',
      kind: 'webp-animado',
      asBackground: false,
      formatoPorExtensao: 'webp',
      src: 'https://x.test/a.webp',
    },
  ];
  const { porRef } = construirMapaEstrutural(coleta);
  const midias = construirMidias(coleta, porRef, construirCamadas(coleta, porRef));
  assert.equal(midias[0]?.animated, false);
  assert.ok(midias[0]?.limitations.some((l) => /pode ser estático ou animado/.test(l)));
});

// ── Runtimes ────────────────────────────────────────────────────────────────

const inst = (over: Partial<RawInstrumentacao> = {}): RawInstrumentacao => ({
  listenersPorTipo: {},
  observers: { intersection: 0, mutation: 0, resize: 0 },
  animationApis: [],
  graphicsContexts: {},
  shadowRoots: { open: 0, closed: 0 },
  shadowFechados: 0,
  dynamicInserts: {},
  midiaDinamicaCount: 0,
  historyChanges: 0,
  rafCount: 0,
  rafOrigens: [],
  animacoesCss: {},
  transicoes: {},
  bloqueados: [],
  falhas: [],
  runtimes: [],
  scripts: [],
  ...over,
});

test('global exposto no window é evidência forte; nome de arquivo é indício', () => {
  const rts = construirRuntimes(
    inst({
      runtimes: [
        {
          kind: 'three',
          label: 'THREE',
          evidence: ['global window.THREE'],
          scripts: [],
          version: '160',
        },
        {
          kind: 'gsap',
          label: 'gsap',
          evidence: ['script src https://cdn/gsap.min.js'],
          scripts: [],
          version: '',
        },
      ],
    }),
  );
  const three = rts.find((r) => r.kind === 'three');
  const gsap = rts.find((r) => r.kind === 'gsap');
  assert.equal(three?.confidence, 'alta');
  assert.equal(three?.version, '160');
  assert.equal(three?.encapsulable, true);
  assert.equal(gsap?.confidence, 'baixa');
  assert.equal(gsap?.encapsulable, false, 'indício não autoriza encapsular');
  assert.ok(gsap?.limitations.some((l) => /nome do arquivo/.test(l)));
});

test('runtime sem evidência não entra — não inventamos tecnologia', () => {
  const rts = construirRuntimes(
    inst({ runtimes: [{ kind: 'three', label: 'THREE', evidence: [], scripts: [], version: '' }] }),
  );
  assert.equal(rts.length, 0);
});

test('loop de rAF sem biblioteca identificada é registrado como limitação honesta', () => {
  const rts = construirRuntimes(
    inst({ rafCount: 240, rafOrigens: [{ url: 'https://site.test/app.js', chamadas: 200 }] }),
  );
  assert.equal(rts.length, 1);
  assert.equal(rts[0]?.kind, 'desconhecido');
  assert.equal(rts[0]?.encapsulable, false);
  assert.ok(rts[0]?.evidence.some((e) => /requestAnimationFrame/.test(e)));
});

test('o limiar de contenção é o contrato — mudar aqui muda a posse', () => {
  assert.ok(LIMIAR_CONTENCAO > 0.5 && LIMIAR_CONTENCAO < 1);
});
