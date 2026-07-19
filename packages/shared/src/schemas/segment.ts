import { z } from 'zod';

/**
 * Categorias de componente. Correspondem à sidebar da galeria no mockup.
 * A lista fica versionada aqui para que o classifier LLM tenha um vocabulário fechado.
 */
export const ComponentCategory = z.enum([
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
