import { z } from 'zod';
import { Box, CapturedAsset, InteractionKind, RenderMode, SupportLevel } from './capture.js';
import { Confidence } from './interaction-support.js';
import { ScrollBehavior } from './scroll.js';
import { TelemetriaRelatorio } from './telemetria.js';

/**
 * Contratos do motor de captura V2.
 *
 * O V1 descrevia a página como **um HTML final mais uma lista de coisas
 * clicáveis**. Faltava tudo o que decide se um componente sobrevive fora da
 * origem: onde ele está na tela, que camada o cobre, que fundo é dele, que
 * runtime o desenha, o que muda quando o tempo passa e o que muda quando o
 * ponteiro atravessa a viewport.
 *
 * Este arquivo descreve a página como uma **composição**: estrutural, visual em
 * camadas, temporal, interativa, semântica, dependente de assets e possivelmente
 * dependente de runtimes. A segmentação passa a ser consequência dessas
 * evidências, não a primeira coisa que acontece.
 *
 * Convenções que valem para o arquivo inteiro:
 *
 * - **Coordenada normalizada.** Toda posição de ponteiro é `0..1` na viewport, e
 *   é convertida para px na execução. É o que faz a mesma trajetória valer em
 *   1440x900, num notebook 1280x720 e com `deviceScaleFactor` diferente.
 * - **Nada de conteúdo sensível.** Nenhum campo aqui carrega valor de input,
 *   cookie, cabeçalho de autorização ou querystring com credencial. O
 *   fingerprint usa forma e posição, nunca o que a pessoa digitou.
 * - **Honestidade acima de aparência.** Todo detector devolve `confidence` e
 *   `evidence`. Detectar não é preservar; preservar não é validar.
 */

// ── Versões ──────────────────────────────────────────────────────────────────

/** Motor. `1` = pipeline legado (`@ds/explorer`), `2` = este. */
export const ENGINE_VERSION_V2 = 2;

/** Forma deste contrato. Sobe quando um campo muda de significado. */
/**
 * `2` — a captura passou a medir linguagem visual (`designTokens` e o
 * `tokenIds` de cada segmento). Manifesto `1` continua válido e lido: os dois
 * campos têm default vazio, e um acervo antigo simplesmente não tem rampa
 * declarada até ser recapturado.
 */
export const CAPTURE_V2_SCHEMA_VERSION = 2;

// ── Geometria e identidade ───────────────────────────────────────────────────

/**
 * Ponto na viewport em coordenada normalizada. `0,0` é o canto superior
 * esquerdo; `1,1` o inferior direito. Independente de resolução, zoom e DPR — é
 * o contrato que a varredura de ponteiro exige para ser reproduzível.
 */
export const NormalizedPoint = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type NormalizedPoint = z.infer<typeof NormalizedPoint>;

/**
 * Retângulo normalizado (0..1 nos dois eixos), relativo à viewport. Conviver com
 * o `Box` em px é de propósito: o px serve para medir a página naquela sessão, o
 * normalizado serve para reencenar em outra.
 */
export const NormalizedBox = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type NormalizedBox = z.infer<typeof NormalizedBox>;

/**
 * Identidade estável de um elemento.
 *
 * O `data-dsx-ref` do V1 morria a cada render, e `nth-child`/XPath morrem a cada
 * interação que insere um nó. O fingerprint combina sinais que sobrevivem:
 * semântica (tag/role/ARIA), intenção declarada (`data-*`), texto resumido,
 * classes distintivas (as que não parecem geradas), o ancestral semântico e a
 * posição relativa DENTRO da seção — mais o hash de tudo isso.
 *
 * `hash` é o que se compara; os campos existem para auditar por que dois
 * elementos foram considerados o mesmo (ou não).
 */
export const ElementFingerprint = z.object({
  /** Hash estável dos sinais abaixo. É a chave de comparação. */
  hash: z.string(),
  tag: z.string(),
  role: z.string().nullable(),
  /** Atributos ARIA relevantes (sem valores de campo). */
  aria: z.record(z.string(), z.string()).default({}),
  /** `data-*` de intenção (toggle/tab/modal…), sem `data-dsx*`. */
  dataAttrs: z.record(z.string(), z.string()).default({}),
  /** Texto resumido e normalizado (no máximo 120 chars). */
  text: z.string().default(''),
  /** Classes que NÃO parecem geradas por bundler/CSS-in-JS. */
  stableClasses: z.array(z.string()).default([]),
  id: z.string().nullable().default(null),
  /** Tag do ancestral semântico mais próximo (section/article/header…). */
  semanticAncestor: z.string().nullable().default(null),
  /** Índice entre os irmãos do MESMO tipo — mais estável que nth-child puro. */
  siblingIndex: z.number().int().nonnegative().default(0),
  /** Assinatura estrutural: cadeia de tags dos filhos diretos. */
  structuralSignature: z.string().default(''),
  /** Caixa normalizada na viewport no momento da coleta. */
  box: NormalizedBox.optional(),
  /** Tipos de evento com listener registrado (da instrumentação). */
  listeners: z.array(z.string()).default([]),
  /** `cursor` computado — sinal forte de interatividade. */
  cursor: z.string().optional(),
});
export type ElementFingerprint = z.infer<typeof ElementFingerprint>;

// ── Mapa estrutural ──────────────────────────────────────────────────────────

/**
 * O papel estrutural de um nó. Cobre landmark, região, agrupamento e mídia — de
 * propósito inclui o que NÃO tem texto, porque foi exatamente isso que o V1
 * perdia (`if (!interativo) continue`).
 */
export const StructuralRole = z.enum([
  'document',
  'header',
  'nav',
  'hero',
  'main',
  'section',
  'article',
  'aside',
  'footer',
  'form',
  'list',
  'listitem',
  'card',
  'group',
  'button',
  'link',
  'heading',
  'text',
  'image',
  'video',
  'canvas',
  'svg',
  'iframe',
  'shadow-host',
  'media-group',
  'decoration',
  'unknown',
]);
export type StructuralRole = z.infer<typeof StructuralRole>;

/** Onde o nó vive — o DOM normal, dentro de shadow root, ou dentro de iframe. */
export const NodeRealm = z.enum([
  'document',
  'shadow-open',
  'shadow-closed',
  'iframe-same-origin',
  'iframe-cross-origin',
]);
export type NodeRealm = z.infer<typeof NodeRealm>;

