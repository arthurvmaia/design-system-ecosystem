import { z } from 'zod';

/** Estado do processamento de um design system, do upload até estar pronto na galeria. */
export const DesignSystemStatus = z.enum([
  'pending',
  'extracting',
  'extracted',
  'segmenting',
  'segmented',
  'classifying',
  'ready',
  'failed',
]);
export type DesignSystemStatus = z.infer<typeof DesignSystemStatus>;

/** Entrada da tabela design_systems. */
export const DesignSystemRecord = z.object({
  id: z.string().startsWith('ds_'),
  sourceUrl: z.string().url().nullable(),
  sourceHash: z.string().length(64),
  extractedAt: z.number().int().positive(),
  name: z.string().min(1),
  stackJson: z.string().nullable(),
  status: DesignSystemStatus,
  vaultPath: z.string().min(1),
  errorMessage: z.string().nullable().optional(),
});
export type DesignSystemRecord = z.infer<typeof DesignSystemRecord>;

/** Input para criar um design system a partir de um arquivo HTML ou URL. */
export const CreateDesignSystemInput = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('url'),
    url: z.string().url(),
    name: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('html'),
    html: z.string().min(1),
    name: z.string().min(1),
  }),
]);
export type CreateDesignSystemInput = z.infer<typeof CreateDesignSystemInput>;

/** Item que entra no STACK.md gerado pelo extractor. */
export const StackItem = z.object({
  name: z.string(),
  description: z.string(),
});
export type StackItem = z.infer<typeof StackItem>;

export const StackManifest = z.array(StackItem);
export type StackManifest = z.infer<typeof StackManifest>;
