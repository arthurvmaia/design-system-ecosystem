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
  return `<div class="secao-{{ section.id }}">{{ section.settings.heading }}{% for block in section.blocks %}<p {{ block.shopify_attributes }}>{{ block.settings.texto }}</p>{% endfor %}</div>{% schema %}${JSON.stringify({ name, settings, blocks: [{ type: "linha", name: "Linha", settings: [{ type: "text", id: "texto", label: "Texto", default: "linha" }] }], presets: [{ name, blocks: [{ type: "linha" }] }] })}{% endschema %}`;
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
    /* Banner com imagem da LOJA (shopify://shop_images/…), que é o caso de toda
       loja real: o arquivo mora nos Arquivos da loja e não viaja no ZIP. */
    "sections/image-banner.liquid": `<div class="banner">desktop={{ section.settings.image.width }}x{{ section.settings.image.height }} celular={{ section.settings.mobile_image.width }}x{{ section.settings.mobile_image.height }} url=[{{ section.settings.image | image_url }}]</div>{% schema %}${JSON.stringify({
      name: "Banner",
      settings: [
        { type: "image_picker", id: "image", label: "Imagem" },
        { type: "image_picker", id: "mobile_image", label: "Imagem do celular" },
      ],
      blocks: [],
    })}{% endschema %}`,
    "sections/main-product.liquid": section("Produto"),
    "sections/main-cart-items.liquid": section("Carrinho"),
    "sections/promo-group.json": JSON.stringify({ type: "promo", name: "Promoções", sections: { faixa: { type: "promo", settings: { heading: "Faixa global" } } }, order: ["faixa"] }),
    "templates/index.json": JSON.stringify({
      sections: {
        hero: { type: "hero", settings: { heading: "Início" }, blocks: { "linha-1": { type: "linha", settings: { texto: "linha um" } } }, block_order: ["linha-1"] },
        faixa: { type: "image-banner", settings: { image: "shopify://shop_images/BANNER.jpg", mobile_image: "shopify://shop_images/BANNER-CELULAR.png" } },
        cartao: { type: "promo", settings: { heading: "Promo" } },
      },
      order: ["hero", "faixa", "cartao"],
    }),
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
    /* Seção de grupo carrega `shopify-section-group-<grupo>`, como na Shopify.
       Não é enfeite: o CSS dos temas se apoia nessa classe, e no Dawn é
       `.section-header.shopify-section-group-header-group { z-index: 3 }` que
       dá empilhamento ao cabeçalho. Sem ela o cabeçalho fica em `z-index: auto`
       e a gaveta do menu, que é filha dele, é pintada POR BAIXO da primeira
       seção do corpo: o menu abria — `<details>` aberto, corpo travado, ícone
       virando X — e não aparecia nada na tela. Todo estado dizia sim; só o
       pixel dizia não. */
    assert.match(
      html,
      /<div id="shopify-section-faixa" class="shopify-section shopify-section-group-promo-group section-promo"/,
      "seção de grupo precisa da classe shopify-section-group-<grupo>",
    );
    /* e seção de TEMPLATE não carrega grupo nenhum: inventar a classe faria o
       CSS de grupo alcançar o corpo da página, que é o oposto do problema */
    assert.match(html, /<div id="shopify-section-hero" class="shopify-section section-hero"/);

    /* O PLACEHOLDER TEM A FORMA DO LUGAR.
       Imagem de banner é `shopify://shop_images/…`: mora nos Arquivos da loja,
       não viaja no ZIP, e por isso TODA loja real cai no placeholder. Com o
       quadrado de 1200×1200, o Dawn — que dimensiona por `image.aspect_ratio`
       quando `slide_height: adapt_image` — abria o banner com altura igual à
       largura: uma tela inteira de cinza. As medidas do drop são o que o tema
       lê, então elas têm de vir no formato da Shopify: 3:1 no desktop
       (1800×600) e 1080×1350 no celular. */
    assert.match(html, /desktop=1800x600 celular=1080x1350/, "o placeholder de banner tem de sair 3:1 e 1080x1350");
    assert.match(html, /url=\[data:image\/svg\+xml,/, "sem arquivo, o banner sai com o placeholder");
    /* fora de banner o quadrado continua: é o formato de cartão de produto */
    const semBanner = await renderThemePage({ theme, files, pageId: "product", assetBase: (path) => `/x/${path}` });
    assert.doesNotMatch(semBanner, /1800x600/, "só banner recebe 3:1");
    /* nenhuma variável de cor quebrada */
    assert.doesNotMatch(html, /--[\w-]+:\s*(?:,\s*)+;/);
    /* ponte de sincronia: clique → editor e editor → scroll na seção */
    assert.match(html, /orbisSection/);
    assert.match(html, /orbisScrollTo/);
    /* inspetor (fase 8): modos, seleção de bloco e bloqueio de formulários */
    assert.match(html, /orbisMode/);
    assert.match(html, /orbisBlock/);
    assert.match(html, /addEventListener\("submit",function\(event\)\{event\.preventDefault\(\);\}/);
    /* o shopify_attributes dos blocos vira data-block-id no HTML — a âncora
       estável da seleção de bloco */
    assert.match(html, /data-block-id="/);
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

/**
 * A ARTE QUE VOLTOU NO PACOTE APARECE.
 *
 * Reimportar a própria loja religa cada arte para `/api/theme-assets?fp=…`, o
 * endereço com que este app serve o arquivo que veio dentro do ZIP. O render
 * não conhecia esse formato: ele tirava o "basename" da URL — `?` fora, o que
 * dá `theme-assets`, sem extensão — e o valor caía no fim da função como
 * "não é imagem". O tema então desenhava o `placeholder_svg_tag`.
 *
 * O efeito medido numa loja real de relógios: logo, dois banners e três capas
 * religados no banco, e a prévia abrindo com o quadro cinza no banner, o
 * cabeçalho escrevendo o nome do tema de ORIGEM no lugar do logo, e os cartões
 * de coleção caindo na foto de produto. Seis arquivos dentro do pacote, zero
 * na tela.
 */
test("a arte religada do pacote aparece no render, em vez do quadro cinza", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
    const { urlDeAssetDoTema } = await server.ssrLoadModule("/lib/asset-do-tema.ts");
    const bytes = makeZip();
    const theme = extractShopifyThemeBytes(bytes, "religada.zip");
    const files = themeFilesFromZip(bytes);

    /* o endereço é montado pelo dono do formato, não escrito à mão: quando ele
       mudar, este teste muda junto e não fica aprovando a forma antiga */
    const religada = urlDeAssetDoTema("f420738eb3209278", "assets/orbis-390d7e56-banner-1.jpg");
    const faixa = theme.pages.find((page) => page.id === "index").sections.find((section) => section.id === "faixa");
    faixa.settings.image = religada;
    faixa.settings.mobile_image = religada;

    const html = await renderThemePage({ theme, files, pageId: "index", assetBase: (path) => `/x/${path}` });

    /* o arquivo religado é a imagem: o tema recebe a URL servida, não um SVG */
    assert.match(html, /url=\[\/api\/theme-assets\?fp=f420738eb3209278&path=assets%2Forbis-390d7e56-banner-1\.jpg\]/);
    assert.doesNotMatch(html, /url=\[data:image\/svg\+xml,/, "com arquivo em mãos, nada de placeholder");
    /* e a seção deixa de ser dimensionada como placeholder de banner */
    assert.doesNotMatch(html, /desktop=1800x600/, "o 3:1 é a medida do placeholder, não a da arte");
  } finally {
    await server.close();
  }
});
