import type {
  IdentidadeVerbal,
  LocalDeLogo,
  LogoVariante,
  PaletaDoProjeto,
  RedeSocial,
  TipografiaDoProjeto,
} from '@ds/shared/schemas';

export type HealthResponse = {
  status: 'ok';
  root: string;
  db: { connected: boolean; serverTimeUnix: number };
  anthropicConfigured: boolean;
};

export type DesignSystemRecord = {
  id: string;
  sourceUrl: string | null;
  sourceHash: string;
  extractedAt: number;
  name: string;
  stackJson: string | null;
  status: string;
  vaultPath: string;
  errorMessage: string | null;
};

/** Níveis de suporte que a Galeria mostra como selo. */
export type ComponentSupport = 'completo' | 'parcial' | 'visual' | 'externo' | 'nao-suportado';

export type ComponentInteraction = {
  kind: string;
  support: ComponentSupport;
  description?: string;
};

/** Estado de uma interação no pipeline (detectada → … → validada). */
export type InteractionStatus =
  | 'detected'
  | 'captured'
  | 'associated'
  | 'replayable'
  | 'validated'
  | 'unsupported'
  | 'external-runtime';

export type Confidence = 'alta' | 'media' | 'baixa' | 'nenhuma';

/** Uma interação de um segmento no modelo de pipeline. */
export type SegmentPipelineItem = {
  kind: string;
  status: InteractionStatus;
  confidence: Confidence;
  stateIds: string[];
  runtime?: string;
  note?: string;
};

/** Metadados de um estado capturado (o HTML fica no vault, servido pelo preview). */
export type SegmentStateMeta = {
  id: string;
  trigger: string;
  label: string;
  method?: string;
  hasPortal?: boolean;
};

/** Contagens por estado de interação, para a listagem da Galeria. */
export type PipelineResumo = {
  detected: number;
  captured: number;
  associated: number;
  replayable: number;
  validated: number;
  unsupported: number;
  externalRuntime: number;
  runtimes: string[];
};

/**
 * Avaliação de fidelidade de um segmento. É como a Galeria deixa de esconder a
 * falha: um componente que só saiu visual, ou que depende de JS, diz aqui. Os
 * campos novos (pipeline/estados/dimensões/confiança) chegam quando houve
 * captura profunda; extrações antigas trazem só o básico.
 */
export type SegmentFidelity = {
  support: ComponentSupport;
  renderMode: string;
  fidelity: number;
  warnings: string[];
  interactions: ComponentInteraction[];
  pipeline?: SegmentPipelineItem[];
  states?: SegmentStateMeta[];
  confidence?: Confidence;
  dimensions?: Partial<Record<string, ComponentSupport>>;
  related?: { kind: string; label: string; stateId?: string }[];
  dependencies?: { type: string; ref: string; runtime?: string; bundled?: boolean }[];
  limitations?: string[];
  /** Comportamentos de scroll associados (reveal/parallax/sticky/progress-*). */
  scroll?: { kind: string; scrub?: boolean; pin?: boolean }[];
  /** Print da dobra no momento da captura, relativo a `capture-v2/`. */
  framePath?: string;
};

export type SegmentRecord = {
  id: string;
  designSystemId: string;
  category: string;
  kind: string;
  name: string;
  htmlSnippet: string;
  previewPath: string | null;
  position: number;
  inLibrary: boolean;
  /** Seção pai quando o segmento é um subcomponente dela; null = seção raiz. */
  parentId: string | null;
  /** Presente quando a segmentação gerou avaliação (extrações novas). */
  fidelity?: SegmentFidelity | null;
  /** Resumo das interações por estado (contagens). Presente na listagem nova. */
  resumo?: PipelineResumo | null;
};

export type TaskEvent = { timestamp: number; level: 'info' | 'warn' | 'error'; message: string };

export type TaskRecord = {
  id: string;
  operation: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  input: unknown;
  result: unknown;
  errorMessage: string | null;
  events: TaskEvent[];
};

/** Job da fila, como o servidor devolve no modo `queue`. */
export type QueueJobRef = {
  id: string;
  type: string;
  label: string;
  createdAt: number;
};

