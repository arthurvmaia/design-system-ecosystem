import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

/** Editar código: regravação de um arquivo no ZIP preservado, sem tocar no resto. */

function makeZip(prefix = "Tema/") {
  return zipSync({
    [`${prefix}config/settings_schema.json`]: strToU8(JSON.stringify([
      { name: "theme_info", theme_name: "Código", theme_version: "1.0", theme_author: "Orbis" },
      { name: "Cores", settings: [{ type: "color", id: "cor", label: "Cor", default: "#112233" }] },
    ])),
    [`${prefix}config/settings_data.json`]: strToU8(JSON.stringify({ current: { cor: "#112233" } })),
    [`${prefix}layout/theme.liquid`]: strToU8("<body>{{ content_for_layout }}</body>"),
    [`${prefix}sections/hero.liquid`]: strToU8(`<p>original</p>{% schema %}${JSON.stringify({ name: "Hero", settings: [], presets: [{ name: "Hero" }] })}{% endschema %}`),
    [`${prefix}templates/index.json`]: strToU8(JSON.stringify({ sections: { hero: { type: "hero", settings: {} } }, order: ["hero"] })),
    [`${prefix}assets/base.css`]: strToU8("body{color:red}"),
    [`${prefix}assets/logo.png`]: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]),
  });
}

test("updateThemeSourceFile regrava um arquivo e preserva o resto byte a byte", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { updateThemeSourceFile, isEditableCodePath, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const original = makeZip();
    const next = updateThemeSourceFile(original, "sections/hero.liquid", strToU8(`<p>editado</p>{% schema %}${JSON.stringify({ name: "Hero", settings: [], presets: [{ name: "Hero" }] })}{% endschema %}`));

    const files = themeFilesFromZip(next);
    assert.match(strFromU8(files.get("sections/hero.liquid")), /editado/);
    /* os demais arquivos continuam idênticos, inclusive o binário */
    const before = unzipSync(original);
    const after = unzipSync(next);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort());
    for (const name of Object.keys(before)) {
      if (name.endsWith("sections/hero.liquid")) continue;
      assert.deepEqual(after[name], before[name], `${name} deveria continuar intocado`);
    }

    /* criação de arquivo novo em pasta válida */
    const withNew = updateThemeSourceFile(next, "snippets/novo.liquid", strToU8("<span>novo</span>"));
    assert.equal(strFromU8(themeFilesFromZip(withNew).get("snippets/novo.liquid")), "<span>novo</span>");

    /* guardas: caminho fora das pastas, extensão binária e escape de diretório */
    assert.equal(isEditableCodePath("assets/base.css"), true);
    assert.equal(isEditableCodePath("assets/logo.png"), false);
    assert.equal(isEditableCodePath("outra-pasta/arquivo.liquid"), false);
    assert.equal(isEditableCodePath("assets/../config/settings_data.json"), false);
    assert.throws(() => updateThemeSourceFile(original, "assets/logo.png", strToU8("x")), /SHOPIFY_CODE_PATH/);
  } finally {
    await server.close();
  }
});

test("navegação do preview: hrefs reais viram páginas do editor", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { resolvePreviewPageId } = await server.ssrLoadModule("/app/ShopifyStorePreview.tsx");
    const theme = { pages: [{ id: "index" }, { id: "collection" }, { id: "product" }, { id: "cart" }, { id: "search" }, { id: "blog" }, { id: "article" }, { id: "page.contact" }, { id: "page" }, { id: "list-collections" }, { id: "customers/login" }] };
    assert.equal(resolvePreviewPageId(theme, "/"), "index");
    assert.equal(resolvePreviewPageId(theme, "/cart"), "cart");
    assert.equal(resolvePreviewPageId(theme, "/search?q=x"), "search");
    assert.equal(resolvePreviewPageId(theme, "/collections"), "list-collections");
    assert.equal(resolvePreviewPageId(theme, "/collections/all"), "collection");
    assert.equal(resolvePreviewPageId(theme, "/products/balance"), "product");
    assert.equal(resolvePreviewPageId(theme, "/blogs/news"), "blog");
    assert.equal(resolvePreviewPageId(theme, "/blogs/news/artigo"), "article");
    assert.equal(resolvePreviewPageId(theme, "/pages/contact"), "page.contact");
    assert.equal(resolvePreviewPageId(theme, "/pages/outra"), "page");
    assert.equal(resolvePreviewPageId(theme, "/account/login"), "customers/login");
    assert.equal(resolvePreviewPageId(theme, "/nada-a-ver"), null);
  } finally {
    await server.close();
  }
});
