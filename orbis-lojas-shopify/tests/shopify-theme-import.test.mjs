import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

/**
 * De que loja é este tema.
 *
 * `orbisNicheId` decide a vitrine da prévia e vivia SÓ no banco do app. O ZIP
 * entregue não levava nada, então reimportar a própria loja — gesto natural —
 * perdia o nicho e a vitrine caía no catálogo de demonstração: uma loja de
 * roupa abria com óculos e panela.
 */
test("o tema entregue diz de que loja é, e a importação reconhece pelas coleções quando não diz", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, ARQUIVO_DA_LOJA, marcadorDaLoja } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const comColecoes = (handles) => ({
      "Tema/layout/theme.liquid": strToU8("<html><body>{{ content_for_layout }}</body></html>"),
      "Tema/sections/lista.liquid": strToU8(section("Lista de coleções", [{ type: "collection", id: "collection", label: "Coleção" }])),
      "Tema/templates/index.json": strToU8(JSON.stringify({
        sections: Object.fromEntries(handles.map((h, i) => [`c${i}`, { type: "lista", settings: { collection: h } }])),
        order: handles.map((_, i) => `c${i}`),
      })),
      "Tema/config/settings_schema.json": strToU8(settingsSchema),
      "Tema/config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
    });
    const nicho = (arquivos) => extractShopifyThemeBytes(zipSync(arquivos), "tema.zip").orbisNicheId ?? "";

    /* o marcador é a fonte exata: sobrevive a renomear coleção no editor */
    assert.equal(nicho({ ...comColecoes([]), [`Tema/${ARQUIVO_DA_LOJA}`]: strToU8(marcadorDaLoja("joias")) }), "joias");
    /* e vence a dedução, se as duas discordarem */
    assert.equal(nicho({ ...comColecoes(["novidades", "basicos", "alfaiataria"]), [`Tema/${ARQUIVO_DA_LOJA}`]: strToU8(marcadorDaLoja("joias")) }), "joias");

    /* sem marcador, as coleções entregam o nicho — é o caso das lojas geradas
       antes deste commit, que já estão no computador de quem usa */
    assert.equal(nicho(comColecoes(["novidades", "basicos", "colecao-de-estacao", "alfaiataria", "promocoes", "ultimas-pecas"])), "roupas");
    assert.equal(nicho(comColecoes(["oculos-de-sol", "armacoes-de-grau", "polarizados"])), "oculos");

    /* coincidência não basta: "Novidades" e "Promoções" existem em quase todo
       nicho, e chutar aqui poria a loja errada na tela com cara de certeza */
    assert.equal(nicho(comColecoes(["novidades", "promocoes"])), "");
    /* tema cru continua sem nicho: é ele que abre com a vitrine de demonstração */
    assert.equal(nicho(comColecoes([])), "");
  } finally {
    await server.close();
  }
});

/**
 * A LOJA ENTREGUE NÃO É O TEMA DE ORIGEM.
 *
 * Uma loja feita sobre o Dawn continua carregando o `theme_info` do Dawn: o
 * `themeName` dela é "Dawn". Como o estúdio derivava o id do tema desse nome,
 * importar a loja do cliente caía em `import-dawn` — o MESMO id do tema base —
 * e o `ON CONFLICT DO UPDATE` a gravava por cima dele. Medido no acervo desta
 * máquina: o tema `import-dawn` do estúdio estava com `sourceFile`
 * "loja-claro-co.zip", ou seja, já era a loja do cliente ocupando a linha do
 * tema. Duas lojas sobre o mesmo tema também disputavam a mesma linha, e a
 * última a entrar apagava a anterior sem aviso.
 */
