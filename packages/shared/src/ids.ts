import { ulid } from 'ulid';

/**
 * IDs no ecossistema são ULIDs:
 * - Ordenáveis lexicograficamente
 * - Contêm timestamp em ms
 * - Sem colisão prática
 * - Curtos (26 caracteres)
 *
 * Prefixamos por tipo para leitura humana em logs e no filesystem.
 */

export type DesignSystemId = `ds_${string}`;
export type SegmentId = `seg_${string}`;
export type ComponentId = `cmp_${string}`;
export type KitId = `kit_${string}`;
export type ProjectId = `prj_${string}`;
export type TaskId = `task_${string}`;
/**
 * Uma seção do site que o usuário montou.
 *
 * Precisa de id próprio porque nome e posição são dele: ele renomeia "Abertura"
 * para "Comece por aqui" e arrasta a seção para o fim da página. A mídia enviada
 * e o texto escrito se penduram no id, então sobrevivem aos dois.
 */
export type SectionId = `sec_${string}`;

export const newDesignSystemId = (): DesignSystemId => `ds_${ulid()}`;
export const newSegmentId = (): SegmentId => `seg_${ulid()}`;
export const newComponentId = (): ComponentId => `cmp_${ulid()}`;
export const newKitId = (): KitId => `kit_${ulid()}`;
export const newProjectId = (): ProjectId => `prj_${ulid()}`;
export const newTaskId = (): TaskId => `task_${ulid()}`;
export const newSectionId = (): SectionId => `sec_${ulid()}`;

const PREFIXES = ['ds_', 'seg_', 'cmp_', 'kit_', 'prj_', 'task_', 'sec_'] as const;

export const isValidId = (value: string): boolean => {
  return PREFIXES.some((p) => value.startsWith(p)) && value.length === 30;
};
