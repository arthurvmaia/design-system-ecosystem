import { z } from 'zod';
import { FidelityAssessment } from './capture.js';
import {
  Confidence,
  FidelityDimensions,
  InteractionStatus,
  SegmentInteraction,
} from './interaction-support.js';
import { ScrollBehavior } from './scroll.js';

/**
 * Categorias de componente. A lista fica versionada aqui para que o classifier
 * LLM tenha um vocabulário fechado.
 *
 * São dois grupos com origens diferentes:
 *
 * **Seções** (`hero`, `nav`, `pricing`, …) saem de um pedaço real do DOM. É uma
 * fatia da página, do jeito que ela está lá.
 *
 * **Sistemas** (`typography`, `interaction`, e também `button` e `card` quando
 * vêm do segundo passe) não existem como um nó só em lugar nenhum: são
 * varreduras do documento inteiro que juntam o que se repete. A família de
 * botões de um site está espalhada por dez seções; o conjunto tipográfico
 * idem. Reunir isso é o que permite curtir "a tipografia deste site" em vez de
 * curtir vinte títulos soltos.
 */
export const ComponentCategory = z.enum([
  'typography',
  'interaction',
  'background',
  'overlay',
  'hero',
  'header',
  'nav',
  'footer',
  'card',
  'feature',
  'pricing',
  'testimonial',
  'faq',
  'cta',
  'form',
  'button',
  'badge',
  'input',
  'accordion',
  'gallery',
  'stats',
  'logo-cloud',
  'team',
  'timeline',
  'other',
]);
export type ComponentCategory = z.infer<typeof ComponentCategory>;

/** Nível mais alto da taxonomia da galeria. */
export const ComponentKind = z.enum(['component', 'layout', 'animation', 'effect', 'asset']);
export type ComponentKind = z.infer<typeof ComponentKind>;

/**
 * Versão do pipeline de segmentação. Sobe quando a forma dos insights muda de um
 * jeito que a leitura precise saber. Vai gravado em cada insight para que dado
 * antigo continue interpretável (a rota aplica defaults seguros no que faltar).
 */
export const PIPELINE_VERSION = 2;

/** Entrada da tabela segments. Um segmento é um componente candidato antes da curadoria. */
export const SegmentRecord = z.object({
  id: z.string().startsWith('seg_'),
  designSystemId: z.string().startsWith('ds_'),
  category: ComponentCategory,
  kind: ComponentKind,
  name: z.string().min(1),
  htmlSnippet: z.string().min(1),
  previewPath: z.string().nullable(),
  position: z.number().int().nonnegative(),
  inLibrary: z.boolean(),
});
export type SegmentRecord = z.infer<typeof SegmentRecord>;

/**
 * Enriquecimento de um segmento com a avaliação de fidelidade e os estados
 * descobertos. Mora ao lado do `SegmentRecord`, e não dentro dele, de propósito:
 * o `SegmentRecord` é a forma exata da tabela `segments` do SQLite, e misturar
 * campos que a tabela não tem quebraria o insert. A ligação é por `id`.
 *
 * Fica no manifesto (JSON no vault) — nada de coluna nova, nada de migration.
 * A rota de segmentos lê o manifesto e junta isto às linhas do banco na
 * resposta. Manifesto antigo sem `insights` continua válido.
 */
/**
 * Um estado capturado, ligado ao segmento. Metadados só — o HTML de cada estado
 * (que pode ser pesado) fica no vault, em `segments/states/<segId>.json`, e o
 * preview o lê de lá. É a regra do usuário: banco/manifesto como índice, vault
 * como armazenamento do artefato pesado.
 */
export const SegmentState = z.object({
  id: z.string(),
  trigger: z.string(),
  label: z.string(),
  /** Como a reprodução aplica este estado no preview. */
  method: z.enum(['swap-html', 'toggle-class', 'portal', 'css']).optional(),
  /** Este estado abre conteúdo em portal (modal/menu fora da subtree). */
  hasPortal: z.boolean().optional(),
});
export type SegmentState = z.infer<typeof SegmentState>;

/**
 * Um estado capturado COM o HTML — o que o preview precisa para reproduzir.
 * Mora no vault (`segments/states/<segId>.json`), não no manifesto, porque o
 * HTML pode ser pesado. O `SegmentState` (sem HTML) é o índice no manifesto.
 */
export const StoredState = SegmentState.extend({
  /** HTML do elemento naquele estado. */
  html: z.string(),
  /** HTML do conteúdo em portal (modal/menu) que o estado revelou, se houve. */
  portalHtml: z.string().optional(),
});
export type StoredState = z.infer<typeof StoredState>;

