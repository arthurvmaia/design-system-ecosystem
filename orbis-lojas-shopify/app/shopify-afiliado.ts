/**
 * O link de indicação da Shopify — a linha que vale dinheiro.
 *
 * É por ele que a comissão é creditada: quem cria a conta a partir do botão do
 * app conta como indicação sua. Trocar de programa, de campanha ou de país é
 * trocar ESTA linha, e só ela: não existe outra cópia do endereço no app.
 *
 * Enquanto estiver com o valor de fábrica, o botão leva à página normal da
 * Shopify. A pessoa cria a conta do mesmo jeito — só não gera comissão. Por
 * isso o app não finge que está tudo certo: com o link de fábrica, a tela diz
 * em voz baixa que a indicação ainda não está configurada, para o dia de
 * publicar não passar em branco.
 */
export const LINK_PADRAO = "https://www.shopify.com/br";

/**
 * O link de indicação em uso.
 *
 * O `rid` é o identificador da indicação: é ele, e só ele, que liga a conta
 * criada a esta origem. Ao trocar o endereço, o `rid` tem de vir junto.
 */
export const LINK_DE_AFILIADO = "https://accounts.shopify.com/signup?rid=7c38fff0-e701-43c8-992b-7fc6f48e98e9";

/** Verdadeiro enquanto ninguém trocou o link de fábrica pelo de indicação. */
export const SEM_LINK_DE_INDICACAO = LINK_DE_AFILIADO === LINK_PADRAO;

/**
 * O caminho até a chave de acesso, DENTRO do admin da loja do cliente.
 *
 * Mora aqui pelo mesmo motivo do link de indicação: endereço da Shopify existe
 * num arquivo só, senão alguém acrescenta outro amanhã e o do dinheiro deixa de
 * ser o único. Este não leva a cadastro nenhum e não disputa comissão com nada
 * — é a loja DELE, e é onde a chave nasce.
 *
 * Precisa estar aqui porque dizer o menu não bastou: quem tem conta de parceiro
 * cai no painel de parceiros, que é outro lugar e onde esse menu não existe.
 * Lá se criam apps públicos, que dão client ID e secret; a chave `shpat_` só
 * sai do admin da loja.
 */
export function caminhoDaChaveDeAcesso(loja: string): string {
  const nome = String(loja ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/\.myshopify\.com$/, "");
  return nome ? `https://admin.shopify.com/store/${nome}/settings/apps/development` : "";
}
