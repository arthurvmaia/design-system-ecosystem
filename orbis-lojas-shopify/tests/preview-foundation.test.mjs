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

test("Fase 3: a área de Temas usa a fundação (card grande + biblioteca)", async () => {
  const source = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /previewFromTheme\(theme\)/, "ThemeCard nasce do normalizador");
  assert.match(source, /const \[principal, \.\.\.biblioteca\]/, "primeiro tema em destaque, demais na grade");
  assert.match(source, /cardFor\(principal, "grande"\)/);
  assert.doesNotMatch(source, /mini-store/, "o mock antigo do card saiu de cena");
});

test("Fase 4: a área de Projetos usa a fundação com ações próprias", async () => {
  const source = await readFile(new URL("../app/AppShell.tssx".replace("tssx","tsx"), import.meta.url), "utf8");
  assert.match(source, /previewFromProject\(project\)/, "ProjectRow nasce do normalizador");
  assert.match(source, /size="lista"/, "projetos em modo lista");
  assert.match(source, /Tema: \{project\.themeName\}/, "tema relacionado visível");
  assert.doesNotMatch(source, /project-thumb/, "o thumb antigo de três barras saiu");
});

test("RECUPERAÇÃO F2: a miniatura é a home REAL pelo motor existente, não um mock", async () => {
  const card = await readFile(new URL("../app/PreviewCard.tsx", import.meta.url), "utf8");
  assert.match(card, /function RealHomeThumbnail/, "motor de miniatura real existe");
  assert.match(card, /\/api\/theme-render/.source ? /fetch\(src\)/ : /fetch\(src\)/, "busca o HTML real da rota de render");
  assert.match(card, /homeHtmlCache/, "cache por URL, sem regenerar a cada render");
  assert.match(card, /IntersectionObserver/, "carregamento tardio: só quando o card aparece");
  /* o observer sozinho não basta: em aba oculta ele nunca reporta e a
     miniatura ficaria presa em carregando — a geometria é quem decide */
  assert.match(card, /getBoundingClientRect\(\)/, "verificação geométrica como rede de segurança");
  assert.match(card, /addEventListener\("scroll", checar/, "rolagem reavalia sem depender do observer");
  assert.match(card, /pointer-events/.source ? /tabIndex=\{-1\}/ : /tabIndex=\{-1\}/, "iframe inerte para foco");
  assert.match(card, /Tentar de novo/, "erro real com nova tentativa, sem imagem falsa");
  assert.match(card, /homeSrc \? \(\s*<RealHomeThumbnail/, "quando a home real existe, o mock NUNCA aparece");
  const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.home-thumb-frame \{[^}]*pointer-events: none/, "nenhuma interação atravessa a miniatura");
  const route = await readFile(new URL("../app/api/theme-render/route.ts", import.meta.url), "utf8");
  assert.match(route, /projectId/, "a MESMA rota de render serve projetos");
  assert.match(route, /WHERE id = \? AND user_id = \?/, "projeto escopado ao dono");
});

test("RECUPERAÇÃO F3: cada tema mostra a home real DELE na área de Temas", async () => {
  const source = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  /* a URL carrega o id do PRÓPRIO tema — nada de preview compartilhado */
  assert.match(source, /homeSrc = model\.renderable \? `\/api\/theme-render\?themeId=\$\{encodeURIComponent\(theme\.id\)\}&page=index`/);
  assert.match(source, /homeSrc=\{homeSrc\}/, "o card recebe a home real");
  assert.match(source, /unavailableReason=/, "sem ZIP preservado, o motivo é declarado");
  assert.doesNotMatch(source, /previewFromTheme\(theme\)[\s\S]{0,400}PreviewMock/, "o mock não é o preview final de tema");
});