test("a loja entregue importa como ela mesma, e não por cima do tema de origem", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, identidadeDoTemaImportado, ARQUIVO_DA_LOJA, marcadorDaLoja } =
      await server.ssrLoadModule("/lib/shopify-theme.ts");

    const temaBase = {
      "layout/theme.liquid": "<html><body>{{ content_for_layout }}</body></html>",
      "sections/lista.liquid": section("Lista"),
      "templates/index.json": JSON.stringify({ sections: { c0: { type: "lista", settings: {} } }, order: ["c0"] }),
      "config/settings_schema.json": JSON.stringify([
        { name: "theme_info", theme_name: "Dawn", theme_version: "15.0", theme_author: "Shopify" },
      ]),
      "config/settings_data.json": JSON.stringify({ current: {} }),
    };
    const modeloNativo = { header: { brand: "Claro Co." }, hero: { headline: "Claro Co." } };

    /* o tema cru: entra pelo nome dele, como sempre */
    const cru = extractShopifyThemeBytes(archive(temaBase), "dawn.zip");
    assert.equal(cru.orbisLoja, undefined, "tema sem marcador não inventa loja");
    assert.equal(identidadeDoTemaImportado(cru).id, "import-dawn");

    /* a loja entregue: mesmo themeName, identidade própria */
    const daLoja = extractShopifyThemeBytes(archive({
      ...temaBase,
      [ARQUIVO_DA_LOJA]: marcadorDaLoja("oculos", {}, { nome: "Claro Co.", slug: "claro-co", customizacao: modeloNativo }),
    }), "loja-claro-co.zip");
    assert.equal(daLoja.themeName, "Dawn", "o theme_info continua sendo o do tema de origem");
    assert.deepEqual(daLoja.orbisLoja, { nome: "Claro Co.", slug: "claro-co" });
    assert.equal(identidadeDoTemaImportado(daLoja).id, "loja-claro-co");
    assert.equal(identidadeDoTemaImportado(daLoja).nome, "Claro Co.", "a lista do estúdio mostra o nome da loja");

    /* é ESTA a regressão: o id da loja não pode ser o do tema base */
    assert.notEqual(
      identidadeDoTemaImportado(daLoja).id,
      identidadeDoTemaImportado(cru).id,
      "a loja do cliente não pode gravar por cima do tema de origem",
    );

    /* e duas lojas sobre o mesmo tema não disputam a mesma linha */
    const outra = extractShopifyThemeBytes(archive({
      ...temaBase,
      [ARQUIVO_DA_LOJA]: marcadorDaLoja("roupas", {}, { nome: "Vega Modas", slug: "vega-modas" }),
    }), "loja-vega-modas.zip");
    assert.notEqual(identidadeDoTemaImportado(outra).id, identidadeDoTemaImportado(daLoja).id);

    /* o modelo nativo do estúdio viaja: sem ele a importação o herdava do que
       estivesse naquele id, e a loja abria com o conteúdo de demonstração */
    assert.deepEqual(daLoja.orbisCustomizacao, modeloNativo);
    assert.equal(outra.orbisCustomizacao, undefined, "loja que não declara modelo não ganha um inventado");

    /* o tema NÃO pode voltar dentro do modelo nativo: além da loja carregar duas
       versões de si mesma, o marcador viraria um ciclo no JSON */
    const comTemaDentro = extractShopifyThemeBytes(archive({
      ...temaBase,
      [ARQUIVO_DA_LOJA]: marcadorDaLoja("oculos", {}, {
        nome: "Claro Co.", slug: "claro-co",
        customizacao: { ...modeloNativo, shopify: { pages: [] } },
      }),
    }), "loja.zip");
    assert.equal("shopify" in (comTemaDentro.orbisCustomizacao ?? {}), false);

    /* meia identidade não vale: sem nome ou sem apelido o importador teria de
       inventar a outra metade, que é o palpite que o marcador existe para evitar */
    const meia = extractShopifyThemeBytes(archive({
      ...temaBase,
      [ARQUIVO_DA_LOJA]: marcadorDaLoja("oculos", {}, { nome: "Claro Co." }),
    }), "loja.zip");
    assert.equal(meia.orbisLoja, undefined);
    assert.equal(identidadeDoTemaImportado(meia).id, "import-dawn");

    /* o ShrinePro segue com id fixo — mas uma LOJA feita sobre ele não vira ele */
    assert.equal(identidadeDoTemaImportado({ themeName: "ShrinePro", sourceFile: "shrine.zip" }).id, "shrine-pro");
    assert.equal(
      identidadeDoTemaImportado({ themeName: "ShrinePro", sourceFile: "loja-x.zip", orbisLoja: { nome: "Loja X", slug: "loja-x" } }).id,
      "loja-loja-x",
    );
  } finally {
    await server.close();
  }
});

/**
 * A foto que ESTE app produziu volta sozinha na reimportação.
 *
 * Um tema exportado da Shopify aponta as fotos como `shopify://shop_images/…`
 * e o arquivo não viaja no ZIP: ele mora nos Arquivos da loja. Por isso
 * reimportar a própria loja trazia o banner em branco.
 *
 * Só que a exportação daqui grava o nome como `orbis-<8 do id>-<arquivo>`, e
 * esse id é o da mídia. Se ela ainda está no banco, o arquivo é o MESMO e não
 * há nada a adivinhar. Medido no acervo desta máquina: o Dawn importado pedia
 * três imagens assim, e as três estavam guardadas.
 */
