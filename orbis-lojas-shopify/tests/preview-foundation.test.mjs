import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/** Fase 2: a fundação dos previews normaliza Tema e Projeto com dados reais. */

const fakeShopify = {
  format: "shopify-os-2.0",
  themeName: "Tema Real",
  version: "2.0",
  author: "Loja",
  sourceFile: "tema.zip",
  sourceFingerprint: "abcdef0123456789",
  importedAt: new Date().toISOString(),
  summary: { fileCount: 10, templateCount: 7, jsonTemplateCount: 7, liquidTemplateCount: 0, sectionDefinitionCount: 12, editableSettingCount: 40, assetCount: 3, snippetCount: 2, localeCount: 1, layoutCount: 1 },
  sourceFiles: [],
  compatibility: { architecture: "Shopify OS 2.0", preservedSource: true, externalData: [] },
  globalGroups: [],
  globalValues: { colors_accent_1: "#6d388b", colors_background_1: "#ffffff", colors_text: "#121212" },
  sectionSchemas: [],
  pages: [{ id: "index", name: "Página inicial", template: "templates/index.json", sections: [] }],
  assetPreview: "/api/theme-assets?fp=abcdef0123456789&path=assets%2Fbanner.png",
};

test("previewFromTheme e previewFromProject derivam imagem, paleta e status do tema real", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { previewFromTheme, previewFromProject } = await server.ssrLoadModule("/app/preview-model.ts");

    const theme = previewFromTheme({ id: "t1", name: "Tema Real", slug: "tema-real", description: "", category: "Loja virtual", tokenPrice: 0, version: "2.0", author: "Loja", languages: [], sectionCount: 12, featured: 1, badge: "TEMA IMPORTADO", defaultSettings: { shopify: fakeShopify } });
    assert.equal(theme.image, fakeShopify.assetPreview, "a imagem é a foto real eleita na importação");
    assert.equal(theme.palette.accent, "#6d388b", "a paleta vem dos settings reais");
    assert.equal(theme.status?.label, "ZIP preservado");
    assert.ok(theme.meta.includes("7 páginas"));

    const project = previewFromProject({ id: "p1", themeId: "t1", themeName: "Tema Real", name: "Loja Nova", status: "published", customization: { shopify: fakeShopify }, publishedSlug: null, createdAt: "2026-08-01 10:00:00", updatedAt: "2026-08-07 10:00:00" });
    assert.equal(project.palette.accent, "#6d388b");
    assert.equal(project.status?.label, "PUBLICADO");
    assert.equal(project.status?.tone, "ok");
    assert.equal(project.subtitle, "Tema Real");

    /* sem dados Shopify: cai na paleta do caminho legado, sem inventar imagem */
    const semShopify = previewFromTheme({ id: "t2", name: "Sem Dados", slug: "x", description: "", category: "Loja virtual", tokenPrice: 0, version: "1", author: "", languages: [], sectionCount: 0, featured: 0, badge: null, defaultSettings: {} });
    assert.equal(semShopify.image, undefined);
    assert.ok(/^#[0-9a-f]{6}$/i.test(semShopify.palette.accent));
  } finally {
    await server.close();
  }
});

test("PreviewCard cobre carregamento, erro de imagem e fallback com paleta", async () => {
  const source = await readFile(new URL("../app/PreviewCard.tsx", import.meta.url), "utf8");
  assert.match(source, /onError=\{\(\) => setImageState\("erro"\)\}/, "erro de imagem cai no mock");
  assert.match(source, /PreviewMock/, "mock com a paleta real quando não há foto");
  assert.match(source, /PreviewCardSkeleton/, "esqueleto para listas carregando");
  assert.match(source, /--pc-accent/, "o mock é pintado pela paleta do modelo");
  assert.match(source, /aria-label/, "cartão acessível");
});
