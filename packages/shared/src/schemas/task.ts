import { z } from 'zod';

export const TaskOperation = z.enum([
  'extract',
  'segment',
  'classify',
  'isolate',
  'tokenize',
  'generate-site',
]);
export type TaskOperation = z.infer<typeof TaskOperation>;

export const TaskStatus = z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** task.json escrito em workspace/{task_id}/. */
export const TaskManifest = z.object({
  id: z.string().startsWith('task_'),
  operation: TaskOperation,
  status: TaskStatus,
  createdAt: z.number().int().positive(),
  startedAt: z.number().int().positive().nullable(),
  completedAt: z.number().int().positive().nullable(),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).nullable(),
  errorMessage: z.string().nullable(),
  logs: z.array(
    z.object({
      timestamp: z.number().int().positive(),
      level: z.enum(['debug', 'info', 'warn', 'error']),
      message: z.string(),
    }),
  ),
});
export type TaskManifest = z.infer<typeof TaskManifest>;

/** Entrada da tabela llm_cache. */
export const LlmCacheRecord = z.object({
  inputHash: z.string().length(64),
  operation: TaskOperation,
  outputJson: z.string(),
  costUsd: z.number().nonnegative().nullable(),
  createdAt: z.number().int().positive(),
});
export type LlmCacheRecord = z.infer<typeof LlmCacheRecord>;
