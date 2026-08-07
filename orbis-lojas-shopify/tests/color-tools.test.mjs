import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/** Fase 9: ferramentas de cor do inspetor — parse com alfa, formato e contraste. */

test("parse, formato e contraste cobrem hex, hex8 e rgba", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { parseColorValue, formatColorValue, contrastRatio, isTextColorSetting, contextBackgroundColor, CONTRAST_MINIMUM } = await server.ssrLoadModule("/lib/color-tools.ts");

    assert.deepEqual(parseColorValue("#6d388b"), { hex: "#6d388b", alpha: 1 });
    assert.deepEqual(parseColorValue("#fff"), { hex: "#ffffff", alpha: 1 });
    assert.deepEqual(parseColorValue("#6d388b80"), { hex: "#6d388b", alpha: 0.5 });
    assert.deepEqual(parseColorValue("rgba(109, 56, 139, 0.35)"), { hex: "#6d388b", alpha: 0.35 });
    assert.equal(parseColorValue("linear-gradient(#fff, #000)"), null);

    /* alfa cheio volta como hex (formato dos temas); parcial vira rgba */
    assert.equal(formatColorValue("#6d388b", 1), "#6d388b");
    assert.equal(formatColorValue("#6d388b", 0.5), "rgba(109, 56, 139, 0.5)");
    /* round-trip: o que sai parseia de volta igual */
    assert.deepEqual(parseColorValue(formatColorValue("#6d388b", 0.5)), { hex: "#6d388b", alpha: 0.5 });

    assert.equal(contrastRatio("#000000", "#ffffff"), 21);
    assert.equal(contrastRatio("#ffffff", "#ffffff"), 1);
    assert.ok((contrastRatio("#777777", "#888888") ?? 21) < CONTRAST_MINIMUM, "cinzas próximos reprovam");
    assert.equal(contrastRatio("token-invalido", "#fff"), null);

    assert.equal(isTextColorSetting("text_color"), true);
    assert.equal(isTextColorSetting("heading_color"), true);
    assert.equal(isTextColorSetting("background_color"), false);
    assert.equal(contextBackgroundColor({ background_color: "#ffffff", heading: "Olá" }), "#ffffff");
    assert.equal(contextBackgroundColor({ background_image: "x.png" }), null);
  } finally {
    await server.close();
  }
});

test("o painel de cores expõe paleta do tema, origem, restauração e alerta", async () => {
  const appShell = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  assert.match(appShell, /function ShopifyColorField/);
  assert.match(appShell, /themeColorSwatches/, "amostras vêm das cores REAIS do tema");
  assert.match(appShell, /rememberRecentColor/, "cores recentes registradas");
  assert.match(appShell, /Usando o padrão do tema/, "origem do valor declarada");
  assert.match(appShell, /Editado \$\{scope\}/, "nível da edição declarado (tema/seção/bloco)");
  assert.match(appShell, /Restaurar padrão/, "restauração do valor herdado");
  assert.match(appShell, /A cor NÃO foi alterada/, "alerta de contraste nunca troca a cor sozinho");
  assert.match(appShell, /scope="no tema inteiro"/);
  assert.match(appShell, /scope="nesta seção"/);
  assert.match(appShell, /scope="neste bloco"/);
});
