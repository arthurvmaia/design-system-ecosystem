import { cancelJob, getProgresso, listDoneJobs, listPendingJobs } from '@ds/shared';
import { Hono } from 'hono';
import { getExecutionMode } from '../lib/execution-mode.js';

export const queueRoute = new Hono();

/**
 * Estado da fila. É a fonte única do painel, do semáforo e da barra de
 * progresso — os três leem daqui para não divergirem entre si.
 */
queueRoute.get('/', (c) => {
  const done = listDoneJobs();
  return c.json({
    mode: getExecutionMode(),
    pending: listPendingJobs(),
    done: done.slice(-25).reverse(),
    /** Quantos jobs falharam. É o que acende o amarelo no semáforo. */
    erros: done.filter((j) => j.status === 'erro').length,
    /** `null` quando não há rodada em andamento. */
    progresso: getProgresso(),
  });
});

queueRoute.delete('/:id', (c) => {
  const ok = cancelJob(c.req.param('id'));
  if (!ok) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
