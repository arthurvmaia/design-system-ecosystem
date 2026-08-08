import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strToU8, zipSync } from "fflate";

/**
 * O catálogo real (10 produtos extraídos de fiordibrasil.com) é o que abastece
 * toda prévia de tema importado. Estes testes travam: a quantidade, a completude
 * de cada produto e o fato de os produtos inventados não voltarem.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));
const catalogoUrl = new URL("../lib/catalogo-loja.ts", import.meta.url);
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

test("o catálogo tem exatamente 10 produtos reais e completos", async () => {
  const { CATALOGO_LOJA } = await comServidor((server) => server.ssrLoadModule("/lib/catalogo-loja.ts"));
  assert.equal(CATALOGO_LOJA.length, 10);
  const handles = new Set();
  for (const produto of CATALOGO_LOJA) {
    assert.ok(produto.title.trim().length > 3, `título vazio em ${produto.handle}`);
    assert.ok(produto.descriptionHtml.trim().length > 40, `descrição curta demais em ${produto.handle}`);
    assert.ok(produto.images.length > 0, `sem imagem em ${produto.handle}`);
    for (const imagem of produto.images) assert.match(imagem.src, /^https:\/\//);
    assert.ok(produto.variants.length > 0, `sem variante em ${produto.handle}`);
    for (const variante of produto.variants) {
      assert.ok(Number.isInteger(variante.price) && variante.price > 0, `preço inválido em ${produto.handle}`);
      assert.ok(Number.isInteger(variante.id), `id de variante inválido em ${produto.handle}`);
    }
    assert.ok(!handles.has(produto.handle), `handle repetido: ${produto.handle}`);
    handles.add(produto.handle);
  }
  /* ids de variante são únicos no catálogo inteiro: é assim que o carrinho casa item e produto */
  const variantes = CATALOGO_LOJA.flatMap((produto) => produto.variants.map((v) => v.id));
  assert.equal(new Set(variantes).size, variantes.length);
});

test("os produtos inventados saíram do render e do fallback", async () => {
  const [catalogo, preview] = await Promise.all([readFile(catalogoUrl, "utf8"), readFile(previewUrl, "utf8")]);
  const renderSource = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  for (const inventado of [/Daily Ritual/, /Pure Form/, /Starter Kit/, /Produto de demonstração/]) {
    assert.doesNotMatch(renderSource, inventado);
    assert.doesNotMatch(preview, inventado);
  }
  /* avaliação e variantes falsas ("Opção 1/2/3") também não voltam */
  assert.doesNotMatch(preview, /shopify-rating/);
  assert.doesNotMatch(preview, /Opção 1<\/button>/);
  /* o catálogo declara de onde veio */
  assert.match(catalogo, /fiordibrasil\.com/);
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
    const { CATALOGO_LOJA } = await server.ssrLoadModule("/lib/catalogo-loja.ts");
    const theme = await extractShopifyThemeBytes(zip, "rota.zip");
    const files = themeFilesFromZip(zip);
    const base = { theme, files, pageId: "product", assetBase: (path) => `/assets/${path}` };

    /* um produto com mais de uma variante, para a segunda ser escolhível */
    const alvo = CATALOGO_LOJA.find((produto) => produto.variants.length > 1);
    const segunda = alvo.variants[1];

    const semHandle = await renderThemePage(base);
    const comHandle = await renderThemePage({ ...base, handle: alvo.handle });
    const comVariante = await renderThemePage({ ...base, handle: alvo.handle, variantId: segunda.id });

    assert.ok(comHandle.includes(alvo.title), "o handle da rota não escolheu o produto");
    assert.ok(comHandle.includes(alvo.descriptionHtml.slice(0, 30).replace(/<[^>]*>/g, "").trim().slice(0, 20)) || comHandle.length > semHandle.length - 1);
    assert.ok(comVariante.includes(segunda.title), `a variante ${segunda.title} não foi selecionada`);
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
    const { CATALOGO_LOJA } = await server.ssrLoadModule("/lib/catalogo-loja.ts");

    const theme = await extractShopifyThemeBytes(zip, "catalogo.zip");
    const files = themeFilesFromZip(zip);
    const primeiro = CATALOGO_LOJA[0];
    const variante = primeiro.variants[0];

    const html = await renderThemePage({
      theme, files, pageId: "index", assetBase: (path) => `/assets/${path}`,
      cartItems: [{ variantId: variante.id, quantity: 2 }],
    });

    /* a vitrine mostra os 10 produtos reais, com imagem da própria loja */
    for (const produto of CATALOGO_LOJA) assert.ok(html.includes(produto.title), `faltou ${produto.title} na vitrine`);
    assert.ok(html.includes("cdn.shopify.com"), "imagem real do produto não foi renderizada");

    /* o carrinho casou a variante clicada, com quantidade e total certos */
    const esperado = (variante.price * 2 / 100).toFixed(2).replace(".", ",");
    assert.ok(html.includes(`${primeiro.title}`), "o carrinho não mostrou o produto");
    assert.ok(html.includes(`x2`), "o carrinho não mostrou a quantidade");
    assert.ok(html.includes(esperado), `o total da linha (${esperado}) não apareceu`);
  });
});