test("percorrerValores alcança global, seção E bloco, que é onde mora a imagem do slide", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { percorrerValores } = await server.ssrLoadModule("/lib/theme-export.ts");
    const tema = {
      globalValues: { logo: "shopify://shop_images/orbis-aaaaaaaa-logo.png", cor: "#fff" },
      pages: [{
        id: "index",
        sections: [{
          settings: { fundo: "shopify://shop_images/orbis-bbbbbbbb-fundo.png" },
          /* o bloco é o nível que os laços copiados esqueciam, e é onde o
             slideshow guarda a imagem do banner */
          blocks: [{ settings: { image: "shopify://shop_images/orbis-cccccccc-banner.png", titulo: "Oi" } }],
        }],
      }],
    };

    /* primeiro só LÊ: devolver null não pode trocar nada */
    const vistos = [];
    const semTroca = percorrerValores(tema, (v) => { vistos.push(v); return null; });
    assert.equal(semTroca, 0, "devolver null não troca valor nenhum");
    assert.equal(vistos.length, 5, "todo texto é visitado, dos globais aos blocos");

    /* agora troca, e os três níveis têm de ser alcançados */
    const trocados = percorrerValores(tema, (v) => (v.startsWith("shopify://") ? `/api/media/${v.slice(-13, -4)}` : null));
    assert.equal(trocados, 3);
    assert.match(tema.globalValues.logo, /^\/api\/media\//);
    assert.match(tema.pages[0].sections[0].settings.fundo, /^\/api\/media\//);
    assert.match(tema.pages[0].sections[0].blocks[0].settings.image, /^\/api\/media\//, "o bloco não pode ficar de fora");
    assert.equal(tema.pages[0].sections[0].blocks[0].settings.titulo, "Oi", "texto que não casa fica intacto");
  } finally {
    await server.close();
  }
});

/**
 * A LOJA VOLTA INTEIRA — inclusive fora da máquina que a gerou.
 *
 * A reconexão tinha uma fonte só: o id da mídia no banco DESTE computador.
 * Funcionava em casa e falhava em qualquer outro lugar, porque o arquivo da
 * arte não está em `assets/` — a entrega o move para
 * `previa-local/imagens-para-a-shopify/` para o pacote caber no teto de 50 MB
 * da Shopify, e o importador descartava essa pasta inteira. A loja abria sem
 * banner e sem logo, com o arquivo dentro do próprio ZIP que acabara de abrir.
 */
test("a imagem da loja volta do acervo ou do próprio pacote, e o resto fica como está", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { reconectarImagens, prefixosDeMidia } = await server.ssrLoadModule("/lib/theme-export.ts");

    const idLocal = "aaaaaaaa-1111-2222-3333-444444444444";
    const tema = () => ({
      globalValues: { logo: "shopify://shop_images/orbis-aaaaaaaa-logo.png" },
      pages: [{
        id: "index",
        sections: [{
          id: "hero",
          settings: { fundo: "shopify://shop_images/orbis-bbbbbbbb-banner.png" },
          blocks: [{ id: "b1", settings: { foto: "shopify://shop_images/de-outra-loja.png", titulo: "Oi" } }],
        }],
      }],
      orbisCapas: {
        "oculos-de-sol": `/api/media/${idLocal}`,
        polarizados: "/api/media/bbbbbbbb-1111-2222-3333-444444444444",
      },
    });

    /* os prefixos varridos alcançam settings, blocos E capas */
    assert.deepEqual(prefixosDeMidia(tema()).sort(), ["aaaaaaaa", "bbbbbbbb"]);

    const acervo = new Map([["aaaaaaaa", idLocal]]);
    const pacote = new Map([["orbis-bbbbbbbb-banner.png", "/api/theme-assets?fp=ff&path=assets%2Forbis-bbbbbbbb-banner.png"]]);

    const t = tema();
    const contagem = reconectarImagens(t, acervo, pacote);

    /* 1. o que está no acervo volta para a biblioteca do editor, onde dá para trocar */
    assert.equal(t.globalValues.logo, `/api/media/${idLocal}`);
    /* 2. o que não está volta do PACOTE — é isto que faz a loja abrir em outra máquina */
    assert.equal(t.pages[0].sections[0].settings.fundo, "/api/theme-assets?fp=ff&path=assets%2Forbis-bbbbbbbb-banner.png");
    /* 3. o que não é nosso não é inventado: quadro vazio avisa, imagem errada não */
    assert.equal(t.pages[0].sections[0].blocks[0].settings.foto, "shopify://shop_images/de-outra-loja.png");
    assert.equal(t.pages[0].sections[0].blocks[0].settings.titulo, "Oi", "texto que não casa fica intacto");
    assert.deepEqual(contagem, { doAcervo: 1, doPacote: 2 }, "a capa também conta");

    /* as CAPAS seguem o mesmo caminho: sem isso a vitrine volta a cair na foto
       de produto sorteada pelo handle, que é o defeito que elas corrigem */
    assert.equal(t.orbisCapas["oculos-de-sol"], `/api/media/${idLocal}`, "capa que existe aqui fica como está");
    assert.equal(t.orbisCapas.polarizados, "/api/theme-assets?fp=ff&path=assets%2Forbis-bbbbbbbb-banner.png");

    /* sem acervo nenhum — outra máquina — o pacote sozinho ainda entrega */
    const fora = tema();
    const soPacote = reconectarImagens(fora, new Map(), pacote);
    assert.equal(fora.globalValues.logo, "shopify://shop_images/orbis-aaaaaaaa-logo.png", "sem arquivo, nada é inventado");
    assert.equal(fora.pages[0].sections[0].settings.fundo, "/api/theme-assets?fp=ff&path=assets%2Forbis-bbbbbbbb-banner.png");
    assert.equal(soPacote.doAcervo, 0);
  } finally {
    await server.close();
  }
});

