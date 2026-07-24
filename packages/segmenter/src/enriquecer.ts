import type {
  FidelityDimensions,
  InteractionKind,
  InteractionStatus,
  SegmentInsight,
  SegmentInteraction,
  SupportLevel,
} from '@ds/shared';
import { PIPELINE_VERSION, recomputarSelo } from '@ds/shared';
import type { EnriquecimentoSegmento } from './associar.js';

/**
 * Transforma a avaliação estática de um segmento + o que a associação trouxe do
 * manifesto num insight honesto: fidelidade POR DIMENSÃO e o selo geral
 * recalculado a partir delas. É a regra da seção 10 do pedido — `completo` não
 * pode aparecer com interação detectada e não reproduzida ou asset externo.
 *
 * Puro e testável: recebe dados, devolve o insight final.
 */

/** O nível que um status de interação representa numa dimensão. */
const NIVEL_DO_STATUS: Record<InteractionStatus, SupportLevel> = {
  validated: 'completo',
  replayable: 'completo',
  associated: 'parcial',
  captured: 'parcial',
  detected: 'visual',
  'external-runtime': 'externo',
  unsupported: 'nao-suportado',
};

const RANK_SUPPORT: Record<SupportLevel, number> = {
  completo: 4,
  parcial: 3,
  visual: 2,
  externo: 1,
  'nao-suportado': 0,
};

/** O melhor (mais completo) entre dois níveis. */
const melhorNivel = (a: SupportLevel, b: SupportLevel): SupportLevel =>
  RANK_SUPPORT[a] >= RANK_SUPPORT[b] ? a : b;

/** A que dimensão cada família de interação pertence. */
const EIXO: Partial<Record<InteractionKind, keyof FidelityDimensions>> = {
  hover: 'hover',
  'hover-regiao': 'hover',
  focus: 'hover',
  'focus-visible': 'hover',
  click: 'click',
  toggle: 'click',
  tab: 'click',
  modal: 'click',
  tooltip: 'hover',
  scroll: 'scroll',
  viewport: 'scroll',
};

/** O melhor nível das interações que caem num dado eixo. */
const nivelDoEixo = (
  eixo: keyof FidelityDimensions,
  pipeline: SegmentInteraction[],
): SupportLevel | undefined => {
  const relevantes = pipeline.filter((i) => EIXO[i.kind] === eixo);
  if (relevantes.length === 0) return undefined;
  return relevantes.map((i) => NIVEL_DO_STATUS[i.status]).reduce(melhorNivel);
};

/**
 * Detecta se um segmento referencia asset EXTERNO (imagem, fonte, mídia da
 * origem). É o que impede `completo` pela regra da seção 10 — asset apontando
 * para a origem não é portátil. Segmento de texto/DOM puro não tem isso.
 */
export const temAssetExterno = (html: string): boolean =>
  /<img[\s>]|<video[\s>]|<source[\s>]|\bsrcset\s*=|\bsrc\s*=|url\(|background-image|@font-face/i.test(
    html,
  );

export type OpcoesDimensoes = {
  /** Quantos assets do segmento têm cópia local no vault. */
  assetsLocais?: number;
  /** Quantos assets do segmento seguem externos (não localizados). */
  assetsExternos?: number;
  /** Fallback heurístico quando não há índice de assets (extração antiga/rápida). */
  temAssetExterno?: boolean;
};

/**
 * Monta as dimensões de fidelidade. Visual/estrutura/css são fortes (temos o DOM
 * real e o CSS isolado); `assets`/`portabilidade` saem da localização REAL (quantos
 * assets viraram locais x quantos seguem na origem); validação fica de fora quando
 * não houve execução conferida.
 */
export const montarDimensoes = (
  base: SegmentInsight,
  enr: EnriquecimentoSegmento,
  opts: OpcoesDimensoes = {},
): FidelityDimensions => {
  const caps = base.capabilities;
  const temRuntimeExterno = enr.pipeline.some((i) => i.status === 'external-runtime');
  const externos = opts.assetsExternos ?? (opts.temAssetExterno ? 1 : 0);
  const locais = opts.assetsLocais ?? 0;

  const animacao: SupportLevel = caps.hasLottie
    ? 'externo'
    : caps.hasWebGL || caps.hasCanvas
      ? 'externo'
      : 'completo'; // CSS puro/estático roda por inclusão do keyframe no preview

  // Assets locais → portátil; algum externo → parcial; só externos → externo;
  // nenhum asset → completo (nada a carregar).
  const assets: SupportLevel = externos > 0 ? (locais > 0 ? 'parcial' : 'externo') : 'completo';

  const dims: FidelityDimensions = {
    visual: 'completo',
    estrutura: 'completo',
    css: 'completo',
    assets,
    animacao,
    runtime: temRuntimeExterno || caps.dependsOnExternalScript ? 'externo' : 'completo',
    portabilidade: externos > 0 ? 'parcial' : 'completo',
  };

  const hover = nivelDoEixo('hover', enr.pipeline);
  const click = nivelDoEixo('click', enr.pipeline);
  const scroll = nivelDoEixo('scroll', enr.pipeline);
  if (hover) dims.hover = hover;
  if (click) dims.click = click;
  if (scroll) dims.scroll = scroll;
  return dims;
};

/**
 * O insight final de um segmento COM captura associada. Quando não houve captura
 * (`enr` ausente), devolve o base só carimbando a versão do pipeline.
 */
const ENR_VAZIO: EnriquecimentoSegmento = {
  states: [],
  storedStates: [],
  pipeline: [],
  related: [],
  dependencies: [],
  confidence: 'nenhuma',
  limitations: [],
};

export const enriquecerInsight = (
  base: SegmentInsight,
  enr: EnriquecimentoSegmento | undefined,
  manifestVersion: number | undefined,
  opts: OpcoesDimensoes = {},
): SegmentInsight => {
  const temInteracao = enr !== undefined && (enr.pipeline.length > 0 || enr.states.length > 0);
  const temAssetInfo = opts.assetsLocais !== undefined || opts.assetsExternos !== undefined;
  // Sem interação E sem índice de assets (extração antiga/rápida): só carimba a
  // versão, preservando o dado antigo.
  if (!temInteracao && !temAssetInfo) {
    return { ...base, pipelineVersion: PIPELINE_VERSION, manifestVersion };
  }

  const e = enr ?? ENR_VAZIO;
  const dims = montarDimensoes(base, e, opts);
  const support = recomputarSelo(dims, e.pipeline);
  const limitations = [...new Set([...base.warnings, ...e.limitations])];

  return {
    ...base,
    support,
    states: e.states.length > 0 ? e.states : undefined,
    pipeline: e.pipeline.length > 0 ? e.pipeline : undefined,
    dimensions: dims,
    confidence: e.confidence !== 'nenhuma' ? e.confidence : undefined,
    related: e.related.length > 0 ? e.related : undefined,
    dependencies: e.dependencies.length > 0 ? e.dependencies : undefined,
    limitations: limitations.length > 0 ? limitations : undefined,
    warnings: limitations,
    manifestVersion,
    pipelineVersion: PIPELINE_VERSION,
  };
};