/**
 * Um nó do mapa estrutural. Árvore achatada: cada nó guarda o hash do pai, para
 * o consumidor remontar sem recursão profunda no JSON.
 */
export const StructuralNode = z.object({
  fingerprint: ElementFingerprint,
  role: StructuralRole,
  realm: NodeRealm.default('document'),
  /** Hash do pai no mapa. `null` no raiz. */
  parent: z.string().nullable().default(null),
  /** Profundidade a partir do raiz. */
  depth: z.number().int().nonnegative().default(0),
  /** Caixa em px na página (não na viewport) — `y` absoluto, para o scroll. */
  pageBox: Box.optional(),
  /** Área visível ocupada, em fração da viewport. Peso VISUAL, não peso em bytes. */
  areaShare: z.number().min(0).max(1).default(0),
  /** Texto próprio (sem descendentes), resumido. */
  ownText: z.string().default(''),
  /** Comprimento do texto da subárvore — para densidade, não para nome. */
  subtreeTextLength: z.number().int().nonnegative().default(0),
  /** Tags de mídia presentes na subárvore. */
  mediaTags: z.array(z.string()).default([]),
  /** O nó está visível no estado inicial? */
  visible: z.boolean().default(true),
});
export type StructuralNode = z.infer<typeof StructuralNode>;

// ── Mapa visual em camadas ───────────────────────────────────────────────────

/** Contexto de empilhamento de um elemento — quem manda em quem, visualmente. */
export const StackingInfo = z.object({
  zIndex: z.string().default('auto'),
  /** O elemento CRIA um stacking context (transform, filter, opacity<1, etc.)? */
  createsContext: z.boolean().default(false),
  /** Hash do stacking context que o contém. */
  contextOwner: z.string().nullable().default(null),
  position: z.string().default('static'),
  opacity: z.number().default(1),
  transform: z.string().default('none'),
  filter: z.string().default('none'),
  backdropFilter: z.string().default('none'),
  mixBlendMode: z.string().default('normal'),
  isolation: z.string().default('auto'),
  mask: z.string().default('none'),
  clipPath: z.string().default('none'),
  overflow: z.string().default('visible'),
  pointerEvents: z.string().default('auto'),
});
export type StackingInfo = z.infer<typeof StackingInfo>;

/**
 * O papel da camada na composição da seção. É o que impede o V1 de repetir-se:
 * um `background` não é um componente solto, é uma camada COM DONO.
 */
export const LayerRole = z.enum([
  'background', // pinta atrás do conteúdo
  'overlay', // cobre o conteúdo (véu, gradiente de leitura)
  'content', // o conteúdo em si
  'decoration', // enfeite sem função (linha, orbe, textura)
  'media', // vídeo/imagem/canvas que É o conteúdo
  'sticky', // fica preso durante o scroll
  'fixed', // fixo na viewport
  'portal', // renderizado fora da árvore da seção
]);
export type LayerRole = z.infer<typeof LayerRole>;

/**
 * Uma camada visual.
 *
 * O ponto central do V2: cada camada sabe **a que seção pertence** (`ownerSection`)
 * e **quem a cobre / quem ela cobre**. É isso que mantém o fundo WebGL do hero
 * dentro do hero em vez de virar um card preto avulso, e o que permite dizer "o
 * overlay escuro é da seção X" para um elemento `position:fixed` que no DOM está
 * no fim do `<body>`.
 */
export const VisualLayer = z.object({
  fingerprint: ElementFingerprint,
  role: LayerRole,
  /** Hash da seção dona — por CONTENÇÃO GEOMÉTRICA, não por parentesco no DOM. */
  ownerSection: z.string().nullable().default(null),
  /** Como a posse foi decidida (dom, geometria, stacking, comportamento). */
  ownerEvidence: z.array(z.string()).default([]),
  ownerConfidence: Confidence.default('media'),
  stacking: StackingInfo,
  /** Ordem de pintura resolvida dentro do contexto (maior = mais na frente). */
  paintOrder: z.number().int().default(0),
  pageBox: Box.optional(),
  normalizedBox: NormalizedBox.optional(),
  /** Hashes de camadas que cobrem esta. */
  coveredBy: z.array(z.string()).default([]),
  /** Hashes de camadas que esta cobre. */
  covers: z.array(z.string()).default([]),
  /** Pseudo-elementos com conteúdo/fundo próprio. */
  pseudo: z.array(z.enum(['before', 'after'])).default([]),
  /** A camada é inseparável da experiência da seção (não vira item isolado). */
  inseparable: z.boolean().default(false),
});
export type VisualLayer = z.infer<typeof VisualLayer>;

// ── Backgrounds ──────────────────────────────────────────────────────────────

/**
 * De onde o fundo vem. A lista é longa porque cada origem tem um jeito
 * diferente de ser preservada — e porque o V1 só sabia ler o atributo `style`.
 */
export const BackgroundSource = z.enum([
  'css-color',
  'css-image', // background-image: url()
  'css-gradient', // linear/radial/conic
  'css-multiple', // várias camadas em background-image
  'css-image-set',
  'css-cross-fade',
  'mask-image',
  'border-image',
  'pseudo-before',
  'pseudo-after',
  'css-variable', // o fundo vem de uma custom property
  'img-element', // <img> posicionado como fundo
  'picture-element',
  'svg-inline',
  'svg-external',
  'video-element',
  'canvas-element',
  'iframe-element',
  'absolute-child', // filho absoluto usado como fundo
]);
export type BackgroundSource = z.infer<typeof BackgroundSource>;

/**
 * Um fundo detectado, como ENTIDADE EXPLÍCITA do manifesto.
 *
 * "Background animado deve virar entidade explícita" é regra do pedido, e é o
 * antídoto do card preto: o fundo passa a ter identidade, dono, assets, runtime
 * e — quando for o caso — a admissão de que só sobrevive como referência visual.
 */
