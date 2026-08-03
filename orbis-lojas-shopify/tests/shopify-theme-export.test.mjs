import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strToU8, strFromU8, zipSync, unzipSync } from "fflate";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/featured-collection-schema.json", import.meta.url), "utf8"));

const featuredCollectionLiquid = `<div class="featured">{{ section.settings.title }}</div>{% schema %}${JSON.stringify({
  name: "Coleção em destaque",
  settings: fixture.settings,
  disabled_on: { groups: ["header", "footer"] },
  presets: [{ name: "Coleção em destaque" }],
})}{% endschema %}`;

function buildFixtureZip() {
  return zipSync({
    "Tema/config/settings_schema.json": strToU8(JSON.stringify([
      { name: "theme_info", theme_name: "Fixture", theme_version: "1.0", theme_author: "Teste" },
      { name: "Cores", settings: [{ type: "color", id: "colors_accent_1", label: "Accent", default: "#008060" }] },
    ])),
    "Tema/config/settings_data.json": strToU8(JSON.stringify({
      current: { colors_accent_1: "#112233", chave_desconhecida: { aninhada: true }, sections: {} },
      presets: { Default: { colors_accent_1: "#445566" } },
    })),
    "Tema/layout/theme.liquid": strToU8("{{ content_for_layout }}"),
    "Tema/sections/featured-collection.liquid": strToU8(featuredCollectionLiquid),
    "Tema/sections/main-product.liquid": strToU8(`{% schema %}{"name":"Produto","presets":[{"name":"Produto"}]}{% endschema %}`),
    "Tema/sections/main-cart-items.liquid": strToU8(`{% schema %}{"name":"Carrinho","presets":[{"name":"Carrinho"}]}{% endschema %}`),
    "Tema/templates/index.json": strToU8(JSON.stringify({
      wrapper: "div.pagina-inicial",
      sections: {
        destaque: {
          type: "featured-collection",
          custom_css: [".featured { color: red; }"],
          settings: fixture.instanceData.settings,
        },
      },
      order: ["destaque"],
    })),
    "Tema/templates/product.json": strToU8(JSON.stringify({ sections: { main: { type: "main-product", settings: {} } }, order: ["main"] })),
  });
}

async function loadModules() {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  const shopifyTheme = await server.ssrLoadModule("/lib/shopify-theme.ts");
  const themeExport = await server.ssrLoadModule("/lib/theme-export.ts");
  return { server, shopifyTheme, themeExport };
}

test("schema real da coleção em destaque é interpretado com fidelidade", async () => {
  const { server, shopifyTheme } = await loadModules();
  try {
    const theme = shopifyTheme.extractShopifyThemeBytes(buildFixtureZip(), "fixture.zip");
    const schema = theme.sectionSchemas.find((item) => item.type === "featured-collection");
    assert.ok(schema, "schema featured-collection existe");
    assert.equal(schema.settings.length, 29, "29 settings preservados (incluindo separadores header)");
    const byId = new Map(schema.settings.map((setting) => [setting.id, setting]));
    const headers = schema.settings.filter((setting) => setting.type === "header");
    assert.equal(headers.length, 3, "3 separadores de grupo preservados");
    assert.deepEqual(
      [byId.get("products_to_show").min, byId.get("products_to_show").max, byId.get("products_to_show").step],
      [2, 25, 1],
    );
    assert.deepEqual(
      [byId.get("padding_top").min, byId.get("padding_top").max, byId.get("padding_top").step, byId.get("padding_top").unit],
      [0, 100, 4, "px"],
    );
    assert.equal(byId.get("collection").type, "collection");
    assert.equal(byId.get("columns_mobile").options.length, 2);
    assert.equal(byId.get("visibility").options.length, 3);
    assert.deepEqual(schema.disabledOn, { templates: undefined, groups: ["header", "footer"] });
    const page = theme.pages.find((item) => item.id === "index");
    const instance = page.sections.find((section) => section.type === "featured-collection");
    assert.equal(instance.settings.title, "Ofertas Imperdíveis");
    assert.equal(instance.settings.products_to_show, 7);
    assert.equal(instance.settings.collection, "casa-cozinha-e-jardim");
  } finally {
    await server.close();
  }
});

