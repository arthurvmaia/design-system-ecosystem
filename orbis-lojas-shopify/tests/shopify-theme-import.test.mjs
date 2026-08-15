import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strToU8, zipSync } from "fflate";

const settingsSchema = JSON.stringify([
  { name: "theme_info", theme_name: "Tema de teste", theme_version: "2.4.0", theme_author: "Orbis" },
  { name: "Cores", settings: [{ type: "color", id: "colors_accent_1", label: "Destaque", default: "#008060" }] },
]);

function section(name, settings = []) {
  return `{% schema %}${JSON.stringify({ name, settings, presets: [{ name }] })}{% endschema %}`;
}

function archive(files) {
  return zipSync(Object.fromEntries(Object.entries(files).map(([path, value]) => [`Tema/${path}`, strToU8(value)])));
}

test("importador reconhece temas OS 2.0 e clássicos sem perder os arquivos", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const os2 = extractShopifyThemeBytes(archive({
      "config/settings_schema.json": settingsSchema,
      "config/settings_data.json": JSON.stringify({ current: { colors_accent_1: "#112233" } }),
      "sections/slideshow.liquid": section("Slideshow", [{ type: "text", id: "heading", label: "Título", default: "Olá" }]),
      "sections/main-product.liquid": section("Produto"),
      "sections/main-cart-items.liquid": section("Carrinho"),
      "templates/index.json": `/* arquivo gerado pela Shopify */ ${JSON.stringify({ sections: { hero: { type: "slideshow", settings: { heading: "Início" } } }, order: ["hero"] })}`,
      "templates/product.json": JSON.stringify({ sections: { main: { type: "main-product", settings: {} } }, order: ["main"] }),
      "templates/cart.json": JSON.stringify({ sections: { cart: { type: "main-cart-items", settings: {} } }, order: ["cart"] }),
      "assets/theme.css": "body{}",
      "snippets/card.liquid": "<div>card</div>",
    }), "os2.zip");
    assert.equal(os2.format, "shopify-os-2.0");
    assert.equal(os2.compatibility.architecture, "Shopify OS 2.0");
    assert.ok(os2.pages.some((page) => page.id === "index"));
    assert.ok(os2.pages.some((page) => page.id === "search"));
    assert.equal(os2.summary.assetCount, 1);
    assert.equal(os2.summary.snippetCount, 1);
    assert.equal(os2.sourceFiles.length, 10);

    const vintage = extractShopifyThemeBytes(archive({
      "config/settings_schema.json": settingsSchema,
      "layout/theme.liquid": "{% section 'header' %}{{ content_for_layout }}{% section 'footer' %}",
      "sections/header.liquid": section("Cabeçalho"),
      "sections/footer.liquid": section("Rodapé"),
      "sections/slideshow.liquid": section("Slideshow").replace("{% schema %}", "{%- schema -%}"),
      "sections/main-product.liquid": section("Produto"),
      "sections/main-cart-items.liquid": section("Carrinho"),
      "templates/index.liquid": "{% section 'slideshow' %}",
      "templates/product.liquid": "{{ product.title }}",
      "templates/cart.liquid": "{{ cart.items }}",
    }), "vintage.zip");
    assert.equal(vintage.format, "shopify-vintage");
    assert.equal(vintage.compatibility.architecture, "Shopify clássico");
    assert.ok(vintage.pages.some((page) => page.id === "header-group"));
    assert.ok(vintage.pages.some((page) => page.id === "footer-group"));
    assert.ok(vintage.pages.find((page) => page.id === "product")?.sections.some((item) => item.type === "main-product"));
    assert.equal(vintage.summary.liquidTemplateCount, 3);
  } finally {
    await server.close();
  }
});