export const BackgroundDetection = z.object({
  id: z.string(),
  source: BackgroundSource,
  /** Elemento que carrega o fundo. */
  fingerprint: ElementFingerprint,
  /** Seção dona (o fundo não é órfão). */
  ownerSection: z.string().nullable().default(null),
  /** Valor CSS bruto relevante, já sanitizado (sem querystring sensível). */
  cssValue: z.string().default(''),
  /** Custom properties de que o valor depende, resolvidas. */
  variables: z.record(z.string(), z.string()).default({}),
  /** URLs de asset referenciadas (absolutas, sanitizadas). */
  assetUrls: z.array(z.string()).default([]),
  /** O fundo muda no tempo (medido, não adivinhado)? */
  animated: z.boolean().default(false),
  /** Como a animação foi constatada. */
  animationEvidence: z.array(z.string()).default([]),
  /** Runtime responsável, quando houver (`webgl`, `lottie`, `canvas2d`…). */
  runtime: z.string().optional(),
  /** Cobre a seção inteira (candidato a fundo inseparável). */
  coversSection: z.boolean().default(false),
  confidence: Confidence.default('media'),
  limitations: z.array(z.string()).default([]),
});
export type BackgroundDetection = z.infer<typeof BackgroundDetection>;

// ── Mídia ────────────────────────────────────────────────────────────────────

export const MediaKind = z.enum([
  'video',
  'gif',
  'webp-animado',
  'avif-animado',
  'apng',
  'svg-animado',
  'svg-estatico',
  'imagem',
  'lottie',
  'canvas-2d',
  'webgl',
  'webgl2',
  'iframe',
  'audio',
]);
export type MediaKind = z.infer<typeof MediaKind>;

/** Quando a mídia entrou na página — o que decide se um render único a veria. */
export const MediaAppearance = z.enum([
  'inicial',
  'apos-load',
  'apos-scroll',
  'apos-hover',
  'apos-clique',
  'apos-tempo',
]);
export type MediaAppearance = z.infer<typeof MediaAppearance>;

export const MediaDetection = z.object({
  id: z.string(),
  kind: MediaKind,
  fingerprint: ElementFingerprint,
  ownerSection: z.string().nullable().default(null),
  /** URL da fonte (sanitizada). Ausente para canvas/webgl. */
  src: z.string().optional(),
  /** Fontes alternativas (`<source>`, srcset). */
  sources: z.array(z.string()).default([]),
  poster: z.string().optional(),
  /** Atributos de reprodução, quando vídeo. */
  playback: z
    .object({
      autoplay: z.boolean().default(false),
      muted: z.boolean().default(false),
      loop: z.boolean().default(false),
      controls: z.boolean().default(false),
      playsInline: z.boolean().default(false),
      rate: z.number().default(1),
      objectFit: z.string().optional(),
      objectPosition: z.string().optional(),
    })
    .optional(),
  intrinsic: z.object({ width: z.number(), height: z.number() }).optional(),
  /** Usada como fundo da seção (não é o conteúdo). */
  asBackground: z.boolean().default(false),
  appearance: MediaAppearance.default('inicial'),
  /** Mudou no tempo, de fato (pixel diff). */
  animated: z.boolean().default(false),
  /** Reage ao ponteiro (medido pela varredura). */
  pointerReactive: z.boolean().default(false),
  /** Reage ao scroll. */
  scrollReactive: z.boolean().default(false),
  confidence: Confidence.default('media'),
  limitations: z.array(z.string()).default([]),
});
export type MediaDetection = z.infer<typeof MediaDetection>;

// ── Runtimes ─────────────────────────────────────────────────────────────────

export const RuntimeKind = z.enum([
  'three',
  'pixi',
  'webgl-cru',
  'canvas-2d',
  'lottie',
  'gsap',
  'scrolltrigger',
  'framer-motion',
  'lenis',
  'locomotive',
  'swiper',
  'embla',
  'splide',
  'barba',
  'matter',
  'p5',
  'anime',
  'aos',
  'shader-cru',
  'web-animations',
  'video-runtime',
  // ── Runtimes que DESENHAM o que o HTML só declara ──────────────────────────
  // Estes três não animam nada: eles produzem o conteúdo. Sem eles, o HTML
  // capturado é uma promessa não cumprida, e o pior é que ela parece cumprida —
  // as tags estão todas lá.
  //
  // `iconify`: `<iconify-icon icon="solar:home">` é uma casca. O desenho vem de
  // uma API externa e entra num shadow root. Sem o runtime, uma caixa vazia.
  // `tailwind-cdn`: `cdn.tailwindcss.com` COMPILA as classes utilitárias no
  // navegador. Sem ele, `class="flex gap-4 bg-black"` não tem CSS nenhum por
  // trás — a folha que definiria essas classes nunca existiu em disco.
  // `fundo-canvas`: script que pinta um fundo (feixes, partículas, grão) num
  // canvas de página inteira. O que ele desenha não está em elemento nenhum.
  'iconify',
  'tailwind-cdn',
  'fundo-canvas',
  'desconhecido',
]);
export type RuntimeKind = z.infer<typeof RuntimeKind>;

/**
 * Um runtime detectado. `evidence` é obrigatório na prática: a regra do pedido é
 * "não invente tecnologias". Um runtime sem evidência não entra no STACK.
 */
export const RuntimeDetection = z.object({
  id: z.string(),
  kind: RuntimeKind,
  /** Nome como aparece (para o STACK). */
  label: z.string(),
  /** Versão, quando exposta pelo próprio runtime. */
  version: z.string().optional(),
  /** Como foi constatado: global exposto, script src, contexto criado, API chamada. */
  evidence: z.array(z.string()).default([]),
  confidence: Confidence.default('media'),
  /** Scripts relacionados (URLs sanitizadas). */
  scripts: z.array(z.string()).default([]),
  /** Elementos que ele controla. */
  targets: z.array(z.string()).default([]),
  /** Assets que ele consome (texturas, modelos, shaders, JSON). */
  assets: z.array(z.string()).default([]),
  /** Roda dentro de cápsula isolada com segurança? */
  encapsulable: z.boolean().default(false),
  limitations: z.array(z.string()).default([]),
});
export type RuntimeDetection = z.infer<typeof RuntimeDetection>;

// ── Observação temporal ──────────────────────────────────────────────────────

/** O que mudou entre duas amostras no tempo. */
export const TemporalChange = z.enum([
  'pixels',
  'dom',
  'classes',
  'attrs',
  'computed',
  'canvas',
  'video-frame',
  'svg',
  'requests',
  'animations',
  'transform',
  'opacity',
  'filter',
]);
export type TemporalChange = z.infer<typeof TemporalChange>;

