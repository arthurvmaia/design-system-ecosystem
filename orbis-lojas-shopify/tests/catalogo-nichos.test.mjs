import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strToU8, zipSync } from "fflate";

/**
 * O catálogo dos nichos é a ÚNICA fonte de mercadoria do app: loja gerada por
 * nicho mostra os dez produtos daquele nicho, e tema importado não mostra
 * produto nenhum. Estes testes travam as duas metades.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));
const previewUrl = new URL("../app/ShopifyStorePreview.tsx", import.meta.url);

async function comServidor(trabalho) {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try { return await trabalho(server); } finally { await server.close(); }
}

test("todo nicho tem exatamente 10 produtos reais e completos", async () => {
  const { PRODUTOS_POR_NICHO } = await comServidor((server) => server.ssrLoadModule("/lib/catalogo-nichos.ts"));
  const esperados = ["roupas", "oculos", "relogios", "beleza", "casa", "pet", "fitness", "gadgets", "infantil", "joias"];
  const ids = new Set();
  for (const nicho of esperados) {
    const lista = PRODUTOS_POR_NICHO[nicho];
    assert.ok(Array.isArray(lista), `nicho ${nicho} sem catálogo`);
    assert.equal(lista.length, 10, `${nicho} tem ${lista?.length} produtos; o pedido é 10`);
    for (const produto of lista) {
      assert.ok(produto.title.trim().length >= 12, `título curto em ${nicho}`);
      assert.ok(Number.isInteger(produto.price) && produto.price > 0, `preço inválido em ${nicho}`);
      assert.ok(produto.images.length > 0, `sem imagem em ${nicho}`);
      for (const imagem of produto.images) assert.match(imagem, /^https:\/\//);
      assert.match(produto.handle, /^[a-z0-9-]+$/, `handle inválido em ${nicho}`);
      /* id único no catálogo inteiro: é por ele que o carrinho casa a linha */
      assert.ok(!ids.has(produto.id), `produto repetido entre nichos: ${produto.id}`);
      ids.add(produto.id);
    }
  }
  assert.equal(ids.size, 100, "dez nichos vezes dez produtos");
});

test("os produtos inventados saíram do render e do fallback", async () => {
  const [catalogo, preview] = await Promise.all([readFile(new URL("../lib/catalogo-nichos.ts", import.meta.url), "utf8"), readFile(previewUrl, "utf8")]);
  const renderSource = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  for (const inventado of [/Daily Ritual/, /Pure Form/, /Starter Kit/, /Produto de demonstração/]) {
    assert.doesNotMatch(renderSource, inventado);
    assert.doesNotMatch(preview, inventado);
  }
  /* avaliação e variantes falsas ("Opção 1/2/3") também não voltam */
  assert.doesNotMatch(preview, /shopify-rating/);
  assert.doesNotMatch(preview, /Opção 1<\/button>/);
  /* o catálogo declara de onde veio */
  assert.match(catalogo, /aliexpress\.com/);
});

