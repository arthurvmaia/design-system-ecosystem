import 'dotenv/config';

import { ensureDataTree, getDb, runMigrations } from '@ds/indexer';
import { getRoot } from '@ds/shared/paths';
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { getExecutionMode } from './lib/execution-mode.js';
import { ehLeitura, estadoDoPortao, lerCookieDaSessao, nivelDaSessao } from './lib/portao.js';
import { appCompiladoExiste, appWebRoute } from './routes/app-web.js';
import { assetRoute, frameRoute, libraryAssetRoute } from './routes/asset.js';
import { designSystemsRoute } from './routes/design-systems.js';
import { desligarRoute } from './routes/desligar.js';
import { enderecosRoute } from './routes/enderecos.js';
import { healthRoute } from './routes/health.js';
import { kitsRoute } from './routes/kits.js';
import { libraryRoute } from './routes/library.js';
import { meusProjetosRoute } from './routes/meus-projetos.js';
import { movimentoRoute } from './routes/movimento.js';
import { orbisRoute } from './routes/orbis.js';
import { previewRoute } from './routes/preview.js';
import { projectsRoute } from './routes/projects.js';
import { queueRoute } from './routes/queue.js';
import { rejeitadosRoute } from './routes/rejeitados.js';
import { siteRoute } from './routes/site.js';
import { tasksRoute } from './routes/tasks.js';
import { vaultRoute } from './routes/vault.js';

const app = new Hono();

const agoraEmS = (): number => Math.floor(Date.now() / 1000);

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

/**
 * O portão. Tudo que serve dado ou arquivo passa por aqui.
 *
 * A lista de exceções é curta de propósito e cada uma tem motivo: `/api/orbis`
 * é a própria porta, e `/health` é o que diz se o servidor está de pé — negar
 * isso deixaria o app sem como distinguir "servidor caído" de "você não entrou",
 * que são duas telas diferentes.
 *
 * `/vault` e `/site` entram na conta porque servem ARQUIVO. Uma API trancada
 * com os arquivos abertos não é uma API trancada: o acervo inteiro sairia por
 * uma URL adivinhada.
 */
app.use('*', async (c, next) => {
  const caminho = c.req.path;
  const liberado =
    caminho.startsWith('/api/orbis') ||
    caminho === '/health' ||
    caminho.startsWith('/health/') ||
    c.req.method === 'OPTIONS';
  if (liberado) return next();

  const protegido =
    caminho.startsWith('/api/') || caminho.startsWith('/vault') || caminho.startsWith('/site');
  if (!protegido) return next();

  const estado = estadoDoPortao();
  if (estado === 'desligado') return next();

  const nivel =
    estado === 'ativo'
      ? nivelDaSessao(lerCookieDaSessao(c.req.header('cookie')), agoraEmS())
      : null;

  if (nivel === null) {
    return c.json(
      {
        error: 'sem_sessao',
        message:
          estado === 'sem-credencial'
            ? 'Este servidor foi publicado sem credencial, então eu não deixo ninguém entrar.'
            : 'Preciso da credencial antes de mostrar qualquer coisa.',
      },
      401,
    );
  }

  // A tranca da visita fica AQUI, e não na interface. Esconder o botão não
  // impede ninguém de chamar a rota, e tranca que só existe na tela não é
  // tranca. Quem entrou para olhar lê tudo e não muda nada.
  if (nivel === 'visita' && !ehLeitura(c.req.method)) {
    return c.json(
      {
        error: 'somente_leitura',
        message:
          'Esta credencial abre para ver, não para mudar. Deixo o senhor navegar tudo, mas não mexo no acervo por aqui.',
      },
      403,
    );
  }

  return next();
});

app.route('/api/orbis', orbisRoute);
// Fora de `/api/orbis` de propósito: aquele prefixo é o único que responde sem
// sessão, e desligar a suíte é a ação mais destrutiva do app.
app.route('/api/desligar', desligarRoute);
app.route('/api/enderecos', enderecosRoute);
app.route('/health', healthRoute);
app.route('/api/design-systems', designSystemsRoute);
app.route('/api/library', libraryRoute);
app.route('/api/kits', kitsRoute);
app.route('/api/projects', projectsRoute);
app.route('/api/meus-projetos', meusProjetosRoute);
app.route('/api/preview', previewRoute);
app.route('/api/asset', assetRoute);
app.route('/api/library-asset', libraryAssetRoute);
app.route('/api/frame', frameRoute);
app.route('/api/rejeitados', rejeitadosRoute);
app.route('/api/queue', queueRoute);
app.route('/api/movimento', movimentoRoute);
app.route('/api/tasks', tasksRoute);
app.route('/vault', vaultRoute);
app.route('/site', siteRoute);

// O app compilado, por último: ele é o coringa que responde tudo que sobrou, e
// só entra quando existe build. Em desenvolvimento não existe, e o Vite continua
// servindo o app em 5173 como sempre.
if (appCompiladoExiste()) app.route('/', appWebRoute);

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

  console.log('Orbis (Design System Ecosystem) server');
  console.log(`  data root : ${getRoot()}`);
  console.log(`  modo      : ${getExecutionMode()}`);
  console.log(`  listening : http://localhost:${port}`);

  serve({ fetch: app.fetch, port });
};

boot();

export type AppType = typeof app;