/**
 * Uma observação da mesma região em dois instantes.
 *
 * O critério que o V1 não tinha: **pixels mudaram e o DOM não** ⇒ há um runtime
 * pintando ali (vídeo, canvas, WebGL, SVG animado, animação CSS contínua). É a
 * diferença entre "tem classe `animate-`" e "isto se move".
 */
export const TemporalObservation = z.object({
  id: z.string(),
  /** Alvo: hash do elemento/camada, ou `viewport:<n>` para a viewport inteira. */
  target: z.string(),
  /** Instantes amostrados (ms desde o início da observação). */
  timestamps: z.array(z.number().int().nonnegative()).default([]),
  changes: z.array(TemporalChange).default([]),
  /** Fração de pixels alterados entre a primeira e a última amostra (0..1). */
  pixelDelta: z.number().min(0).max(1).default(0),
  /** DOM permaneceu praticamente igual? */
  domStable: z.boolean().default(true),
  /** Conclusão: há movimento contínuo neste alvo. */
  moving: z.boolean().default(false),
  /** Causa mais provável, com base nos detectores. */
  attributedTo: z.string().optional(),
  /** Amostras guardadas (caminhos relativos), já deduplicadas por hash. */
  frames: z.array(z.string()).default([]),
  /** Regiões dinâmicas a mascarar em comparação visual. */
  dynamicRegions: z.array(NormalizedBox).default([]),
  confidence: Confidence.default('media'),
});
export type TemporalObservation = z.infer<typeof TemporalObservation>;

// ── Varredura de ponteiro ────────────────────────────────────────────────────

/**
 * Formas de trajetória. `hilbert` e `serpentina` são as de COBERTURA (varrem a
 * viewport uniformemente); as demais são complementares e existem para provocar
 * efeitos que só respondem a um tipo de movimento — círculo fechando encontra
 * efeito radial e cena orbital, diagonal encontra tilt, aproximação encontra
 * campo de partículas.
 */
export const PointerPathKind = z.enum([
  'hilbert',
  'serpentina',
  'grade',
  'circulo-fechando',
  'circulo-expandindo',
  'diagonal',
  'horizontal',
  'vertical',
  'aproximar-centro',
  'afastar-centro',
  'refinamento', // segunda passada numa região que reagiu
]);
export type PointerPathKind = z.infer<typeof PointerPathKind>;

export const PointerSpeed = z.enum(['lento', 'normal', 'rapido']);
export type PointerSpeed = z.infer<typeof PointerSpeed>;

/** Uma trajetória executada, em coordenadas normalizadas. */
export const PointerPath = z.object({
  id: z.string(),
  kind: PointerPathKind,
  speed: PointerSpeed.default('normal'),
  /** Pontos normalizados percorridos (amostrados, não todos os pixels). */
  points: z.array(NormalizedPoint).default([]),
  /** Viewport (px) em que a trajetória foi executada — para reencenar igual. */
  viewport: z.object({ width: z.number().int(), height: z.number().int() }),
  /** Progresso de scroll da página quando rodou (0..1). */
  scrollProgress: z.number().min(0).max(1).default(0),
  durationMs: z.number().int().nonnegative().default(0),
});
export type PointerPath = z.infer<typeof PointerPath>;

/** Como um alvo reagiu ao ponteiro. */
export const PointerReaction = z.enum([
  'cursor',
  'estilo',
  'transform',
  'opacity',
  'filter',
  'dom',
  'pixels',
  'particulas',
  'canvas',
  'requests',
  'animacao',
]);
export type PointerReaction = z.infer<typeof PointerReaction>;

/**
 * Uma reação medida durante a varredura.
 *
 * Guarda a REGIÃO normalizada que reagiu — inclusive quando não há elemento DOM
 * por baixo (cena em canvas). É o que permite dizer "esta área do canvas responde
 * ao cursor" sem inventar um botão que não existe.
 */
export const PointerResponse = z.object({
  id: z.string(),
  pathId: z.string(),
  /** Ponto normalizado onde a reação foi observada. */
  at: NormalizedPoint,
  /** Região reativa (refinada quando houve segunda passada). */
  region: NormalizedBox.optional(),
  /** Elemento sob o ponteiro, quando havia um identificável. */
  fingerprint: ElementFingerprint.optional(),
  /**
   * O endereço (`data-dsx2`) do elemento no momento da sonda. Os endereços são
   * estáveis dentro da captura, então é por ele que o motor preenche o
   * fingerprint depois do mapa final. Ausente em capturas antigas.
   */
  ref: z.number().int().nonnegative().optional(),
  /**
   * O scroll da parada em que a resposta foi medida. `region` é relativa à
   * viewport; sem o scroll, a intersecção com coordenadas de página atribuía
   * TODO comportamento aos segmentos do topo (medido: 100% em 3 de 3 sites).
   */
  scrollY: z.number().nonnegative().optional(),
  /** Não há DOM interno (cena em canvas/WebGL). */
  domless: z.boolean().default(false),
  reactions: z.array(PointerReaction).default([]),
  /** Fração de pixels alterados na região. */
  pixelDelta: z.number().min(0).max(1).default(0),
  /** Espera necessária para a reação aparecer (ms). */
  latencyMs: z.number().int().nonnegative().default(0),
  /** Requests disparados pela reação (URLs sanitizadas). */
  requests: z.array(z.string()).default([]),
  confidence: Confidence.default('media'),
});
export type PointerResponse = z.infer<typeof PointerResponse>;

// ── Scroll ───────────────────────────────────────────────────────────────────

/**
 * Uma passagem por viewport, com sobreposição. Registra o que a viewport
 * mostrou, o que apareceu nela e o que foi observado ali — a unidade de trabalho
 * do percurso descendente.
 */