test("tema sem nicho não recebe produto nem coleção inventados", async () => {
  const layout = "<!doctype html><html><body>{{ content_for_layout }}</body></html>";
  const secao = `<p class="quantos">{{ collections.all.products.size }}</p>
<p class="capa">{{ collections['moda-feminina'].featured_image | default: 'sem-imagem' }}</p>
<ul>{% for produto in collections.all.products %}<li>{{ produto.title }}</li>{% endfor %}</ul>
{% schema %}{"name":"Vitrine"}{% endschema %}`;
  const zip = zipSync({
    "layout/theme.liquid": strToU8(layout),
    "sections/vitrine.liquid": strToU8(secao),
    "templates/index.json": strToU8(JSON.stringify({ sections: { vitrine: { type: "vitrine" } }, order: ["vitrine"] })),
    "config/settings_schema.json": strToU8(JSON.stringify([{ name: "theme_info", theme_name: "Cru", theme_version: "1.0" }])),
    "config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
  });

  await comServidor(async (server) => {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");
    const theme = await extractShopifyThemeBytes(zip, "cru.zip");
    const files = themeFilesFromZip(zip);
    const base = { theme, files, pageId: "index", assetBase: (path) => `/assets/${path}` };

    /**
     * Tema importado que ainda não virou loja de ninguém aparece com o que ELE
     * traz. Enchendo de catálogo, todo tema ficava igual ao lado, com os mesmos
     * produtos e a mesma foto repetida em cada cartão de coleção.
     */
    const cru = await renderThemePage(base);
    assert.match(cru, /<p class="quantos">0<\/p>/, "tema cru não pode ganhar vitrine");
    assert.match(cru, /<p class="capa">sem-imagem<\/p>/, "coleção não empresta a foto de um produto qualquer");
    assert.doesNotMatch(cru, /aliexpress-media\.com/, "nenhuma imagem de catálogo no tema cru");
    for (const produto of PRODUTOS_POR_NICHO.oculos.slice(0, 3)) {
      assert.ok(!cru.includes(produto.title), `produto injetado no tema cru: ${produto.title}`);
    }

    /* com nicho, a vitrine aparece: é a loja que o cliente mandou gerar */
    const comNicho = await renderThemePage({ ...base, nicheId: "oculos" });
    assert.match(comNicho, /<p class="quantos">10<\/p>/, "a loja gerada por nicho mostra os 10 produtos");
    assert.ok(comNicho.includes(PRODUTOS_POR_NICHO.oculos[0].title));
  });
});

test("a rota escolhe o produto e a variante: handle e ?variant chegam ao render", async () => {
  const layout = "<!doctype html><html><body>{{ content_for_layout }}</body></html>";
  const secao = `<h1 class="titulo">{{ product.title }}</h1>
<p class="variante">{{ product.selected_or_first_available_variant.title }}</p>
<p class="preco">{{ product.price | money }}</p>
<p class="descricao">{{ product.description }}</p>
{% schema %}{"name":"Produto"}{% endschema %}`;
  const zip = zipSync({
    "layout/theme.liquid": strToU8(layout),
    "sections/principal.liquid": strToU8(secao),
    "templates/product.json": strToU8(JSON.stringify({ sections: { principal: { type: "principal" } }, order: ["principal"] })),
    "config/settings_schema.json": strToU8(JSON.stringify([{ name: "theme_info", theme_name: "Rota", theme_version: "1.0" }])),
    "config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
  });

  await comServidor(async (server) => {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");
    const VITRINE = PRODUTOS_POR_NICHO.oculos;
    const theme = await extractShopifyThemeBytes(zip, "rota.zip");
    const files = themeFilesFromZip(zip);
    /* com nicho: tema cru nasce SEM vitrine, e este teste é sobre a rota */
    const base = { theme, files, pageId: "product", assetBase: (path) => `/assets/${path}`, nicheId: "oculos" };

    /* o produto do nicho tem uma variante só; o id dele É o id da variante */
    const alvo = VITRINE[0];
    const segunda = { id: alvo.id, price: alvo.price };

    const semHandle = await renderThemePage(base);
    const comHandle = await renderThemePage({ ...base, handle: alvo.handle });
    const comVariante = await renderThemePage({ ...base, handle: alvo.handle, variantId: segunda.id });

    assert.ok(comHandle.includes(alvo.title), "o handle da rota não escolheu o produto");
    assert.ok(comHandle.length > 0 && semHandle.length > 0);
    assert.ok(comVariante.includes((segunda.price / 100).toFixed(2).replace(".", ",")), "o preço da variante escolhida não apareceu");
  });
});

