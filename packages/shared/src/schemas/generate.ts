import { z } from 'zod';
import { ProjectLayout } from './layout.js';
import { MediaManifest, ProjectBranding, ProjectContent } from './project.js';

/**
 * O CONTRATO DE GERAÇÃO — um schema só para os dois modos.
 *
 * Antes disto, o payload da fila era um objeto solto montado na rota e o input
 * do modo API era OUTRO formato (sem mídia, sem bundlePath, kit achatado num
 * catálogo de 500 chars): o wizard prometia coisas que um dos modos jogava
 * fora em silêncio. Este schema é a fonte da verdade dos DOIS caminhos — a
 * fila grava exatamente isto no job, e `generateSite` recebe exatamente isto.
 *
 * Jobs antigos (sem `schemaVersion`) continuam válidos: o default carimba a
 * versão 1 na leitura. Campos novos entram SEMPRE como aditivos.
 */
export const GENERATE_SCHEMA_VERSION = 1;

/** Um componente do kit como a geração o consome: com o bundle em disco. */
export const KitComponenteDeGeracao = z.object({
  id: z.string().startsWith('cmp_'),
  name: z.string(),
  category: z.string(),
  kind: z.string(),
  /** Diretório do bundle curado (library/<cmp>/bundle) — a fonte do esqueleto. */
  bundlePath: z.string(),
  /** Design system de origem, para coerência visual na composição. */
  designSystemId: z.string().nullable().optional(),
});
export type KitComponenteDeGeracao = z.infer<typeof KitComponenteDeGeracao>;

export const GeneratePayload = z.object({
  schemaVersion: z.number().int().positive().default(GENERATE_SCHEMA_VERSION),
  projectId: z.string().startsWith('prj_'),
  projectName: z.string().min(1),
  kitId: z.string(),
  kit: z.object({
    id: z.string(),
    name: z.string(),
    components: z.array(KitComponenteDeGeracao).min(1),
  }),
  layout: ProjectLayout,
  blueprintId: z.string().optional(),
  branding: ProjectBranding,
  content: ProjectContent,
  media: MediaManifest.default([]),
});
export type GeneratePayload = z.infer<typeof GeneratePayload>;
