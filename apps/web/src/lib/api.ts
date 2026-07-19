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
};

const jsonFetch = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return (await res.json()) as T;
};

export const api = {
  health: () => jsonFetch<HealthResponse>('/health'),
  listDesignSystems: () => jsonFetch<{ items: DesignSystemRecord[] }>('/api/design-systems'),
  getDesignSystem: (id: string) =>
    jsonFetch<{ item: DesignSystemRecord; assetsFaltando: string[] }>(
      `/api/design-systems/${id}`,
    ),
  deleteDesignSystem: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/design-systems/${id}`, { method: 'DELETE' }),
  listSegments: (dsId: string) =>
    jsonFetch<{ items: SegmentRecord[] }>(`/api/design-systems/${dsId}/segments`),
  createDesignSystem: (
    input:
      | { kind: 'url'; url: string; name?: string }
      | { kind: 'html'; html: string; name: string },
  ) =>
    jsonFetch<StartWorkResponse>('/api/design-systems', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  getTask: (id: string) => jsonFetch<{ task: TaskRecord }>(`/api/tasks/${id}`),
  listTasks: () => jsonFetch<{ items: TaskRecord[] }>('/api/tasks'),
  classify: (dsId: string) =>
    jsonFetch<StartWorkResponse>(`/api/design-systems/${dsId}/classify`, { method: 'POST' }),
  listLibrary: () => jsonFetch<{ items: LibraryComponentRecord[] }>('/api/library'),
  addToLibrary: (segmentId: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>('/api/library', {
      method: 'POST',
      body: JSON.stringify({ segmentId }),
    }),
  removeFromLibrary: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/library/${id}`, { method: 'DELETE' }),
  renameComponent: (id: string, name: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>(`/api/library/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  createProject: (input: { name: string }) =>
    jsonFetch<{ task: TaskRecord }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  listProjects: () => jsonFetch<{ items: unknown[] }>('/api/projects'),
};