test("round-trip: importar sem editar e exportar preserva a semântica dos arquivos", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const original = buildFixtureZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "fixture.zip");
    const files = shopifyTheme.themeFilesFromZip(original);
    const { zip, warnings } = themeExport.exportThemeZip(theme, files);
    const exported = unzipSync(zip);
    const readJson = (path) => JSON.parse(strFromU8(exported[path]));

    const settingsData = readJson("config/settings_data.json");
    assert.equal(settingsData.current.colors_accent_1, "#112233", "valor atual preservado");
    assert.deepEqual(settingsData.current.chave_desconhecida, { aninhada: true }, "chave desconhecida do settings_data preservada");
    assert.deepEqual(settingsData.presets, { Default: { colors_accent_1: "#445566" } }, "presets preservados");

    const index = readJson("templates/index.json");
    assert.equal(index.wrapper, "div.pagina-inicial", "chave desconhecida do template preservada");
    assert.deepEqual(index.sections.destaque.custom_css, [".featured { color: red; }"], "custom_css da seção preservado");
    assert.equal(index.sections.destaque.settings.title, "Ofertas Imperdíveis");
    assert.equal(index.sections.destaque.settings.products_to_show, 7);
    assert.deepEqual(index.order, ["destaque"]);

    assert.ok(strFromU8(exported["sections/featured-collection.liquid"]).includes("{% schema %}"), "liquid intacto");
    assert.equal(warnings.filter((warning) => !warning.includes("gerada")).length, 0, "sem warnings inesperados");
  } finally {
    await server.close();
  }
});

const TINY_PNG_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

test("mídia do editor e data URIs viram assets com referências reescritas", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const original = buildFixtureZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "fixture.zip");
    const mediaId = "11112222-3333-4444-5555-666677778888";
    const missingId = "99990000-aaaa-bbbb-cccc-ddddeeeeffff";
    theme.globalValues.favicon = `/api/media/${mediaId}`;
    const page = theme.pages.find((item) => item.id === "index");
    const instance = page.sections.find((section) => section.type === "featured-collection");
    instance.settings.image = `/api/media/${mediaId}`;
    instance.settings.background_image = `data:image/png;base64,${TINY_PNG_BASE64}`;
    instance.settings.second_background = `data:image/png;base64,${TINY_PNG_BASE64}`;
    instance.settings.missing_image = `/api/media/${missingId}`;

    assert.deepEqual(themeExport.collectEditorMediaIds(theme).sort(), [mediaId, missingId].sort());

    const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const editorMedia = new Map([[mediaId, { filename: `orbis-11112222-logo do cliente.png`, data: pngBytes }]]);
    const files = shopifyTheme.themeFilesFromZip(original);
    const { zip, modified, warnings } = themeExport.exportThemeZip(theme, files, editorMedia);
    const exported = unzipSync(zip);

    const assetName = "orbis-11112222-logo-do-cliente.png";
    assert.deepEqual(Array.from(exported[`assets/${assetName}`]), Array.from(pngBytes), "bytes da mídia entram em assets/");
    const settingsData = JSON.parse(strFromU8(exported["config/settings_data.json"]));
    assert.equal(settingsData.current.favicon, `shopify://shop_images/${assetName}`, "valor global reescrito");
    const index = JSON.parse(strFromU8(exported["templates/index.json"]));
    assert.equal(index.sections.destaque.settings.image, `shopify://shop_images/${assetName}`, "setting da seção reescrito");
    assert.match(index.sections.destaque.settings.background_image, /^shopify:\/\/shop_images\/orbis-inline-[0-9a-f]{8}\.png$/, "data URI vira asset");
    assert.equal(
      index.sections.destaque.settings.second_background,
      index.sections.destaque.settings.background_image,
      "data URIs idênticos deduplicam no mesmo asset",
    );
    const inlineName = index.sections.destaque.settings.background_image.split("/").at(-1);
    assert.ok(exported[`assets/${inlineName}`]?.length > 0, "arquivo do data URI existe");
    assert.equal(index.sections.destaque.settings.missing_image, `/api/media/${missingId}`, "mídia indisponível fica como estava");
    assert.ok(warnings.some((warning) => warning.includes(missingId)), "warning avisa da mídia indisponível");
    assert.ok(modified.includes(`assets/${assetName}`));
    assert.ok(modified.includes(`assets/${inlineName}`));

    /* round-trip: o ZIP exportado reimporta com os novos assets a bordo */
    const reimported = shopifyTheme.extractShopifyThemeBytes(zip, "reexport.zip");
    assert.ok(reimported.sourceFiles.some((file) => file.path === `assets/${assetName}`), "asset presente na reimportação");
    assert.equal(reimported.globalValues.favicon, `shopify://shop_images/${assetName}`);
  } finally {
    await server.close();
  }
});

