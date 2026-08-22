/**
 * A REDE por baixo da tradução do tema.
 *
 * O texto do próprio tema — "Adicionar ao carrinho", "Esgotado", "Finalizar a
 * compra" — vem dos arquivos de tradução que o tema carrega, e é assim que tem
 * de ser: a Shopify já traduziu o Dawn para trinta idiomas, e manter uma
 * segunda tradução nossa seria garantir que as duas divergissem.
 *
 * ## Por que a rede existe
 *
 * Porque tema real chega com buraco. Medido no acervo desta máquina, num Dawn
 * baixado de uma loja brasileira: dos 30 arquivos de tradução, **29 são
 * traduções de verdade e um não é** — `en.json` está byte a byte igual ao
 * `pt-BR.default.json`. É o que a Shopify faz ao trocar o idioma padrão da
 * loja: ela renomeia `en.default.json` para `pt-BR.default.json` com o conteúdo
 * traduzido, e o inglês some do pacote.
 *
 * Sem rede, escolher "English" entregava uma loja com o hero, o FAQ e as
 * coleções em inglês e o botão de comprar dizendo "Adicionar ao carrinho". A
 * loja pela metade — exatamente o que a tela de idioma existe para evitar.
 *
 * ## O que ela cobre, e o que não
 *
 * As 58 frases que um COMPRADOR lê numa loja gerada: comprar, esgotado, preço,
 * carrinho, busca, newsletter, login, 404. Não cobre as 290 chaves do tema — filtro de coleção, painel de conta,
 * endereço, pedido — porque essas não aparecem numa loja recém-nascida. A
 * lista saiu de MEDIR: renderizar a home nos três idiomas e caçar o que
 * sobrou de português na página, palavra por palavra.
 *
 * A rede só entra quando o tema NÃO traz tradução própria para o idioma
 * escolhido. Onde ele traz, ele vence: quem conhece as chaves daquele tema é
 * ele, e a Shopify escreve melhor a Shopify do que nós.
 */

/**
 * As chaves são as do Dawn e derivados, achatadas por ponto — o mesmo formato
 * em que o renderizador resolve `{{ 'products.product.add_to_cart' | t }}`.
 * `{{ price }}`, `{{ title }}` e `{{ terms }}` são do próprio tema e passam
 * inteiros: são eles que o Liquid preenche depois.
 */
