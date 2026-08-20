import type { Context, Next } from 'hono';

/**
 * Os cabeçalhos que o navegador obedece, postos em TODA resposta.
 *
 * ## Por que globais, e não por rota
 *
 * Eles já existiam em duas rotas — a que serve arquivo do acervo e a que serve
 * o pixel de um criativo —, postos à mão onde alguém lembrou. Cabeçalho de
 * segurança que depende de lembrança protege o que foi lembrado: a rota nova
 * nasce sem nenhum, e ninguém percebe, porque a ausência de um cabeçalho não
 * quebra nada visível.
 *
 * Aqui eles valem por padrão e a rota que precisar de outra coisa sobrescreve —
 * que é o inverso seguro do que havia.
 *
 * ## Por que HSTS só em HTTPS
 *
 * `Strict-Transport-Security` numa resposta HTTP é ignorado pelo navegador por
 * norma, e mandá-lo assim mesmo é ruído. Pior: numa máquina local, se algum dia
 * ele fosse aceito, trancaria `localhost` em HTTPS e o app deixaria de abrir.
 * Ele entra quando a conexão JÁ é segura — que é exatamente quando ele serve
 * para alguma coisa: o app é exposto por túnel, e é lá que a primeira visita em
 * HTTP é a janela que o HSTS fecha.
 *
 * A leitura de `x-forwarded-proto` é a mesma de `portao.ts`, e pela mesma razão:
 * atrás do túnel, a conexão que o Node vê é HTTP mesmo quando a do usuário é
 * HTTPS.
 */

/** Esta requisição chegou por HTTPS, contando o que o túnel diz? */
const ehSeguro = (c: Context): boolean => {
  const encaminhado = c.req.header('x-forwarded-proto');
  if (typeof encaminhado === 'string' && encaminhado !== '') {
    return encaminhado.split(',')[0]?.trim() === 'https';
  }
  try {
    return new URL(c.req.url).protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * O que cada um faz, e por que este e não outro:
 *
 * - **`X-Content-Type-Options: nosniff`** — o navegador para de adivinhar o
 *   tipo pelo conteúdo. É o que impede um arquivo enviado com nome de imagem,
 *   mas com HTML dentro, de ser executado como página.
 * - **`X-Frame-Options: SAMEORIGIN`** — ninguém embute o app num quadro para
 *   roubar clique. O acervo é servido no mesmo servidor, então `SAMEORIGIN` e
 *   não `DENY`: a prévia de um site gerado é um `iframe` de mesma origem.
 * - **`Referrer-Policy: same-origin`** — a URL de uma peça do acervo carrega o
 *   id do job. Ela não precisa viajar para site nenhum quando alguém clica num
 *   link de saída.
 * - **`Cross-Origin-Opener-Policy: same-origin`** — a janela do app não fica
 *   alcançável por outra que a tenha aberto.
 * - **`Permissions-Policy`** — câmera, microfone e localização não são usados
 *   por nada aqui, e o jeito de garantir isso é negar em vez de confiar.
 *
 * **Não há `Content-Security-Policy` global de propósito.** O app serve os
 * BUNDLES do acervo — HTML e script capturados de sites reais, cuja fidelidade
 * é o produto. Uma CSP restritiva quebraria justamente o que este repositório
 * existe para preservar, e uma CSP frouxa o bastante para não quebrar não
 * protegeria de nada. As rotas que servem arquivo do usuário continuam pondo a
 * sua própria (`sandbox`), que é onde ela cabe.
 */
export const cabecalhosDeSeguranca = async (c: Context, next: Next): Promise<void> => {
  await next();

  const fixos: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  for (const [nome, valor] of Object.entries(fixos)) {
    // A rota que já decidiu vence: `criativos` põe `sandbox` no CSP e o `asset`
    // tem o seu próprio. Sobrescrever aqui apagaria uma decisão mais informada.
    if (!c.res.headers.has(nome)) c.res.headers.set(nome, valor);
  }

  if (ehSeguro(c) && !c.res.headers.has('Strict-Transport-Security')) {
    // Um ano, e sem `preload`: entrar na lista de pré-carga dos navegadores é
    // uma decisão que não se desfaz em semanas, e este app ainda muda de
    // endereço.
    c.res.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
};
