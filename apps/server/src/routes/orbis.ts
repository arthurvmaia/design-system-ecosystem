import { Hono } from 'hono';
import {
  DURACAO_DA_SESSAO_S,
  NOME_DO_COOKIE,
  assinarSessao,
  cookieDeSessao,
  estadoDoPortao,
  lerCookieDaSessao,
  senhaConfere,
  sessaoValida,
} from '../lib/portao.js';

/**
 * As três rotas do portão. São as ÚNICAS que respondem sem sessão — o resto da
 * API fica atrás do guarda em `index.ts`.
 *
 * Nenhuma delas devolve a senha, o tamanho dela ou qualquer pista. O erro de
 * senha errada é sempre o mesmo texto, sem contar tentativas restantes nem
 * dizer "usuário existe": informação a mais aqui só serve para quem está
 * tentando adivinhar.
 */
export const orbisRoute = new Hono();

/**
 * O cookie precisa de `SameSite=None; Secure`?
 *
 * Precisa quando o app e a API moram em domínios diferentes — front na Vercel,
 * servidor noutro lugar. Sem isso o navegador descarta o cookie em silêncio, e
 * o sintoma é o pior possível: a senha é aceita e a tela volta a pedir senha.
 *
 * Em desenvolvimento o app vem pelo proxy do Vite, mesma origem e sem HTTPS —
 * ali `None; Secure` seria o erro simétrico, porque `Secure` em http também é
 * descartado. Por isso a decisão sai do `WEB_ORIGIN`: localhost é dev.
 */
const origemCruzada = (): boolean => {
  const web = process.env.WEB_ORIGIN;
  if (web === undefined || web === '') return false;
  try {
    const { hostname } = new URL(web);
    return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]';
  } catch {
    return false;
  }
};

/** Onde a pessoa está: precisa digitar, já entrou, ou o servidor não tem credencial. */
orbisRoute.get('/sessao', (c) => {
  const estado = estadoDoPortao();
  if (estado === 'desligado') return c.json({ estado, dentro: true });
  if (estado === 'sem-credencial') return c.json({ estado, dentro: false });
  const cookie = lerCookieDaSessao(c.req.header('cookie'));
  return c.json({ estado, dentro: sessaoValida(cookie, Math.floor(Date.now() / 1000)) });
});

orbisRoute.post('/entrar', async (c) => {
  const estado = estadoDoPortao();
  if (estado === 'desligado') return c.json({ dentro: true });
  if (estado === 'sem-credencial') {
    return c.json(
      {
        error: 'sem_credencial',
        message:
          'Este servidor foi publicado sem credencial, então eu não deixo ninguém entrar. Quem o publicou precisa definir ORBIS_SENHA.',
      },
      503,
    );
  }

  let senha = '';
  try {
    const corpo = (await c.req.json()) as { senha?: unknown };
    if (typeof corpo.senha === 'string') senha = corpo.senha;
  } catch {
    // corpo ilegível vira senha vazia, que não confere
  }

  if (!senhaConfere(senha)) {
    return c.json({ error: 'credencial_invalida', message: 'Essa credencial não é a minha.' }, 401);
  }

  const expira = Math.floor(Date.now() / 1000) + DURACAO_DA_SESSAO_S;
  c.header(
    'Set-Cookie',
    cookieDeSessao({
      valor: assinarSessao(expira),
      maxAgeS: DURACAO_DA_SESSAO_S,
      origemCruzada: origemCruzada(),
    }),
  );
  return c.json({ dentro: true });
});

orbisRoute.post('/sair', (c) => {
  c.header('Set-Cookie', cookieDeSessao({ valor: '', maxAgeS: 0, origemCruzada: origemCruzada() }));
  return c.json({ dentro: false });
});

export { NOME_DO_COOKIE };