/** Arquivo de estados de um segmento no vault. */
export const SegmentStatesFile = z.object({
  segmentId: z.string().startsWith('seg_'),
  generatedAt: z.number().int().positive(),
  states: z.array(StoredState),
});
export type SegmentStatesFile = z.infer<typeof SegmentStatesFile>;

/** Arquivo de comportamentos de scroll de um segmento no vault (para o preview). */
export const SegmentScrollFile = z.object({
  segmentId: z.string().startsWith('seg_'),
  generatedAt: z.number().int().positive(),
  behaviors: z.array(ScrollBehavior),
});
export type SegmentScrollFile = z.infer<typeof SegmentScrollFile>;

/**
 * Versão do validador de preview e do próprio preview. Sobem quando a lógica de
 * reprodução (validador) ou a composição do preview mudam — o que INVALIDA
 * validações antigas por hash (ver `previewHash`).
 */
export const VALIDATOR_VERSION = 1;
export const PREVIEW_VERSION = 2;

/**
 * Resultado de uma validação de reprodução em navegador: qual segmento, qual
 * interação, se passou. É o que promove uma interação de `replayable` para
 * `validated` — só depois que o replay foi executado e conferido de verdade.
 */
export const ResultadoValidacaoSegmento = z.object({
  segmentId: z.string().startsWith('seg_'),
  kind: z.string(),
  ok: z.boolean(),
  detail: z.string().optional(),
});
export type ResultadoValidacaoSegmento = z.infer<typeof ResultadoValidacaoSegmento>;

/**
 * Estado da validação de uma extração. Diferencia honestamente (regra 18): não
 * executada NÃO é "não suportado"; falha NÃO é "não validado".
 */
export const ValidationStatus = z.enum([
  'pendente',
  'em-andamento',
  'concluida',
  'parcial',
  'falha',
  'nao-executada',
]);
export type ValidationStatus = z.infer<typeof ValidationStatus>;

/**
 * Metadados por segmento, para o cache por hash: só revalida quem mudou. O
 * `previewHash` cobre HTML+estados+dependências+versões; se bater, reaproveita.
 */
export const SegmentValidationMeta = z.object({
  segmentId: z.string().startsWith('seg_'),
  previewHash: z.string(),
  validatedAt: z.number().int().positive(),
  durationMs: z.number().int().nonnegative(),
  error: z.string().optional(),
});
export type SegmentValidationMeta = z.infer<typeof SegmentValidationMeta>;

/** validation.json em vault/{ds}/segments/ — o registro do que foi validado em navegador. */
export const SegmentValidationFile = z.object({
  designSystemId: z.string().startsWith('ds_'),
  generatedAt: z.number().int().positive(),
  /** Estado geral da validação desta extração. Default para arquivos antigos. */
  status: ValidationStatus.default('concluida'),
  pipelineVersion: z.number().int().optional(),
  validatorVersion: z.number().int().optional(),
  durationMs: z.number().int().nonnegative().default(0),
  results: z.array(ResultadoValidacaoSegmento),
  /** Meta por segmento (hash/tempo), para o cache. Ausente em arquivos antigos. */
  segments: z.array(SegmentValidationMeta).default([]),
});
export type SegmentValidationFile = z.infer<typeof SegmentValidationFile>;

/** Um elemento relacionado FORA da subtree do segmento (modal em portal, overlay). */
export const RelatedElement = z.object({
  kind: z.enum(['portal', 'overlay', 'externo']),
  label: z.string(),
  /** Estado capturado que o revela, quando houver. */
  stateId: z.string().optional(),
});
export type RelatedElement = z.infer<typeof RelatedElement>;

/** Dependência de runtime/asset que o segmento precisa para se comportar. */
export const SegmentDependency = z.object({
  type: z.enum(['external-script', 'runtime', 'shared-asset', 'font']),
  ref: z.string(),
  /** Nome do runtime (lottie/gsap/three…), quando aplicável. */
  runtime: z.string().optional(),
  /** Já foi embutida no bundle? */
  bundled: z.boolean().default(false),
});
export type SegmentDependency = z.infer<typeof SegmentDependency>;

