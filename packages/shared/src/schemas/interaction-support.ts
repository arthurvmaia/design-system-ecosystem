import { z } from 'zod';
import { InteractionKind, SupportLevel } from './capture.js';

/**
 * O modelo honesto de "quão longe uma interação chegou".
 *
 * A regra do usuário é explícita: não basta um booleano `hasInteraction`, e
 * `detected` NUNCA pode se passar por `replayable`. Uma interação avança por
 * estados ao longo do pipeline — o explorer percebe, captura, o segmenter
 * associa, o preview reproduz, e só então ela é validada. Cada segmento carrega
 * em que estado cada interação parou, e a Galeria mostra isso sem enfeitar.
 */

/**
 * Estado de uma interação no pipeline. Os cinco primeiros são progressivos
 * (`detected` → … → `validated`); os dois últimos são becos honestos: a
 * interação existe mas não roda aqui.
 */
export const InteractionStatus = z.enum([
  'detected', // o explorer percebeu que existe
  'captured', // estado inicial e posterior registrados
  'associated', // ligada com confiança a um segmento
  'replayable', // há uma reprodução segura no preview
  'validated', // a reprodução foi executada e conferida
  'unsupported', // identificada, mas sem como reproduzir isoladamente
  'external-runtime', // depende de runtime externo ainda não embutido (Lottie, GSAP…)
]);
export type InteractionStatus = z.infer<typeof InteractionStatus>;

/** Ordem de avanço no caminho feliz. Maior = mais longe. Becos = 0. */
export const STATUS_RANK: Record<InteractionStatus, number> = {
  detected: 1,
  captured: 2,
  associated: 3,
  replayable: 4,
  validated: 5,
  unsupported: 0,
  'external-runtime': 0,
};

/** O estado mais avançado entre dois (becos só vencem `detected`). */
export const melhorStatus = (a: InteractionStatus, b: InteractionStatus): InteractionStatus =>
  STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;

/** Rótulo em PT-BR para a UI. */
export const ROTULO_STATUS: Record<InteractionStatus, string> = {
  detected: 'detectada',
  captured: 'capturada',
  associated: 'associada',
  replayable: 'reproduzível',
  validated: 'validada',
  unsupported: 'não suportada',
  'external-runtime': 'runtime externo',
};

/**
 * Famílias de interação que o preview desta fase sabe reproduzir com segurança —
 * troca de estado por classe/atributo, accordion, tabs, dropdown, modal em
 * portal, e o que é puro CSS (hover/focus/animação) que roda por inclusão. O que
 * está fora daqui pode no máximo chegar a `captured`/`associated`, nunca a
 * `replayable`, por mais que tenha sido detectado.
 */
export const KINDS_REPRODUZIVEIS: ReadonlySet<InteractionKind> = new Set<InteractionKind>([
  'hover',
  'hover-regiao',
  'focus',
  'focus-visible',
  'click',
  'toggle',
  'tab',
  'modal',
  'tooltip',
]);

/** Runtimes externos que esta fase reconhece mas ainda não embute. */
export const RUNTIMES_EXTERNOS = ['lottie', 'gsap', 'three', 'webgl', 'canvas'] as const;

/**
 * Interações que rodam por INCLUSÃO do CSS no preview isolado — hover e focus
 * puros. Não precisam de estado capturado nem de JS: o `:hover`/`:focus` do CSS
 * original reproduz o comportamento quando o CSS está presente.
 */
const CSS_NATIVAS: ReadonlySet<InteractionKind> = new Set<InteractionKind>([
  'hover',
  'hover-regiao',
  'focus',
  'focus-visible',
]);

/**
 * Onde uma interação parou no pipeline — a função pura que impede
 * `detected` de se passar por `replayable`. Sobe de estado só quando a condição
 * real foi satisfeita: associada com confiança, com estado capturado (para as
 * de JS) e de uma família que o preview sabe reproduzir.
 */
export const statusDaInteracao = (opts: {
  kind: InteractionKind;
  associated: boolean;
  hasStates: boolean;
  runtime?: string;
}): InteractionStatus => {
  if (opts.runtime) return 'external-runtime';
  if (!opts.associated) return opts.hasStates ? 'captured' : 'detected';
  // Associada. Hover/focus puros rodam pelo próprio CSS — reproduzíveis sem estado.
  if (CSS_NATIVAS.has(opts.kind)) return 'replayable';
  // As de JS precisam do estado capturado para o preview trocar para ele.
  if (!opts.hasStates) return 'associated';
  return KINDS_REPRODUZIVEIS.has(opts.kind) ? 'replayable' : 'associated';
};

