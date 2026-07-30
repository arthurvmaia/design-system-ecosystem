import assert from 'node:assert/strict';
import { test } from 'node:test';
import type {
  BackgroundDetection,
  MediaDetection,
  RuntimeDetection,
  StructuralNode,
  TemporalObservation,
  VisualLayer,
} from '@ds/shared';
import { montarFingerprint } from '../identity/fingerprint.js';
import { classificarRepresentacao } from './representation.js';
import {
  type EntradaSegmentacao,
  camadasQuePassamAtras,
  contarIcones,
  contarSinais,
  escolherSecoes,
  inferirCategoria,
  limitacoesDe,
  segmentarPorEvidencia,
  validarSegmentoV2,
} from './segment-v2.js';

const VP = { width: 1440, height: 900 };

const fp = (over: {
  tag?: string;
  id?: string | null;
  classes?: string[];
  text?: string;
  siblingIndex?: number;
}) =>
  montarFingerprint({
    tag: over.tag ?? 'div',
    role: null,
    aria: {},
    dataAttrs: {},
    text: over.text ?? '',
    classes: over.classes ?? [],
    id: over.id ?? null,
    semanticAncestor: null,
    siblingIndex: over.siblingIndex ?? 0,
    structuralSignature: '',
    listeners: [],
  });

const node = (
  over: Partial<StructuralNode> & { fingerprint: StructuralNode['fingerprint'] },
): StructuralNode => ({
  role: 'section',
  realm: 'document',
  parent: null,
  depth: 0,
  pageBox: { x: 0, y: 0, w: 1440, h: 900 },
  areaShare: 1,
  ownText: '',
  subtreeTextLength: 0,
  mediaTags: [],
  visible: true,
  ...over,
});

const camada = (
  over: Partial<VisualLayer> & { fingerprint: VisualLayer['fingerprint'] },
): VisualLayer => ({
  role: 'content',
  ownerSection: null,
  ownerEvidence: [],
  ownerConfidence: 'alta',
  stacking: {
    zIndex: 'auto',
    createsContext: false,
    contextOwner: null,
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
  },
  paintOrder: 0,
  coveredBy: [],
  covers: [],
  pseudo: [],
  inseparable: false,
  ...over,
});

const entradaVazia = (over: Partial<EntradaSegmentacao> = {}): EntradaSegmentacao => ({
  structuralMap: [],
  visualLayers: [],
  backgroundDetections: [],
  mediaDetections: [],
  runtimeDetections: [],
  temporalObservations: [],
  pointerResponses: [],
  scrollObservations: [],
  safeActions: [],
  htmlPorHash: new Map(),
  framePorHash: new Map(),
  assetsLocais: new Set(),
  scriptsNaoLocalizados: 0,
  cssExternoFaltando: false,
  animacoesCssQueRodaram: [],
  shadowFechados: 0,
  viewport: VP,
  pageHeight: 3600,
  ...over,
});

// ── Escolha de seções ───────────────────────────────────────────────────────

test('embrulho sem conteúdo próprio é descartado; as seções de dentro ficam', () => {
  const main = fp({ tag: 'main' });
  const a = fp({ tag: 'section', id: 'a' });
  const b = fp({ tag: 'section', id: 'b' });
  const secoes = escolherSecoes([
    node({ fingerprint: main, role: 'main', subtreeTextLength: 800, areaShare: 2 }),
    node({
      fingerprint: a,
      role: 'section',
      parent: main.hash,
      subtreeTextLength: 400,
      pageBox: { x: 0, y: 0, w: 1440, h: 900 },
    }),
    node({
      fingerprint: b,
      role: 'section',
      parent: main.hash,
      subtreeTextLength: 400,
      pageBox: { x: 0, y: 900, w: 1440, h: 900 },
    }),
  ]);
  assert.deepEqual(
    secoes.map((s) => s.hash),
    [a.hash, b.hash],
    'o <main> só embrulha — não é um segmento',
  );
});

test('faixa de tela sem tag semântica conta como seção (o caso do site moderno)', () => {
  const divSecao = fp({ tag: 'div', classes: ['py-24'] });
  const secoes = escolherSecoes([
    node({
      fingerprint: divSecao,
      // O papel `section` vem do coletor por geometria, não da tag.
      role: 'section',
      subtreeTextLength: 300,
      areaShare: 0.9,
    }),
  ]);
  assert.equal(secoes.length, 1);
});

test('landmark pequeno (nav de 60px) não é descartado por área', () => {
  const nav = fp({ tag: 'nav' });
  const secoes = escolherSecoes([
    node({
      fingerprint: nav,
      role: 'nav',
      areaShare: 0.04,
      pageBox: { x: 0, y: 0, w: 1440, h: 60 },
      subtreeTextLength: 40,
    }),
  ]);
  assert.equal(secoes.length, 1, 'uma barra de navegação é componente legítimo');
});

test('as seções saem na ordem da página', () => {
  const a = fp({ tag: 'section', id: 'baixo' });
  const b = fp({ tag: 'section', id: 'topo' });
  const secoes = escolherSecoes([
    node({ fingerprint: a, pageBox: { x: 0, y: 2000, w: 1440, h: 900 }, subtreeTextLength: 100 }),
    node({ fingerprint: b, pageBox: { x: 0, y: 0, w: 1440, h: 900 }, subtreeTextLength: 100 }),
  ]);
  assert.deepEqual(
    secoes.map((s) => s.hash),
    [b.hash, a.hash],
  );
});

