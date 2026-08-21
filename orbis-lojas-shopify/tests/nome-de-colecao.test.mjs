import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strToU8, zipSync } from "fflate";

/**
 * O NOME DA COLEÇÃO na vitrine, com acento e com maiúscula no lugar certo.
 *
 * O dono abriu a loja gerada e viu os cartões escritos assim:
 *
 *     Cozinha · Organizacao · Decoracao · Cama E Banho · Iluminacao · Ofertas
 *
 * Nenhum erro de digitação: o tema guarda HANDLE, e handle é slug — sem acento,
 * sem maiúscula, com hífen. Quem montava o cartão reconstruía o título a partir
 * dele e punha maiúscula em toda palavra, então "organizacao" voltava sem
 * cedilha e "cama-e-banho" voltava com um "E" gritado no meio.
 *
 * O nome existe: é a pessoa que o escreve, e `aplicarMarcaNoTema` o converte em
 * handle. Estes testes travam as duas pontas — guardar o nome antes de perdê-lo,
 * e usá-lo na hora de desenhar o cartão.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

async function comServidor(trabalho) {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try { return await trabalho(server); } finally { await server.close(); }
}

/** Um tema mínimo que desenha os títulos das coleções, como o Dawn faz. */
function temaComListaDeColecoes() {
  const layout = "<!doctype html><html><body>{{ content_for_layout }}</body></html>";
  const secao = `<ul class="colecoes">{% for c in section.settings.colecoes %}<li>{{ c.title }}</li>{% endfor %}</ul>
{% schema %}{"name":"Lista","settings":[{"type":"collection_list","id":"colecoes","label":"Coleções"}]}{% endschema %}`;
  /* o `settings` declarado importa: quem resolve percorre o que a SEÇÃO
     guardou, não o schema — seção sem o campo salvo nunca chega no resolvedor */
  return zipSync({
    "layout/theme.liquid": strToU8(layout),
    "sections/lista.liquid": strToU8(secao),
    "templates/index.json": strToU8(JSON.stringify({ sections: { lista: { type: "lista", settings: { colecoes: [] } } }, order: ["lista"] })),
    "config/settings_schema.json": strToU8(JSON.stringify([{ name: "theme_info", theme_name: "Cru", theme_version: "1.0" }])),
    "config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
  });
}

async function renderizar(server, { orbisColecoes, nicheId, handles }) {
  const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
  const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
  const bytes = temaComListaDeColecoes();
  const theme = extractShopifyThemeBytes(bytes, "tema.zip");
  if (orbisColecoes) theme.orbisColecoes = orbisColecoes;
  /* os cartões da home saem das CAPAS: é a chave delas que vira handle */
  const capas = Object.fromEntries(handles.map((h) => [h, `/api/media/${h}`]));
  return renderThemePage({
    theme, files: themeFilesFromZip(bytes), pageId: "index",
    assetBase: (path) => `/assets/${path}`, capasDeColecao: capas, nicheId,
  });
}

test("o cartão mostra o nome que a pessoa escreveu, com acento", async () => {
  await comServidor(async (server) => {
    const html = await renderizar(server, {
      orbisColecoes: ["Cozinha", "Organização", "Decoração", "Cama e banho", "Iluminação"],
      handles: ["cozinha", "organizacao", "decoracao", "cama-e-banho", "iluminacao"],
    });
    for (const nome of ["Organização", "Decoração", "Cama e banho", "Iluminação"]) {
      assert.ok(html.includes(`<li>${nome}</li>`), `faltou "${nome}" na vitrine`);
    }
    /* e o que o dono viu não volta */
    for (const errado of ["Organizacao", "Decoracao", "Iluminacao", "Cama E Banho"]) {
      assert.ok(!html.includes(`<li>${errado}</li>`), `o slug reconstruído voltou: ${errado}`);
    }
  });
});

