/**
 * O PERFIL de quem entrou: admin ou cliente.
 *
 * ## De onde ele vem
 *
 * Do portal. O cartão da frente de design system pergunta "quem está
 * entrando?" antes de abrir — pedido do dono: *"se for admin vai para a tela
 * que já temos hoje... e se for cliente, só deve aparecer da parte de kits em
 * diante"*. A escolha viaja na URL (`?perfil=cliente` / `?perfil=admin`) e
 * fica na sessão DESTA aba.
 *
 * ## O que ele é, e o que ele não é
 *
 * É recorte de NAVEGAÇÃO, não credencial: quem decide o que pode ser feito
 * continua sendo o portão do servidor (admin/visita). O cliente vê a parte
 * dele — escolher kit, gerar site, acompanhar os sites — porque mostrar a
 * fábrica inteira a quem veio buscar o produto é ruído, não segurança.
 *
 * `sessionStorage` de propósito: o perfil é da VISITA. A aba do cliente não
 * contamina a entrada de amanhã, e abrir direto pela porta 5173 (sem passar
 * pelo portal) continua sendo o app inteiro — o fluxo de quem desenvolve.
 */

export type Perfil = 'admin' | 'cliente';

const CHAVE = 'orbis.perfil';

/** Lê o `?perfil=` da URL de entrada e o guarda na sessão da aba. */
export const capturarPerfilDaUrl = (): void => {
  try {
    const p = new URLSearchParams(window.location.search).get('perfil');
    if (p === 'cliente' || p === 'admin') sessionStorage.setItem(CHAVE, p);
  } catch {
    /* sem storage, o app segue inteiro — perfil é recorte, não portão */
  }
};

export const perfilAtual = (): Perfil => {
  try {
    return sessionStorage.getItem(CHAVE) === 'cliente' ? 'cliente' : 'admin';
  } catch {
    return 'admin';
  }
};

/** As rotas que existem para o CLIENTE: da parte de kits em diante. */
export const ROTAS_DO_CLIENTE = ['/design-systems', '/projects', '/meus-projetos'] as const;

/** A primeira tela do cliente: os kits, que é onde a escolha dele começa. */
export const ROTA_INICIAL_DO_CLIENTE = '/design-systems';

/** O prefixo da rota é permitido para este perfil? */
export const rotaPermitida = (perfil: Perfil, pathname: string): boolean =>
  perfil === 'admin' ||
  ROTAS_DO_CLIENTE.some((r) => pathname === r || pathname.startsWith(`${r}/`));
