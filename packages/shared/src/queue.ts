import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { ehJobId, queueDoneDir, queueLotePath, queuePendingDir } from './paths.js';
import type { QueueJob, QueueJobType } from './schemas/queue.js';

/** Operações de fila. Puro sistema de arquivos — sem processo, sem watcher, sem daemon. */

/**
 * O id do job vira NOME DE ARQUIVO em `queue/`, e as quatro funções abaixo o
 * concatenam por conta própria (não passam pelas funções guardadas de
 * `paths.ts`). Um id que não tem forma de id nunca chega ao disco: sem esta
 * conferência, `cancelJob('../../x')` lia, sobrescrevia e movia um `.json`
 * qualquer da máquina, porque `pendente/` e `concluido/` estão na mesma
 * profundidade e o caminho de leitura e o de escrita resolviam para o MESMO
 * arquivo.
 */
const jobInvalido = (id: string): boolean => !ehJobId(id);

const ensureDirs = (): void => {
  for (const dir of [queuePendingDir(), queueDoneDir()]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
};

const newJobId = (): string =>
  `job_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Registra um pedido. Retorna o job gravado — não executa nada. */
export const enqueueJob = (
  type: QueueJobType,
  label: string,
  payload: Record<string, unknown>,
): QueueJob => {
  ensureDirs();
  const job: QueueJob = {
    id: newJobId(),
    type,
    label,
    status: 'pendente',
    createdAt: Date.now(),
    completedAt: null,
    payload,
    result: null,
    error: null,
  };
  writeFileSync(join(queuePendingDir(), `${job.id}.json`), JSON.stringify(job, null, 2), 'utf8');
  return job;
};

/**
 * Antes de `cancelado` existir, cancelar gravava `erro` com a palavra no campo
 * `error`. Esses arquivos continuam em disco e continuariam acusando falha,
 * então traduzimos na leitura em vez de sair reescrevendo o histórico de quem
 * já usa o app.
 */
const normalizar = (job: QueueJob): QueueJob =>
  job.status === 'erro' && job.error === 'cancelado'
    ? { ...job, status: 'cancelado', error: null }
    : job;

const readJobs = (dir: string): QueueJob[] => {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return normalizar(JSON.parse(readFileSync(join(dir, f), 'utf8')) as QueueJob);
      } catch {
        return null;
      }
    })
    .filter((j): j is QueueJob => j !== null)
    .sort((a, b) => a.createdAt - b.createdAt);
};

export const listPendingJobs = (): QueueJob[] => readJobs(queuePendingDir());
export const listDoneJobs = (): QueueJob[] => readJobs(queueDoneDir());

/**
 * Jobs da fila que ainda vão mexer neste projeto.
 *
 * Estar em `pendente/` é a definição: um job só sai de lá quando termina, então
 * a pasta cobre tanto o que espera a vez quanto o que está sendo processado
 * agora.
 *
 * Existe por um estrago real. Um projeto foi excluído no aplicativo enquanto a
 * geração dele rodava: o `DELETE` levou a linha do banco e a pasta inteira, e
 * quem estava gerando seguiu escrevendo, sem saber de nada. O site nasceu órfão
 * — completo em disco, invisível em Meus sites, porque a tela lista a partir do
 * banco. Nada avisou a ninguém.
 */
export const jobsAbertosDoProjeto = (projectId: string): QueueJob[] =>
  listPendingJobs().filter((job) => job.payload?.projectId === projectId);

// ── Lote em processamento ──────────────────────────────────────────────────

/**
 * Os ids que a rodada atual pegou, e o quanto cada um já andou por dentro.
 *
 * `ids` sozinho só permite contar jobs inteiros — a barra saltaria de 0 para
 * 100 numa extração única e ficaria parada por minutos. `etapas` guarda o
 * progresso interno que quem processa reporta, e é o que faz o número subir de
 * forma contínua.
 */
export type QueueLote = {
  ids: string[];
  startedAt: number;
  /** jobId → 0..100. Ausente significa "ainda não reportou nada". */
  etapas?: Record<string, number>;
};

/** Marca o início de uma rodada. Chamado pelo `fila:escolher`. */
export const setLote = (ids: string[]): QueueLote => {
  ensureDirs();
  const lote: QueueLote = { ids, startedAt: Date.now(), etapas: {} };
  writeFileSync(queueLotePath(), JSON.stringify(lote, null, 2), 'utf8');
  return lote;
};

/**
 * Registra o avanço interno de um job. Chamado pelo `fila:progresso`.
 *
 * Silencioso quando não há lote: reportar progresso fora de uma rodada não é
 * erro, é só irrelevante.
 */
export const reportarProgresso = (jobId: string, percentual: number): void => {
  const lote = getLote();
  if (lote === null) return;

  const limpo = Math.max(0, Math.min(100, Math.round(percentual)));
  const atualizado: QueueLote = {
    ...lote,
    etapas: { ...(lote.etapas ?? {}), [jobId]: limpo },
  };
  writeFileSync(queueLotePath(), JSON.stringify(atualizado, null, 2), 'utf8');
};

export const getLote = (): QueueLote | null => {
  const path = queueLotePath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as QueueLote;
  } catch {
    return null;
  }
};

/** Encerra a rodada. Sem isso a barra ficaria congelada em 100% para sempre. */
export const clearLote = (): void => {
  const path = queueLotePath();
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // Arquivo já removido ou em uso. Não vale derrubar o fluxo por isso.
    }
  }
};

/**
 * Quanto da rodada atual já andou, de 0 a 100.
 *
 * Combina duas fontes, e a ordem de confiança importa:
 *
 * 1. **O disco.** Um job que saiu de `pendente/` está feito, ponto — vale 100
 *    independente do que tenha sido reportado. É o piso confiável.
 * 2. **O reporte de etapa.** Para o job que ainda está rodando, usa o que o
 *    processador informou via `fila:progresso`.
 *
 * Um job em andamento é limitado a 99 de propósito: 100% só aparece quando o
 * trabalho realmente fechou. Se ninguém reportar nada, a barra ainda avança a
 * cada job concluído — degrada para o comportamento antigo em vez de travar.
 */
export const getProgresso = (): {
  total: number;
  concluidos: number;
  percentual: number;
  /**
   * Alguém está de fato trabalhando nesta rodada?
   *
   * Um lote no disco NÃO prova trabalho: ele é escrito quando a pessoa escolhe
   * os jobs no PROCESSAR, e continua lá se a janela for fechada antes de rodar
   * qualquer coisa. Sem este campo a tela desenhava "Planejando o site… 0%" com
   * animação para um job parado, e a pessoa esperava minutos por nada.
   *
   * A prova é uma só: algum job reportou etapa ou saiu de `pendente/`.
   */
  emAndamento: boolean;
} | null => {
  const lote = getLote();
  if (lote === null || lote.ids.length === 0) return null;

  const pendentes = new Set(listPendingJobs().map((j) => j.id));
  const etapas = lote.etapas ?? {};

  let concluidos = 0;
  let acumulado = 0;
  let reportou = false;

  for (const id of lote.ids) {
    if (!pendentes.has(id)) {
      concluidos++;
      acumulado += 100;
      reportou = true;
      continue;
    }
    const etapa = etapas[id] ?? 0;
    if (etapa > 0) reportou = true;
    acumulado += Math.min(99, etapa);
  }

  return {
    total: lote.ids.length,
    concluidos,
    percentual: Math.round(acumulado / lote.ids.length),
    emAndamento: reportou,
  };
};

export const getJob = (id: string): QueueJob | null => {
  if (jobInvalido(id)) return null;
  for (const dir of [queuePendingDir(), queueDoneDir()]) {
    const path = join(dir, `${id}.json`);
    if (existsSync(path)) {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as QueueJob;
      } catch {
        return null;
      }
    }
  }
  return null;
};

/**
 * Anexa dados ao `result` de um job que AINDA está pendente, sem fechá-lo.
 *
 * Usado pela extração para gravar o `designSystemId` produzido: o `fila:concluir`
 * lê `job.result.designSystemId` para saber o que segmentar. Separar produzir de
 * concluir mantém o mesmo desenho de sempre — um passo entrega, o outro valida e
 * fecha.
 */
export const setJobResult = (id: string, result: Record<string, unknown>): QueueJob | null => {
  if (jobInvalido(id)) return null;
  const pendingPath = join(queuePendingDir(), `${id}.json`);
  if (!existsSync(pendingPath)) return null;
  const job = JSON.parse(readFileSync(pendingPath, 'utf8')) as QueueJob;
  const updated: QueueJob = { ...job, result: { ...(job.result ?? {}), ...result } };
  writeFileSync(pendingPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
};

/** Move um job de pendente para concluído, anexando resultado ou erro. */
export const finishJob = (
  id: string,
  outcome: { result?: Record<string, unknown>; error?: string },
): QueueJob | null => {
  if (jobInvalido(id)) return null;
  ensureDirs();
  const pendingPath = join(queuePendingDir(), `${id}.json`);
  if (!existsSync(pendingPath)) return null;

  const job = JSON.parse(readFileSync(pendingPath, 'utf8')) as QueueJob;
  const updated: QueueJob = {
    ...job,
    status: outcome.error === undefined ? 'concluido' : 'erro',
    completedAt: Date.now(),
    result: outcome.result ?? null,
    error: outcome.error ?? null,
  };

  const donePath = join(queueDoneDir(), `${id}.json`);
  writeFileSync(donePath, JSON.stringify(updated, null, 2), 'utf8');
  renameSync(pendingPath, join(queueDoneDir(), `.${id}.consumed`));
  return updated;
};

/**
 * Remove um pedido da fila sem executá-lo.
 *
 * Grava `cancelado`, não `erro`: quem clicou no X sabe muito bem o que fez, e
 * marcar isso como falha fazia o painel acusar problema pelo resto da vida do
 * histórico.
 */
export const cancelJob = (id: string): boolean => {
  if (jobInvalido(id)) return false;
  const pendingPath = join(queuePendingDir(), `${id}.json`);
  if (!existsSync(pendingPath)) return false;
  const job = JSON.parse(readFileSync(pendingPath, 'utf8')) as QueueJob;
  writeFileSync(
    join(queueDoneDir(), `${id}.json`),
    JSON.stringify({ ...job, status: 'cancelado', completedAt: Date.now(), error: null }, null, 2),
    'utf8',
  );
  renameSync(pendingPath, join(queueDoneDir(), `.${id}.consumed`));
  return true;
};
