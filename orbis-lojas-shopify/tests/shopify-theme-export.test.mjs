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

/**
 * O tema exportado sai sabendo de que loja ele é.
 *
 * `orbisNicheId` vivia só no banco do app, então quem baixava a própria loja e
 * a punha de volta no estúdio perdia o nicho: a prévia caía no catálogo de
 * demonstração e a loja de roupa abria com óculos e panela. O marcador fecha o
 * ciclo — exportar e importar de volta devolve a mesma vitrine.
 */
test("o nicho da loja viaja no ZIP exportado e volta na importação", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const original = buildFixtureZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "fixture.zip");
    const files = shopifyTheme.themeFilesFromZip(original);

    /* tema sem loja não ganha marcador: ele não é de ninguém ainda */
    const cru = unzipSync(themeExport.exportThemeZip(theme, files).zip);
    assert.equal(cru[shopifyTheme.ARQUIVO_DA_LOJA], undefined, "tema sem nicho não pode inventar um");

    /* e as CAPAS viajam no mesmo marcador. Elas nasciam e morriam no pedido de
       prévia do fluxo do cliente: o Editor, que abre o tema salvo e não tem
       marca nenhuma, caía na foto de produto sorteada pelo handle. */
    const daLoja = { ...theme, orbisNicheId: "roupas", orbisCapas: { basicos: "/api/media/aaaaaaaaaaaaaaaaaaaa" } };
    const { zip } = themeExport.exportThemeZip(daLoja, files);
    const exportado = unzipSync(zip);
    assert.ok(exportado[shopifyTheme.ARQUIVO_DA_LOJA], "o ZIP precisa levar o marcador");
    const marcador = JSON.parse(strFromU8(exportado[shopifyTheme.ARQUIVO_DA_LOJA]));
    assert.equal(marcador.orbisNicheId, "roupas");
    assert.deepEqual(marcador.orbisCapas, { basicos: "/api/media/aaaaaaaaaaaaaaaaaaaa" });

    /* o ciclo inteiro: o que sai daqui volta como a mesma loja, com as capas */
    const devolta = shopifyTheme.extractShopifyThemeBytes(zip, "loja.zip");
    assert.equal(devolta.orbisNicheId, "roupas");
    assert.deepEqual(devolta.orbisCapas, { basicos: "/api/media/aaaaaaaaaaaaaaaaaaaa" });

    /* loja sem capa não declara capa: marcador com campo vazio faz quem lê
       achar que a loja disse "sem capa", e o certo é ele nem perguntar */
    const semCapa = unzipSync(themeExport.exportThemeZip({ ...theme, orbisNicheId: "roupas" }, files).zip);
    assert.equal(JSON.parse(strFromU8(semCapa[shopifyTheme.ARQUIVO_DA_LOJA])).orbisCapas, undefined);
  } finally {
    await server.close();
  }
});

/**
 * O NOME PRÓPRIO da loja viaja junto — e é o que impede a loja entregue de
 * gravar por cima do tema de origem quando volta para o estúdio.
 *
 * Sem ele, uma loja feita sobre o Dawn se chama "Dawn" e importa em
 * `import-dawn`, o id do tema base. Com ele, importa como ela mesma.
 */
test("o nome próprio da loja e o modelo do estúdio sobrevivem à exportação", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const original = buildFixtureZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "fixture.zip");
    const files = shopifyTheme.themeFilesFromZip(original);
    const modeloNativo = { header: { brand: "Claro Co." }, hero: { headline: "Claro Co." } };

    const daLoja = {
      ...theme,
      orbisNicheId: "oculos",
      orbisLoja: { nome: "Claro Co.", slug: "claro-co" },
      orbisCustomizacao: modeloNativo,
    };
    const { zip } = themeExport.exportThemeZip(daLoja, files);
    const marcador = JSON.parse(strFromU8(unzipSync(zip)[shopifyTheme.ARQUIVO_DA_LOJA]));
    assert.deepEqual(marcador.orbisLoja, { nome: "Claro Co.", slug: "claro-co" });
    assert.deepEqual(marcador.orbisCustomizacao, modeloNativo);

    const devolta = shopifyTheme.extractShopifyThemeBytes(zip, "loja-claro-co.zip");
    assert.deepEqual(devolta.orbisLoja, { nome: "Claro Co.", slug: "claro-co" });
    assert.deepEqual(devolta.orbisCustomizacao, modeloNativo);
    assert.equal(shopifyTheme.identidadeDoTemaImportado(devolta).id, "loja-claro-co");
    assert.notEqual(
      shopifyTheme.identidadeDoTemaImportado(devolta).id,
      shopifyTheme.identidadeDoTemaImportado(theme).id,
      "exportar a loja e reimportá-la não pode ocupar a linha do tema de origem",
    );

    /* loja SEM nicho e SEM capa ainda ganha marcador, porque ela tem nome: é o
       nome que decide onde ela entra no estúdio */
    const soNome = unzipSync(themeExport.exportThemeZip({ ...theme, orbisLoja: { nome: "Vega", slug: "vega" } }, files).zip);
    assert.ok(soNome[shopifyTheme.ARQUIVO_DA_LOJA], "loja com nome precisa se declarar mesmo sem nicho");

    /* e o tema cru continua sem marcador nenhum: ele não é de ninguém */
    const cru = unzipSync(themeExport.exportThemeZip(theme, files).zip);
    assert.equal(cru[shopifyTheme.ARQUIVO_DA_LOJA], undefined);

    /**
     * A CAPA conta como imagem a empacotar, mesmo sem estar em setting nenhum.
     *
     * Ela mora no marcador. Na prática cai num cartão de coleção e o percurso a
     * encontra — mas "na prática" não é garantia: sobrando capa para vaga, o
     * arquivo ficava fora do pacote e a capa virava endereço morto fora desta
     * máquina.
     */
    const idSoNaCapa = "cccccccc-1111-2222-3333-444444444444";
    const ids = themeExport.collectEditorMediaIds({
      ...theme,
      orbisCapas: { polarizados: `/api/media/${idSoNaCapa}` },
    });
    assert.ok(ids.includes(idSoNaCapa), "capa fora dos settings precisa entrar na lista de mídia a empacotar");
  } finally {
    await server.close();
  }
});