test("sem nome guardado, o catálogo do nicho responde", async () => {
  await comServidor(async (server) => {
    /**
     * Loja gerada ANTES de o tema passar a guardar nome continua certa: as
     * coleções dela são as do nicho, e o catálogo sabe escrevê-las. Sem esta
     * reserva, todo projeto já criado ficaria com o slug para sempre.
     */
    const html = await renderizar(server, {
      nicheId: "pet",
      handles: ["caes", "gatos", "brinquedos", "mais-vendidos"],
    });
    assert.ok(html.includes("<li>Cães</li>"), "o nicho sabe que é Cães, não Caes");
    assert.ok(html.includes("<li>Mais vendidos</li>"), "e que é Mais vendidos, não Mais Vendidos");
    assert.ok(!html.includes("<li>Caes</li>"));
  });
});

test("sem nome nenhum, o slug ainda não grita maiúscula em ligação", async () => {
  await comServidor(async (server) => {
    /**
     * Coleção de tema IMPORTADO não é nossa: o nome acentuado nunca existiu
     * neste computador, e inventá-lo seria adivinhar. O que dá para consertar
     * sem adivinhar é a maiúscula — "Beleza E Saude" não é decisão de ninguém,
     * é defeito de reconstrução.
     */
    const html = await renderizar(server, { handles: ["beleza-e-saude", "moda-feminina"] });
    assert.ok(html.includes("<li>Beleza e Saude</li>"), "a ligação ficou maiúscula");
    assert.ok(html.includes("<li>Moda Feminina</li>"), "palavra de conteúdo continua capitalizada");
  });
});

test("aplicarMarcaNoTema guarda o nome antes de convertê-lo em handle", async () => {
  await comServidor(async (server) => {
    const { aplicarMarcaNoTema, handleDeColecao } = await server.ssrLoadModule("/lib/shopify-brand.ts");
    const { extractShopifyThemeBytes } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const theme = extractShopifyThemeBytes(temaComListaDeColecoes(), "tema.zip");

    /* a conversão é de mão única: "Organização" vira "organizacao" e o acento
       não tem como voltar de lá. Guardar o nome aqui é o que torna o cartão
       possível — este é o último ponto do caminho em que ele existe */
    assert.equal(handleDeColecao("Organização"), "organizacao");
    const marca = {
      name: "Casa Viva", primaryColor: "#2f5d50", backgroundColor: "#f7f7f5",
      collections: ["Cozinha", "Organização", "Cama e banho"],
    };
    const resultado = aplicarMarcaNoTema(theme, marca);
    assert.deepEqual(resultado.theme.orbisColecoes, ["Cozinha", "Organização", "Cama e banho"]);
  });
});

test("marca própria com nicho escolhido recebe as coleções DO NICHO", async () => {
  await comServidor(async (server) => {
    const { colecoesDaLoja } = await server.ssrLoadModule("/lib/shopify-brand.ts");

    /**
     * Medido numa entrega real: o cliente com marca própria escolheu "roupas" só
     * para ter catálogo, e a lista chegava VAZIA à aplicação da marca. Lista
     * vazia era lida como "não mexer", então o tema saía apontando para as
     * coleções de DEMONSTRAÇÃO do tema de origem — "pet-shop", "eletronicos",
     * "moda-feminina" —, enquanto a instalação criava na Shopify "Novidades",
     * "Básicos" e as outras do nicho. Duas metades da mesma entrega, cada uma
     * com uma lista diferente, e a vitrine do cliente apontando para coleções
     * que não existiam na loja dele.
     */
    assert.deepEqual(
      colecoesDaLoja({ nicheId: "roupas", brand: { name: "Sasa" } }),
      ["Novidades", "Básicos", "Coleção de estação", "Alfaiataria", "Promoções", "Últimas peças"],
    );

    /* o que a pessoa digitou continua vencendo o nicho: era o motivo de o campo
       existir, e o padrão não pode reintroduzir o descarte que ele consertou */
    assert.deepEqual(
      colecoesDaLoja({ nicheId: "roupas", brand: { name: "Sasa", collections: ["Moda Fitness", "Verão"] } }),
      ["Moda Fitness", "Verão"],
    );

    /* espaço em branco não é coleção: apagar tudo devolve as do nicho, em vez
       de entregar uma loja sem categoria nenhuma */
    assert.deepEqual(
      colecoesDaLoja({ nicheId: "roupas", brand: { name: "Sasa", collections: ["  ", ""] } }).length,
      6,
    );

    /**
     * SEM nicho, nada. `nichoPorId` devolve o PRIMEIRO nicho para id
     * desconhecido, então chamá-lo sem nicho daria "roupas" a uma loja que não
     * escolheu catálogo nenhum — inventar categoria é pior que não ter.
     */
    assert.deepEqual(colecoesDaLoja({ brand: { name: "Sasa" } }), []);
  });
});

