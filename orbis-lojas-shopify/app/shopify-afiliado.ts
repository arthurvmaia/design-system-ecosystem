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

/** Cole aqui o seu link de afiliado/parceiro da Shopify. */
export const LINK_DE_AFILIADO = LINK_PADRAO;

/** Verdadeiro enquanto ninguém trocou o link de fábrica pelo de indicação. */
export const SEM_LINK_DE_INDICACAO = LINK_DE_AFILIADO === LINK_PADRAO;