/**
 * A ARTE RELIGADA VOLTA À FORMA CANÔNICA AO SAIR.
 *
 * Reimportar a própria loja religa cada arte para `/api/theme-assets?fp=…`, um
 * endereço DESTA máquina: o `fp` é o do pacote aberto aqui e a rota exige a
 * sessão do dono. Saindo assim dentro do ZIP, a referência morre duas vezes —
 * na Shopify, que não conhece a rota, e na próxima importação, que gera outro
 * `fp`. A loja perdia a arte a cada volta com o arquivo dentro do pacote.
 */
test("a arte religada do pacote sai do ZIP como shopify://shop_images", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const { urlDeAssetDoTema } = await server.ssrLoadModule("/lib/asset-do-tema.ts");
    const original = buildFixtureZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "fixture.zip");
    const files = shopifyTheme.themeFilesFromZip(original);

    /* o endereço vem de quem o define, para este teste não aprovar a forma
       antiga depois que ela mudar */
    theme.globalValues.logo = urlDeAssetDoTema("f420738eb3209278", "assets/orbis-222660fd-logotipo.png");
    const instancia = theme.pages.find((page) => page.id === "index").sections[0];
    instancia.settings.image = urlDeAssetDoTema("f420738eb3209278", "assets/orbis-390d7e56-banner-1.jpg");

    const exportado = unzipSync(themeExport.exportThemeZip(theme, files).zip);

    const settingsData = JSON.parse(strFromU8(exportado["config/settings_data.json"]));
    assert.equal(settingsData.current.logo, "shopify://shop_images/orbis-222660fd-logotipo.png");
    const index = JSON.parse(strFromU8(exportado["templates/index.json"]));
    assert.equal(index.sections.destaque.settings.image, "shopify://shop_images/orbis-390d7e56-banner-1.jpg");

    /* e nada de duplicar megabyte: o arquivo já viaja no pacote de onde veio.
       Registrá-lo outra vez em `assets/` foi o que levou um ZIP a 140 MB. */
    assert.equal(exportado["assets/orbis-222660fd-logotipo.png"], undefined);
    assert.equal(exportado["assets/orbis-390d7e56-banner-1.jpg"], undefined);
  } finally {
    await server.close();
  }
});

/**
 * A CAPA SEM VAGA NA PÁGINA TAMBÉM LEVA O ARQUIVO.
 *
 * A capa mora no marcador, não num setting, e era o ato de reescrever um
 * setting que registrava o arquivo no ZIP. Capa que não coubesse em cartão
 * nenhum saía do pacote como id sem arquivo: fora desta máquina, o cartão
 * daquela coleção virava um endereço morto.
 *
 * Medido numa loja de relógios com seis coleções: seis capas geradas, três com
 * vaga na página, três no pacote. As outras três voltaram com o ícone de figura
 * quebrada, e o cliente viu isso na tela.
 */
