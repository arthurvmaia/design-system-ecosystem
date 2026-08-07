import { getSqlite } from '@ds/indexer';
import { getRoot } from '@ds/shared/paths';
import { Hono } from 'hono';

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  const nowRow = getSqlite().prepare("SELECT strftime('%s','now') AS now").get() as {
    now: string;
  };

  return c.json({
    status: 'ok',
    root: getRoot(),
    db: {
      connected: true,
      serverTimeUnix: Number(nowRow.now),
    },
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    // A chave da Pexels decide se a mídia automática sai como FOTO ou como
    // desenho de cena, e a degradação é silenciosa de propósito (foto nunca
    // derruba a marca automática). O preço do silêncio é não dar para saber
    // POR QUE veio desenho: chave ausente, .env não lido, ou servidor de pé
    // desde antes de a chave ser colada. Aqui a pergunta tem resposta.
    pexelsConfigured: Boolean(process.env.PEXELS_API_KEY?.trim()),
  });
});
