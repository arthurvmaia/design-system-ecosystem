import { z } from 'zod';

/**
 * Kit — o Design System FINAL.
 *
 * A Biblioteca é o acervo: tudo que você já curou, de qualquer site, misturado.
 * O kit é a curadoria da curadoria: um conjunto nomeado e coerente de
 * componentes que representa as decisões de UMA identidade — e é dele que um
 * site é gerado.
 *
 * Um usuário tem quantos kits quiser; o mesmo componente da Biblioteca pode
 * estar em vários kits.
 */
export const KitRecord = z.object({
  id: z.string().startsWith('kit_'),
  name: z.string().min(1),
  description: z.string().nullable(),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});
export type KitRecord = z.infer<typeof KitRecord>;

export const KitComponentLink = z.object({
  kitId: z.string().startsWith('kit_'),
  componentId: z.string().startsWith('cmp_'),
  position: z.number().int().nonnegative(),
});
export type KitComponentLink = z.infer<typeof KitComponentLink>;

export const CreateKitInput = z.object({
  name: z.string().min(1).max(80),
  description: z.string().max(400).nullable().optional(),
  componentIds: z.array(z.string().startsWith('cmp_')).default([]),
});
export type CreateKitInput = z.infer<typeof CreateKitInput>;

export const UpdateKitInput = z.object({
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(400).nullable().optional(),
  /** Lista completa, na ordem desejada. Substitui a anterior. */
  componentIds: z.array(z.string().startsWith('cmp_')).optional(),
});
export type UpdateKitInput = z.infer<typeof UpdateKitInput>;