// ── Sinais de conteúdo ──────────────────────────────────────────────────────

test('contarSinais lê o conteúdo, ignorando script e style', () => {
  const s = contarSinais(
    '<section><style>.x{color:red}</style><script>var a=1</script><h2>Planos</h2><ul><li>R$ 29/mês</li><li>R$ 99/mês</li></ul><button>Assinar</button><input name="e"></section>',
  );
  assert.ok(!s.texto.includes('color:red'), 'CSS não é texto de conteúdo');
  assert.ok(!s.texto.includes('var a=1'), 'JS não é texto de conteúdo');
  assert.equal(s.titulos, 1);
  assert.equal(s.itensRepetidos, 2);
  assert.equal(s.acoes, 1);
  assert.equal(s.campos, 1);
  assert.ok(s.precos >= 2);
});

test('irmãos com a mesma classe são contados como itens repetidos (grid de cards)', () => {
  const html = `<div>${'<div class="card rounded-xl p-6">x</div>'.repeat(4)}</div>`;
  assert.equal(contarSinais(html).itensRepetidos, 4);
});

// ── Categoria por evidência ─────────────────────────────────────────────────

test('categoria sai do conteúdo antes do vocabulário', () => {
  const n = node({ fingerprint: fp({ tag: 'div', id: 'section-3' }) });
  const pricing = inferirCategoria(
    n,
    { ...contarSinais(''), precos: 3, itensRepetidos: 3 },
    [],
    false,
  );
  assert.equal(pricing.categoria, 'pricing');
  assert.ok(pricing.evidencia.includes('preços'));

  const faq = inferirCategoria(n, { ...contarSinais(''), perguntas: 5 }, [], false);
  assert.equal(faq.categoria, 'faq');
});

test('vocabulário de id/classe é o ÚLTIMO recurso, não o primeiro', () => {
  const n = node({ fingerprint: fp({ tag: 'div', id: 'testimonials' }) });
  const r = inferirCategoria(n, contarSinais(''), [], false);
  assert.equal(r.categoria, 'testimonial');
  assert.ok(r.evidencia.startsWith('vocabulário'));
});

test('papel semântico vence tudo', () => {
  const n = node({ fingerprint: fp({ tag: 'footer', id: 'pricing' }), role: 'footer' });
  assert.equal(inferirCategoria(n, contarSinais(''), [], false).categoria, 'footer');
});

// ── Validação: o antídoto do card preto ─────────────────────────────────────

test('canvas sem nada desenhado é REPROVADO, com o motivo escrito', () => {
  const v = validarSegmentoV2({
    texto: '',
    sinais: contarSinais(''),
    midias: [
      {
        id: 'md_1',
        kind: 'webgl',
        fingerprint: fp({ tag: 'canvas' }),
        ownerSection: null,
        sources: [],
        asBackground: true,
        appearance: 'inicial',
        animated: false,
        pointerReactive: false,
        scrollReactive: false,
        confidence: 'baixa',
        limitations: [],
      } satisfies MediaDetection,
    ],
    backgrounds: [],
    temMovimento: false,
    temRuntime: false,
    representacao: classificarRepresentacao({
      runtimes: [],
      midias: ['webgl'],
      assetsLocais: true,
      assetsExternos: 0,
      scriptsNaoLocalizados: 0,
      iframeCrossOrigin: false,
      shadowFechado: false,
      estadosCapturados: 0,
      movimentoMedido: false,
      movimentoPorCss: false,
      reageAoPonteiro: false,
      regiaoReativaSemDom: false,
      dependeDeJs: true,
      bootstrapIdentificado: false,
    }),
    temFrameDeFallback: true,
    areaShare: 1,
  });
  assert.equal(v.ok, false);
  assert.ok(
    v.motivos.some((m) => /Canvas sem nada desenhado/.test(m)),
    `motivos: ${v.motivos.join(' | ')}`,
  );
});

test('canvas com movimento mas SEM conteúdo é efeito, não componente — reprovado; com conteúdo real, aprovado', () => {
  const base = {
    texto: '',
    sinais: contarSinais(''),
    midias: [
      {
        id: 'md_1',
        kind: 'webgl' as const,
        fingerprint: fp({ tag: 'canvas' }),
        ownerSection: null,
        sources: [],
        asBackground: true,
        appearance: 'inicial' as const,
        animated: true,
        pointerReactive: true,
        scrollReactive: false,
        confidence: 'alta' as const,
        limitations: [],
      },
    ],
    backgrounds: [],
    representacao: classificarRepresentacao({
      runtimes: ['three'],
      midias: ['webgl'],
      assetsLocais: true,
      assetsExternos: 0,
      scriptsNaoLocalizados: 0,
      iframeCrossOrigin: false,
      shadowFechado: false,
      estadosCapturados: 0,
      movimentoMedido: true,
      movimentoPorCss: false,
      reageAoPonteiro: true,
      regiaoReativaSemDom: true,
      dependeDeJs: true,
      bootstrapIdentificado: true,
    }),
    temFrameDeFallback: true,
    areaShare: 1,
  };
  // Sozinho, o canvas animado é EFEITO — a Biblioteca não recebe orbe/cena solta.
  const soEfeito = validarSegmentoV2({ ...base, temMovimento: true, temRuntime: true });
  assert.equal(soEfeito.ok, false);
  assert.ok(
    soEfeito.motivos.some((m) => /Efeito visual sem conteúdo próprio/.test(m)),
    `motivos: ${soEfeito.motivos.join(' | ')}`,
  );

  // O MESMO canvas dentro de um hero com título e chamada é aprovado — o
  // componente é o hero, e o efeito viaja como dependência visual dele.
  const heroComCanvas = validarSegmentoV2({
    ...base,
    texto: 'Construa mundos em tempo real',
    sinais: contarSinais(
      '<h1>Construa mundos em tempo real</h1><a href="#">Começar agora</a><canvas></canvas>',
    ),
    temMovimento: true,
    temRuntime: true,
  });
  assert.equal(heroComCanvas.ok, true, heroComCanvas.motivos.join(' | '));
});