/** Tema clássico: as seções da home vivem em settings_data.current.sections. */
function buildVintageZip() {
  const heroLiquid = `{% schema %}${JSON.stringify({
    name: "Hero",
    settings: [{ type: "image_picker", id: "image", label: "Imagem" }],
    blocks: [{ type: "slide", name: "Slide", settings: [{ type: "image_picker", id: "foto", label: "Foto" }] }],
    presets: [{ name: "Hero" }],
  })}{% endschema %}<div>{{ section.settings.image }}</div>`;
  return zipSync({
    "Classico/config/settings_schema.json": strToU8(JSON.stringify([
      { name: "theme_info", theme_name: "Classico", theme_version: "1.0", theme_author: "Teste" },
      { name: "Marca", settings: [{ type: "image_picker", id: "logo", label: "Logo" }] },
    ])),
    "Classico/config/settings_data.json": strToU8(JSON.stringify({
      current: {
        logo: "",
        content_for_index: ["destaque"],
        sections: {
          destaque: {
            type: "hero",
            custom_css: [".hero{}"],
            settings: { image: "" },
            blocks: { b1: { type: "slide", settings: { foto: "" } }, b2: { type: "slide", settings: { foto: "" } } },
            block_order: ["b1", "b2"],
          },
        },
      },
    })),
    "Classico/layout/theme.liquid": strToU8("{{ content_for_layout }}"),
    "Classico/sections/hero.liquid": strToU8(heroLiquid),
    "Classico/sections/main-product.liquid": strToU8(`{% schema %}{"name":"Produto","settings":[{"type":"image_picker","id":"image","label":"Imagem"}],"presets":[{"name":"Produto"}]}{% endschema %}`),
    "Classico/templates/index.liquid": strToU8("{% section 'hero' %}"),
    "Classico/templates/product.liquid": strToU8("{% section 'main-product' %}"),
  });
}

test("mídia em bloco de seção clássica é gravada; página só-Liquid não deixa asset órfão", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const original = buildVintageZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "classico.zip");
    const home = theme.pages.find((item) => item.id === "index");
    const hero = home.sections.find((section) => section.id === "destaque");
    assert.ok(hero, "seção clássica foi importada de current.sections");
    assert.equal(hero.blocks.length, 2, "blocos da seção clássica importados");

    const usado = "aaaaaaaa-1111-2222-3333-444444444444";
    const orfao = "bbbbbbbb-1111-2222-3333-444444444444";
    hero.settings.image = `/api/media/${usado}`;
    hero.blocks[0].settings.foto = `/api/media/${usado}`;
    /* página de produto é template Liquid: nada dela é gravado na exportação */
    const produto = theme.pages.find((item) => item.id === "product");
    produto.sections[0].settings.image = `/api/media/${orfao}`;

    const editorMedia = new Map([
      [usado, { filename: "usada.png", data: new Uint8Array([7]) }],
      [orfao, { filename: "orfa.png", data: new Uint8Array([8]) }],
    ]);
    const files = shopifyTheme.themeFilesFromZip(original);
    const { zip, warnings } = themeExport.exportThemeZip(theme, files, editorMedia);
    const exported = unzipSync(zip);
    const current = JSON.parse(strFromU8(exported["config/settings_data.json"])).current;
    const gravado = current.sections.destaque;

    assert.match(gravado.settings.image, /^shopify:\/\/shop_images\/usada\.png$/, "setting da seção clássica gravado");
    assert.equal(gravado.blocks.b1.settings.foto, gravado.settings.image, "imagem do BLOCO clássico gravada");
    assert.deepEqual(gravado.block_order, ["b1", "b2"], "ordem dos blocos preservada");
    assert.deepEqual(gravado.custom_css, [".hero{}"], "chave desconhecida da seção preservada");
    assert.deepEqual(Array.from(exported["assets/usada.png"]), [7]);
    assert.equal(exported["assets/orfa.png"], undefined, "mídia de página só-Liquid não vira asset órfão");
    assert.ok(
      warnings.some((warning) => warning.includes("não couberam no formato do tema")),
      `edição perdida é avisada, não silenciosa: ${JSON.stringify(warnings)}`,
    );

    /* apagar todos os blocos precisa sobreviver à exportação */
    hero.blocks = [];
    const segunda = themeExport.exportThemeZip(theme, shopifyTheme.themeFilesFromZip(original), editorMedia);
    const semBlocos = JSON.parse(strFromU8(unzipSync(segunda.zip)["config/settings_data.json"])).current.sections.destaque;
    assert.deepEqual(semBlocos.blocks, {}, "remover todos os blocos é persistido");
    assert.deepEqual(semBlocos.block_order, []);
  } finally {
    await server.close();
  }
});