export const SegmentInsight = FidelityAssessment.extend({
  /** Liga ao `SegmentRecord.id`. */
  segmentId: z.string().startsWith('seg_'),
  /** Estados descobertos pela exploração, quando houve captura por navegador. */
  states: z.array(SegmentState).optional(),
  /**
   * Interações no modelo de pipeline (detected→…→validated). Mais rico que o
   * `interactions` herdado do `FidelityAssessment` (que é só kind+support): aqui
   * cada uma diz onde parou e com que confiança foi associada.
   */
  pipeline: z.array(SegmentInteraction).optional(),
  /** Fidelidade por dimensão. O selo (`support`) é calculado a partir dela. */
  dimensions: FidelityDimensions.optional(),
  /** Comportamentos de scroll associados a este segmento (reveal, parallax…). */
  scroll: z.array(ScrollBehavior).optional(),
  /** Confiança geral da associação captura↔segmento. */
  confidence: Confidence.optional(),
  /** Elementos relacionados fora da subtree (modal em portal, overlay). */
  related: z.array(RelatedElement).optional(),
  /** Dependências de runtime/asset. */
  dependencies: z.array(SegmentDependency).optional(),
  /** Limitações honestas, prontas para a UI. */
  limitations: z.array(z.string()).optional(),
  /** Versão do manifesto de captura que gerou este insight. */
  manifestVersion: z.number().int().optional(),
  /** Versão do pipeline de segmentação (`PIPELINE_VERSION`). */
  pipelineVersion: z.number().int().optional(),
});
export type SegmentInsight = z.infer<typeof SegmentInsight>;

/** Estado mais avançado da interação, exportado para reuso. */
export { InteractionStatus };

/**
 * Uma interação capturada pelo explorer que NÃO pôde ser ligada a nenhum
 * segmento com confiança. Registrada em vez de descartada ou grudada no
 * lugar errado — é o caso para a Revisão/Pendências (seção 3 do pedido).
 */
export const InteracaoNaoAssociada = z.object({
  label: z.string(),
  kind: z.string(),
  motivo: z.string(),
});
export type InteracaoNaoAssociada = z.infer<typeof InteracaoNaoAssociada>;

/**
 * Sinaliza que a CAPTURA saiu parcial por orçamento de tempo — o que a Galeria
 * mostra como "parcial por tempo" em vez de fingir estar completa (regra 10). O
 * que foi capturado é válido; só não é tudo.
 */
export const CapturaParcial = z.object({
  fase: z.string(),
  motivo: z.string().optional(),
  totalMs: z.number().int().nonnegative(),
});
export type CapturaParcial = z.infer<typeof CapturaParcial>;

/** Manifest.json em vault/{ds}/segments/. */
export const SegmentsManifest = z.object({
  designSystemId: z.string().startsWith('ds_'),
  generatedAt: z.number().int().positive(),
  segments: z.array(SegmentRecord),
  /** Avaliações de fidelidade por segmento. Ausente em manifestos antigos. */
  insights: z.array(SegmentInsight).optional(),
  /** Interações capturadas sem associação confiável. Ausente em manifestos antigos. */
  naoAssociados: z.array(InteracaoNaoAssociada).optional(),
  /** Presente quando a captura foi cortada por tempo (extração parcial). */
  capturaParcial: CapturaParcial.optional(),
});
export type SegmentsManifest = z.infer<typeof SegmentsManifest>;

/**
 * Um candidato que NÃO passou na validação e por isso ficou de fora da Galeria.
 *
 * A Galeria é para o que o algoritmo realmente conseguiu interpretar. O que ele
 * não entendeu — um invólucro vazio, um fragmento sem substância, um bloco que
 * não dá para dizer o que é — não some calado: fica aqui, com o motivo, para a
 * pessoa revisar depois. Sites mais novos e fora do padrão vão cair mais aqui, e
 * isso é esperado.
 */
export const RejectedSegment = z.object({
  id: z.string().startsWith('seg_'),
  designSystemId: z.string().startsWith('ds_'),
  category: ComponentCategory,
  kind: ComponentKind,
  name: z.string().min(1),
  htmlSnippet: z.string().min(1),
  position: z.number().int().nonnegative(),
  /** Por que o algoritmo não teve confiança neste bloco. */
  motivos: z.array(z.string()),
});
export type RejectedSegment = z.infer<typeof RejectedSegment>;

/** rejeitados.json em vault/{ds}/segments/ — o par do manifest, para o que ficou de fora. */
export const RejeitadosManifest = z.object({
  designSystemId: z.string().startsWith('ds_'),
  generatedAt: z.number().int().positive(),
  rejeitados: z.array(RejectedSegment),
});
export type RejeitadosManifest = z.infer<typeof RejeitadosManifest>;