export const TRADUCAO_DE_TEMA = {
  en: {
    "products.product.add_to_cart": "Add to cart",
    "products.product.sold_out": "Sold out",
    "products.product.unavailable": "Unavailable",
    "products.product.on_sale": "Sale",
    "products.product.quantity.label": "Quantity",
    "products.product.price.regular_price": "Regular price",
    "products.product.price.sale_price": "Sale price",
    "products.product.price.from_price_html": "From {{ price }}",
    "products.product.view_full_details": "View full details",
    "products.product.include_taxes": "Tax included.",
    "sections.cart.title": "Your cart",
    "sections.cart.empty": "Your cart is empty",
    "sections.cart.checkout": "Check out",
    "sections.cart.update": "Update",
    "sections.cart.remove_title": "Remove {{ title }}",
    "sections.cart.headings.product": "Product",
    "sections.cart.headings.price": "Price",
    "sections.cart.headings.total": "Total",
    "sections.cart.headings.quantity": "Quantity",
    "sections.cart.subtotal": "Subtotal",
    "general.continue_shopping": "Continue shopping",
    "general.search.search": "Search",
    "general.search.reset": "Clear search term",
    "general.cart.view_empty_cart": "View my cart",
    "general.pagination.previous": "Previous page",
    "general.pagination.next": "Next page",
    "newsletter.label": "Email",
    "newsletter.button_label": "Subscribe",
    "newsletter.success": "Thanks for subscribing",
    "customer.log_in": "Log in",
    "customer.log_out": "Log out",
    "customer.create_account": "Create account",
    "customer.login_page.sign_in": "Sign in",
    "templates.404.title": "Page not found",
    "templates.search.no_results": "No results found for “{{ terms }}”. Check the spelling or use a different word or phrase.",
    "templates.contact.form.send": "Send",
    "onboarding.product_title": "Example product title",
    "sections.cart.headings.image": "Product image",
    "sections.cart.caption": "Cart items",
    "sections.cart.new_subtotal": "New subtotal",
    "sections.cart.cart_error": "There was an error updating your cart. Please try again.",
    "sections.cart.taxes_and_shipping_at_checkout": "Taxes and shipping calculated at checkout",
    "sections.featured_collection.view_all": "View all",
    "sections.featured_collection.view_all_label": "View all products in the {{ collection_name }} collection",
    "sections.collection_list.view_all": "View all",
    "sections.featured_blog.view_all": "View all",
    "sections.header.menu": "Menu",
    "templates.cart.cart": "Cart",
    "general.cart.view": "View cart ({{ count }})",
    "general.cart.item_added": "Item added to your cart",
    "products.product.price.unit_price": "Unit price",
    "products.product.product_variants": "Product variants",
    "products.product.quantity.in_cart_html": "<span class=\"quantity-cart\">{{ quantity }}</span> in cart",
    "products.product.quantity.input_label": "Quantity for {{ product }}",
    "products.product.quantity.increase": "Increase quantity for {{ product }}",
    "products.product.quantity.decrease": "Decrease quantity for {{ product }}",
    "products.facets.clear_all": "Remove all",
    "accessibility.close": "Close",
  },
  es: {
    "products.product.add_to_cart": "Agregar al carrito",
    "products.product.sold_out": "Agotado",
    "products.product.unavailable": "No disponible",
    "products.product.on_sale": "Oferta",
    "products.product.quantity.label": "Cantidad",
    "products.product.price.regular_price": "Precio habitual",
    "products.product.price.sale_price": "Precio de oferta",
    "products.product.price.from_price_html": "A partir de {{ price }}",
    "products.product.view_full_details": "Ver todos los detalles",
    "products.product.include_taxes": "Impuesto incluido.",
    "sections.cart.title": "Tu carrito",
    "sections.cart.empty": "Tu carrito está vacío",
    "sections.cart.checkout": "Pagar pedido",
    "sections.cart.update": "Actualizar",
    "sections.cart.remove_title": "Eliminar {{ title }}",
    "sections.cart.headings.product": "Producto",
    "sections.cart.headings.price": "Precio",
    "sections.cart.headings.total": "Total",
    "sections.cart.headings.quantity": "Cantidad",
    "sections.cart.subtotal": "Subtotal",
    "general.continue_shopping": "Seguir comprando",
    "general.search.search": "Búsqueda",
    "general.search.reset": "Borrar término de búsqueda",
    "general.cart.view_empty_cart": "Ver mi carrito",
    "general.pagination.previous": "Página anterior",
    "general.pagination.next": "Página siguiente",
    "newsletter.label": "Correo electrónico",
    "newsletter.button_label": "Suscribirse",
    "newsletter.success": "Gracias por suscribirte",
    "customer.log_in": "Iniciar sesión",
    "customer.log_out": "Cerrar sesión",
    "customer.create_account": "Crear cuenta",
    "customer.login_page.sign_in": "Iniciar sesión",
    "templates.404.title": "Página no encontrada",
    "templates.search.no_results": "No se encontraron resultados para “{{ terms }}”. Revisa la ortografía o usa una palabra o frase diferente.",
    "templates.contact.form.send": "Enviar",
    "onboarding.product_title": "Ejemplo de nombre del producto",
    "sections.cart.headings.image": "Imagen del producto",
    "sections.cart.caption": "Artículos en el carrito",
    "sections.cart.new_subtotal": "Nuevo subtotal",
    "sections.cart.cart_error": "Hubo un error al actualizar tu carrito. Inténtalo de nuevo.",
    "sections.cart.taxes_and_shipping_at_checkout": "Los impuestos y gastos de envío se calculan en el pago",
    "sections.featured_collection.view_all": "Ver todo",
    "sections.featured_collection.view_all_label": "Ver todos los productos de la colección {{ collection_name }}",
    "sections.collection_list.view_all": "Ver todo",
    "sections.featured_blog.view_all": "Ver todo",
    "sections.header.menu": "Menú",
    "templates.cart.cart": "Carrito",
    "general.cart.view": "Ver carrito ({{ count }})",
    "general.cart.item_added": "Artículo agregado a tu carrito",
    "products.product.price.unit_price": "Precio unitario",
    "products.product.product_variants": "Variantes de producto",
    "products.product.quantity.in_cart_html": "<span class=\"quantity-cart\">{{ quantity }}</span> en el carrito",
    "products.product.quantity.input_label": "Cantidad para {{ product }}",
    "products.product.quantity.increase": "Aumentar cantidad para {{ product }}",
    "products.product.quantity.decrease": "Reducir cantidad para {{ product }}",
    "products.facets.clear_all": "Eliminar todos",
    "accessibility.close": "Cerrar",
  },
};

/** A rede daquele idioma — vazia para português, que é a língua dos temas daqui. */
export function redeDeTraducao(idioma) {
  return TRADUCAO_DE_TEMA[idioma] ?? {};
}