test("a ponte do preview resolve página buscada por fetch e troca de variante", async () => {
  const render = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  const preview = await readFile(previewUrl, "utf8");
  /* quick-add "Escolher opções": o tema busca /products/... por fetch */
  assert.match(render, /function pedirPagina/);
  assert.match(render, /orbisPaginaHref/);
  assert.match(render, /products\|collections\|pages\|blogs\|search/);
  /* seletor de opções: a variante escolhida vai para o formulário de compra */
  assert.match(render, /function trocarVariante/);
  assert.match(render, /querySelectorAll\('\[name="id"\]'\)/);
  /* comprar não depende mais do modo do editor */
  assert.doesNotMatch(render, /if\(window\.__orbisModo==="selecionar"\)return;/);
  /* o editor resolve handle e variante da rota */
  assert.match(preview, /export function handleFromHref/);
  assert.match(preview, /export function variantFromHref/);
  assert.match(preview, /orbisPaginaHref/);
});

test("a ponte trata quantidade e remoção da linha do carrinho", async () => {
  const render = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  const preview = await readFile(previewUrl, "utf8");
  /* mais/menos, lixeira e quantidade digitada não dependem do JS do tema */
  assert.match(render, /function definirQuantidade/);
  assert.match(render, /function campoDaLinha/);
  assert.match(render, /data-quantity-variant-id/);
  assert.match(render, /nome==="minus"/);
  assert.match(render, /cart-remove-button/);
  /* redesenho comum a comprar, mudar e remover */
  assert.match(render, /function sincronizarCarrinho/);
  /* o carrinho do editor é a fonte da verdade quando o quadro é remontado */
  assert.match(render, /orbisCartDefinir/);
  assert.match(preview, /orbisCartDefinir/);
});

test("o tema renderizado mostra produto real e o carrinho recebe a variante clicada", async () => {
  const layout = "<!doctype html><html><body>{{ content_for_layout }}</body></html>";
  const secao = `{% for produto in collections.all.products %}<article class="card"><h3>{{ produto.title }}</h3><p class="preco">{{ produto.price | money }}</p><img src="{{ produto.featured_image | image_url: width: 400 }}" alt="{{ produto.title }}">{% form 'product', produto %}<input type="hidden" name="id" value="{{ produto.selected_or_first_available_variant.id }}"><button name="add">Adicionar</button>{% endform %}</article>{% endfor %}
<div class="gaveta">{% for item in cart.items %}<span class="linha">{{ item.title }} x{{ item.quantity }} = {{ item.line_price | money }}</span>{% endfor %}</div>
{% schema %}{"name":"Vitrine"}{% endschema %}`;

  const zip = zipSync({
    "layout/theme.liquid": strToU8(layout),
    "sections/vitrine.liquid": strToU8(secao),
    "templates/index.json": strToU8(JSON.stringify({ sections: { vitrine: { type: "vitrine" } }, order: ["vitrine"] })),
    "config/settings_schema.json": strToU8(JSON.stringify([{ name: "theme_info", theme_name: "Catálogo", theme_version: "1.0" }])),
    "config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
  });

  await comServidor(async (server) => {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");
    const VITRINE = PRODUTOS_POR_NICHO.oculos;

    const theme = await extractShopifyThemeBytes(zip, "catalogo.zip");
    const files = themeFilesFromZip(zip);
    const primeiro = VITRINE[0];
    const variante = { id: primeiro.id, price: primeiro.price };

    const html = await renderThemePage({
      theme, files, pageId: "index", assetBase: (path) => `/assets/${path}`,
      /* a vitrine só existe com nicho; tema cru nasce vazio de propósito */
      nicheId: "oculos",
      cartItems: [{ variantId: variante.id, quantity: 2 }],
    });

    /* a vitrine mostra os 10 produtos reais, com imagem da própria loja */
    for (const produto of VITRINE) assert.ok(html.includes(produto.title), `faltou ${produto.title} na vitrine`);
    assert.ok(html.includes("aliexpress-media.com"), "imagem real do produto não foi renderizada");

    /* o carrinho casou a variante clicada, com quantidade e total certos */
    const esperado = (variante.price * 2 / 100).toFixed(2).replace(".", ",");
    assert.ok(html.includes(`${primeiro.title}`), "o carrinho não mostrou o produto");
    assert.ok(html.includes(`x2`), "o carrinho não mostrou a quantidade");
    assert.ok(html.includes(esperado), `o total da linha (${esperado}) não apareceu`);
  });
});
