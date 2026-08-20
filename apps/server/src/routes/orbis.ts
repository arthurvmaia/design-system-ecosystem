import type { Context } from 'hono';
import { Hono } from 'hono';
import { esperar, registrarAcerto, registrarFalha } from '../lib/limite-de-tentativas.js';
import {
  DURACAO_DA_SESSAO_S,
  NOME_DO_COOKIE,
  assinarSessao,
  cookieDeSessao,
  estadoDoPortao,
  lerCookieDaSessao,
  nivelDaSenha,
  nivelDaSessao,
  temNivelDeVisita,
  trancaDeAcaoAtiva,
} from '../lib/portao.js';

/**
 * As três rotas do portão. São as ÚNICAS que respondem sem sessão — o resto da
 * API fica atrás do guarda em `index.ts`.
 *
 * Nenhuma delas devolve a senha, o tamanho dela ou qualquer pista. O erro de
 * senha errada é sempre o mesmo texto, sem contar tentativas restantes nem
 * dizer "usuário existe": informação a mais aqui só serve para quem está
 * tentando adivinhar. E não diz QUAL das duas senhas errou, pelo mesmo motivo.
 */
export const orbisRoute = new Hono();

/**
 * O cookie precisa de `SameSite=None; Secure`?
 *
 * Precisa quando o app e a API moram em domínios diferentes — front na Vercel,
 * servidor noutro lugar. Sem isso o navegador descarta o cookie em silêncio, e
 * o sintoma é o pior possível: a senha é aceita e a tela volta a pedir senha.
 *
 * Servindo o app do próprio Hono (o caso do túnel) a origem é a mesma, e aí
 * `Lax` basta e é mais restrito.
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

/**
 * A conexão chegou por HTTPS?
 *
 * Pelo túnel a Cloudflare termina o TLS e repassa em http para o servidor, então
 * a URL local diz `http` e mente. Quem conta a verdade é o `x-forwarded-proto`.
 */
const conexaoSegura = (c: Context): boolean => {
  const encaminhado = c.req.header('x-forwarded-proto');
  if (typeof encaminhado === 'string' && encaminhado !== '') {
    return encaminhado.split(',')[0]?.trim() === 'https';
  }
  return new URL(c.req.url).protocol === 'https:';
};

/** Onde a pessoa está: precisa digitar, já entrou (e em que nível), ou o servidor não tem credencial. */
orbisRoute.get('/sessao', (c) => {
  const estado = estadoDoPortao();
  // `exigeAcao` viaja em TODOS os ramos: é a interface que precisa dele para
  // saber se pede a credencial do gasto, e ela pergunta uma vez só.
  const exigeAcao = trancaDeAcaoAtiva();
  if (estado === 'desligado') {
    return c.json({ estado, dentro: true, nivel: 'admin', exigeAcao });
  }
  if (estado === 'sem-credencial') {
    return c.json({ estado, dentro: false, nivel: null, exigeAcao });
  }
  const nivel = nivelDaSessao(
    lerCookieDaSessao(c.req.header('cookie')),
    Math.floor(Date.now() / 1000),
  );
  return c.json({
    estado,
    dentro: nivel !== null,
    nivel,
    temVisita: temNivelDeVisita(),
    exigeAcao,
  });
});

orbisRoute.post('/entrar', async (c) => {
  const estado = estadoDoPortao();
  if (estado === 'desligado') return c.json({ dentro: true, nivel: 'admin' });
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

  const nivel = nivelDaSenha(senha);
  if (nivel === null) {
    // A porta passa a custar tempo. Sem isto, com o app publicado por túnel,
    // uma senha só e compartilhada aceitava quantos palpites a rede aguentasse.
    await esperar(registrarFalha());
    return c.json({ error: 'credencial_invalida', message: 'Essa credencial não é a minha.' }, 401);
  }
  registrarAcerto();

  const expira = Math.floor(Date.now() / 1000) + DURACAO_DA_SESSAO_S;
  c.header(
    'Set-Cookie',
    cookieDeSessao({
      valor: assinarSessao(expira, nivel),
      maxAgeS: DURACAO_DA_SESSAO_S,
      origemCruzada: origemCruzada(),
      seguro: conexaoSegura(c),
      // O cookie leva `Max-Age` e sobrevive a fechar o navegador. A validade
      // real continua sendo a que viaja ASSINADA dentro do valor: uma semana,
      // conferida a cada pedido. Sem `Max-Age`, a assinatura prometia sete dias
      // e o navegador entregava até o fim da aba, e as duas coisas se
      // contradiziam sem que ninguém percebesse.
    }),
  );
  return c.json({ dentro: true, nivel });
});

orbisRoute.post('/sair', (c) => {
  c.header(
    'Set-Cookie',
    cookieDeSessao({
      valor: '',
      maxAgeS: 0,
      origemCruzada: origemCruzada(),
      seguro: conexaoSegura(c),
    }),
  );
  return c.json({ dentro: false, nivel: null });
});

export { NOME_DO_COOKIE };
