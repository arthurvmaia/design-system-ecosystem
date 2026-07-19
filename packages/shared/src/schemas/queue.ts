import { z } from 'zod';

/**
 * Fila de trabalho em disco.
 *
 * Existe para separar QUEM PEDE de QUEM EXECUTA.
 *
 * No modo `api`, o servidor pede e executa na mesma hora, chamando a Anthropic.
 * No modo `queue`, o servidor só registra o pedido num arquivo JSON e devolve
 * na hora. O trabalho fica parado até uma pessoa abrir o Claude Code e mandar
 * processar.
 *
 * Essa pausa é intencional e é o ponto inteiro do desenho: nada aqui observa a
 * pasta, nada dispara sozinho. Um vigia automático transformaria isto em
 * automação disfarçada — que é exatamente o que este modo evita.
 */

export const QueueJobType = z.enum(['extract', 'classify', 'generate']);
export type QueueJobType = z.infer<typeof QueueJobType>;

export const QueueJobStatus = z.enum(['pendente', 'concluido', 'erro']);
export type QueueJobStatus = z.infer<typeof QueueJobStatus>;

export const QueueJob = z.object({
  id: z.string().startsWith('job_'),
  type: QueueJobType,
  /** Descrição curta para a interface e para a listagem no Claude Code. */
  label: z.string(),
  status: QueueJobStatus,
  createdAt: z.number().int().positive(),
  completedAt: z.number().int().positive().nullable().default(null),
  /** Dados necessários para executar. O formato varia por tipo. */
  payload: z.record(z.string(), z.unknown()),
  /** Preenchido por quem processou: o que foi produzido, para auditoria. */
  result: z.record(z.string(), z.unknown()).nullable().default(null),
  error: z.string().nullable().default(null),
});
export type QueueJob = z.infer<typeof QueueJob>;

/** Modo de execução do servidor. */
export const ExecutionMode = z.enum(['queue', 'api']);
export type ExecutionMode = z.infer<typeof ExecutionMode>;