test("a capa sem vaga na página viaja no pacote e volta na reimportação", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const original = buildFixtureZip();
    const theme = shopifyTheme.extractShopifyThemeBytes(original, "fixture.zip");
    const files = shopifyTheme.themeFilesFromZip(original);

    /* uma capa que NENHUM setting menciona: só o marcador sabe dela */
    const idDaCapa = "cccccccc-1111-2222-3333-444444444444";
    const daLoja = { ...theme, orbisNicheId: "relogios", orbisCapas: { pulseiras: `/api/media/${idDaCapa}` } };
    const bytesDaCapa = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
    const editorMedia = new Map([[idDaCapa, { filename: `orbis-${idDaCapa.slice(0, 8)}-capa.png`, data: bytesDaCapa }]]);

    const { zip } = themeExport.exportThemeZip(daLoja, files, editorMedia);
    const exportado = unzipSync(zip);
    assert.ok(exportado["assets/orbis-cccccccc-capa.png"], "o arquivo da capa precisa entrar no ZIP");

    /* o marcador guarda o ID, e é de propósito: é o prefixo dele que casa a
       arte na volta. Reescrevê-lo para o nome perderia essa identidade. */
    const marcador = JSON.parse(strFromU8(exportado[shopifyTheme.ARQUIVO_DA_LOJA]));
    assert.deepEqual(marcador.orbisCapas, { pulseiras: `/api/media/${idDaCapa}` });

    /* A VOLTA, que é o que o cliente vive: outra máquina, banco vazio. Sem
       acervo nenhum, a capa tem de sair do próprio pacote. */
    const devolta = shopifyTheme.extractShopifyThemePackage(zip, "loja.zip");
    const urls = Object.fromEntries(devolta.images.map((asset) => [asset.name.toLowerCase(), `/servido/${asset.name}`]));
    const artesDoPacote = new Map(Object.entries(urls));
    const contagem = themeExport.reconectarImagens(devolta.theme, new Map(), artesDoPacote);

    assert.equal(devolta.theme.orbisCapas.pulseiras, "/servido/orbis-cccccccc-capa.png", "a capa volta do pacote");
    assert.deepEqual(contagem.perdidas, [], "nada se perde quando o arquivo viajou");
  } finally {
    await server.close();
  }
});

/**
 * A VOLTA INTEIRA: entregar, importar, EXPORTAR e importar de novo.
 *
 * É o gesto de quem baixa a própria loja pelo estúdio e a abre noutro
 * computador. Cada perna já tinha teste; a emenda entre elas não, e era ali que
 * a arte sumia — o leitor de arquivos descartava `previa-local/` inteiro, então
 * a exportação não tinha o arquivo para reemitir. Medido na Hora Watches: 15 MB
 * de entrada, 0,8 MB de saída, as seis peças pelo caminho.
 */
test("a arte sobrevive a exportar e importar de novo, sem acervo nenhum", async () => {
  const { server, shopifyTheme, themeExport } = await loadModules();
  try {
    const { urlDeAssetDoTema } = await server.ssrLoadModule("/lib/asset-do-tema.ts");
    /* um pacote ENTREGUE: a arte mora fora de `assets/`, como a entrega faz */
    const arte = strToU8("bytes-da-arte-de-banner");
    const entregue = zipSync({
      ...Object.fromEntries(Object.entries(unzipSync(buildFixtureZip())).map(([p, v]) => [p, v])),
      "Tema/previa-local/imagens-para-a-shopify/orbis-390d7e56-banner.png": arte,
      "Tema/previa-local/produtos-para-importar.csv": strToU8("Title\nvelho"),
    });

    /* 1ª importação: a arte vira asset e a referência aponta para cá */
    const primeira = shopifyTheme.extractShopifyThemePackage(entregue, "entregue.zip");
    assert.ok(primeira.images.some((img) => img.path === "assets/orbis-390d7e56-banner.png"));
    const tema = primeira.theme;
    tema.globalValues.logo = "shopify://shop_images/orbis-390d7e56-banner.png";
    const urls = {};
    for (const img of primeira.images) urls[img.name.toLowerCase()] = urlDeAssetDoTema(tema.sourceFingerprint, img.path);
    tema.assetUrls = urls;
    themeExport.reconectarImagens(tema, new Map(), new Map(Object.entries(urls)));
    assert.match(tema.globalValues.logo, /^\/api\/theme-assets\?/, "religada para o endereço servido");

    /* 2. EXPORTAR pelo estúdio, que é onde o arquivo se perdia */
    const { zip } = themeExport.exportThemeZip(tema, shopifyTheme.themeFilesFromZip(entregue), new Map());
    const saida = unzipSync(zip);
    assert.ok(saida["assets/orbis-390d7e56-banner.png"], "o arquivo tem de sair no ZIP");
    assert.equal(saida["previa-local/produtos-para-importar.csv"], undefined, "o resto da prévia continua fora");
    const globais = JSON.parse(strFromU8(saida["config/settings_data.json"]));
    assert.equal(globais.current.logo, "shopify://shop_images/orbis-390d7e56-banner.png", "referência canônica, não endereço local");

    /* 3. IMPORTAR de novo, em máquina sem acervo: a arte volta do pacote */
    const segunda = shopifyTheme.extractShopifyThemePackage(zip, "baixado.zip");
    const urls2 = {};
    for (const img of segunda.images) urls2[img.name.toLowerCase()] = urlDeAssetDoTema(segunda.theme.sourceFingerprint, img.path);
    segunda.theme.assetUrls = urls2;
    const contagem = themeExport.reconectarImagens(segunda.theme, new Map(), new Map(Object.entries(urls2)));
    assert.equal(contagem.doPacote, 1, "a arte volta do próprio ZIP baixado");
    assert.deepEqual(contagem.perdidas, [], "nada se perde na volta");
    assert.match(segunda.theme.globalValues.logo, /orbis-390d7e56-banner\.png/);
  } finally {
    await server.close();
  }
});
