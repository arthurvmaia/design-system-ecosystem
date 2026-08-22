import { cancelJob, ehJobId, getProgresso, listDoneJobs, listPendingJobs } from '@ds/shared';
import { Hono } from 'hono';
import { getExecutionMode } from '../lib/execution-mode.js';

export const queueRoute = new Hono();

/**
 * O que o painel da fila precisa saber de um job — e nada além disso.
 *
 * A rota devolvia o `QueueJob` inteiro, `payload` incluído. Para `extract` isso
 * era uma URL; para `criativo` é o briefing completo: a descrição da cena, a
 * headline literal, os claims que o cliente autorizou e o teto de créditos dele.
 * Nada disso é necessário para desenhar uma linha numa lista, e a rota responde
 * a qualquer sessão — inclusive a de nível `visita`, que é de leitura.
 *
 * A única chave do payload que alguém consome é `projectId`
 * (`apps/web/src/routes/projects/index.tsx:208`, para saber se aquele projeto
 * tem job na fila). Ela fica, com o mesmo nome, e o resto não sai daqui.
 *
 * `result` continua indo: ele é produzido pelo nosso próprio motor e o que há
 * nele — o id do design system, a contagem de variações — já é visível nas
 * telas que o mostram.
 */
const resumirJob = (job: ReturnType<typeof listPendingJobs>[number]) => {
  const payload = job.payload as { projectId?: unknown } | null;
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId : undefined;
  return {
    id: job.id,
    type: job.type,
    label: job.label,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    error: job.error,
    result: job.result,
    payload: projectId === undefined ? {} : { projectId },
  };
};

/**
 * Estado da fila. É a fonte única do painel, do semáforo e da barra de
 * progresso — os três leem daqui para não divergirem entre si.
 */
queueRoute.get('/', (c) => {
  const done = listDoneJobs();
  return c.json({
    mode: getExecutionMode(),
    pending: listPendingJobs().map(resumirJob),
    done: done.slice(-25).reverse().map(resumirJob),
    /** Quantos jobs falharam. É o que acende o amarelo no semáforo. */
    erros: done.filter((j) => j.status === 'erro').length,
    /** `null` quando não há rodada em andamento. */
    progresso: getProgresso(),
  });
});

queueRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  if (!ehJobId(id)) return c.json({ error: 'invalid_id' }, 400);
  const ok = cancelJob(id);
  if (!ok) return c.json({ error: 'not_found' }, 404);
  return c.json({ ok: true });
});