export const ScrollViewportPass = z.object({
  index: z.number().int().nonnegative(),
  /** Posição de scroll (px) e progresso global (0..1). */
  scrollY: z.number(),
  progress: z.number().min(0).max(1),
  /** Sobreposição usada em relação à viewport anterior (0..1). */
  overlap: z.number().min(0).max(1).default(0),
  direction: z.enum(['descendo', 'subindo']).default('descendo'),
  /** Hashes de elementos que ficaram visíveis nesta passagem. */
  visible: z.array(z.string()).default([]),
  /** Hashes que apareceram AGORA (lazy-load, reveal). */
  appeared: z.array(z.string()).default([]),
  /** Ids de observação temporal feitas nesta viewport. */
  temporalIds: z.array(z.string()).default([]),
  /** Ids de trajetória de ponteiro executadas aqui. */
  pointerPathIds: z.array(z.string()).default([]),
  /** Assets carregados durante esta passagem. */
  assetsLoaded: z.array(z.string()).default([]),
});
export type ScrollViewportPass = z.infer<typeof ScrollViewportPass>;

// ── Ações ────────────────────────────────────────────────────────────────────

/** Ações locais e reversíveis que a exploração pode executar. */
export const SafeActionKind = z.enum([
  'abrir-menu',
  'fechar-menu',
  'abrir-submenu',
  'expandir-accordion',
  'recolher-accordion',
  'trocar-tab',
  'abrir-modal',
  'fechar-modal',
  'avancar-carousel',
  'voltar-carousel',
  'abrir-tooltip',
  'alternar-tema',
  'pausar-animacao',
  'iniciar-animacao',
  'focar-campo',
  'revelar-conteudo',
  'alternar-switch',
  'hover',
  'teclado',
]);
export type SafeActionKind = z.infer<typeof SafeActionKind>;

/** Por que uma ação foi barrada. Log seguro: sem URL com credencial. */
export const BlockReason = z.enum([
  'submit',
  'login',
  'cadastro',
  'compra',
  'pagamento',
  'exclusao',
  'confirmacao-irreversivel',
  'upload',
  'download',
  'permissao',
  'clipboard',
  'geolocalizacao',
  'camera',
  'microfone',
  'protocolo-externo',
  'navegacao-externa',
  'envio-mensagem',
  'instalacao',
  'abrir-aplicativo',
  'alteracao-persistente',
  'campo-sensivel',
  'popup',
  'orcamento',
]);
export type BlockReason = z.infer<typeof BlockReason>;

export const ExecutedAction = z.object({
  id: z.string(),
  kind: SafeActionKind,
  /** Alvo (hash do fingerprint) ou região normalizada, quando sem DOM. */
  target: z.string().nullable().default(null),
  region: NormalizedBox.optional(),
  fromState: z.string(),
  toState: z.string(),
  /** A ação produziu efeito observável? */
  hadEffect: z.boolean().default(false),
  /** O estado anterior foi restaurado e CONFERIDO? */
  restored: z.boolean().default(false),
  /** Como a restauração foi conferida (assinatura igual, pixels iguais…). */
  restoreEvidence: z.array(z.string()).default([]),
  latencyMs: z.number().int().nonnegative().default(0),
  /** Assets carregados por causa desta ação. */
  assetsLoaded: z.array(z.string()).default([]),
  /** Requests disparados (sanitizados). */
  requests: z.array(z.string()).default([]),
});
export type ExecutedAction = z.infer<typeof ExecutedAction>;

export const BlockedAction = z.object({
  reason: BlockReason,
  /** Alvo descrito de forma segura (tag + rótulo curto, nunca valor de campo). */
  target: z.string(),
  /** Detalhe sanitizado (host sem querystring, por exemplo). */
  detail: z.string().optional(),
});
export type BlockedAction = z.infer<typeof BlockedAction>;

// ── Grafo de estados ─────────────────────────────────────────────────────────

/**
 * Um estado da página. Diferente do `CapturedState` do V1 (que era o HTML de um
 * elemento), aqui o estado é um NÓ do grafo: tem assinatura, profundidade, o
 * escopo que mudou e o que foi guardado dele.
 */
export const StateNode = z.object({
  id: z.string(),
  /** Assinatura para dedup. */
  signature: z.string(),
  /** Rótulo em PT-BR ("menu aberto", "aba 2", "modal aberto"). */
  label: z.string(),
  /** Profundidade a partir do estado inicial. */
  depth: z.number().int().nonnegative().default(0),
  /** Id do estado pai. `null` no inicial. */
  parent: z.string().nullable().default(null),
  /** Hash do escopo (seção/bloco) em que a mudança se manifestou. */
  scope: z.string().nullable().default(null),
  /** HTML do escopo neste estado — gravado fora do manifesto quando pesado. */
  htmlRef: z.string().optional(),
  /** HTML de portal aberto neste estado. */
  portalHtmlRef: z.string().optional(),
  /** Frame visual deste estado (caminho relativo). */
  frameRef: z.string().optional(),
  /** Camadas que passaram a existir/ficar visíveis. */
  layersAdded: z.array(z.string()).default([]),
  /** Assets que este estado trouxe. */
  assets: z.array(z.string()).default([]),
  confidence: Confidence.default('media'),
});
export type StateNode = z.infer<typeof StateNode>;

export const StateEdge = z.object({
  from: z.string(),
  to: z.string(),
  actionId: z.string(),
  kind: SafeActionKind,
  /** A transição é reversível (a ação inversa foi executada e conferida)? */
  reversible: z.boolean().default(false),
});
export type StateEdge = z.infer<typeof StateEdge>;

export const StateGraph = z.object({
  rootId: z.string(),
  nodes: z.array(StateNode).default([]),
  edges: z.array(StateEdge).default([]),
  /** Tetos aplicados, para auditar por que a busca parou. */
  limits: z
    .object({
      maxDepth: z.number().int(),
      maxStates: z.number().int(),
      maxActions: z.number().int(),
    })
    .optional(),
  /** Ciclos detectados (estados que voltaram a um já visto). */
  cycles: z.number().int().nonnegative().default(0),
  /** Estados descartados por dedup. */
  deduped: z.number().int().nonnegative().default(0),
  /** A busca foi cortada por orçamento? */
  truncated: z.boolean().default(false),
});
export type StateGraph = z.infer<typeof StateGraph>;

// ── Representação ────────────────────────────────────────────────────────────

