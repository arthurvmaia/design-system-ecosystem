/**
 * O CONTEÚDO QUE O PRÓPRIO TEMA TRAZ ESCRITO, nos idiomas da loja.
 *
 * Não são chaves de tradução — essas moram em `traducao-tema.mjs` e vêm dos
 * arquivos `locales/` que a Shopify já traduziu. Isto aqui é outra coisa: o
 * texto que o LOJISTA da loja de origem digitou nos settings do tema. "Nossas
 * Coleções", "Ofertas Imperdíveis", "Links rápidos", "Assine nossa newsletter".
 *
 * ## Por que precisou existir
 *
 * `aplicarMarcaNoTema` só escreve onde o tema não escreveu nada de próprio, e
 * essa regra está certa: sobrescrever o que o lojista digitou seria apagar
 * decisão dele. Só que numa loja em INGLÊS o que o lojista de origem digitou em
 * português não é decisão a preservar, é texto na língua errada.
 *
 * Medido no Dawn do acervo, gerando uma loja de roupas em inglês: a página
 * abria com as coleções em inglês e os TÍTULOS em português, e o cliente viu
 * isso na tela. Vinte e quatro settings, do "Nossas Coleções" da home ao
 * "Frete grátis" da tabela de quantidade na página do produto.
 *
 * ## Quando entra, e quando não
 *
 * Só quando o idioma da loja é DIFERENTE do idioma do tema — e o idioma do tema
 * é declarado por ele mesmo, no nome do arquivo de tradução padrão
 * (`locales/pt-BR.default.json`). Loja em português sobre tema português não
 * encosta em nada, que é como tem de ser.
 *
 * ## A chave, e por que ela é assim
 *
 * `<tipo da seção>.<id do setting>`, e não o texto de origem. Casar pelo texto
 * daria uma tradução mais fiel à intenção do lojista, e funcionaria só para as
 * frases exatas deste tema; a chave estrutural vale para qualquer tema da
 * família Dawn, que é o que o acervo tem. Setting que não estiver aqui fica
 * como veio, visível e corrigível, em vez de virar frase inventada.
 *
 * O valor é uma LISTA porque o mesmo tipo de seção aparece mais de uma vez na
 * mesma página: a home tem duas `featured-collection`, e as duas com o mesmo
 * título seriam duas vitrines com o mesmo nome. Consome-se em ordem; acabando a
 * lista, repete-se a última.
 *
 * Os marcadores do tema (`[amount]`, `[timer]`, `[amount_saved]`) atravessam
 * inteiros: é o tema que os preenche, e um marcador traduzido vira texto morto
 * na tela.
 */

export const CONTEUDO_DE_TEMA = {
  en: {
    /* barra de progresso e contador do carrinho — seções próprias deste tema */
    "global.cart_progress_message": ["[amount] away from FREE SHIPPING!"],
    "global.cart_progress_success": ["You've got FREE SHIPPING! 🎉"],
    "global.cart_timer_text": ["<strong>FREE SHIPPING</strong> held for [timer]"],
    "global.cart_savings_label": ["You saved"],
    "global.cart_upsell_heading": ["Add these too"],
    /* títulos de vitrine */
    "collection-list.title": ["Our collections"],
    "featured-collection.title": ["You may also like", "Special offers", "Featured picks"],
    "main-list-collections.title": ["Collections"],
    "collage.heading": ["Discover more of our favourites"],
    /* newsletter, no rodapé e nas páginas que a repetem */
    "footer.newsletter_heading": ["Subscribe to our newsletter"],
    "newsletter>heading.heading": ["Subscribe to our newsletter"],
    "newsletter>paragraph.text": ["<p>Sign up and be the first to hear about offers and new arrivals.</p>"],
    "footer>link_list.heading": ["Quick links"],
    /* tabela de quantidade da página de produto */
    "main-product>volume_breaks.tier_2_badge": ["BEST SELLER"],
    "main-product>volume_breaks.tier_2_benefit": ["Free shipping"],
    "main-product>volume_breaks.tier_3_benefit": ["Free shipping"],
    "main-product>volume_breaks.tier_4_benefit": ["Free shipping"],
    "main-product>volume_breaks.tier_2_caption": ["You save [amount_saved]"],
    "main-product>volume_breaks.tier_3_caption": ["You save [amount_saved]"],
    "main-product>volume_breaks.tier_4_caption": ["You save [amount_saved]"],
    /* rastreio de pedido */
    "track-order.placeholder": ["Tracking code"],
    "track-order.error_message": ["Enter a tracking code."],
    "track-order.footnote": ["<p>The code can take up to 48h to show up with the carrier.</p>"],
  },

  es: {
    "global.cart_progress_message": ["¡Te faltan [amount] para conseguir ENVÍO GRATIS!"],
    "global.cart_progress_success": ["¡Conseguiste ENVÍO GRATIS! 🎉"],
    "global.cart_timer_text": ["<strong>ENVÍO GRATIS</strong> reservado por [timer]"],
    "global.cart_savings_label": ["Has ahorrado"],
    "global.cart_upsell_heading": ["Llévate también"],
    "collection-list.title": ["Nuestras colecciones"],
    "featured-collection.title": ["Quizá te interese", "Ofertas especiales", "Selección destacada"],
    "main-list-collections.title": ["Colecciones"],
    "collage.heading": ["Descubre más de nuestros favoritos"],
    "footer.newsletter_heading": ["Suscríbete a nuestra newsletter"],
    "newsletter>heading.heading": ["Suscríbete a nuestra newsletter"],
    "newsletter>paragraph.text": ["<p>Suscríbete y entérate antes que nadie de las ofertas y novedades.</p>"],
    "footer>link_list.heading": ["Enlaces rápidos"],
    "main-product>volume_breaks.tier_2_badge": ["MÁS VENDIDO"],
    "main-product>volume_breaks.tier_2_benefit": ["Envío gratis"],
    "main-product>volume_breaks.tier_3_benefit": ["Envío gratis"],
    "main-product>volume_breaks.tier_4_benefit": ["Envío gratis"],
    "main-product>volume_breaks.tier_2_caption": ["Ahorras [amount_saved]"],
    "main-product>volume_breaks.tier_3_caption": ["Ahorras [amount_saved]"],
    "main-product>volume_breaks.tier_4_caption": ["Ahorras [amount_saved]"],
    "track-order.placeholder": ["Código de seguimiento"],
    "track-order.error_message": ["Escribe un código de seguimiento."],
    "track-order.footnote": ["<p>El código puede tardar hasta 48h en aparecer en la transportadora.</p>"],
  },
};

/**
 * Um distribuidor que lembra o que já entregou.
 *
 * A home tem duas `featured-collection`; sem memória, as duas sairiam com o
 * mesmo título e a página teria duas vitrines chamadas a mesma coisa. Cada
 * chave tem a sua vez, e quando a lista acaba a última repete — repetir é feio,
 * ficar em português é pior.
 */
export function distribuidorDeTextos(idioma) {
  const tabela = CONTEUDO_DE_TEMA[idioma];
  if (!tabela) return () => undefined;
  const usados = new Map();
  return (chave) => {
    const lista = tabela[chave];
    if (!lista?.length) return undefined;
    const vez = usados.get(chave) ?? 0;
    usados.set(chave, vez + 1);
    return lista[Math.min(vez, lista.length - 1)];
  };
}