/**
 * Resposta das rotas que disparam trabalho.
 *
 * No modo `api` o servidor executa e devolve uma `task` para acompanhar.
 * No modo `queue` ele só registra o pedido em disco e devolve o `job`.
 * Quem consome precisa checar qual dos dois veio — nunca assumir `task`.
 */
export type StartWorkResponse = { task: TaskRecord } | { queued: true; job: QueueJobRef };

export type LibraryComponentRecord = {
  id: string;
  segmentId: string | null;
  designSystemId: string | null;
  category: string;
  kind: string;
  name: string;
  bundlePath: string;
  bundleHash: string;
  tokensJson: string | null;
  addedAt: number;
  notes: string | null;
  /** Etiquetas livres do usuário. Sempre presente (lista vazia quando não há). */
  tags: string[];
};

// ── Kits (Design Systems finais) ─────────────────────────────────────────────

export type KitComponentRef = {
  id: string;
  name: string;
  category: string;
  kind: string;
  position: number;
};

/** Resumo do contrato de um componente do kit (espaços reais de conteúdo). */
export type KitContratoResumo = {
  id: string;
  disponivel: boolean;
  textos: number;
  links: number;
  logos: number;
  midias: { tipo: string }[];
};

export type KitRecord = {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  components: KitComponentRef[];
  /** Projetos que usam este kit — a UI avisa antes de excluir. */
  usedByProjects: Array<{ id: string; name: string }>;
};

export type CreateKitInput = {
  name: string;
  description?: string | null;
  componentIds?: string[];
};

export type UpdateKitInput = {
  name?: string;
  description?: string | null;
  /** Lista completa, na ordem desejada. Substitui a anterior. */
  componentIds?: string[];
};

// ── Impacto (o que quebra ao apagar) ─────────────────────────────────────────

export type DesignSystemImpact = {
  segmentos: number;
  componentesDaBiblioteca: Array<{ id: string; name: string }>;
};

export type LibraryComponentImpact = {
  usadoEmKits: Array<{ id: string; name: string }>;
};

// ── Rejeitados (não passaram na validação; vão para a Revisão) ────────────────

export type RejectedSegment = {
  id: string;
  designSystemId: string;
  category: string;
  kind: string;
  name: string;
  htmlSnippet: string;
  position: number;
  /** Por que o algoritmo não teve confiança neste bloco. */
  motivos: string[];
};

export type RejeitadosGrupo = {
  designSystemId: string;
  designSystemName: string;
  itens: RejectedSegment[];
};

// ── Layout / blueprints ──────────────────────────────────────────────────────

export type LayoutSlot = { role: string; label: string; hint: string; required: boolean };
export type Blueprint = {
  id: string;
  name: string;
  description: string;
  bestFor: string;
  slots: LayoutSlot[];
};
export type CreativeDirection = { id: string; name: string; guidance: string };

export type ProjectLayout = {
  mode: 'blueprint' | 'criativo';
  blueprintId: string;
  disabledRoles: string[];
  density?: 'compacto' | 'equilibrado' | 'espacoso';
  motion?: 'nenhuma' | 'sutil' | 'expressiva';
  preferDesignSystemId?: string | null;
  creativeSeed?: number;
};

// ── Projetos ─────────────────────────────────────────────────────────────────

export type ProjectContent = {
  about?: string;
  slogan?: string;
  cta?: string;
  sections?: Record<string, string>;
  [k: string]: unknown;
};

export type ProjectBranding = {
  brandName?: string;
  tone?: string;
  logoPath?: string | null;
  faviconPath?: string | null;
  palette: {
    primary: string;
    secondary?: string;
    background: string;
    foreground: string;
    accent?: string;
  };
  typography: { display: string; body: string; mono?: string };
  contact?: { email?: string; phone?: string; whatsapp?: string; address?: string };
  social?: Record<string, string>;
  mainCta?: { label?: string; href?: string };
  // ── Campos novos (A5) — aditivos; o shape vem do shared (fonte única) ──
  identidadeVerbal?: IdentidadeVerbal;
  logos?: LogoVariante[];
  logosLocais?: Partial<Record<LocalDeLogo, string>>;
  paleta?: PaletaDoProjeto;
  tipografia?: TipografiaDoProjeto;
  sociais?: RedeSocial[];
};

