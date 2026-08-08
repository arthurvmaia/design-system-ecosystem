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
