import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strToU8, zipSync } from "fflate";

/**
 * Fidelidade do motor de render contra os padrões reais dos temas Shopify
 * (Dawn e derivados como ShrinePro): canais de cor, esquemas iteráveis,
 * fontes do font_picker e grupos de seção arbitrários.
 */

const settingsSchema = JSON.stringify([
  { name: "theme_info", theme_name: "Tema de fidelidade", theme_version: "1.0.0", theme_author: "Orbis" },
  {
    name: "Cores",
    settings: [
      { type: "color", id: "colors_accent_1", label: "Destaque", default: "#008060" },
      { type: "color", id: "colors_text", label: "Texto", default: "#121212" },
      { type: "color_background", id: "gradient_accent_1", label: "Gradiente", default: "" },
    ],
  },
  {
    name: "Tipografia",
    settings: [
      { type: "font_picker", id: "type_header_font", label: "Títulos", default: "assistant_n4" },
      { type: "font_picker", id: "type_body_font", label: "Corpo", default: "assistant_n4" },
    ],
  },
]);

const layout = `<!doctype html><html><head>{{ content_for_header }}
<style>
:root {
  --color-base-accent-1: {{ settings.colors_accent_1.red }}, {{ settings.colors_accent_1.green }}, {{ settings.colors_accent_1.blue }};
  --gradient-base-accent-1: {% if settings.gradient_accent_1 != blank %}{{ settings.gradient_accent_1 }}{% else %}{{ settings.colors_accent_1 }}{% endif %};
  --font-heading-family: {{ settings.type_header_font.family }}, {{ settings.type_header_font.fallback_families }};
  --font-heading-style: {{ settings.type_header_font.style }};
  --font-heading-weight: {{ settings.type_header_font.weight }};
}
{% for scheme in settings.color_schemes %}.color-{{ scheme.id }} { --color-background: {{ scheme.settings.background.rgb }}; }
{% endfor %}
</style></head><body>{% sections 'promo-group' %}{{ content_for_layout }}</body></html>`;

function section(name, settings = []) {
  return `<div class="secao-{{ section.id }}">{{ section.settings.heading }}</div>{% schema %}${JSON.stringify({ name, settings, presets: [{ name }] })}{% endschema %}`;
}

function makeZip() {
  return zipSync(Object.fromEntries(Object.entries({
    "config/settings_schema.json": settingsSchema,
    "config/settings_data.json": JSON.stringify({
      current: {
        colors_accent_1: "#6d388b",
        colors_text: "#121212",
        gradient_accent_1: "",
        type_header_font: "playfair_display_i7",
        type_body_font: "harmonia_sans_n4",
        color_schemes: {
          "scheme-1": { settings: { background: "#ffffff", text: "#121212" } },
          "scheme-2": { settings: { background: "#0a0a0a", text: "#fafafa" } },
        },
      },
    }),
    "layout/theme.liquid": layout,
    "sections/hero.liquid": section("Hero", [{ type: "text", id: "heading", label: "Título", default: "Olá" }]),
    "sections/promo.liquid": section("Promo", [{ type: "text", id: "heading", label: "Título", default: "Promo" }]),
    "sections/main-product.liquid": section("Produto"),
    "sections/main-cart-items.liquid": section("Carrinho"),
    "sections/promo-group.json": JSON.stringify({ type: "promo", name: "Promoções", sections: { faixa: { type: "promo", settings: { heading: "Faixa global" } } }, order: ["faixa"] }),
    "templates/index.json": JSON.stringify({ sections: { hero: { type: "hero", settings: { heading: "Início" } } }, order: ["hero"] }),
    "templates/index.context.abc-123.json": JSON.stringify({ sections: { hero: { type: "hero", settings: { heading: "Contexto de mercado" } } }, order: ["hero"] }),
    "templates/product.json": JSON.stringify({ sections: { main: { type: "main-product", settings: {} } }, order: ["main"] }),
    "templates/cart.json": JSON.stringify({ sections: { cart: { type: "main-cart-items", settings: {} } }, order: ["cart"] }),
    "assets/base.css": "body{}",
  }).map(([path, value]) => [`Tema/${path}`, strToU8(value)])));
}

