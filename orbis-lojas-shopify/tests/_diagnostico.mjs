/* Diagnóstico de fidelidade: importa um ZIP real de tema e audita o HTML
 * renderizado pelo motor contra o que a Shopify produz.
 * Uso: node tests/_diagnostico.mjs <caminho-do-zip> [pagina]
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const zipPath = process.argv[2];
const pageId = process.argv[3] ?? "index";
if (!zipPath) { console.error("informe o caminho do ZIP"); process.exit(1); }

const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
try {
  const { extractShopifyThemePackage, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
  const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");

  const bytes = new Uint8Array(await readFile(zipPath));
  const { theme } = extractShopifyThemePackage(bytes, zipPath.split(/[\\/]/).at(-1));
  const files = themeFilesFromZip(bytes);

  const json = JSON.stringify(theme);
  console.log("== IMPORTAÇÃO ==");
  console.log("tema:", theme.themeName, "| formato:", theme.format);
  console.log("páginas:", theme.pages.map((p) => p.id).join(", "));
  console.log("tamanho serializado:", (json.length / 1024 / 1024).toFixed(2), "MB", json.length > 3_000_000 ? "  *** ACIMA DO TETO DE 3MB do cleanShopifyData — o tema seria DESCARTADO na persistência ***" : "(dentro do teto de 3MB)");
  console.log("grupos de settings:", theme.globalGroups.map((g) => g.name).join(" | "));

  const html = await renderThemePage({ theme, files, pageId, assetBase: (p) => `/assets-local/${p}` });
  await writeFile(new URL(`./_render-${pageId.replace(/[^\w.-]/g, "_")}.html`, import.meta.url), html);

  console.log("\n== RENDER (" + pageId + ") ==", html.length, "bytes");
  const brokenVars = [...html.matchAll(/--[\w-]+:\s*(?:,\s*)+;/g)];
  console.log("variáveis CSS quebradas (', ,'):", brokenVars.length, brokenVars.slice(0, 8).map((m) => m[0]));
  const emptyVars = [...html.matchAll(/--[\w-]+:\s*;/g)];
  console.log("variáveis CSS vazias:", emptyVars.length, emptyVars.slice(0, 8).map((m) => m[0]));
  console.log("@font-face presentes:", (html.match(/@font-face/g) ?? []).length);
  console.log("links de fonte:", [...html.matchAll(/<link[^>]*(?:fonts\.|font\/woff)[^>]*>/g)].length);
  console.log("comentários de erro de seção:", [...html.matchAll(/<!-- (?:seção|template) [^>]*-->/g)].map((m) => m[0].slice(0, 110)));
  const colorBase = html.match(/--color-base-accent-1:[^;]*/);
  console.log("--color-base-accent-1:", colorBase ? colorBase[0] : "AUSENTE");
  const bodyFont = html.match(/--font-body-family:[^;]*/);
  console.log("--font-body-family:", bodyFont ? bodyFont[0] : "AUSENTE");
  const headingFont = html.match(/--font-heading-family:[^;]*/);
  console.log("--font-heading-family:", headingFont ? headingFont[0] : "AUSENTE");
  const italic = html.match(/--font-body-style:[^;]*/);
  console.log("--font-body-style:", italic ? italic[0] : "AUSENTE");
  console.log("classes color-scheme no HTML:", [...new Set([...html.matchAll(/class="[^"]*\bcolor-([\w-]+)/g)].map((m) => m[1]))].slice(0, 10));
  console.log("seções renderizadas:", [...html.matchAll(/id="shopify-section-[^"]*" class="shopify-section section-([\w-]+)"/g)].map((m) => m[1]).join(", "));
} finally {
  await server.close();
}
