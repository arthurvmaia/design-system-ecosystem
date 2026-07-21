import { z } from 'zod';

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

/** Manifest.json em vault/{ds}/segments/. */
export const SegmentsManifest = z.object({
  designSystemId: z.string().startsWith('ds_'),
  generatedAt: z.number().int().positive(),
  segments: z.array(SegmentRecord),
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
