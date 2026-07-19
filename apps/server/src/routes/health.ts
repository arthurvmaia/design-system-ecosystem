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
  });
});