export type MediaItem = {
  path: string;
  mimeType: string;
  kind: 'image' | 'video' | 'logo' | 'icon' | '3d' | 'lottie' | 'mockup';
  originalName: string;
  alt?: string;
  slotRole?: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  kitId: string | null;
  contentJson: string | null;
  brandingJson: string | null;
  mediaManifestJson: string | null;
  layoutJson: string | null;
  status: string;
};

export type ProjectVersion = { timestamp: string; arquivos: number; bytes: number };

export type MeusProjetosItem = {
  id: string;
  name: string;
  status: string;
  updatedAt: number;
  versoes: ProjectVersion[];
};

export type UpdateProjectInput = {
  name?: string;
  kitId?: string | null;
  content?: ProjectContent;
  branding?: ProjectBranding;
  layout?: ProjectLayout;
};

const jsonFetch = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    // O erro que chega ao toast é o que a PESSOA lê: preferir a mensagem
    // humana que o servidor mandou; nunca despejar status/JSON cru na tela.
    const body = await res.text();
    let mensagem = 'Não deu para concluir agora. Tente de novo em instantes.';
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (typeof parsed.message === 'string' && parsed.message.trim() !== '') {
        mensagem = parsed.message;
      }
    } catch {
      // corpo não-JSON: fica a mensagem genérica
    }
    throw new Error(mensagem);
  }
  return (await res.json()) as T;
};

/**
 * URLs de prévia servidas pelo próprio backend.
 *
 * A prévia é um documento HTML completo montado no server (head real, scripts,
 * atributos do body) e servido com `Content-Security-Policy: sandbox`. O front
 * só aponta um iframe para cá — nada de montar srcDoc no cliente. `bg` força o
 * contraste do fundo no modal de detalhe.
 */
export const previewSegmentUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}${bg ? `?bg=${bg}` : ''}`;
/**
 * Prévia em modo HOVER: reescreve as regras `:hover` do site como classe e as
 * liga num elemento de cada vez. Existe porque `:hover` não se aciona por
 * código, então sem isto o hover só aparecia por acaso.
 */
export const previewSegmentHoverUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}?hover=1${bg ? `&bg=${bg}` : ''}`;
/**
 * O print da dobra, como a captura a viu no site. `framePath` vem do insight e
 * é relativo a `capture-v2/` (ex.: `frames/secao-ab12.png`).
 */
export const frameUrl = (dsId: string, framePath: string): string =>
  `/api/frame/${dsId}/${framePath.replace(/^frames[/\\]/, '')}`;
/**
 * Prévia em modo REPLAY: injeta a barra de interações capturadas e o runtime que
 * reproduz cada estado (com botão Reiniciar). Só faz efeito quando o segmento
 * tem estados no vault; senão cai na prévia limpa.
 */
