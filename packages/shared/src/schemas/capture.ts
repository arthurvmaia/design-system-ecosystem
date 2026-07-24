import { z } from 'zod';

/**
 * Contratos da captura por navegador e da avaliação de fidelidade.
 *
 * Este arquivo é o coração da mudança de arquitetura: descreve o que o motor de
 * exploração (`@ds/explorer`) produz e como um componente declara, de forma
 * honesta, **até onde ele foi reproduzido**. A regra do usuário é explícita:
 * um componente incompleto não pode se passar por completo — a limitação
 * aparece, não some.
 *
 * Tudo aqui é aditivo e opcional nos schemas existentes. Um manifesto ou
 * metadata gravado antes desta versão continua válido: os campos novos
 * simplesmente não estarão lá.
 */

// ── Fidelidade e suporte ─────────────────────────────────────────────────────

/**
 * Quão fielmente um componente pôde ser reproduzido fora da página de origem.
 * A ordem vai do melhor para o pior e é o rótulo que a Galeria mostra.
 *
 * - `completo`     — HTML/CSS (e estados capturados) reproduzem o componente.
 * - `parcial`      — parte das interações virou estado; parte não pôde.
 * - `visual`       — aparência fiel, mas o comportamento não roda (ex: canvas
 *                    virou imagem, animação de JS não foi reencenada).
 * - `externo`      — depende de um runtime/asset externo não capturado.
 * - `nao-suportado`— não há como reproduzir isoladamente.
 */
export const SupportLevel = z.enum(['completo', 'parcial', 'visual', 'externo', 'nao-suportado']);
export type SupportLevel = z.infer<typeof SupportLevel>;

/** Como o componente pinta na tela. Decide a estratégia de preview e isolamento. */
export const RenderMode = z.enum([
  'html', // HTML + CSS puro
  'html-js', // precisa de JS local para o comportamento
  'canvas', // desenha em <canvas> 2D
  'webgl', // WebGL / Three.js / shaders
  'video', // <video>
  'iframe', // conteúdo embarcado
  'lottie', // animação Lottie (JSON)
  'svg-animado', // SVG com <animate>/SMIL ou CSS
  'misto', // combinação
]);
export type RenderMode = z.infer<typeof RenderMode>;

/** Famílias de interação que a exploração tenta descobrir e reproduzir. */
export const InteractionKind = z.enum([
  'hover',
  'hover-regiao', // hover numa sub-região específica
  'focus',
  'focus-visible',
  'click',
  'toggle', // abre/fecha (accordion, dropdown, menu)
  'tab', // troca de aba
  'carousel', // avança/volta slides
  'modal', // abre overlay em portal
  'tooltip',
  'scroll',
  'viewport', // dispara ao entrar na viewport
  'drag',
  'pointer',
  'timer', // muda sozinho por temporizador
  'dom-mutation', // altera o DOM dinamicamente
  'keyboard',
]);
export type InteractionKind = z.infer<typeof InteractionKind>;

/** Uma interação conhecida do componente e o quanto dela foi reproduzida. */
export const InteractionInfo = z.object({
  kind: InteractionKind,
  support: SupportLevel,
  /** Frase curta em PT-BR para a UI. */
  description: z.string().optional(),
});
export type InteractionInfo = z.infer<typeof InteractionInfo>;

/**
 * Sinais técnicos detectados no componente. Booleans para o consumidor decidir
 * o que exibir. Todos opcionais para tolerar metadata antiga.
 */
export const ComponentCapabilities = z
  .object({
    hasCanvas: z.boolean(),
    hasWebGL: z.boolean(),
    hasVideo: z.boolean(),
    hasIframe: z.boolean(),
    hasLottie: z.boolean(),
    hasAnimatedSvg: z.boolean(),
    hasCssAnimation: z.boolean(),
    /** Referencia um `<script src>` externo (CDN, bundle) não embutido. */
    dependsOnExternalScript: z.boolean(),
    /** O comportamento depende de JavaScript de qualquer origem. */
    dependsOnJs: z.boolean(),
    /** Abre/usa conteúdo renderizado por portal (modal, menu, tooltip). */
    hasPortal: z.boolean(),
  })
  .partial();
export type ComponentCapabilities = z.infer<typeof ComponentCapabilities>;

/**
 * Avaliação de fidelidade de um componente. É o resultado de uma função pura
 * (`assessFidelity`) e o que a Galeria e a Biblioteca usam para o selo e os
 * avisos. Reutilizável em segmento e em componente curado.
 */
export const FidelityAssessment = z.object({
  support: SupportLevel,
  renderMode: RenderMode,
  /** Estimativa 0–100, só para ordenar/expressar confiança. */
  fidelity: z.number().min(0).max(100),
  /** Limitações em PT-BR, prontas para a UI. Vazio = sem ressalvas. */
  warnings: z.array(z.string()),
  capabilities: ComponentCapabilities,
  interactions: z.array(InteractionInfo),
});
export type FidelityAssessment = z.infer<typeof FidelityAssessment>;

// ── Captura por navegador ────────────────────────────────────────────────────

/** Categoria de um asset localizado, para deduplicação e organização em disco. */
export const CapturedAssetKind = z.enum([
  'css',
  'js',
  'font',
  'image',
  'svg',
  'video',
  'json',
  'other',
]);
export type CapturedAssetKind = z.infer<typeof CapturedAssetKind>;

