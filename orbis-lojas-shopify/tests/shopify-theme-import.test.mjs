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

/**
 * Um asset que não entra na instalação é uma imagem PARTIDA na prévia: o Liquid
 * continua pedindo o arquivo, porque ele está no ZIP, e o servidor não o tem
 * para servir. Isso aconteceu de verdade com um banner 4k de 12 MB, cortado por
 * um teto de 10 MB escolhido no olho, e ninguém tinha como saber o motivo.
 *
 * Duas metades, e as duas importam: o teto agora é o da própria Shopify (20 MB),
 * então arquivo legítimo entra; e o que fica de fora é DECLARADO com o motivo.
 */
test("asset que não entra na instalação é declarado, e o banner 4k entra", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const zip = zipSync({
      "Tema/layout/theme.liquid": strToU8("<html><body>{{ content_for_layout }}</body></html>"),
      "Tema/sections/vitrine.liquid": strToU8(section("Vitrine")),
      "Tema/templates/index.json": strToU8(JSON.stringify({ sections: { vitrine: { type: "vitrine" } }, order: ["vitrine"] })),
      "Tema/config/settings_schema.json": strToU8(settingsSchema),
      "Tema/config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
      /* o banner 4k que era cortado: 12 MB, tamanho real de PNG que este app gera */
      "Tema/assets/banner-4k.png": new Uint8Array(12 * 1024 * 1024),
      /* acima do limite da Shopify: fica fora, mas dizendo por quê */
      "Tema/assets/gigante.png": new Uint8Array(21 * 1024 * 1024),
      "Tema/assets/vazio.png": new Uint8Array(0),
    });

    const tema = extractShopifyThemeBytes(zip, "tema.zip");
    const fora = tema.assetsForaDaInstalacao ?? [];
    const caminhos = fora.map((item) => item.path);

    assert.ok(!caminhos.includes("assets/banner-4k.png"), "banner 4k de 12 MB tem de ser instalado");
    assert.ok(caminhos.includes("assets/gigante.png"), "arquivo acima de 20 MB precisa ser declarado");
    assert.ok(caminhos.includes("assets/vazio.png"), "arquivo vazio precisa ser declarado");

    const gigante = fora.find((item) => item.path === "assets/gigante.png");
    assert.match(gigante.motivo, /21\.0 MB.*20 MB/, `o motivo precisa dizer o tamanho e o limite: ${gigante.motivo}`);
    assert.equal(gigante.bytes, 21 * 1024 * 1024);
  } finally {
    await server.close();
  }
});

/**
 * Os rótulos do editor saíam em tcheco num Dawn com trinta idiomas: sem
 * `pt-BR` e sem `en.default`, o código pegava o PRIMEIRO `locales/*.schema.json`
 * do ZIP. "Záhlaví" no lugar de "Cabeçalho" não é detalhe — é o painel inteiro
 * ilegível para quem edita.
 */
test("os rótulos do editor seguem a escada de idioma: português, inglês, e só então o resto", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const base = {
      "Tema/layout/theme.liquid": strToU8("<html><body>{{ content_for_layout }}</body></html>"),
      "Tema/sections/cabecalho.liquid": strToU8(section("t:sections.header.name")),
      "Tema/templates/index.json": strToU8(JSON.stringify({ sections: { cabecalho: { type: "cabecalho" } }, order: ["cabecalho"] })),
      "Tema/config/settings_schema.json": strToU8(settingsSchema),
      "Tema/config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
    };
    const tcheco = strToU8(JSON.stringify({ sections: { header: { name: "Záhlaví" } } }));
    const ingles = strToU8(JSON.stringify({ sections: { header: { name: "Header" } } }));
    const portugues = strToU8(JSON.stringify({ sections: { header: { name: "Cabeçalho" } } }));
    const nomeDaSecao = (zip) => extractShopifyThemeBytes(zip, "tema.zip").sectionSchemas[0]?.name;

    /* tcheco vem antes no ZIP e mesmo assim perde para o inglês */
    assert.equal(nomeDaSecao(zipSync({ ...base, "Tema/locales/cs.schema.json": tcheco, "Tema/locales/en.schema.json": ingles })), "Header");
    /* e o português ganha do inglês, mesmo sem ser o nome exato pt-BR */
    assert.equal(nomeDaSecao(zipSync({ ...base, "Tema/locales/en.schema.json": ingles, "Tema/locales/pt.schema.json": portugues })), "Cabeçalho");
    /* o caso real do dawn8.zip: português é o PADRÃO do tema, mas com outro
       nome de arquivo — e o tcheco vem primeiro na lista */
    assert.equal(nomeDaSecao(zipSync({ ...base, "Tema/locales/cs.schema.json": tcheco, "Tema/locales/en.schema.json": ingles, "Tema/locales/pt-BR.default.schema.json": portugues })), "Cabeçalho");
    /* sem português, vale o idioma que o TEMA marcou como padrão */
    assert.equal(nomeDaSecao(zipSync({ ...base, "Tema/locales/cs.schema.json": tcheco, "Tema/locales/de.default.schema.json": strToU8(JSON.stringify({ sections: { header: { name: "Kopfzeile" } } })) })), "Kopfzeile");
    /* só tcheco: rótulo estranho ainda é melhor que a chave crua */
    assert.equal(nomeDaSecao(zipSync({ ...base, "Tema/locales/cs.schema.json": tcheco })), "Záhlaví");
  } finally {
    await server.close();
  }
});