/** Confiança de uma associação elemento↔segmento. */
export const Confidence = z.enum(['alta', 'media', 'baixa', 'nenhuma']);
export type Confidence = z.infer<typeof Confidence>;

export const ROTULO_CONFIANCA: Record<z.infer<typeof Confidence>, string> = {
  alta: 'alta',
  media: 'média',
  baixa: 'baixa',
  nenhuma: 'sem associação',
};

/**
 * Uma interação de um segmento: qual é, onde parou no pipeline, com que
 * confiança foi associada e a que estados capturados se liga.
 */
export const SegmentInteraction = z.object({
  kind: InteractionKind,
  status: InteractionStatus,
  confidence: Confidence,
  /** Ids dos estados capturados desta interação (vazio até `captured`). */
  stateIds: z.array(z.string()).default([]),
  /** Runtime externo de que depende, quando `external-runtime`. */
  runtime: z.string().optional(),
  /** Frase curta em PT-BR para a UI. */
  note: z.string().optional(),
});
export type SegmentInteraction = z.infer<typeof SegmentInteraction>;

/**
 * Fidelidade por dimensão. O selo geral é CALCULADO a partir daqui (ver
 * `recomputarSelo`) — nunca o contrário. Todas opcionais para tolerar insights
 * antigos, que só têm o selo agregado.
 */
export const FidelityDimensions = z
  .object({
    visual: SupportLevel,
    estrutura: SupportLevel,
    css: SupportLevel,
    assets: SupportLevel,
    hover: SupportLevel,
    click: SupportLevel,
    scroll: SupportLevel,
    animacao: SupportLevel,
    runtime: SupportLevel,
    portabilidade: SupportLevel,
    validacao: SupportLevel,
  })
  .partial();
export type FidelityDimensions = z.infer<typeof FidelityDimensions>;

/**
 * Resumo do pipeline de interações de um segmento — contagens por estado, para
 * a Galeria mostrar "3 detectadas, 2 reproduzíveis" sem receber o detalhe todo.
 * É o "resumo na listagem" da seção 6 do pedido.
 */
export type PipelineResumo = {
  detected: number;
  captured: number;
  associated: number;
  replayable: number;
  validated: number;
  unsupported: number;
  externalRuntime: number;
  /** Runtimes externos distintos de que o segmento depende. */
  runtimes: string[];
};

export const resumirPipeline = (pipeline: SegmentInteraction[]): PipelineResumo => {
  const r: PipelineResumo = {
    detected: 0,
    captured: 0,
    associated: 0,
    replayable: 0,
    validated: 0,
    unsupported: 0,
    externalRuntime: 0,
    runtimes: [],
  };
  const runtimes = new Set<string>();
  for (const it of pipeline) {
    if (it.status === 'external-runtime') r.externalRuntime++;
    else r[it.status]++;
    if (it.runtime) runtimes.add(it.runtime);
  }
  r.runtimes = [...runtimes];
  return r;
};

/**
 * O selo honesto a partir das dimensões e das interações.
 *
 * `completo` exige que NADA esteja pendente: nenhuma interação detectada sem
 * reprodução, nenhum runtime externo faltando, nenhum asset ainda apontando para
 * a origem. Basta uma ressalva para cair para `parcial` — é a regra do usuário
 * de que COMPLETO não pode aparecer com interação ausente ou asset externo.
 */
export const recomputarSelo = (
  dims: FidelityDimensions,
  interactions: SegmentInteraction[],
): SupportLevel => {
  const valores = Object.values(dims).filter((v): v is z.infer<typeof SupportLevel> => Boolean(v));
  if (valores.includes('nao-suportado')) return 'nao-suportado';
  if (valores.includes('externo') || interactions.some((i) => i.status === 'external-runtime')) {
    return 'externo';
  }

  // Interação detectada/capturada/associada mas ainda NÃO reproduzida derruba o
  // selo: a página tem comportamento que o componente isolado ainda não repete.
  const naoReproduzida = interactions.some(
    (i) => STATUS_RANK[i.status] > 0 && STATUS_RANK[i.status] < STATUS_RANK.replayable,
  );
  if (naoReproduzida) return 'parcial';
  if (valores.includes('visual')) return 'visual';
  if (valores.includes('parcial')) return 'parcial';
  return 'completo';
};