test("importador encontra automaticamente um tema dentro de ZIPs de instalação", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const innerTheme = archive({
      "config/settings_schema.json": settingsSchema,
      "config/settings_data.json": JSON.stringify({ current: { colors_accent_1: "#334455" } }),
      "layout/theme.liquid": "{{ content_for_layout }}",
      "sections/slideshow.liquid": section("Slideshow"),
      "sections/main-product.liquid": section("Produto"),
      "sections/main-cart-items.liquid": section("Carrinho"),
      "templates/index.liquid": "{% section 'slideshow' %}",
      "templates/product.liquid": "{{ product.title }}",
      "templates/cart.liquid": "{{ cart.items }}",
      "assets/theme.css": "body{}",
    });
    const packageZip = zipSync({
      "Documentação/leia-me.txt": strToU8("Pacote de instalação"),
      "Para instalar/tema-kalles.zip": innerTheme,
    });
    const imported = extractShopifyThemeBytes(packageZip, "tema-kalles-nichado.zip");
    assert.equal(imported.compatibility.packageDepth, 1);
    assert.equal(imported.compatibility.themeArchivePath, "Para instalar/tema-kalles.zip");
    assert.match(imported.sourceFile, /tema-kalles-nichado\.zip.*tema-kalles\.zip/);
    assert.equal(imported.summary.fileCount, 10);
    assert.equal(imported.summary.assetCount, 1);
    assert.ok(imported.pages.some((page) => page.id === "cart"));
  } finally {
    await server.close();
  }
});

test("a pasta de prévia do pacote entregue não entra no tema", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { themeFilesFromZip, extractShopifyThemeBytes } = await server.ssrLoadModule("/lib/shopify-theme.ts");

    /**
     * O pacote que a Orbis entrega é importável como tema — é o objetivo — e
     * leva ao lado uma pasta `previa-local/` com a prévia, o CSV de produtos e
     * o kit de logo. Reimportar esse pacote é gesto natural, e ela entrava
     * junto: um tema real desta máquina chegou a 354 arquivos, 40 de prévia.
     *
     * O estrago era silencioso e cumulativo: na geração seguinte os arquivos do
     * tema são gravados DEPOIS dos novos e sobrescreviam o CSV, o leia-me e as
     * imagens pelos da entrega anterior — cada loja nova nascia com o catálogo
     * de uma loja velha.
     */
    const arquivos = {
      "config/settings_schema.json": JSON.stringify([{ name: "theme_info", theme_name: "T", theme_version: "1", theme_author: "a" }]),
      "config/settings_data.json": JSON.stringify({ current: {} }),
      "layout/theme.liquid": "{{ content_for_layout }}",
      "sections/hero.liquid": '<div></div>{% schema %}{"name":"Hero"}{% endschema %}',
      "templates/index.json": JSON.stringify({ sections: { hero: { type: "hero", settings: {} } }, order: ["hero"] }),
      /* o que vem de carona num pacote entregue */
      "previa-local/index.html": "<html></html>",
      "previa-local/produtos-para-importar.csv": "Title\nvelho",
      "previa-local/logo-da-marca/logo-extenso.svg": "<svg></svg>",
      "previa-local/imagens-para-a-shopify/orbis-1-banner.png": "x",
    };
    const zip = zipSync(Object.fromEntries(Object.entries(arquivos).map(([p, v]) => [p, strToU8(v)])));

    const lidos = themeFilesFromZip(zip);
    const caminhos = [...lidos.keys()];
    assert.equal(caminhos.filter((p) => p.startsWith("previa-local/")).length, 0, "prévia não pode virar arquivo de tema");
    /* e o tema de verdade continua inteiro */
    for (const obrigatorio of ["layout/theme.liquid", "config/settings_schema.json", "templates/index.json", "sections/hero.liquid"]) {
      assert.ok(lidos.has(obrigatorio), `sumiu ${obrigatorio}`);
    }
    /* o importador tambem nao lista a previa entre os arquivos do tema */
    const tema = extractShopifyThemeBytes(zip, "pacote.zip");
    assert.equal(tema.sourceFiles.filter((f) => f.path.startsWith("previa-local/")).length, 0);
  } finally {
    await server.close();
  }
});
