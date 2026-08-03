import { z } from 'zod';
import { ComponentCategory, ComponentKind } from './segment.js';

/** Entrada da tabela library_components. */
export const LibraryComponentRecord = z.object({
  id: z.string().startsWith('cmp_'),
  segmentId: z.string().startsWith('seg_').nullable(),
  designSystemId: z.string().startsWith('ds_').nullable(),
  category: ComponentCategory,
  kind: ComponentKind,
  name: z.string().min(1),
  bundlePath: z.string().min(1),
  bundleHash: z.string().length(64),
  tokensJson: z.string().nullable(),
  addedAt: z.number().int().positive(),
  notes: z.string().nullable(),
});
export type LibraryComponentRecord = z.infer<typeof LibraryComponentRecord>;
