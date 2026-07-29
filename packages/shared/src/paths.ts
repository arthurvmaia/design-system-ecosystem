import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
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
/**
 * Saída do motor de exploração (`@ds/explorer`): o manifesto rico da captura por
 * navegador e os assets baixados. Fica separado de `extracted/` porque é
 * material de origem diferente — o snapshot instrumentado, não o HTML reescrito.
 */
export const vaultCaptureDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'capture');
export const vaultCaptureManifest = (id: DesignSystemId): string =>
  join(vaultCaptureDir(id), 'manifest.json');
export const vaultCaptureAssetsDir = (id: DesignSystemId): string =>
  join(vaultCaptureDir(id), 'assets');

/**
 * Saída do motor V2 (`@ds/engine-v2`). Pasta SEPARADA da `capture/` do V1 de
 * propósito: durante a migração os dois motores podem ter rodado no mesmo design
 * system, e comparar V1 com V2 exige que nenhum sobrescreva o outro. O leitor
 * escolhe: existe `capture-v2/manifest.json`? usa o V2; senão, o V1 de sempre.
 */
export const vaultCaptureV2Dir = (id: DesignSystemId): string => join(vaultDsDir(id), 'capture-v2');
export const vaultCaptureV2Manifest = (id: DesignSystemId): string =>
  join(vaultCaptureV2Dir(id), 'manifest.json');
export const vaultCaptureV2AssetsDir = (id: DesignSystemId): string =>
  join(vaultCaptureV2Dir(id), 'assets');
/**
 * Frames guardados pela observação temporal e pelos estados. Ficam fora do
 * manifesto porque são binários e pesados — o manifesto guarda só o caminho
 * relativo, já deduplicado por hash.
 */
export const vaultCaptureV2FramesDir = (id: DesignSystemId): string =>
  join(vaultCaptureV2Dir(id), 'frames');
/** HTML dos nós do grafo de estados (blob por estado, referenciado por `htmlRef`). */
export const vaultCaptureV2StatesDir = (id: DesignSystemId): string =>
  join(vaultCaptureV2Dir(id), 'states');

export const vaultSegmentsDir = (id: DesignSystemId): string => join(vaultDsDir(id), 'segments');
/**
 * Bundle compilado de um segmento — a saída do Design System Compiler:
 * `index.html`, `manifest.json`, `STACK.md`, `assets/**`, `validation.json`.
 * É o que a Biblioteca copia quando o item é curado, e é o que faz o item
 * sobreviver sozinho depois que a extração original for apagada.
 */
export const vaultSegmentBundlesDir = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'bundles');
export const vaultSegmentBundleDir = (id: DesignSystemId, segId: string): string =>
  join(vaultSegmentBundlesDir(id), segId);
export const vaultSegmentsManifest = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'manifest.json');
/**
 * HTML dos estados capturados de um segmento. Fica fora do manifesto de
 * propósito: o manifesto é o índice (leve, lido em toda listagem), e o HTML de
 * cada estado pode ser pesado. Banco/manifesto indexam; o vault guarda o blob.
 */
export const vaultSegmentStatesDir = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'states');
export const vaultSegmentStates = (id: DesignSystemId, segId: string): string =>
  join(vaultSegmentStatesDir(id), `${segId}.json`);
/** Comportamentos de scroll de um segmento (para o preview reproduzir). */
export const vaultSegmentScrollDir = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'scroll');
export const vaultSegmentScroll = (id: DesignSystemId, segId: string): string =>
  join(vaultSegmentScrollDir(id), `${segId}.json`);
/**
 * Registro do que foi validado em navegador (replay executado e conferido).
 * Fica separado dos insights: os insights saem da segmentação; a validação é um
 * passo posterior que promove `replayable` → `validated`.
 */
export const vaultSegmentValidation = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'validation.json');
/** Candidatos que não passaram na validação — o par do manifest. */
export const vaultRejeitadosPath = (id: DesignSystemId): string =>
  join(vaultSegmentsDir(id), 'rejeitados.json');

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

/**
 * Este diretório de design system pode ser apagado do disco?
 *
 * A ÚLTIMA coisa entre um engano e os arquivos de alguém. Mora aqui, e não em
 * quem apaga, porque dois lugares apagam — a rota de exclusão do servidor e o
 * `pnpm acervo:limpar-orfas` — e cada um tinha a sua versão escrita à mão.
 * Duas guardas que precisam concordar acabam discordando, e a que discordar
 * primeiro leva arquivo junto.
 *
 * Duas condições, as duas obrigatórias:
 *
 * - o alvo está DENTRO do vault: não é o próprio vault, não é irmão dele, e não
 *   sobe por `..`;
 * - o nome é um id de design system, e nada mais — `..`, `*`, vazio ou nome com
 *   separador de caminho reprovam.
 */
export const podeApagarDesignSystem = (dir: string, raizDoVault: string, id: string): boolean => {
  if (!/^ds_[A-Za-z0-9]+$/.test(id)) return false;
  const raiz = resolve(raizDoVault);
  const alvo = resolve(dir);
  return alvo !== raiz && alvo.startsWith(raiz + sep);
};

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
