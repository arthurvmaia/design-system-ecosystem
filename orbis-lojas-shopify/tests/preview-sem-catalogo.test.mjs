import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * A simulação (o desenho que aparece quando o render do Liquid falha) não tem
 * mais catálogo: mercadoria é da loja de quem publica. Sem produto, cada seção
 * tem de mostrar o vazio — e não estourar num `PRODUCTS[0]` que não existe.
 *
 * Este teste RENDERIZA o componente de verdade. É o que pega a quebra que
 * nenhuma leitura de fonte pega.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

function secao(id, type, settings = {}) {
  return { id, type, name: type, settings, blocks: [] };
}

function temaFalso(sections) {
  return {
    format: "shopify-os-2.0", themeName: "Cru", version: "1.0", author: "", sourceFile: "cru.zip",
    sourceFingerprint: "x", importedAt: "2026-01-01T00:00:00.000Z",
    summary: { fileCount: 0, templateCount: 0, jsonTemplateCount: 0, liquidTemplateCount: 0, sectionDefinitionCount: 0, editableSettingCount: 0, assetCount: 0, snippetCount: 0, localeCount: 0, layoutCount: 0 },
    sourceFiles: [], compatibility: { architecture: "Shopify OS 2.0", preservedSource: false, externalData: [] },
    globalGroups: [], globalValues: {}, sectionSchemas: [],
    pages: [{ id: "index", name: "Início", template: "index", sections }],
  };
}

test("a simulação sem catálogo renderiza inteira, sem produto inventado", async () => {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { ShopifyStorePreview } = await server.ssrLoadModule("/app/ShopifyStorePreview.tsx");

    /* uma seção de cada família que antes ia buscar produto no catálogo */
    const sections = [
      secao("s1", "main-product"),
      secao("s2", "featured-collection"),
      secao("s3", "image-banner"),
      secao("s4", "main-search"),
      secao("s5", "main-cart-items"),
      secao("s6", "main-cart-footer"),
    ];
    const theme = temaFalso(sections);
    const page = theme.pages[0];

    const html = renderToStaticMarkup(createElement(ShopifyStorePreview, {
      theme, page, device: "desktop", selectedSectionId: "", onSelectSection: () => {}, onNavigatePage: () => {},
    }));

    assert.ok(html.length > 0, "a simulação não renderizou");
    /* o vazio é dito por extenso, em vez de virar produto de mentira */
    assert.match(html, /Este tema ainda não tem catálogo ligado/);
    assert.match(html, /Seu carrinho está vazio/);
    assert.doesNotMatch(html, /R\$\s?0,00.*Adicionar ao carrinho/s);
  } finally {
    await server.close();
  }
});
