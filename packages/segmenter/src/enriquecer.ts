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

export type OpcoesDimensoes = { temAssetExterno?: boolean };

/**
 * Monta as dimensões de fidelidade. Visual/estrutura/css são fortes (temos o DOM
 * real e o CSS isolado); assets/portabilidade dependem do que o segmento
 * referencia (texto puro é portátil; imagem da origem, não); validação fica de
 * fora quando não houve execução conferida.
 */
export const montarDimensoes = (
  base: SegmentInsight,
  enr: EnriquecimentoSegmento,
  opts: OpcoesDimensoes = {},
): FidelityDimensions => {
  const caps = base.capabilities;
  const temRuntimeExterno = enr.pipeline.some((i) => i.status === 'external-runtime');
  const externos = opts.temAssetExterno ?? false;

  const animacao: SupportLevel = caps.hasLottie
    ? 'externo'
    : caps.hasWebGL || caps.hasCanvas
      ? 'externo'
      : 'completo'; // CSS puro/estático roda por inclusão do keyframe no preview

  const dims: FidelityDimensions = {
    visual: 'completo',
    estrutura: 'completo',
    css: 'completo',
    // Asset da origem não é portátil (regra da seção 10); sem asset, é completo.
    assets: externos ? 'externo' : 'completo',
    animacao,
    runtime: temRuntimeExterno || caps.dependsOnExternalScript ? 'externo' : 'completo',
    portabilidade: externos ? 'parcial' : 'completo',
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
export const enriquecerInsight = (
  base: SegmentInsight,
  enr: EnriquecimentoSegmento | undefined,
  manifestVersion: number | undefined,
  opts: OpcoesDimensoes = {},
): SegmentInsight => {
  if (!enr || (enr.pipeline.length === 0 && enr.states.length === 0)) {
    return { ...base, pipelineVersion: PIPELINE_VERSION, manifestVersion };
  }

  const dims = montarDimensoes(base, enr, opts);
  const support = recomputarSelo(dims, enr.pipeline);
  const limitations = [...new Set([...base.warnings, ...enr.limitations])];

  return {
    ...base,
    support,
    states: enr.states,
    pipeline: enr.pipeline,
    dimensions: dims,
    confidence: enr.confidence,
    related: enr.related.length > 0 ? enr.related : undefined,
    dependencies: enr.dependencies.length > 0 ? enr.dependencies : undefined,
    limitations: limitations.length > 0 ? limitations : undefined,
    warnings: limitations,
    manifestVersion,
    pipelineVersion: PIPELINE_VERSION,
  };
};