test("nomes longos e colisões geram assets distintos sem sobrescrever os originais", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    /* nomes que só diferem no começo: o corte por tamanho os deixaria idênticos */
    const tail = `${"n".repeat(96)}.png`;
    const originalWithAsset = zipSync({
      ...unzipSync(buildFixtureZip()),
      "Tema/assets/logo.png": new Uint8Array([1, 1, 1]),
    });
    const theme = shopifyTheme.extractShopifyThemeBytes(originalWithAsset, "fixture.zip");
    const page = theme.pages.find((item) => item.id === "index");
    const instance = page.sections.find((section) => section.type === "featured-collection");
    const ids = ["aaaaaaaa-0000-0000-0000-000000000001", "bbbbbbbb-0000-0000-0000-000000000002", "cccccccc-0000-0000-0000-000000000003"];
    instance.settings.image_a = `/api/media/${ids[0]}`;
    instance.settings.image_b = `/api/media/${ids[1]}`;
    instance.settings.image_c = `/api/media/${ids[2]}`;

    const editorMedia = new Map([
      [ids[0], { filename: `primeiro-${tail}`, data: new Uint8Array([10]) }],
      [ids[1], { filename: `segundo-${tail}`, data: new Uint8Array([20]) }],
      [ids[2], { filename: "logo.png", data: new Uint8Array([30]) }],
    ]);
    const files = shopifyTheme.themeFilesFromZip(originalWithAsset);
    const { zip } = themeExport.exportThemeZip(theme, files, editorMedia);
    const exported = unzipSync(zip);
    const index = JSON.parse(strFromU8(exported["templates/index.json"]));
    const nameOf = (value) => value.split("/").at(-1);

    const [a, b, c] = [index.sections.destaque.settings.image_a, index.sections.destaque.settings.image_b, index.sections.destaque.settings.image_c].map(nameOf);
    assert.notEqual(a, b, "conteúdos diferentes com nome truncado igual não se fundem");
    assert.deepEqual(Array.from(exported[`assets/${a}`]), [10]);
    assert.deepEqual(Array.from(exported[`assets/${b}`]), [20]);
    assert.notEqual(c, "logo.png", "não rouba o nome de um asset original");
    assert.deepEqual(Array.from(exported["assets/logo.png"]), [1, 1, 1], "asset original intacto");
    assert.deepEqual(Array.from(exported[`assets/${c}`]), [30]);
    for (const name of [a, b, c]) assert.ok(name.length <= 90 && /^[a-zA-Z0-9._-]+$/.test(name), `nome de asset seguro: ${name}`);
  } finally {
    await server.close();
  }
});

test("edições aplicadas na exportação atualizam somente o necessário", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const original = buildFixtureZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "fixture.zip");
    const page = theme.pages.find((item) => item.id === "index");
    const instance = page.sections.find((section) => section.type === "featured-collection");
    instance.settings.title = "Título Editado no Orbis";
    instance.settings.products_to_show = 12;
    theme.globalValues.colors_accent_1 = "#ff8800";
    const files = shopifyTheme.themeFilesFromZip(original);
    const { zip, modified } = themeExport.exportThemeZip(theme, files);
    const exported = unzipSync(zip);
    const index = JSON.parse(strFromU8(exported["templates/index.json"]));
    assert.equal(index.sections.destaque.settings.title, "Título Editado no Orbis");
    assert.equal(index.sections.destaque.settings.products_to_show, 12);
    assert.deepEqual(index.sections.destaque.custom_css, [".featured { color: red; }"], "custom_css sobrevive à edição");
    const settingsData = JSON.parse(strFromU8(exported["config/settings_data.json"]));
    assert.equal(settingsData.current.colors_accent_1, "#ff8800");
    assert.ok(modified.includes("templates/index.json"));
    assert.ok(modified.includes("config/settings_data.json"));
    assert.ok(!modified.includes("templates/product.json"), "template não editado não é reescrito");
  } finally {
    await server.close();
  }
});