test("a busca de mídia continua escopada ao dono", async () => {
  const rota = await readFile(new URL("../app/api/theme-import/route.ts", import.meta.url), "utf8");
  /* mídia de um usuário não pode aparecer na loja de outro por coincidência de id */
  assert.match(rota, /WHERE user_id = \? AND/);
  /* e a resposta diz quantas voltaram, e de onde */
  assert.match(rota, /imagensDoAcervo: religadas\.doAcervo/);
  assert.match(rota, /imagensDoPacote: religadas\.doPacote/);
});

/**
 * A ARTE que viaja no pacote entra como asset instalável.
 *
 * Ela não está em `assets/` porque a Shopify recusa tema acima de 50 MB. Estava
 * sendo descartada com o resto de `previa-local/`, e sem ela a loja importada
 * fora desta máquina não tinha imagem nenhuma para mostrar.
 */
test("as artes da entrega viram asset da loja, sem deixar a prévia entrar no tema", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemePackage } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const png = strToU8("conteudo-de-imagem");
    const zip = zipSync({
      "Tema/config/settings_schema.json": strToU8(settingsSchema),
      "Tema/config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
      "Tema/layout/theme.liquid": strToU8("{{ content_for_layout }}"),
      "Tema/sections/hero.liquid": strToU8(section("Hero")),
      "Tema/templates/index.json": strToU8(JSON.stringify({ sections: { hero: { type: "hero", settings: {} } }, order: ["hero"] })),
      "Tema/assets/base.css": strToU8("body{}"),
      "Tema/previa-local/index.html": strToU8("<html></html>"),
      "Tema/previa-local/produtos-para-importar.csv": strToU8("Title\nvelho"),
      "Tema/previa-local/imagens-para-a-shopify/orbis-aaaaaaaa-banner.png": png,
      "Tema/previa-local/imagens-para-a-shopify/COMO-SUBIR-AS-IMAGENS.txt": strToU8("instrucoes"),
      "Tema/previa-local/logo-da-marca/logo-extenso.svg": strToU8("<svg></svg>"),
    });

    const { theme, images } = extractShopifyThemePackage(zip, "loja.zip");
    assert.deepEqual(theme.orbisArtes, ["orbis-aaaaaaaa-banner.png"]);
    const arte = images.find((img) => img.name === "orbis-aaaaaaaa-banner.png");
    assert.ok(arte, "a arte da entrega precisa ser instalada");
    assert.equal(arte.path, "assets/orbis-aaaaaaaa-banner.png", "entra onde o tema procuraria a imagem");

    /* e nada mais da prévia atravessa: nem o txt de instruções, nem o CSV, nem
       o kit de logo — foi isso que fez cada loja nova nascer com o catálogo de
       uma loja velha */
    assert.equal(theme.sourceFiles.filter((f) => f.path.startsWith("previa-local/")).length, 0);
    assert.equal(images.filter((img) => img.name.endsWith(".txt")).length, 0);
    assert.equal(images.some((img) => img.name === "logo-extenso.svg"), false, "o kit de logo não é asset do tema");
  } finally {
    await server.close();
  }
});

