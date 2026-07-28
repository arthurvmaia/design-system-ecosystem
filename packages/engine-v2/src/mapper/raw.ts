/**
 * O contrato entre o que roda DENTRO da página (`collectors.ts`, strings) e o que
 * roda no Node (`build-maps.ts`, tipado e testável).
 *
 * Existe pelo mesmo motivo que o `ElementDescriptor` do V1 existe: o coletor
 * in-page não pode importar tipos, então o formato precisa estar escrito em algum
 * lugar que o compilador verifique do lado de cá. Toda mudança no coletor tem de
 * aparecer aqui, ou o typecheck acusa.
 *
 * Os `ref` são índices da sessão de coleta. O hash estável nasce no Node
 * (`montarFingerprint`), para a lógica de identidade viver num só lugar.
 */

export type BoxPx = { x: number; y: number; w: number; h: number };

export type RawStacking = {
  zIndex: string;
  createsContext: boolean;
  position: string;
  opacity: number;
  transform: string;
  filter: string;
  backdropFilter: string;
  mixBlendMode: string;
  isolation: string;
  mask: string;
  clipPath: string;
  overflow: string;
  pointerEvents: string;
};

/** Um nó emitido pelo percurso. */
export type RawNode = {
  ref: number;
  realm: 'document' | 'shadow-open';
  parentRef: number | null;
  depth?: number;
  tag: string;
  role: string | null;
  aria: Record<string, string>;
  dataAttrs: Record<string, string>;
  id: string | null;
  classes: string[];
  text: string;
  ownText: string;
  subtreeTextLength: number;
  semanticAncestor: string | null;
  siblingIndex: number;
  structuralSignature: string;
  /**
   * Campos de SEGURANÇA, consumidos pela política do V1 (`ehSeguroClicar`).
   * `href` vem CRU de propósito: decidir mesma-origem exige a URL como está no
   * DOM, e sanitizar antes tiraria o que a decisão precisa.
   */
  href: string | null;
  tipo: string | null;
  tabindex: number | null;
  download: boolean;
  targetBlank: boolean;
  desabilitado: boolean;
  /** Papel estrutural, já decidido in-page (tem acesso ao CSSOM). */
  papel: string;
  /** Papel da camada visual. */
  camada: string;
  visivel: boolean;
  areaShare: number;
  box: BoxPx;
  pageBox: BoxPx;
  normalizedBox: BoxPx;
  midiaTags: string[];
  listeners: string[];
  cursor: string;
  observadoPorIntersection: boolean;
  temShadow: boolean;
  stacking: RawStacking;
  pseudo: Array<'before' | 'after'>;
  animationName: string;
  animationDuration: string;
  transitionProperty: string;
  transitionDuration: string;
};

export type RawBackground = {
  ref: number;
  source: string;
  cssValue: string;
  assetUrls: string[];
  variables: Record<string, string>;
  /** O CSS DECLARA animação — ainda não é prova de movimento. */
  declaraAnimacao: boolean;
  cobreSecao: boolean;
  camada: string;
  zIndex: string;
};

export type RawMedia = {
  ref: number;
  tag: string;
  kind?: string;
  asBackground: boolean;
  src?: string;
  sources?: string[];
  poster?: string;
  playback?: {
    autoplay: boolean;
    muted: boolean;
    loop: boolean;
    controls: boolean;
    playsInline: boolean;
    rate: number;
    objectFit?: string;
    objectPosition?: string;
  };
  intrinsic?: { width: number; height: number };
  readyState?: number;
  paused?: boolean;
  contextoDetectado?: string;
  formatoPorExtensao?: string;
  temSmil?: boolean;
  markupBytes?: number;
  mesmaOrigem?: boolean;
};

export type RawColeta = {
  nos: RawNode[];
  backgrounds: RawBackground[];
  midias: RawMedia[];
  viewport: { width: number; height: number; deviceScaleFactor: number };
  scroll: { x: number; y: number };
  pageHeight: number;
  truncado: boolean;
};

export type RawRuntime = {
  kind: string;
  label: string;
  evidence: string[];
  scripts: string[];
  version: string;
};

export type RawInstrumentacao = {
  listenersPorTipo: Record<string, number>;
  observers: { intersection: number; mutation: number; resize: number };
  animationApis: string[];
  graphicsContexts: Record<string, number>;
  shadowRoots: { open: number; closed: number };
  shadowFechados: number;
  dynamicInserts: Record<string, number>;
  midiaDinamicaCount: number;
  historyChanges: number;
  rafCount: number;
  rafOrigens: Array<{ url: string; chamadas: number }>;
  animacoesCss: Record<string, number>;
  transicoes: Record<string, number>;
  bloqueados: Array<{ motivo: string; alvo: string }>;
  falhas: string[];
  runtimes: RawRuntime[];
  scripts: string[];
};

/** Assinatura do estado da página (para o grafo e para conferir a restauração). */
export type RawAssinaturaEstado = {
  htmlHash: string;
  htmlBytes: number;
  nodeCount: number;
  htmlClasses: string;
  bodyClasses: string;
  bodyStyle: string;
  overflow: string;
  overlays: Array<{ ref: string | null; tag: string; classes: string; box: BoxPx }>;
  expandidos: number;
  selecionados: number;
  /** Quantos `<details open>` — estado sem ARIA que o hash de HTML não pega. */
  detalhesAbertos: number;
  focado: string;
  scrollY: number;
  scrollX: number;
};

/** Uma medida de elemento, para detectar reação. */
export type RawMedida = {
  transform: string;
  opacity: string;
  filter: string;
  backgroundColor: string;
  backgroundImage: string;
  backgroundPosition: string;
  color: string;
  boxShadow: string;
  borderColor: string;
  classes: string;
  childCount: number;
  textLen: number;
  box: BoxPx;
  visivel: boolean;
  animacoes: number;
  cursor: string;
};

export type RawAlvoNoPonto = {
  ref: number | null;
  refAncestral: number | null;
  tag: string;
  cursor: string;
  pointerEvents: string;
  emShadow: boolean;
  box: BoxPx;
  normalizedBox: BoxPx;
};

export type RawCss = {
  /** Posição na ordem do documento — a ordem é a cascata. Ausente em coletas antigas. */
  ordem?: number;
  /** De onde veio: 'style' | 'link' | 'cssom' | 'adopted' | 'shadow'. Ausente em coletas antigas. */
  origem?: string;
  href: string | null;
  inline: boolean;
  content?: string;
  viaCssom?: boolean;
};

export type RawJsInline = {
  type: string;
  module: boolean;
  /** JSON-LD, importmap, config — DADOS, nunca script executável. */
  dados: boolean;
  bytes: number;
  content: string;
  async: boolean;
  defer: boolean;
  ordem: number;
};