test("render reproduz cores, esquemas, fontes e grupos como a Shopify", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
    const bytes = makeZip();
    const theme = extractShopifyThemeBytes(bytes, "fidelidade.zip");

    /* importador: grupo arbitrário vira página; template contextual não */
    assert.ok(theme.pages.some((page) => page.id === "promo-group"), "sections/promo-group.json deveria virar grupo");
    assert.ok(!theme.pages.some((page) => page.id.includes(".context.")), "templates .context.* não são páginas do editor");

    const files = themeFilesFromZip(bytes);
    const html = await renderThemePage({ theme, files, pageId: "index", assetBase: (path) => `/x/${path}` });

    /* cores: canais expostos como no drop de cor da Shopify */
    assert.match(html, /--color-base-accent-1: 109, 56, 139;/, "os canais .red/.green/.blue devem sair da cor configurada");
    /* color_background vazio continua blank e cai no fallback da cor sólida */
    assert.match(html, /--gradient-base-accent-1: #6d388b;/);
    /* esquemas de cor: iteráveis, com id e canais */
    assert.match(html, /\.color-scheme-1 \{ --color-background: 255 255 255; \}/);
    assert.match(html, /\.color-scheme-2 \{ --color-background: 10 10 10; \}/);
    /* fontes: família multi-palavra, itálico só quando o handle diz i */
    assert.match(html, /--font-heading-family: Playfair Display, serif;/);
    assert.match(html, /--font-heading-style: italic;/);
    assert.match(html, /--font-heading-weight: 700;/);
    /* webfonts reais no content_for_header */
    assert.match(html, /fonts\.googleapis\.com\/css2\?[^"]*Playfair\+Display/);
    assert.match(html, /fonts\.googleapis\.com\/css2\?[^"]*Harmonia\+Sans/);
    /* disciplina de carga: SOMENTE as famílias usadas pelo tema entram na
       folha — nada de catálogo inteiro nem pesos além dos derivados */
    const sheet = html.match(/fonts\.googleapis\.com\/css2\?([^"]*)/)?.[1] ?? "";
    assert.equal((sheet.match(/family=/g) ?? []).length, 2, "duas famílias usadas, duas famílias na folha");
    /* grupo arbitrário renderizado por {% sections 'promo-group' %} */
    assert.match(html, /Faixa global/);
    /* nenhuma variável de cor quebrada */
    assert.doesNotMatch(html, /--[\w-]+:\s*(?:,\s*)+;/);
    /* ponte de sincronia: clique → editor e editor → scroll na seção */
    assert.match(html, /orbisSection/);
    assert.match(html, /orbisScrollTo/);
  } finally {
    await server.close();
  }
});

test("filtros de cor aceitam o drop e convertem entre formatos", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
    const bytes = zipSync({
      "Tema/config/settings_schema.json": strToU8(JSON.stringify([
        { name: "theme_info", theme_name: "Filtros", theme_version: "1.0", theme_author: "Orbis" },
        { name: "Cores", settings: [{ type: "color", id: "cor", label: "Cor", default: "#336699" }] },
      ])),
      "Tema/config/settings_data.json": strToU8(JSON.stringify({ current: { cor: "#336699" } })),
      "Tema/layout/theme.liquid": strToU8("<body>hex={{ settings.cor | color_to_hex }};rgb={{ settings.cor | color_to_rgb }};claro={{ settings.cor | color_lighten: 20 }};alpha={{ settings.cor | color_modify: 'alpha', 0.5 }};{{ content_for_layout }}</body>"),
      "Tema/sections/hero.liquid": strToU8(`<p>ok</p>{% schema %}${JSON.stringify({ name: "Hero", settings: [], presets: [{ name: "Hero" }] })}{% endschema %}`),
      "Tema/templates/index.json": strToU8(JSON.stringify({ sections: { hero: { type: "hero", settings: {} } }, order: ["hero"] })),
    });
    const theme = extractShopifyThemeBytes(bytes, "filtros.zip");
    const files = themeFilesFromZip(bytes);
    const html = await renderThemePage({ theme, files, pageId: "index", assetBase: (path) => `/x/${path}` });
    assert.match(html, /hex=#336699;/);
    assert.match(html, /rgb=rgb\(51, 102, 153\);/);
    assert.match(html, /claro=rgb\(92, 133, 173\);/);
    assert.match(html, /alpha=rgba\(51, 102, 153, 0\.5\);/);
  } finally {
    await server.close();
  }
});