/**
 * As três formas de preservar um item — a decisão mais importante do V2.
 *
 * O V1 tinha só uma (HTML estático) e tentava aplicá-la a tudo, o que produzia o
 * card preto: um `<canvas>` "preservado" como HTML é um retângulo vazio.
 *
 * - `componente-portatil`  — DOM+CSS+assets+estados reproduzem o item. Editável.
 * - `capsula-runtime`      — precisa do runtime; roda isolado em iframe com a
 *                            MENOR unidade funcional (não a página inteira).
 * - `referencia-visual`    — não há como preservar com segurança/portabilidade;
 *                            guarda loop visual + frame de fallback + contexto, e
 *                            é apresentado como referência, nunca como editável.
 */
export const RepresentationType = z.enum([
  'componente-portatil',
  'capsula-runtime',
  'referencia-visual',
]);
export type RepresentationType = z.infer<typeof RepresentationType>;

/** A decisão, com o porquê — auditável e honesta. */
export const RepresentationDecision = z.object({
  type: RepresentationType,
  /** Razões que levaram a esta forma. */
  reasons: z.array(z.string()).default([]),
  /** Formas consideradas e rejeitadas, com o motivo. */
  rejected: z.array(z.object({ type: RepresentationType, why: z.string() })).default([]),
  /** Runtimes de que depende. */
  runtimes: z.array(RuntimeKind).default([]),
  /** Modo de render primário (reusa o vocabulário do V1). */
  renderMode: RenderMode.optional(),
  /** Editável no sentido de "dá para mexer no HTML/CSS e ver o efeito". */
  editable: z.boolean().default(false),
  confidence: Confidence.default('media'),
  limitations: z.array(z.string()).default([]),
});
export type RepresentationDecision = z.infer<typeof RepresentationDecision>;

// ── Evidência de segmentação ─────────────────────────────────────────────────

/**
 * Os sinais que sustentam um segmento. Existe para que a segmentação seja
 * AUDITÁVEL: quando um card sai errado, dá para ver qual evidência o produziu, em
 * vez de reverter uma constante de fração de bytes no escuro.
 */
