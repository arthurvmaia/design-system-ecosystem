import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ComponentId, DesignSystemId, ProjectId, TaskId } from './ids.js';

/**
 * Contrato de storage do ecossistema.
 *
 * Toda pasta e arquivo do sistema é resolvido por esta camada.
 * Nunca hardcode paths fora daqui: se a raiz mudar (variável de ambiente,
 * futuro empacotamento Tauri), tudo continua funcionando.
 */

const DEFAULT_ROOT = join(homedir(), 'design-system-ecosystem');

export const getRoot = (): string => {
  return process.env.DS_ECOSYSTEM_ROOT ?? DEFAULT_ROOT;
};

/** Arquivo do índice SQLite. */
export const dbPath = (): string => join(getRoot(), 'ecosystem.db');

/** Config JSON com preferências do usuário. */
export const configPath = (): string => join(getRoot(), 'ecosystem.config.json');

/** Lockfile para impedir dois processos escrevendo. */
export const lockPath = (): string => join(getRoot(), '.lock');

// ── Vault ──────────────────────────────────────────────────────────────────
export const vaultDir = (): string => join(getRoot(), 'vault');
export const vaultDsDir = (id: DesignSystemId): string => join(vaultDir(), id);
export const vaultSourceDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'source');
export const vaultExtractedDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'extracted');
export const vaultSegmentsDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'segments');
export const vaultSegmentsManifest = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'manifest.json');

// ── Library ────────────────────────────────────────────────────────────────
export const libraryDir = (): string => join(getRoot(), 'library');
export const librarySharedDir = (): string => join(libraryDir(), '_shared');
export const librarySharedAssetDir = (sha256: string): string => join(librarySharedDir(), sha256);
export const libraryComponentDir = (id: ComponentId): string => join(libraryDir(), id);
export const libraryComponentBundleDir = (id: ComponentId): string =>
  join(libraryComponentDir(id), 'bundle');
export const libraryComponentPreview = (id: ComponentId): string =>
  join(libraryComponentDir(id), 'preview.png');
export const libraryComponentMetadata = (id: ComponentId): string =>
  join(libraryComponentDir(id), 'metadata.json');
export const libraryComponentTokens = (id: ComponentId): string =>
  join(libraryComponentDir(id), 'tokens.json');

// ── Projects ───────────────────────────────────────────────────────────────
export const projectsDir = (): string => join(getRoot(), 'projects');
export const projectDir = (id: ProjectId): string => join(projectsDir(), id);
export const projectContentDir = (id: ProjectId): string => join(projectDir(id), 'content');
export const projectBrandingDir = (id: ProjectId): string => join(projectDir(id), 'branding');
export const projectMediaDir = (id: ProjectId): string => join(projectDir(id), 'media');
export const projectGeneratedDir = (id: ProjectId): string => join(projectDir(id), 'generated');
export const projectGeneratedVersionDir = (id: ProjectId, isoTimestamp: string): string =>
  join(projectGeneratedDir(id), isoTimestamp);

// ── Cache ──────────────────────────────────────────────────────────────────
export const cacheDir = (): string => join(getRoot(), 'cache');
export const cacheThumbnailsDir = (): string => join(cacheDir(), 'thumbnails');
export const cacheLlmDir = (): string => join(cacheDir(), 'llm');
export const cachePlaywrightDir = (): string => join(cacheDir(), 'playwright');

// ── Workspace ──────────────────────────────────────────────────────────────
export const workspaceDir = (): string => join(getRoot(), 'workspace');
export const workspaceTaskDir = (id: TaskId): string => join(workspaceDir(), id);
export const workspaceTaskInputDir = (id: TaskId): string => join(workspaceTaskDir(id), 'input');
export const workspaceTaskOutputDir = (id: TaskId): string => join(workspaceTaskDir(id), 'output');
export const workspaceTaskManifest = (id: TaskId): string =>
  join(workspaceTaskDir(id), 'task.json');

// ── Fila (modo queue) ──────────────────────────────────────────────────────
/**
 * A fila é o contrato entre o app e quem processa. O app só escreve pedidos;
 * quem executa lê, trabalha e move para `concluido`. Nada aqui dispara trabalho
 * sozinho — é uma caixa de entrada, não um gatilho.
 */
export const queueDir = (): string => join(getRoot(), 'queue');
export const queuePendingDir = (): string => join(queueDir(), 'pendente');
export const queueDoneDir = (): string => join(queueDir(), 'concluido');

/**
 * Lote em processamento: os ids que o PROCESSAR.bat pegou nesta rodada.
 *
 * Existe porque a fila sozinha não diz quanto falta. Ela só sabe o que ainda
 * está pendente — não sabe de quantos aquela rodada partiu, então não dá para
 * calcular porcentagem. Este arquivo guarda o denominador.
 *
 * Fica na raiz de `queue/`, fora de `pendente/` e `concluido/`, para não ser
 * confundido com um job pela listagem.
 */
export const queueLotePath = (): string => join(queueDir(), 'lote.json');

/** Todas as pastas de topo, na ordem que devem ser criadas no bootstrap. */
export const topLevelDirs = (): readonly string[] => [
  getRoot(),
  vaultDir(),
  libraryDir(),
  librarySharedDir(),
  projectsDir(),
  cacheDir(),
  cacheThumbnailsDir(),
  cacheLlmDir(),
  cachePlaywrightDir(),
  workspaceDir(),
  queueDir(),
  queuePendingDir(),
  queueDoneDir(),
];