export const previewSegmentReplayUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}?replay=1${bg ? `&bg=${bg}` : ''}`;
/**
 * Prévia em modo SCROLL: reproduz os comportamentos capturados (reveal,
 * parallax, sticky, progress) com rolagem REAL numa área alta — é onde o
 * usuário VÊ o efeito acontecer em vez de ler que ele existe.
 */
export const previewSegmentScrollUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}?scroll=1${bg ? `&bg=${bg}` : ''}`;
export const previewComponentUrl = (cmpId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/component/${cmpId}${bg ? `?bg=${bg}` : ''}`;
export const previewRejeitadoUrl = (dsId: string, segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/rejeitado/${dsId}/${segId}${bg ? `?bg=${bg}` : ''}`;

/** URL estática de uma versão gerada de um site (iframe de Meus sites / nova aba). */
export const siteUrl = (prjId: string, versao: string): string =>
  `/site/${prjId}/${encodeURIComponent(versao)}/index.html`;

/** URL de download do .zip de uma versão gerada. */
export const downloadUrl = (prjId: string, versao: string): string =>
  `/api/meus-projetos/${prjId}/download?versao=${encodeURIComponent(versao)}`;

export const api = {
  health: () => jsonFetch<HealthResponse>('/health'),

  // ── Design Systems (extrações) ──────────────────────────────────────────
  listDesignSystems: () => jsonFetch<{ items: DesignSystemRecord[] }>('/api/design-systems'),
  getDesignSystem: (id: string) =>
    jsonFetch<{ item: DesignSystemRecord; assetsFaltando: string[] }>(`/api/design-systems/${id}`),
  deleteDesignSystem: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/design-systems/${id}`, { method: 'DELETE' }),
  designSystemImpact: (id: string) =>
    jsonFetch<DesignSystemImpact>(`/api/design-systems/${id}/impacto`),
  listSegments: (dsId: string) =>
    jsonFetch<{
      items: SegmentRecord[];
      capturaParcial?: { fase: string; motivo?: string; totalMs: number };
    }>(`/api/design-systems/${dsId}/segments`),
  deleteSegment: (dsId: string, segId: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/design-systems/${dsId}/segments/${segId}`, {
      method: 'DELETE',
    }),
  /** Excluir vários segmentos da Galeria. Cópias na Biblioteca sobrevivem. */
  deleteSegmentsBatch: (dsId: string, segmentIds: string[]) =>
    jsonFetch<{ deleted: number }>(`/api/design-systems/${dsId}/segments/batch-delete`, {
      method: 'POST',
      body: JSON.stringify({ segmentIds }),
    }),
  createDesignSystem: (
    input:
      | { kind: 'url'; url: string; name?: string }
      | { kind: 'html'; html: string; name: string },
  ) =>
    jsonFetch<StartWorkResponse>('/api/design-systems', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  classify: (dsId: string) =>
    jsonFetch<StartWorkResponse>(`/api/design-systems/${dsId}/classify`, { method: 'POST' }),

  // ── Tasks ───────────────────────────────────────────────────────────────
  getTask: (id: string) => jsonFetch<{ task: TaskRecord }>(`/api/tasks/${id}`),
  listTasks: () => jsonFetch<{ items: TaskRecord[] }>('/api/tasks'),

  // ── Biblioteca ──────────────────────────────────────────────────────────
  listLibrary: () => jsonFetch<{ items: LibraryComponentRecord[] }>('/api/library'),
  getLibraryComponent: (id: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>(`/api/library/${id}`),
  addToLibrary: (segmentId: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>('/api/library', {
      method: 'POST',
      body: JSON.stringify({ segmentId }),
    }),
  /** Curtir vários de uma vez. Idempotente; devolve o que entrou/já estava/sumiu. */
  addToLibraryBatch: (segmentIds: string[]) =>
    jsonFetch<{ added: string[]; already: string[]; missing: string[] }>('/api/library/batch', {
      method: 'POST',
      body: JSON.stringify({ segmentIds }),
    }),
  removeFromLibrary: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/library/${id}`, { method: 'DELETE' }),
  patchComponent: (
    id: string,
    patch: { name?: string; category?: string; notes?: string | null; tags?: string[] },
  ) =>
    jsonFetch<{ item: LibraryComponentRecord }>(`/api/library/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  /** Atalho preservado: renomear é o caso mais comum de PATCH. */
  renameComponent: (id: string, name: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>(`/api/library/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  libraryImpact: (id: string) => jsonFetch<LibraryComponentImpact>(`/api/library/${id}/impacto`),

  // ── Rejeitados (Revisão) ────────────────────────────────────────────────
  listRejeitados: () => jsonFetch<{ grupos: RejeitadosGrupo[]; total: number }>('/api/rejeitados'),
  excluirDaBibliotecaEmLote: (componentIds: string[], confirmarEmUso = false) =>
    jsonFetch<{
      excluidos: string[];
      emUso: { id: string; name: string; kits: string[]; projetos: string[] }[];
      faltando: string[];
    }>('/api/library/excluir-lote', {
      method: 'POST',
      body: JSON.stringify({ componentIds, confirmarEmUso }),
    }),
  recuperarRejeitado: (dsId: string, segId: string) =>
    jsonFetch<{ ok: true; segmentId: string }>(`/api/rejeitados/${dsId}/${segId}/recuperar`, {
      method: 'POST',
    }),
  descartarRejeitado: (dsId: string, segId: string) =>
    jsonFetch<{ ok: true }>(`/api/rejeitados/${dsId}/${segId}`, { method: 'DELETE' }),

  // ── Kits (Design Systems finais) ────────────────────────────────────────
  listKits: () => jsonFetch<{ items: KitRecord[] }>('/api/kits'),
  getKit: (id: string) => jsonFetch<{ item: KitRecord }>(`/api/kits/${id}`),
  getKitContratos: (id: string) =>
    jsonFetch<{ items: KitContratoResumo[] }>(`/api/kits/${id}/contratos`),
  createKit: (input: CreateKitInput) =>
    jsonFetch<{ item: KitRecord }>('/api/kits', { method: 'POST', body: JSON.stringify(input) }),
  updateKit: (id: string, input: UpdateKitInput) =>
    jsonFetch<{ item: KitRecord }>(`/api/kits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteKit: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/kits/${id}`, { method: 'DELETE' }),
  duplicateKit: (id: string) =>
    jsonFetch<{ item: KitRecord }>(`/api/kits/${id}/duplicate`, { method: 'POST' }),

  // ── Projetos ────────────────────────────────────────────────────────────
  getBlueprints: () =>
    jsonFetch<{ items: Blueprint[]; directions: CreativeDirection[] }>('/api/projects/blueprints'),
  listProjects: () => jsonFetch<{ items: ProjectRecord[] }>('/api/projects'),
  getProject: (id: string) => jsonFetch<{ item: ProjectRecord }>(`/api/projects/${id}`),
  /** Cria um rascunho. NÃO gera nada — só nome + kit. */
  createProject: (input: { name: string; kitId?: string | null }) =>
    jsonFetch<{ item: ProjectRecord }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateProject: (id: string, patch: UpdateProjectInput) =>
    jsonFetch<{ item: ProjectRecord }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  duplicateProject: (id: string) =>
    jsonFetch<{ item: ProjectRecord }>(`/api/projects/${id}/duplicate`, { method: 'POST' }),
  deleteProject: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  /** Dispara a geração do site a partir do rascunho já salvo. */
  generateProject: (id: string) =>
    jsonFetch<StartWorkResponse & { projectId?: string }>(`/api/projects/${id}/generate`, {
      method: 'POST',
    }),
  /** Upload de mídia (multipart). Não passa por jsonFetch: o corpo é FormData. */
  uploadMedia: async (
    id: string,
    file: File,
    meta: { kind: MediaItem['kind']; slotRole?: string; alt?: string },
  ): Promise<{ item: MediaItem; media: MediaItem[] }> => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', meta.kind);
    if (meta.slotRole) form.append('slotRole', meta.slotRole);
    if (meta.alt) form.append('alt', meta.alt);
    const res = await fetch(`/api/projects/${id}/media`, { method: 'POST', body: form });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
    return res.json();
  },
  /** Move a mídia de seção. `slotRole: null` devolve para "o gerador decide". */
  updateMedia: (id: string, path: string, patch: { slotRole: string | null }) =>
    jsonFetch<{ media: MediaItem[] }>(`/api/projects/${id}/media`, {
      method: 'PATCH',
      body: JSON.stringify({ path, ...patch }),
    }),
  deleteMedia: (id: string, path: string) =>
    jsonFetch<{ deleted: boolean; media: MediaItem[] }>(
      `/api/projects/${id}/media?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
    ),

  // ── Meus sites (versões geradas em disco) ───────────────────────────────
  listMeusProjetos: () => jsonFetch<{ items: MeusProjetosItem[] }>('/api/meus-projetos'),
  meusProjetosContagem: () => jsonFetch<{ total: number }>('/api/meus-projetos/contagem'),
  abrirPasta: (id: string) =>
    jsonFetch<{ ok: boolean }>(`/api/meus-projetos/${id}/abrir-pasta`, { method: 'POST' }),
};