export const EvidenceKind = z.enum([
  'semantica', // tag/landmark/role
  'rotulo', // comentário/atributo declarando a seção
  'layout', // geometria: largura total, quebra de fluxo
  'proximidade', // vizinhança visual
  'espaco-visual', // separação por espaço em branco
  'stacking', // mesmo contexto de empilhamento
  'fundo-compartilhado', // a mesma camada de fundo cobre o grupo
  'comportamento', // reage junto (hover/scroll/ponteiro)
  'estado', // muda junto numa transição de estado
  'scroll', // entra/sai junto na viewport
  'interacao', // controlador e controlado
  'runtime', // desenhado pelo mesmo runtime
  'pixel-diff', // muda junto no tempo
  'secao-controladora', // pertence à seção que o controla
  'assets', // compartilha assets
  'heading', // agrupado por título
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const SegmentEvidence = z.object({
  segmentId: z.string(),
  /** Hashes dos elementos/camadas que compõem o segmento. */
  members: z.array(z.string()).default([]),
  /** Sinais que sustentaram o agrupamento, com peso. */
  signals: z
    .array(
      z.object({
        kind: EvidenceKind,
        weight: z.number(),
        detail: z.string().optional(),
      }),
    )
    .default([]),
  /** Camadas de fundo que pertencem a este segmento. */
  backgroundIds: z.array(z.string()).default([]),
  mediaIds: z.array(z.string()).default([]),
  runtimeIds: z.array(z.string()).default([]),
  /** Ids de estado do grafo que afetam este segmento. */
  stateIds: z.array(z.string()).default([]),
  /** Ids de reação de ponteiro dentro deste segmento. */
  pointerResponseIds: z.array(z.string()).default([]),
  /** Comportamentos de scroll associados. */
  scrollIds: z.array(z.string()).default([]),
  /** Assets de que o segmento depende (chaves do índice de assets). */
  assetKeys: z.array(z.string()).default([]),
  /**
   * Os degraus de rampa que aparecem DENTRO deste segmento.
   *
   * É o que faz "quero a tipografia daqui" ter endereço: sem isto, a rampa
   * existe no nível da página e ninguém sabe qual peça usa qual degrau.
   */
  tokenIds: z.array(z.string()).default([]),
  /** Por que este nome (para o nome não ser "Seção"). */
  nameEvidence: z.array(z.string()).default([]),
  confidence: Confidence.default('media'),
});
export type SegmentEvidence = z.infer<typeof SegmentEvidence>;

// ── LINGUAGEM VISUAL ─────────────────────────────────────────────────────────

/**
 * Um DEGRAU de uma rampa do site: um tamanho de letra, um respiro, um raio.
 *
 * ## O buraco que isto fecha
 *
 * O motor media composição, comportamento e portabilidade com rigor, e não
 * media LINGUAGEM VISUAL. `RawNode` guardava empilhamento, animação e
 * transição, e não guardava um único `font-size`. O efeito prático aparecia na
 * ponta: "quero a tipografia deste site" entregava uma lista de nomes de fonte,
 * porque nome de fonte era tudo que existia. Escala, ritmo e forma — o que
 * separa um site bem desenhado de um mal desenhado — não eram medidos.
 *
 * ## Por que rampa, e não a lista de valores
 *
 * Uma página tem dezenas de tamanhos de letra medidos, e a maioria é ruído: o
 * mesmo degrau aparece como 15.99px e 16px em nós diferentes, e um `<sup>`
 * perdido não é um degrau da escala. O que interessa é o conjunto pequeno de
 * degraus que o site de fato usa, cada um com o peso da evidência.
 *
 * ## A regra que vale para tudo aqui
 *
 * `papel` é `null` quando a evidência não separa — a mesma regra do
 * `clusters.ts` na cor. Chutar que o segundo maior tamanho é "título" produz um
 * site com hierarquia inventada, e inventar aqui é pior que não dizer.
 */
export const EixoDeToken = z.enum(['tipografia', 'espaco', 'raio']);
export type EixoDeToken = z.infer<typeof EixoDeToken>;

/**
 * Papel de um degrau de TIPOGRAFIA. Só dois são afirmáveis sem chute:
 *
 * - `corpo`: o degrau em que está a maior parte do texto. É medição direta.
 * - `display`: o maior degrau, quando ele se destaca do corpo o bastante para
 *   não ser confundível com um título comum.
 *
 * O resto fica `null`. Um site pode ter cinco degraus entre o corpo e o
 * display, e nomear cada um seria inventar uma hierarquia que ninguém mediu.
 */
export const PapelDeToken = z.enum(['corpo', 'display']);
export type PapelDeToken = z.infer<typeof PapelDeToken>;

export const DesignToken = z.object({
  /** `tipo-3`, `espaco-1`, `raio-2` — estável dentro de uma captura. */
  id: z.string(),
  eixo: EixoDeToken,
  /** O valor do degrau em px, já consolidado a partir das amostras. */
  valor: z.number().nonnegative(),
  /** Quantos nós usam este degrau. É o peso da evidência. */
  ocorrencias: z.number().int().nonnegative().default(0),
  /**
   * Quanto texto (em caracteres) está neste degrau. Só faz sentido em
   * tipografia, e é o que elege `corpo` — o degrau em que se lê, não o que
   * aparece em mais lugares.
   */
  caracteres: z.number().int().nonnegative().default(0),
  papel: PapelDeToken.nullable().default(null),
  /** Os valores crus que caíram neste degrau, para auditar a fusão. */
  amostra: z.array(z.number()).default([]),
});
export type DesignToken = z.infer<typeof DesignToken>;

// ── STACK ────────────────────────────────────────────────────────────────────

/**
 * Uma tecnologia REALMENTE detectada. `evidence` não é decorativo: a regra do
 * pedido é "não invente tecnologias", então uma entrada sem evidência não deve
 * existir.
 */
export const StackEntry = z.object({
  name: z.string(),
  /** Para que serve, em PT-BR. */
  usage: z.string(),
  version: z.string().optional(),
  confidence: Confidence,
  evidence: z.array(z.string()).default([]),
  /** Arquivos do bundle relacionados. */
  files: z.array(z.string()).default([]),
  /** O item precisa deste runtime para funcionar? */
  runtimeRequired: z.boolean().default(false),
});
export type StackEntry = z.infer<typeof StackEntry>;

// ── Fidelidade V2 ────────────────────────────────────────────────────────────

/**
 * Estado de uma dimensão de fidelidade — mais fino que `SupportLevel`.
 *
 * A diferença que o pedido cobra: `detectado` não é `capturado`, `capturado` não
 * é `associado`, e nada disso é `validado`. "Completo porque o primeiro frame
 * apareceu" deixa de ser expressável.
 */
export const DimensionState = z.enum([
  'detectado',
  'capturado',
  'associado',
  'portatil',
  'runtime-preservado',
  'referencia-visual',
  'replayable',
  'validado',
  'parcial',
  'unsupported',
  'externo',
  'ausente',
]);
export type DimensionState = z.infer<typeof DimensionState>;

/**
 * Fidelidade multidimensional. Cada dimensão diz até onde AQUELA parte chegou.
 * Tudo opcional: um item antigo tem só o selo agregado, e continua válido.
 */
export const FidelityV2 = z
  .object({
    visual: DimensionState,
    estrutura: DimensionState,
    css: DimensionState,
    assets: DimensionState,
    temporal: DimensionState,
    hover: DimensionState,
    click: DimensionState,
    scroll: DimensionState,
    pointer: DimensionState,
    drag: DimensionState,
    keyboard: DimensionState,
    background: DimensionState,
    media: DimensionState,
    animation: DimensionState,
    runtime: DimensionState,
    portability: DimensionState,
    validation: DimensionState,
  })
  .partial();
export type FidelityV2 = z.infer<typeof FidelityV2>;

// ── Validação ────────────────────────────────────────────────────────────────

/** Uma checagem executada no preview real. */
export const ValidationCheck = z.object({
  name: z.string(),
  ok: z.boolean(),
  /** Detalhe em PT-BR quando falhou (ou observação quando passou). */
  detail: z.string().optional(),
  /** Só faz sentido para certa representação. */
  appliesTo: RepresentationType.optional(),
});
export type ValidationCheck = z.infer<typeof ValidationCheck>;

export const ValidationReport = z.object({
  ranAt: z.number().int().positive(),
  representation: RepresentationType,
  checks: z.array(ValidationCheck).default([]),
  /** Erros de console bloqueantes encontrados. */
  consoleErrors: z.array(z.string()).default([]),
  /** Requests externas observadas no preview (devem ser nenhuma ou declaradas). */
  externalRequests: z.array(z.string()).default([]),
  /** Violações de CSP registradas. */
  cspViolations: z.array(z.string()).default([]),
  ok: z.boolean().default(false),
  /** O preview mostrou área preta/vazia sem explicação? */
  telaPreta: z.boolean().default(false),
});
export type ValidationReport = z.infer<typeof ValidationReport>;

// ── Comparação visual ────────────────────────────────────────────────────────

/** Um par comparado, com máscara de regiões dinâmicas e limiar próprio. */
export const VisualComparison = z.object({
  a: z.enum(['original', 'captura', 'bundle', 'preview']),
  b: z.enum(['original', 'captura', 'bundle', 'preview']),
  /**
   * O DONO da comparação: o hash do segmento comparado e a posição dele (o
   * bundle mora em `seg_<position>`).
   *
   * Sem estes campos, a associação era pela ordem do array e exigia
   * `comparações == segmentos com print` — condição medida FALSA em 7 de 7
   * capturas do acervo (itens pulados por orçamento não deixam marca na
   * lista). O resultado: 8 de 10 reprovações gravadas no manifesto e nenhuma
   * chegando à tela. Opcionais porque o acervo antigo não os tem; captura nova
   * sempre escreve os dois.
   */
  segmentHash: z.string().optional(),
  position: z.number().int().nonnegative().optional(),
  /** Região comparada. Ausente = viewport inteira. */
  region: NormalizedBox.optional(),
  /** Natureza da região — decide o limiar. */
  nature: z.enum(['estatica', 'animada', 'video', 'canvas', 'runtime-externo']),
  /** Limiar aplicado (0..1). Diferente por natureza, de propósito. */
  threshold: z.number().min(0).max(1),
  /** Diferença medida (0..1). */
  delta: z.number().min(0).max(1),
  ok: z.boolean(),
  /** Máscaras aplicadas. */
  masked: z.array(NormalizedBox).default([]),
  /**
   * Deslocamento (px) em que a MENOR diferença foi encontrada, quando a busca
   * de alinhamento rodou e achou algo melhor que a posição crua. "A peça está
   * 4 px mais baixa" é dado de enquadramento, não infidelidade.
   */
  offset: z.object({ x: z.number().int(), y: z.number().int() }).optional(),
});
export type VisualComparison = z.infer<typeof VisualComparison>;

// ── Manifesto V2 ─────────────────────────────────────────────────────────────

/** Como a captura correu, e por quê parou onde parou. */
export const CaptureModeV2 = z.enum([
  'completo', // todas as fases rodaram
  'parcial-orcamento', // cortada por tempo/orçamento
  'parcial-cancelado', // AbortSignal
  'degradado-estatico', // sem navegador
]);
export type CaptureModeV2 = z.infer<typeof CaptureModeV2>;

/**
 * O manifesto V2 — a fonte da verdade da captura.
 *
 * Ordem dos campos = ordem do pipeline, de propósito: quem lê o arquivo lê a
 * história da captura de cima para baixo (instrumentação → mapas → tempo →
 * ponteiro → scroll → ações → estados → segmentação → compilação → validação).
 */
export const CaptureManifestV2 = z.object({
  engineVersion: z.literal(2),
  schemaVersion: z.number().int().positive(),
  source: z.object({
    url: z.string().nullable(),
    finalUrl: z.string().nullable().optional(),
    /** `url` renderizada por navegador, `html` colado, `fixture` local. */
    kind: z.enum(['url', 'html', 'fixture']).default('url'),
    capturedAt: z.number().int().positive(),
    /** UA usado (para reproduzir). */
    userAgent: z.string().optional(),
  }),
  captureMode: CaptureModeV2,
  viewport: z.object({
    width: z.number().int(),
    height: z.number().int(),
    deviceScaleFactor: z.number().default(1),
  }),
  /** Altura total da página em px, no fim da captura. */
  pageHeight: z.number().nonnegative().default(0),

  // Instrumentação
  instrumentation: z.object({
    /** A instrumentação entrou ANTES dos scripts da página? */
    beforePageScripts: z.boolean(),
    /** Contagem de listeners por tipo de evento. */
    listenersByType: z.record(z.string(), z.number()).default({}),
    observers: z
      .object({
        intersection: z.number().int().default(0),
        mutation: z.number().int().default(0),
        resize: z.number().int().default(0),
      })
      .default({ intersection: 0, mutation: 0, resize: 0 }),
    /** APIs de animação usadas. */
    animationApis: z.array(z.string()).default([]),
    /** Contextos gráficos criados, por tipo. */
    graphicsContexts: z.record(z.string(), z.number()).default({}),
    shadowRoots: z
      .object({ open: z.number().int(), closed: z.number().int() })
      .default({ open: 0, closed: 0 }),
    /** Nós inseridos dinamicamente, por tag de interesse. */
    dynamicInserts: z.record(z.string(), z.number()).default({}),
    historyChanges: z.number().int().default(0),
    /** Recursos que a instrumentação NÃO conseguiu observar. */
    limitations: z.array(z.string()).default([]),
  }),

  // Mapas
  structuralMap: z.array(StructuralNode).default([]),
  visualLayers: z.array(VisualLayer).default([]),
  backgroundDetections: z.array(BackgroundDetection).default([]),
  mediaDetections: z.array(MediaDetection).default([]),
  runtimeDetections: z.array(RuntimeDetection).default([]),

  // Observação
  temporalObservations: z.array(TemporalObservation).default([]),
  pointerPaths: z.array(PointerPath).default([]),
  pointerResponses: z.array(PointerResponse).default([]),
  scrollPasses: z.array(ScrollViewportPass).default([]),
  /** Comportamentos de scroll no formato portátil já existente (V1 preservado). */
  scrollObservations: z.array(ScrollBehavior).default([]),

  // Ações e estados
  safeActions: z.array(ExecutedAction).default([]),
  blockedActions: z.array(BlockedAction).default([]),
  stateGraph: StateGraph.optional(),

  /** As rampas do site: tamanho de letra, respiro e raio, com peso e papel. */
  designTokens: z.array(DesignToken).default([]),

  // Segmentação e compilação
  segmentEvidence: z.array(SegmentEvidence).default([]),
  /** Representação escolhida por segmento. */
  representations: z.record(z.string(), RepresentationDecision).default({}),
  assets: z.array(CapturedAsset).default([]),
  /** Dependência declarada por segmento: chaves de asset e runtimes. */
  dependencies: z
    .record(
      z.string(),
      z.object({
        assets: z.array(z.string()).default([]),
        runtimes: z.array(z.string()).default([]),
        scripts: z.array(z.string()).default([]),
        fonts: z.array(z.string()).default([]),
      }),
    )
    .default({}),
  stack: z.array(StackEntry).default([]),
  /** Fidelidade por segmento. */
  fidelity: z.record(z.string(), FidelityV2).default({}),
  /** Selo agregado por segmento (reusa o vocabulário do V1 para a Galeria). */
  support: z.record(z.string(), SupportLevel).default({}),
  /** Interações conhecidas por segmento. */
  interactions: z.record(z.string(), z.array(InteractionKind)).default({}),

  // Validação
  validation: z.record(z.string(), ValidationReport).default({}),
  visualComparisons: z.array(VisualComparison).default([]),

  // Meta
  telemetry: TelemetriaRelatorio.optional(),
  confidence: Confidence.default('media'),
  /** Limitações de nível de página, em PT-BR. */
  limitations: z.array(z.string()).default([]),
  /** Por que a captura é parcial, quando for. */
  partialReasons: z.array(z.string()).default([]),
  /** Versão do compilador que produziu os bundles. */
  compilerVersion: z.number().int().positive().optional(),
});
export type CaptureManifestV2 = z.infer<typeof CaptureManifestV2>;

/**
 * Discrimina um manifesto V1 de um V2 sem parse completo — o que permite ler o
 * vault antigo e o novo pelo mesmo caminho. Um manifesto sem `engineVersion` é
 * V1 por definição (o campo nasceu aqui).
 */
export const ehManifestoV2 = (raw: unknown): boolean =>
  typeof raw === 'object' &&
  raw !== null &&
  (raw as { engineVersion?: unknown }).engineVersion === 2;