test("o nome da coleção e a semente do sorteio voltam com a loja reimportada", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { exportThemeZip: exportar } = await server.ssrLoadModule("/lib/theme-export.ts");

    /**
     * O DEFEITO QUE ISTO FECHA, e que o dono viu no editor.
     *
     * Handle é slug: "organizacao" não reconstrói "Organização", e "cama-e-banho"
     * não reconstrói "Cama e Banho". O nome escrito pelo cliente vivia só em
     * memória — o marcador da loja entregue nunca o gravou —, então reimportar a
     * PRÓPRIA loja perdia os nomes e caía no padrão do nicho.
     *
     * A semente do sorteio anda junto pelo mesmo motivo: sem ela, o tema
     * reimportado é embaralhado de novo e a loja muda de ordem sozinha.
     */
    const bytes = archive({
      "config/settings_schema.json": settingsSchema,
      "config/settings_data.json": JSON.stringify({ current: {} }),
      "layout/theme.liquid": "<html><body>{{ content_for_layout }}</body></html>",
      "sections/lista.liquid": section("Lista", []),
      "templates/index.json": JSON.stringify({ sections: { a: { type: "lista", settings: {} } }, order: ["a"] }),
    });
    const original = extractShopifyThemeBytes(bytes, "tema.zip");

    const nomes = ["Organização", "Cama e Banho", "Últimas Peças"];
    const entregue = {
      ...original,
      orbisNicheId: "casa",
      orbisColecoes: nomes,
      orbisSorteio: "cliente-a",
      orbisCapas: { organizacao: "/api/media/1111111111111111aaaa" },
      orbisLoja: { nome: "Casa Viva", slug: "casa-viva" },
    };

    const saida = exportar(entregue, themeFilesFromZip(bytes));
    const devolta = extractShopifyThemeBytes(saida.zip, "entregue.zip");

    assert.deepEqual(devolta.orbisColecoes, nomes, "os nomes das coleções não voltaram");
    assert.equal(devolta.orbisSorteio, "cliente-a", "a semente do sorteio não voltou");
    /* e o que já voltava continua voltando */
    assert.equal(devolta.orbisNicheId, "casa");
    assert.deepEqual(devolta.orbisCapas, entregue.orbisCapas);
    assert.deepEqual(devolta.orbisLoja, entregue.orbisLoja);

    /* tema que nunca foi loja da Orbis não ganha campo nenhum: marcador com
       campo vazio faz quem lê achar que a loja declarou "sem coleção" */
    const cru = extractShopifyThemeBytes(bytes, "tema.zip");
    assert.equal(cru.orbisColecoes, undefined);
    assert.equal(cru.orbisSorteio, undefined);
  } finally { await server.close(); }
});

test("a chave do mapa de assets e a mesma que o Editor procura", async () => {
  const { readFile } = await import("node:fs/promises");
  const importacao = await readFile(new URL("../app/api/theme-import/route.ts", import.meta.url), "utf8");
  const tela = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");

  /**
   * O DEFEITO: a previa mostrava a imagem e o Editor mostrava o quadro vazio.
   *
   * O mapa era indexado com a caixa do arquivo, e o campo de imagem do Editor
   * busca em caixa baixa. Um tema que traga `Logo.png` batia na previa — o
   * renderizador normaliza os DOIS lados (`assetPathByName`) — e nunca batia no
   * Editor. A assimetria e o defeito; qual caixa se escolhe e indiferente,
   * desde que seja uma so.
   */
  const ABRE = String.fromCharCode(91);
  const FECHA = String.fromCharCode(93);
  const acessos = [];
  /* as duas formas de chegar no mapa: `urls[...]` e `assetUrls?.[...]` */
  for (const prefixo of ["urls" + ABRE, "Urls?." + ABRE]) {
    for (const pedaco of importacao.split(prefixo).slice(1)) acessos.push(pedaco.split(FECHA)[0].trim());
  }
  assert.ok(acessos.length >= 4, `esperava as duas gravacoes e as duas leituras do mapa, achei ${acessos.length}`);
  for (const chave of acessos) {
    assert.ok(chave.includes("chaveDeAsset("), `mapa de assets acessado sem normalizar a caixa: ${chave}`);
  }

  /* do lado da tela, a busca continua em caixa baixa */
  const previa = tela.slice(tela.indexOf("function mediaPreviewSource"));
  const corpo = previa.slice(0, previa.indexOf(String.fromCharCode(10) + "}"));
  assert.ok(corpo.includes("toLowerCase()"), "o Editor deixou de normalizar; o mapa e ele divergem de novo");
});