test('referência visual sem frame de fallback é reprovada — melhor não mostrar que mostrar vazio', () => {
  const repr = classificarRepresentacao({
    runtimes: [],
    midias: [],
    assetsLocais: true,
    assetsExternos: 0,
    scriptsNaoLocalizados: 0,
    iframeCrossOrigin: true,
    shadowFechado: false,
    estadosCapturados: 0,
    movimentoMedido: false,
    movimentoPorCss: false,
    reageAoPonteiro: false,
    regiaoReativaSemDom: false,
    dependeDeJs: false,
    bootstrapIdentificado: false,
  });
  const v = validarSegmentoV2({
    texto: 'algum texto aqui',
    sinais: contarSinais('<p>algum texto aqui</p>'),
    midias: [],
    backgrounds: [],
    temMovimento: false,
    temRuntime: false,
    representacao: repr,
    temFrameDeFallback: false,
    areaShare: 1,
  });
  assert.equal(v.ok, false);
  assert.ok(v.motivos.some((m) => /sem frame de fallback/.test(m)));
});

test('fundo/gradiente sem conteúdo é DECORAÇÃO — reprovado; faixa de logos (imagens sem texto) é aprovada', () => {
  const reprEstatica = classificarRepresentacao({
    runtimes: [],
    midias: [],
    assetsLocais: true,
    assetsExternos: 0,
    scriptsNaoLocalizados: 0,
    iframeCrossOrigin: false,
    shadowFechado: false,
    estadosCapturados: 0,
    movimentoMedido: false,
    movimentoPorCss: false,
    reageAoPonteiro: false,
    regiaoReativaSemDom: false,
    dependeDeJs: false,
    bootstrapIdentificado: false,
  });
  const base = {
    texto: '',
    sinais: contarSinais(''),
    midias: [],
    temMovimento: false,
    temRuntime: false,
    representacao: reprEstatica,
    temFrameDeFallback: true,
    areaShare: 1,
  };
  const fundo = (cssValue: string, animated = false): BackgroundDetection => ({
    id: 'bg_1',
    source: 'css-image',
    fingerprint: fp({ tag: 'div' }),
    ownerSection: null,
    cssValue,
    variables: {},
    assetUrls: /url\(/.test(cssValue) ? ['https://x.test/a.jpg'] : [],
    animated,
    animationEvidence: [],
    coversSection: true,
    confidence: 'alta',
    limitations: [],
  });

  // Fundo com imagem, gradiente animado, orbe: nada disso vira card sozinho.
  for (const bg of [
    fundo('url("https://x.test/a.jpg")'),
    fundo('linear-gradient(90deg, #f00, #00f)', true),
  ]) {
    const v = validarSegmentoV2({ ...base, backgrounds: [bg] });
    assert.equal(v.ok, false, `deveria reprovar: ${bg.cssValue}`);
    assert.ok(
      v.motivos.some((m) => /Efeito visual sem conteúdo próprio/.test(m)),
      `motivos: ${v.motivos.join(' | ')}`,
    );
  }

  // Mas uma faixa de logos — imagens de conteúdo, sem uma palavra — é seção real.
  const logos = validarSegmentoV2({
    ...base,
    sinais: contarSinais('<img src="a.svg"><img src="b.svg"><img src="c.svg">'),
    midias: [
      {
        id: 'md_1',
        kind: 'imagem',
        fingerprint: fp({ tag: 'img' }),
        ownerSection: null,
        src: 'https://x.test/logo.svg',
        sources: [],
        asBackground: false,
        appearance: 'inicial',
        animated: false,
        pointerReactive: false,
        scrollReactive: false,
        confidence: 'alta',
        limitations: [],
        intrinsic: { width: 120, height: 40 },
      } satisfies MediaDetection,
    ],
    backgrounds: [],
  });
  assert.equal(logos.ok, true, logos.motivos.join(' | '));
});

// ── Pipeline completo ───────────────────────────────────────────────────────

/** Um hero com fundo WebGL animado que reage ao cursor — o caso que o V1 erra. */
const cenarioHeroWebgl = (): EntradaSegmentacao => {
  const heroFp = fp({ tag: 'section', id: 'hero', text: 'Construa mais rápido' });
  const canvasFp = fp({ tag: 'canvas', classes: ['scene'] });
  const tituloFp = fp({ tag: 'h1', text: 'Construa mais rápido' });

  const structuralMap: StructuralNode[] = [
    node({
      fingerprint: heroFp,
      role: 'hero',
      subtreeTextLength: 80,
      areaShare: 1,
      pageBox: { x: 0, y: 0, w: 1440, h: 900 },
    }),
    node({
      fingerprint: canvasFp,
      role: 'canvas',
      parent: heroFp.hash,
      areaShare: 1,
      pageBox: { x: 0, y: 0, w: 1440, h: 900 },
      mediaTags: ['canvas'],
    }),
    node({
      fingerprint: tituloFp,
      role: 'heading',
      parent: heroFp.hash,
      areaShare: 0.1,
      ownText: 'Construa mais rápido',
      subtreeTextLength: 20,
      pageBox: { x: 120, y: 380, w: 700, h: 120 },
    }),
  ];

  const visualLayers: VisualLayer[] = [
    camada({ fingerprint: heroFp, role: 'content', ownerSection: heroFp.hash }),
    camada({
      fingerprint: canvasFp,
      role: 'background',
      ownerSection: heroFp.hash,
      inseparable: true,
      normalizedBox: { x: 0, y: 0, w: 1, h: 1 },
    }),
    camada({ fingerprint: tituloFp, role: 'content', ownerSection: heroFp.hash }),
  ];

  const runtime: RuntimeDetection = {
    id: 'rt_1',
    kind: 'three',
    label: 'THREE',
    evidence: ['global window.THREE'],
    confidence: 'alta',
    scripts: ['https://x.test/three.min.js'],
    targets: [canvasFp.hash],
    assets: [],
    encapsulable: true,
    limitations: [],
  };

  const temporal: TemporalObservation = {
    id: 'tmp_1',
    target: canvasFp.hash,
    timestamps: [0, 250, 500],
    changes: ['pixels'],
    pixelDelta: 0.42,
    domStable: true,
    moving: true,
    attributedTo: 'pintura fora do DOM',
    frames: ['frames/hero-0ms.png'],
    dynamicRegions: [],
    confidence: 'alta',
  };

  return entradaVazia({
    structuralMap,
    visualLayers,
    runtimeDetections: [runtime],
    temporalObservations: [temporal],
    mediaDetections: [
      {
        id: 'md_1',
        kind: 'webgl',
        fingerprint: canvasFp,
        ownerSection: heroFp.hash,
        sources: [],
        asBackground: true,
        appearance: 'inicial',
        animated: true,
        pointerReactive: true,
        scrollReactive: false,
        confidence: 'alta',
        limitations: [],
      },
    ],
    pointerResponses: [
      {
        id: 'pr_1',
        pathId: 'p_hilbert',
        at: { x: 0.5, y: 0.5 },
        region: { x: 0, y: 0, w: 1, h: 1 },
        fingerprint: canvasFp,
        domless: true,
        reactions: ['pixels', 'canvas'],
        pixelDelta: 0.2,
        latencyMs: 90,
        requests: [],
        confidence: 'alta',
      },
    ],
    htmlPorHash: new Map([
      [
        heroFp.hash,
        '<section id="hero"><canvas class="scene"></canvas><h1>Construa mais rápido</h1><a href="#x">Começar</a></section>',
      ],
    ]),
    framePorHash: new Map([[heroFp.hash, 'frames/hero.png']]),
  });
};

test('hero com WebGL animado: um segmento, nome descritivo, cápsula de runtime', () => {
  const r = segmentarPorEvidencia(cenarioHeroWebgl());
  assert.equal(r.segmentos.length, 1);
  assert.equal(r.rejeitados.length, 0);
  const s = r.segmentos[0];
  assert.ok(s);
  assert.equal(s.category, 'hero');
  assert.equal(s.representation.type, 'capsula-runtime');
  assert.equal(s.kind, 'animation');
  assert.match(s.name, /WebGL/, `nome: ${s.name}`);
  assert.ok(!/^Se[çc][ãa]o/.test(s.name), 'o nome não pode sair genérico');
});

test('o fundo WebGL fica DENTRO do hero — não vira um item preto avulso', () => {
  const r = segmentarPorEvidencia(cenarioHeroWebgl());
  assert.equal(r.segmentos.length, 1, 'o canvas não gera um segmento próprio');
  const s = r.segmentos[0];
  assert.ok(s);
  assert.ok(s.evidence.mediaIds.includes('md_1'), 'a mídia pertence ao segmento do hero');
  assert.ok(s.evidence.runtimeIds.includes('rt_1'));
  assert.ok(s.htmlSnippet.includes('<canvas'), 'o canvas viaja com a seção');
  assert.ok(s.htmlSnippet.includes('<h1>'), 'e o título também');
});

test('a fidelidade é honesta: temporal preservado como runtime, validação ausente', () => {
  const r = segmentarPorEvidencia(cenarioHeroWebgl());
  const s = r.segmentos[0];
  assert.ok(s);
  assert.equal(s.fidelity.temporal, 'runtime-preservado');
  assert.equal(s.fidelity.runtime, 'runtime-preservado');
  assert.equal(s.fidelity.validation, 'ausente', 'nada nasce validado');
  assert.notEqual(s.support, 'completo', 'cápsula de runtime nunca é "completo"');
});

test('a evidência é auditável: cada sinal com peso e detalhe', () => {
  const r = segmentarPorEvidencia(cenarioHeroWebgl());
  const s = r.segmentos[0];
  assert.ok(s);
  const kinds = s.evidence.signals.map((x) => x.kind);
  assert.ok(kinds.includes('pixel-diff'), 'movimento medido precisa aparecer');
  assert.ok(kinds.includes('runtime'));
  assert.ok(kinds.includes('comportamento'), 'reação ao ponteiro precisa aparecer');
  assert.equal(s.evidence.confidence, 'alta');
  for (const sig of s.evidence.signals) {
    assert.ok(sig.weight > 0);
    assert.ok((sig.detail ?? '').length > 0, `sinal ${sig.kind} sem detalhe`);
  }
});

test('o MESMO hero sem movimento e sem runtime é reprovado como canvas vazio', () => {
  const base = cenarioHeroWebgl();
  const semVida = entradaVazia({
    ...base,
    runtimeDetections: [],
    temporalObservations: [],
    pointerResponses: [],
    // Sem texto na seção: só o canvas.
    htmlPorHash: new Map([
      [
        [...base.htmlPorHash.keys()][0] as string,
        '<section id="hero"><canvas class="scene"></canvas></section>',
      ],
    ]),
    mediaDetections: base.mediaDetections.map((m) => ({
      ...m,
      animated: false,
      pointerReactive: false,
    })),
  });
  const r = segmentarPorEvidencia(semVida);
  assert.equal(r.segmentos.length, 0);
  assert.equal(r.rejeitados.length, 1);
  assert.ok(
    r.rejeitados[0]?.motivos.some((m) => /Canvas sem nada desenhado/.test(m)),
    `motivos: ${r.rejeitados[0]?.motivos.join(' | ')}`,
  );
});

test('seção de texto puro: portátil, editável, sem limitação inventada', () => {
  const secaoFp = fp({ tag: 'section', id: 'features' });
  const r = segmentarPorEvidencia(
    entradaVazia({
      structuralMap: [
        node({
          fingerprint: secaoFp,
          role: 'section',
          subtreeTextLength: 300,
          areaShare: 0.8,
          pageBox: { x: 0, y: 900, w: 1440, h: 720 },
        }),
      ],
      visualLayers: [camada({ fingerprint: secaoFp, ownerSection: secaoFp.hash })],
      htmlPorHash: new Map([
        [
          secaoFp.hash,
          '<section id="features"><h2>Recursos</h2><div class="card p-6">Um</div><div class="card p-6">Dois</div><div class="card p-6">Três</div></section>',
        ],
      ]),
    }),
  );
  const s = r.segmentos[0];
  assert.ok(s);
  assert.equal(s.representation.type, 'componente-portatil');
  assert.equal(s.representation.editable, true);
  assert.equal(s.support, 'completo');
  assert.equal(s.fidelity.temporal, 'ausente', 'sem movimento medido, temporal é ausente');
  assert.deepEqual(s.limitations, []);
});

test('folha externa sem cópia local: css `parcial` e selo `parcial` mesmo no portátil', () => {
  const secaoFp = fp({ tag: 'section', id: 'features' });
  const entrada = (cssExternoFaltando: boolean) =>
    entradaVazia({
      cssExternoFaltando,
      structuralMap: [
        node({
          fingerprint: secaoFp,
          role: 'section',
          subtreeTextLength: 300,
          areaShare: 0.8,
          pageBox: { x: 0, y: 900, w: 1440, h: 720 },
        }),
      ],
      visualLayers: [camada({ fingerprint: secaoFp, ownerSection: secaoFp.hash })],
      htmlPorHash: new Map([
        [
          secaoFp.hash,
          '<section id="features"><h2>Recursos</h2><div class="card p-6">Um</div><div class="card p-6">Dois</div></section>',
        ],
      ]),
    });

  // Com todas as folhas localizadas, o portátil segue completo.
  const completo = segmentarPorEvidencia(entrada(false)).segmentos[0];
  assert.ok(completo);
  assert.equal(completo.fidelity.css, 'portatil');
  assert.equal(completo.support, 'completo');

  // Uma folha externa perdida: o CSS que viaja está incompleto — o selo diz.
  const parcial = segmentarPorEvidencia(entrada(true)).segmentos[0];
  assert.ok(parcial);
  assert.equal(parcial.representation.type, 'componente-portatil');
  assert.equal(parcial.fidelity.css, 'parcial');
  assert.equal(parcial.support, 'parcial', 'portátil sem parte dos estilos não é completo');
});

test('toda evidência que aprova também nomeia — aprovado não sai genérico', () => {
  // A MESMA evidência que aprova uma seção agora alimenta o nome. Aqui: seção
  // sem texto e sem título, aprovada pelas IMAGENS de conteúdo (fundo sozinho
  // não aprova mais) — o nome ainda usa o fundo distintivo ("imagem de fundo")
  // porque nenhuma evidência mais forte falou. A limitação "nome saiu genérico"
  // segue como rede de segurança, mas não deve disparar num aprovado.
  const secaoFp = fp({ tag: 'div' });
  const r = segmentarPorEvidencia(
    entradaVazia({
      structuralMap: [
        node({
          fingerprint: secaoFp,
          role: 'section',
          subtreeTextLength: 0,
          areaShare: 0.5,
        }),
      ],
      visualLayers: [camada({ fingerprint: secaoFp, ownerSection: secaoFp.hash })],
      backgroundDetections: [
        {
          id: 'bg_img',
          source: 'css-image',
          fingerprint: secaoFp,
          ownerSection: secaoFp.hash,
          cssValue: 'url("https://x.test/fundo.jpg")',
          variables: {},
          assetUrls: ['https://x.test/fundo.jpg'],
          animated: false,
          animationEvidence: [],
          coversSection: true,
          confidence: 'alta',
          limitations: [],
        },
      ],
      htmlPorHash: new Map([
        [
          secaoFp.hash,
          '<div><img src="https://x.test/l1.svg"><img src="https://x.test/l2.svg"></div>',
        ],
      ]),
    }),
  );
  const s = r.segmentos[0];
  assert.ok(s, `rejeitados: ${r.rejeitados.map((x) => x.motivos.join(';')).join(' | ')}`);
  assert.ok(/imagem de fundo/.test(s.name), `nome: ${s.name}`);
  assert.ok(
    !s.limitations.some((l) => /nome saiu genérico/.test(l)),
    `limitações: ${s.limitations.join(' | ')}`,
  );
});

test('bloco sem título usa o texto visível como nome — não fica "Bloco"', () => {
  const secaoFp = fp({ tag: 'div' });
  const r = segmentarPorEvidencia(
    entradaVazia({
      structuralMap: [
        node({
          fingerprint: secaoFp,
          role: 'section',
          subtreeTextLength: 60,
          areaShare: 0.5,
        }),
      ],
      visualLayers: [camada({ fingerprint: secaoFp, ownerSection: secaoFp.hash })],
      htmlPorHash: new Map([[secaoFp.hash, '<div>um pouco de texto solto aqui dentro</div>']]),
    }),
  );
  const s = r.segmentos[0];
  assert.ok(s);
  assert.ok(!/^bloco/i.test(s.name), `nome: ${s.name}`);
  assert.ok(s.name.includes('um pouco de texto'), `nome: ${s.name}`);
});

// ── Fidelidade do fundo ──────────────────────────────────────────────────────
//
// A condição antiga comparava a lista de assets do fundo com ela mesma (sempre
// verdadeira) e TODO fundo saía `capturado` — inclusive o que continuava
// buscando a imagem na origem. Os três testes fixam a regra de verdade: com
// cópia local é `capturado`, sem cópia é `detectado`, e gradiente (sem asset)
// não exige cópia nenhuma.

const entradaComFundo = (
  assetsLocais: ReadonlySet<string>,
  fundo: Partial<BackgroundDetection> = {},
): EntradaSegmentacao => {
  const secaoFp = fp({ tag: 'section', id: 'hero-fundo' });
  return entradaVazia({
    structuralMap: [
      node({
        fingerprint: secaoFp,
        role: 'section',
        subtreeTextLength: 300,
        areaShare: 0.8,
        pageBox: { x: 0, y: 0, w: 1440, h: 900 },
      }),
    ],
    visualLayers: [camada({ fingerprint: secaoFp, ownerSection: secaoFp.hash })],
    backgroundDetections: [
      {
        id: 'bg_hero',
        source: 'css-image',
        fingerprint: secaoFp,
        ownerSection: secaoFp.hash,
        cssValue: 'url("https://x.test/fundo.jpg")',
        variables: {},
        assetUrls: ['https://x.test/fundo.jpg'],
        animated: false,
        animationEvidence: [],
        coversSection: true,
        confidence: 'alta',
        limitations: [],
        ...fundo,
      },
    ],
    htmlPorHash: new Map([
      [
        secaoFp.hash,
        '<section id="hero-fundo"><h2>Planos</h2><div class="card">Um</div><div class="card">Dois</div></section>',
      ],
    ]),
    assetsLocais,
  });
};

test('fundo com imagem E cópia local sai `capturado`', () => {
  const r = segmentarPorEvidencia(entradaComFundo(new Set(['https://x.test/fundo.jpg'])));
  const s = r.segmentos[0];
  assert.ok(s, `rejeitados: ${r.rejeitados.map((x) => x.motivos.join(';')).join(' | ')}`);
  assert.equal(s.fidelity.background, 'capturado');
});

test('fundo com imagem SEM cópia local sai `detectado`, não `capturado`', () => {
  const r = segmentarPorEvidencia(entradaComFundo(new Set()));
  const s = r.segmentos[0];
  assert.ok(s);
  assert.equal(
    s.fidelity.background,
    'detectado',
    'a imagem segue na origem: `capturado` prometeria o que o bundle não leva',
  );
});

test('fundo sem asset (gradiente) não exige cópia: segue `capturado`', () => {
  const r = segmentarPorEvidencia(
    entradaComFundo(new Set(), {
      source: 'css-gradient',
      cssValue: 'linear-gradient(180deg, #000, #333)',
      assetUrls: [],
    }),
  );
  const s = r.segmentos[0];
  assert.ok(s);
  assert.equal(s.fidelity.background, 'capturado', 'gradiente viaja no CSS, sem arquivo');
});

// ── Camadas de fundo atrás da região ─────────────────────────────────────────
//
// O fundo de uma página (feixes de luz, blobs, grão) é IRMÃO do conteúdo, não
// filho: mora no `<body>` com `position:fixed`, atrás de tudo. A segmentação o
// emitia como item solto e nunca o recompunha atrás de ninguém — a seção que na
// origem tinha feixes saía com fundo morto, e nada explicava por quê, porque o
// CSS e o HTML dela estavam íntegros.

/** Uma camada com hash conhecido, para as asserções falarem do que importa. */
const camadaCom = (
  hash: string,
  over: { position?: string; pageBox?: { x: number; y: number; w: number; h: number } } = {},
): VisualLayer => {
  const base = camada({ fingerprint: fp({ tag: 'div' }) });
  return {
    ...base,
    fingerprint: { ...base.fingerprint, hash },
    stacking: { ...base.stacking, position: over.position ?? 'absolute' },
    pageBox: over.pageBox,
  };
};

const dobraEm = (y: number): StructuralNode =>
  node({ fingerprint: fp({ tag: 'section' }), pageBox: { x: 0, y, w: 1440, h: 800 } });

test('camada fixa passa atrás de QUALQUER dobra, mesmo a 3000px de distância', () => {
  // O caso comum, e o que um filtro por caixa perderia: uma camada fixa tem
  // pageBox no topo do documento, então toda dobra abaixo da primeira ficaria
  // sem fundo — justamente as que mais precisam dele.
  const atras = camadasQuePassamAtras({
    no: dobraEm(3000),
    camadas: { comRuntime: ['feixes'], soCss: [] },
    visualLayers: [
      camadaCom('feixes', { position: 'fixed', pageBox: { x: 0, y: 0, w: 1440, h: 900 } }),
    ],
    htmlPorHash: new Map([['feixes', '<canvas id="bg"></canvas>']]),
  });
  assert.deepEqual(atras, ['feixes']);
});

test('camada absoluta que não encosta na dobra fica de fora', () => {
  const atras = camadasQuePassamAtras({
    no: dobraEm(3000),
    camadas: { comRuntime: [], soCss: ['blob'] },
    visualLayers: [camadaCom('blob', { pageBox: { x: 0, y: 0, w: 1440, h: 900 } })],
    htmlPorHash: new Map([['blob', '<div class="blob"></div>']]),
  });
  assert.deepEqual(atras, [], 'levar um blob que fica 2km acima seria ruído, não fidelidade');
});

test('camada absoluta que intersecta a dobra entra', () => {
  const atras = camadasQuePassamAtras({
    no: dobraEm(800),
    camadas: { comRuntime: [], soCss: ['blob'] },
    visualLayers: [camadaCom('blob', { pageBox: { x: 0, y: 400, w: 1440, h: 900 } })],
    htmlPorHash: new Map([['blob', '<div class="blob"></div>']]),
  });
  assert.deepEqual(atras, ['blob']);
});

test('camada sem HTML capturado não entra: não há o que materializar', () => {
  const atras = camadasQuePassamAtras({
    no: dobraEm(0),
    camadas: { comRuntime: ['sem-html'], soCss: [] },
    visualLayers: [camadaCom('sem-html', { position: 'fixed' })],
    htmlPorHash: new Map(),
  });
  assert.deepEqual(atras, []);
});

test('camada sem medida entra: ela já foi escolhida como fundo de página', () => {
  // Na dúvida, incluir. `escolherCamadasDePagina` já decidiu que aquilo é fundo
  // da página inteira; descartar por falta de caixa devolveria o defeito
  // original em silêncio.
  const atras = camadasQuePassamAtras({
    no: dobraEm(0),
    camadas: { comRuntime: [], soCss: ['grao'] },
    visualLayers: [],
    htmlPorHash: new Map([['grao', '<div class="grao"></div>']]),
  });
  assert.deepEqual(atras, ['grao']);
});

test('a ordem é estável: comRuntime antes de soCss', () => {
  // Fundo que troca de ordem entre duas compilações é um fundo diferente: a
  // ordem de irmãos decide quem pinta por cima de quem.
  const atras = camadasQuePassamAtras({
    no: dobraEm(0),
    camadas: { comRuntime: ['canvas'], soCss: ['grao'] },
    visualLayers: [
      camadaCom('canvas', { position: 'fixed' }),
      camadaCom('grao', { position: 'fixed' }),
    ],
    htmlPorHash: new Map([
      ['canvas', '<canvas></canvas>'],
      ['grao', '<div></div>'],
    ]),
  });
  assert.deepEqual(atras, ['canvas', 'grao']);
});

// ── Contagem de ícone ────────────────────────────────────────────────────────

test('ícone que virou span com SVG conta como desenhado', () => {
  const html = '<div><span data-ds-icone="inline"><svg viewBox="0 0 24 24"></svg></span></div>';
  assert.deepEqual(contarIcones(html), { inline: 1, pendentes: 0 });
});

test('casca de web component conta como pendente', () => {
  const html = '<iconify-icon icon="solar:home"></iconify-icon>';
  assert.deepEqual(contarIcones(html), { inline: 0, pendentes: 1 });
});

test('a falha declarada pelo motor conta como pendente, não some da conta', () => {
  const html = '<span data-ds-icone="nao-desenhado" data-ds-icone-origem="mdi:x"></span>';
  assert.equal(contarIcones(html).pendentes, 1);
});

test('ícone que já tinha SVG na luz não é pendente', () => {
  const html = '<iconify-icon icon="x"><svg viewBox="0 0 24 24"></svg></iconify-icon>';
  assert.equal(contarIcones(html).pendentes, 0);
});

// ── A ficha não repete a mesma frase ─────────────────────────────────────────

test('a mesma frase, vinda de dois alvos, aparece UMA vez', () => {
  // Um parallax com dois alvos exibia "Parallax aproximado por keyframes de
  // translateY vinculados ao progresso" duas vezes, uma embaixo da outra, na
  // ficha que a pessoa lê. Repetir não acrescenta e tira credibilidade do
  // resto da lista: quem vê a mesma frase duas vezes lê as outras com menos
  // atenção.
  const frase = 'Parallax aproximado por keyframes de translateY vinculados ao progresso.';
  assert.deepEqual(limitacoesDe([frase, frase]), [frase]);
});

test('a ordem da primeira aparição é preservada', () => {
  // A ordem carrega significado: a limitação da representação vem antes das de
  // mídia porque ela é a que decide o resto.
  assert.deepEqual(limitacoesDe(['a', 'b', 'a', 'c']), ['a', 'b', 'c']);
});

test('frase vazia ou só espaço não vira item da lista', () => {
  assert.deepEqual(limitacoesDe(['', '   ', 'real']), ['real']);
});

test('o teto de 12 continua valendo: uma ficha não é um relatório', () => {
  const muitas = Array.from({ length: 30 }, (_, i) => `limitação ${i}`);
  assert.equal(limitacoesDe(muitas).length, 12);
});

// ── A camada de fundo é classificada pela MESMA evidência que as dobras ──────
//
// A chamada que classifica o fundo da página omitia dois fatos que a chamada
// das dobras informava: se o CSS compilado pelo Tailwind foi capturado, e quais
// runtimes viajam dentro do bundle. Não era uma divergência de opinião entre
// dois classificadores — era o mesmo classificador recebendo menos fatos.
//
// O efeito, na MESMA captura: a dobra saía `componente-portatil` porque o CSS
// do Tailwind estava no CSSOM, e o fundo saía `capsula-runtime` dizendo "o CSS
// resultante não foi capturado: as classes ficam sem estilo".

test('o fundo e a dobra concordam sobre o CSS que o Tailwind compilou', () => {
  const secaoFp = fp({ tag: 'section', id: 'precos', text: 'Planos e preços' });
  const fundoFp = fp({ tag: 'div', classes: ['bg-grain'] });

  const tailwind: RuntimeDetection = {
    id: 'rt_tw',
    kind: 'tailwind-cdn',
    label: 'Tailwind por CDN',
    evidence: ['script cdn.tailwindcss.com'],
    confidence: 'alta',
    scripts: ['https://cdn.tailwindcss.com'],
    targets: [secaoFp.hash, fundoFp.hash],
    assets: [],
    encapsulable: true,
    limitations: [],
  };

  const r = segmentarPorEvidencia(
    entradaVazia({
      // A captura leu o CSSOM: o CSS compilado veio junto.
      cssExternoFaltando: false,
      runtimeDetections: [tailwind],
      structuralMap: [
        node({
          fingerprint: secaoFp,
          role: 'section',
          subtreeTextLength: 300,
          areaShare: 0.8,
          pageBox: { x: 0, y: 0, w: 1440, h: 800 },
        }),
        node({
          fingerprint: fundoFp,
          role: 'unknown',
          areaShare: 1,
          pageBox: { x: 0, y: 0, w: 1440, h: 3600 },
        }),
      ],
      visualLayers: [camada({ fingerprint: secaoFp, ownerSection: secaoFp.hash })],
      camadasDePagina: { comRuntime: [fundoFp.hash], soCss: [] },
      htmlPorHash: new Map([
        [
          secaoFp.hash,
          '<section id="precos"><h2>Planos e preços</h2><div class="card p-6">Um plano com descrição suficiente para contar como conteúdo próprio.</div></section>',
        ],
        [fundoFp.hash, '<div class="bg-grain fixed inset-0"></div>'],
      ]),
    }),
  );

  const dobra = r.segmentos.find((s) => s.hash === secaoFp.hash);
  const fundo = r.segmentos.find((s) => s.category === 'background');
  assert.ok(dobra, 'a dobra tem de sair');
  assert.ok(fundo, 'a camada de fundo tem de sair');

  const semCss = (s: (typeof r.segmentos)[number]) =>
    s.representation.limitations.some((l) => l.includes('o CSS resultante não foi capturado'));

  assert.equal(semCss(dobra), false);
  assert.equal(
    semCss(fundo),
    false,
    'o fundo não pode declarar CSS perdido numa captura em que a dobra o declara capturado',
  );
  assert.equal(fundo.representation.type, dobra.representation.type);
});

test('quando o CSS compilado NÃO veio, o fundo também diz isso', () => {
  // A correção não é "o fundo sempre passa": é o fundo receber a mesma
  // evidência. Com a folha perdida, os dois têm de reclamar juntos.
  const secaoFp = fp({ tag: 'section', id: 'precos', text: 'Planos e preços' });
  const fundoFp = fp({ tag: 'div', classes: ['bg-grain'] });

  const tailwind: RuntimeDetection = {
    id: 'rt_tw',
    kind: 'tailwind-cdn',
    label: 'Tailwind por CDN',
    evidence: ['script cdn.tailwindcss.com'],
    confidence: 'alta',
    scripts: ['https://cdn.tailwindcss.com'],
    targets: [secaoFp.hash, fundoFp.hash],
    assets: [],
    encapsulable: true,
    limitations: [],
  };

  const r = segmentarPorEvidencia(
    entradaVazia({
      cssExternoFaltando: true,
      runtimeDetections: [tailwind],
      structuralMap: [
        node({
          fingerprint: secaoFp,
          role: 'section',
          subtreeTextLength: 300,
          areaShare: 0.8,
          pageBox: { x: 0, y: 0, w: 1440, h: 800 },
        }),
        node({
          fingerprint: fundoFp,
          role: 'unknown',
          areaShare: 1,
          pageBox: { x: 0, y: 0, w: 1440, h: 3600 },
        }),
      ],
      visualLayers: [camada({ fingerprint: secaoFp, ownerSection: secaoFp.hash })],
      camadasDePagina: { comRuntime: [fundoFp.hash], soCss: [] },
      htmlPorHash: new Map([
        [
          secaoFp.hash,
          '<section id="precos"><h2>Planos e preços</h2><div class="card p-6">Um plano com descrição suficiente para contar como conteúdo próprio.</div></section>',
        ],
        [fundoFp.hash, '<div class="bg-grain fixed inset-0"></div>'],
      ]),
    }),
  );

  const fundo = r.segmentos.find((s) => s.category === 'background');
  assert.ok(fundo);
  assert.ok(
    fundo.representation.limitations.some((l) => l.includes('o CSS resultante não foi capturado')),
  );
});
