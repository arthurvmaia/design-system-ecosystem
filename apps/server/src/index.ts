import 'dotenv/config';

import { ensureDataTree, getDb, runMigrations } from '@ds/indexer';
import { getRoot } from '@ds/shared/paths';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getExecutionMode } from './lib/execution-mode.js';
import { designSystemsRoute } from './routes/design-systems.js';
import { healthRoute } from './routes/health.js';
import { kitsRoute } from './routes/kits.js';
import { libraryRoute } from './routes/library.js';
import { meusProjetosRoute } from './routes/meus-projetos.js';
import { previewRoute } from './routes/preview.js';
import { projectsRoute } from './routes/projects.js';
import { queueRoute } from './routes/queue.js';
import { rejeitadosRoute } from './routes/rejeitados.js';
import { siteRoute } from './routes/site.js';
import { tasksRoute } from './routes/tasks.js';
import { vaultRoute } from './routes/vault.js';

const app = new Hono();

app.use('*', logger());
// Devolver o próprio `origin` liberava qualquer site a chamar esta API com
// credenciais — inclusive um site aberto por acaso no navegador, já que o
// servidor escuta em localhost. Fixamos na origem do app, que é o que o
// WEB_ORIGIN do .env sempre prometeu.
app.use(
  '/api/*',
  cors({
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
);

app.route('/health', healthRoute);
app.route('/api/design-systems', designSystemsRoute);
app.route('/api/library', libraryRoute);
app.route('/api/kits', kitsRoute);
app.route('/api/projects', projectsRoute);
app.route('/api/meus-projetos', meusProjetosRoute);
app.route('/api/preview', previewRoute);
app.route('/api/rejeitados', rejeitadosRoute);
app.route('/api/queue', queueRoute);
app.route('/api/tasks', tasksRoute);
app.route('/vault', vaultRoute);
app.route('/site', siteRoute);

app.notFound((c) => c.json({ error: 'not_found', path: c.req.path }, 404));
app.onError((err, c) => {
  console.error('Server error:', err);
  return c.json({ error: 'internal_error', message: err.message }, 500);
});

const port = Number(process.env.PORT ?? 8787);

const boot = () => {
  ensureDataTree();
  getDb(); // aquece a conexão e roda os PRAGMAs

  // Aplica migrations pendentes no boot. Garante que um banco criado antes de
  // uma migration nova (ex.: a de kits) receba as tabelas que faltam, em vez de
  // estourar "no such table" na primeira operação. Idempotente; se falhar,
  // avisa e segue — não vale derrubar o servidor por causa disso.
  try {
    runMigrations();
  } catch (err) {
    console.warn('Aviso: migrations no boot falharam:', err instanceof Error ? err.message : err);
  }

  console.log('Design System Ecosystem server');
  console.log(`  data root : ${getRoot()}`);
  console.log(`  modo      : ${getExecutionMode()}`);
  console.log(`  listening : http://localhost:${port}`);

  serve({ fetch: app.fetch, port });
};

boot();

export type AppType = typeof app;