test("acabando as coleções, o CARTÃO some e a seção de destaque dá a volta", async () => {
  await comServidor(async (server) => {
    const { aplicarMarcaNoTema } = await server.ssrLoadModule("/lib/shopify-brand.ts");
    const { gerarMarca } = await server.ssrLoadModule("/lib/marca-generator.mjs");

    /**
     * As duas vagas erram para lados opostos, e por isso a regra é diferente.
     *
     * Medido numa entrega real: as seis coleções da loja preenchiam os seis
     * cartões de "Nossas Coleções" e ACABAVAM ali. As duas `featured-collection`
     * do Dawn ficavam então com o que o tema trouxe de casa, apontando para
     * "moda-feminina" e "casa-cozinha-e-jardim" — coleções da loja de ORIGEM,
     * que não existem na loja do cliente. Duas seções vazias na home.
     */
    const tema = {
      format: "shopify-os-2.0", themeName: "Tema", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [], globalValues: {},
      sectionSchemas: [
        { type: "collection-list", name: "Lista", presets: [], settings: [],
          blocks: [{ type: "cartao", name: "Cartão", settings: [{ id: "collection", type: "collection", label: "Coleção" }] }] },
        { type: "featured-collection", name: "Destaque", blocks: [], presets: [],
          settings: [{ id: "collection", type: "collection", label: "Coleção" }] },
      ],
      pages: [{ id: "index", name: "Início", template: "templates/index.json", sections: [
        { id: "lista", type: "collection-list", name: "Lista", settings: {}, blocks: [
          { id: "b0", type: "cartao", settings: { collection: "da-origem-0" } },
          { id: "b1", type: "cartao", settings: { collection: "da-origem-1" } },
          { id: "b2", type: "cartao", settings: { collection: "da-origem-2" } },
        ] },
        { id: "d1", type: "featured-collection", name: "Destaque", settings: { collection: "da-origem-a" }, blocks: [] },
        { id: "d2", type: "featured-collection", name: "Destaque", settings: { collection: "da-origem-b" }, blocks: [] },
      ] }],
    };

    /* DUAS coleções para TRÊS cartões e DUAS seções: a lista acaba de propósito */
    const marca = gerarMarca({ nicheId: "roupas", semente: "vaga", sobrescritas: { collections: ["Alfa", "Beta"] } });
    const { theme } = aplicarMarcaNoTema(tema, { ...marca, imagens: {} });

    const secoes = theme.pages[0].sections;
    const lista = secoes.find((s) => s.type === "collection-list");
    const destaques = secoes.filter((s) => s.type === "featured-collection");

    /* 1. o cartão sem coleção SOME: repetir lado a lado põe a mesma coleção
       duas vezes na mesma vitrine, com fotos diferentes, e parece duas */
    assert.equal(lista.blocks.length, 2, "o cartão sobrando devia ter sido removido");
    assert.deepEqual(lista.blocks.map((b) => b.settings.collection).sort(), ["alfa", "beta"]);

    /* 2. a SEÇÃO não some e não fica com o handle do tema de origem: ela dá a
       volta na lista. O que ela mostra são produtos, não um cartão de coleção */
    assert.equal(destaques.length, 2, "seção de destaque não pode ser apagada");
    assert.deepEqual(destaques.map((s) => s.settings.collection).sort(), ["alfa", "beta"]);

    /* 3. e nada, em lugar nenhum, continua apontando para a loja de origem */
    assert.doesNotMatch(JSON.stringify(theme.pages), /da-origem-/);
  });
});
