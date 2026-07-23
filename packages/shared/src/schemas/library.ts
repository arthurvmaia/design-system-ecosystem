import { z } from 'zod';
import { FidelityAssessment } from './capture.js';
import { ComponentCategory, ComponentKind } from './segment.js';

/** Tipos de dependência de um componente da library. */
export const DependencyType = z.enum(['font', 'image', 'svg', 'js-lib', 'css-lib', 'shared-asset']);
export type DependencyType = z.infer<typeof DependencyType>;

export const ComponentDependency = z.object({
  componentId: z.string().startsWith('cmp_'),
  depType: DependencyType,
  depPath: z.string().nullable(),
  depUrl: z.string().url().nullable(),
});
export type ComponentDependency = z.infer<typeof ComponentDependency>;

/** Tokens extraídos de um componente durante isolamento. */
export const ComponentTokens = z.object({
  colors: z.record(z.string(), z.string()).optional(),
  spacing: z.record(z.string(), z.string()).optional(),
  radii: z.record(z.string(), z.string()).optional(),
  typography: z
    .object({
      families: z.record(z.string(), z.string()).optional(),
      sizes: z.record(z.string(), z.string()).optional(),
      weights: z.record(z.string(), z.string()).optional(),
    })
    .optional(),
  shadows: z.record(z.string(), z.string()).optional(),
});
export type ComponentTokens = z.infer<typeof ComponentTokens>;

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

/** Metadata.json escrito em library/{cmp_id}/. */
export const ComponentMetadata = z.object({
  id: z.string().startsWith('cmp_'),
  name: z.string(),
  category: ComponentCategory,
  kind: ComponentKind,
  origin: z.object({
    designSystemId: z.string().startsWith('ds_').nullable(),
    segmentId: z.string().startsWith('seg_').nullable(),
    sourceUrl: z.string().url().nullable(),
  }),
  addedAt: z.number().int().positive(),
  tags: z.array(z.string()),
  notes: z.string().nullable(),
  bundleHash: z.string().length(64),
  /**
   * Avaliação de fidelidade do componente (selo + avisos + interações). Opcional
   * para tolerar bundles gravados antes desta versão. É o que cumpre a regra de
   * "não esconder a falha": um componente que só saiu como visual diz isso aqui.
   */
  fidelity: FidelityAssessment.optional(),
  /**
   * Dependências técnicas conhecidas (libs, fontes, scripts externos) que o
   * componente precisa e que podem não estar embutidas. Ausente = sem deps
   * declaradas.
   */
  dependencies: z
    .array(
      z.object({
        type: z.enum(['font', 'image', 'svg', 'js-lib', 'css-lib', 'script', 'shared-asset']),
        ref: z.string(),
        bundled: z.boolean(),
      }),
    )
    .optional(),
});
export type ComponentMetadata = z.infer<typeof ComponentMetadata>;

/** Metadata.json escrito em library/_shared/{sha256}/. */
export const SharedAssetMetadata = z.object({
  sha256: z.string().length(64),
  mimeType: z.string(),
  originalName: z.string(),
  size: z.number().int().positive(),
  referencedBy: z.array(z.string().startsWith('cmp_')),
});
export type SharedAssetMetadata = z.infer<typeof SharedAssetMetadata>;