/** Um asset baixado e reescrito, endereçado por conteúdo (sha256). */
export const CapturedAsset = z.object({
  /** URL absoluta original, para auditoria e cache. */
  originalUrl: z.string(),
  /** Caminho relativo dentro da pasta de captura, já deduplicado. */
  localPath: z.string(),
  sha256: z.string(),
  mimeType: z.string(),
  bytes: z.number().int().nonnegative(),
  kind: CapturedAssetKind,
});
export type CapturedAsset = z.infer<typeof CapturedAsset>;

/** O que disparou um estado descoberto. */
export const StateTrigger = z.enum(['initial', 'hover', 'focus', 'click', 'scroll', 'timer']);
export type StateTrigger = z.infer<typeof StateTrigger>;

/**
 * Um estado distinto de um elemento — o DOM depois de uma interação segura.
 * `signature` é o que permite deduplicar: dois cliques que levam ao mesmo
 * estado não viram dois registros.
 */
export const CapturedState = z.object({
  id: z.string(),
  trigger: StateTrigger,
  /** Rótulo em PT-BR (ex: "aberto", "aba 2", "com tooltip"). */
  label: z.string(),
  /** Hash estável do estado, para dedup. */
  signature: z.string(),
  /** HTML do elemento naquele estado. */
  html: z.string(),
  /**
   * HTML de conteúdo relacionado aberto FORA do elemento (portal): o modal, o
   * menu, o tooltip que a interação revelou em outro ponto do DOM.
   */
  portalHtml: z.string().optional(),
});
export type CapturedState = z.infer<typeof CapturedState>;

/** Retângulo na viewport, em CSS px. */
export const Box = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type Box = z.infer<typeof Box>;

/**
 * Assinatura para religar um elemento capturado a um segmento do
 * `design-system.html`. O `ref` (`data-dsx-ref`) vale só dentro da sessão de
 * captura; o que sobrevive entre renders é o id e as classes do elemento. É por
 * eles que o segmenter associa os estados descobertos ao segmento certo.
 */
export const ElementMatch = z.object({
  id: z.string().nullable(),
  classes: z.array(z.string()),
});
export type ElementMatch = z.infer<typeof ElementMatch>;

/** Um elemento interativo descoberto, com seus estados e sua avaliação. */
export const CapturedElement = z.object({
  /** Caminho estável tipo seletor, para religar ao DOM na sessão de captura. */
  ref: z.string(),
  tag: z.string(),
  role: z.string().nullable(),
  box: Box,
  label: z.string(),
  /** Como religar este elemento a um segmento (id/classes). Opcional em manifestos antigos. */
  match: ElementMatch.optional(),
  interactions: z.array(InteractionKind),
  states: z.array(CapturedState),
  assessment: FidelityAssessment,
});
export type CapturedElement = z.infer<typeof CapturedElement>;

/** Uma folha de estilo coletada (inline ou externa já baixada). */
export const CapturedStylesheet = z.object({
  href: z.string().nullable(),
  inline: z.boolean(),
  bytes: z.number().int().nonnegative(),
  /** Caminho local quando foi baixada/salva. */
  localPath: z.string().optional(),
});
export type CapturedStylesheet = z.infer<typeof CapturedStylesheet>;

export const CaptureStats = z.object({
  durationMs: z.number().int().nonnegative(),
  elementsAnalyzed: z.number().int().nonnegative(),
  interactionsTried: z.number().int().nonnegative(),
  statesFound: z.number().int().nonnegative(),
  assetsFound: z.number().int().nonnegative(),
  assetsSaved: z.number().int().nonnegative(),
  assetsBytes: z.number().int().nonnegative(),
});
export type CaptureStats = z.infer<typeof CaptureStats>;

/**
 * O manifesto da captura: a fonte da verdade rica que substitui o único
 * snapshot estático. Gravado em `vault/<ds>/capture/manifest.json`. O segmenter
 * lê quando existe e enriquece os segmentos; quando não existe, cai no
 * comportamento estático de sempre.
 */
/**
 * Como a página foi explorada. `quick` = só render + varredura estática;
 * `deep` = descoberta de estados interativos. A decisão é automática (ver
 * `decidirProfundidade`), e os motivos ficam registrados para auditoria.
 */
export const ExplorationInfo = z.object({
  mode: z.enum(['quick', 'deep']),
  /** Sinais que motivaram a profundidade (canvas, sticky, lottie…). */
  reasons: z.array(z.string()),
  durationMs: z.number().int().nonnegative(),
  /** Limites que foram atingidos (tempo, cliques…). */
  limitsHit: z.array(z.string()).default([]),
  errors: z.array(z.string()).default([]),
});
export type ExplorationInfo = z.infer<typeof ExplorationInfo>;

export const CaptureManifest = z.object({
  version: z.literal(1),
  url: z.string().nullable(),
  capturedAt: z.number().int().positive(),
  strategy: z.enum(['playwright', 'estatico']),
  /** Rápida ou profunda, e por quê. Ausente em manifestos anteriores a esta fase. */
  exploration: ExplorationInfo.optional(),
  viewport: z.object({ width: z.number().int(), height: z.number().int() }),
  stylesheets: z.array(CapturedStylesheet),
  assets: z.array(CapturedAsset),
  elements: z.array(CapturedElement),
  stats: CaptureStats,
  /** Avisos de nível de página (deps não suportadas, limites atingidos). */
  warnings: z.array(z.string()),
});
export type CaptureManifest = z.infer<typeof CaptureManifest>;
