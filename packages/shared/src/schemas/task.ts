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
