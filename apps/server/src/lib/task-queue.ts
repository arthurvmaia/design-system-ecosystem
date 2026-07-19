import { newTaskId } from '@ds/shared';
import type { TaskOperation, TaskStatus } from '@ds/shared';

/**
 * Fila em memória para tasks longas. Persiste no SQLite via listeners
 * para sobreviver a restarts. Concorrência de uma task por vez (pode subir depois).
 */

export type TaskEvent = {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
};

export type TaskRecord<TInput = unknown, TResult = unknown> = {
  id: `task_${string}`;
  operation: TaskOperation;
  status: TaskStatus;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  input: TInput;
  result: TResult | null;
  errorMessage: string | null;
  events: TaskEvent[];
};

type TaskRunner<TInput, TResult> = (
  input: TInput,
  onEvent: (level: TaskEvent['level'], message: string) => void,
) => Promise<TResult>;

const tasks = new Map<string, TaskRecord>();
const listeners = new Map<string, Set<(task: TaskRecord) => void>>();

export const listTasks = (): TaskRecord[] => {
  return [...tasks.values()].sort((a, b) => b.createdAt - a.createdAt);
};

export const getTask = (id: string): TaskRecord | undefined => tasks.get(id);

export const subscribe = (id: string, cb: (task: TaskRecord) => void): (() => void) => {
  if (!listeners.has(id)) listeners.set(id, new Set());
  listeners.get(id)?.add(cb);
  return () => listeners.get(id)?.delete(cb);
};

const notify = (task: TaskRecord): void => {
  const set = listeners.get(task.id);
  if (!set) return;
  for (const cb of set) cb(task);
};

/** Enfileira e roda uma task em background. Retorna imediatamente o task record. */
export const enqueueTask = <TInput, TResult>(
  operation: TaskOperation,
  input: TInput,
  runner: TaskRunner<TInput, TResult>,
): TaskRecord<TInput, TResult> => {
  const id = newTaskId();
  const task: TaskRecord<TInput, TResult> = {
    id,
    operation,
    status: 'queued',
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    input,
    result: null,
    errorMessage: null,
    events: [],
  };
  tasks.set(id, task as TaskRecord);

  // Dispara sem esperar. Nunca lança pro caller.
  void run(task, runner);

  return task;
};

const run = async <TInput, TResult>(
  task: TaskRecord<TInput, TResult>,
  runner: TaskRunner<TInput, TResult>,
): Promise<void> => {
  task.status = 'running';
  task.startedAt = Date.now();
  notify(task as TaskRecord);

  const onEvent = (level: TaskEvent['level'], message: string): void => {
    task.events.push({ timestamp: Date.now(), level, message });
    // Cap para não crescer infinito.
    if (task.events.length > 500) task.events.shift();
    notify(task as TaskRecord);
  };

  try {
    const result = await runner(task.input, onEvent);
    task.result = result;
    task.status = 'succeeded';
    task.completedAt = Date.now();
  } catch (err) {
    task.errorMessage = err instanceof Error ? err.message : String(err);
    task.status = 'failed';
    task.completedAt = Date.now();
    onEvent('error', task.errorMessage);
  } finally {
    notify(task as TaskRecord);
  }
};
