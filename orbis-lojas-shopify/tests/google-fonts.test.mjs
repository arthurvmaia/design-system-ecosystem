import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/** Fase 6: catálogo do Google Fonts — parse, reserva e disciplina de performance. */

test("parseGoogleFontsMetadata reduz o metadata público ao que o editor usa", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { parseGoogleFontsMetadata, CATALOG_FALLBACK } = await server.ssrLoadModule("/lib/google-fonts.ts");
    const raw = `)]}'\n${JSON.stringify({ familyMetadataList: [
      { family: "Poppins", category: "Sans Serif", fonts: { "300": {}, "400": {}, "400i": {}, "700": {} } },
      { family: "Lora", category: "Serif", fonts: { "400": {}, "500i": {} } },
      { family: "", category: "Serif", fonts: {} },
      { family: "Fonte Estranha", category: "categoria-nova", fonts: {} },
    ] })}`;
    const fonts = parseGoogleFontsMetadata(raw);
    assert.equal(fonts.length, 3, "família sem nome cai fora");
    assert.deepEqual(fonts[0], { family: "Poppins", category: "sans-serif", weights: [300, 400, 700], italic: true });
    assert.deepEqual(fonts[1].weights, [400, 500]);
    assert.equal(fonts[1].italic, true);
    assert.equal(fonts[2].weights.length, 1, "família sem variantes ganha 400 como reserva");
    assert.equal(fonts[2].category, "sans-serif", "categoria desconhecida normaliza");
    assert.ok(CATALOG_FALLBACK.length >= 30, "reserva local cobre as famílias já conhecidas");
  } finally {
    await server.close();
  }
});

test("o catálogo carrega fontes sob demanda, nunca o acervo inteiro", async () => {
  const catalog = await readFile(new URL("../app/FontCatalog.tsx", import.meta.url), "utf8");
  assert.match(catalog, /text=\$\{encodeURIComponent\(family\)\}/, "preview do nome usa subset só das letras do nome");
  assert.match(catalog, /loadedPreviews/, "folhas de preview são deduplicadas");
  assert.match(catalog, /PAGE_SIZE/, "lista paginada, não o catálogo inteiro");
  assert.match(catalog, /CATALOG_FALLBACK/, "reserva declarada quando o catálogo cai");
  assert.match(catalog, /rememberRecentFont/, "fontes recentes registradas");
  const route = await readFile(new URL("../app/api/google-fonts/route.ts", import.meta.url), "utf8");
  assert.match(route, /CATALOG_TTL_MS/, "cache com validade no R2");
  assert.match(route, /source: "stale"/, "cache vencido ainda serve quando a rede cai");
});
