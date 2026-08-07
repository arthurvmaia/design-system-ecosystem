import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertUnlock,
  canAccessProject,
  normalizeCustomization,
  validateUpload,
} from "../lib/business-rules.mjs";

test("desbloqueio calcula saldo sem permitir valor negativo", () => {
  assert.equal(assertUnlock(40, 38), 2);
  assert.throws(() => assertUnlock(20, 38), /INSUFFICIENT_TOKENS/);
  assert.throws(() => assertUnlock(40.5, 10), /INVALID_TOKEN_AMOUNT/);
});

test("personalização sanitiza texto, cores e limites", () => {
  const result = normalizeCustomization({
    brand: "<script>Loja</script>",
    primaryColor: "not-a-color",
    buttonRadius: 999,
    spacing: 1,
    heroImage: "https://evil.example/payload.svg",
  });
  assert.equal(result.header.brand, "scriptLoja/script");
  assert.equal(result.hero.accentColor, "#05acff");
  assert.equal(result.global.buttonRadius, 28);
  assert.equal(result.global.sectionSpacing, 20);
  assert.equal(result.hero.image, "");
});

test("cada seção preserva seu próprio conteúdo e suas cores", () => {
  const result = normalizeCustomization({
    announcement: { text: "FRETE GRÁTIS", background: "#123456", textColor: "#ffffff" },
    hero: { headline: "Coleção principal", background: "#abcdef", textColor: "#102030", accentColor: "#008060" },
    footer: { brand: "Rodapé", background: "#07110c", textColor: "#dfeee6", accentColor: "#22d49b" },
  });
  assert.equal(result.announcement.text, "FRETE GRÁTIS");
  assert.equal(result.hero.headline, "Coleção principal");
  assert.equal(result.footer.brand, "Rodapé");
  assert.equal(result.announcement.background, "#123456");
  assert.equal(result.hero.background, "#abcdef");
  assert.equal(result.footer.background, "#07110c");
});

test("autorização mantém projetos isolados", () => {
  assert.equal(canAccessProject("owner-a", "owner-a"), true);
  assert.equal(canAccessProject("owner-a", "owner-b"), false);
  assert.equal(canAccessProject("owner-a", "admin", true), true);
});

test("upload aceita somente imagens seguras de até 5 MB", () => {
  assert.equal(validateUpload("image/webp", 1024), true);
  assert.throws(() => validateUpload("image/svg+xml", 1024), /INVALID_FILE_TYPE/);
  assert.throws(() => validateUpload("image/png", 6 * 1024 * 1024), /INVALID_FILE_SIZE/);
});

test("operações financeiras têm idempotência e gatilhos atômicos", async () => {
  const source = await readFile(new URL("../lib/data.ts", import.meta.url), "utf8");
  assert.match(source, /idempotency_key TEXT NOT NULL UNIQUE/);
  assert.match(source, /CREATE TRIGGER IF NOT EXISTS validate_unlock_before_insert/);
  assert.match(source, /CREATE TRIGGER IF NOT EXISTS complete_unlock_after_insert/);
  assert.match(source, /CHECK\(balance >= 0\)/);
  assert.match(source, /WHERE id = \? AND user_id = \?/);
});

test("interface expõe ShrinePro, importação local e não possui área Admin", async () => {
  const source = await readFile(new URL("../app/AppShell.tsx", import.meta.url), "utf8");
  assert.match(source, /label: "Importar temas"/);
  assert.match(source, /action: "deleteProject"/);
  assert.match(source, /action: "deleteTheme"/);
  assert.match(source, /ShopifyStorePreview/);
  assert.match(source, /type="color" defaultValue=\{validColor\}/);
  assert.doesNotMatch(source, /type="color" value=\{validColor\}/);
  assert.doesNotMatch(source, /AdminView|Administração/);
  assert.doesNotMatch(source, /WalletView|Confirmar desbloqueio|Adicionar tokens/);
  const dataSource = await readFile(new URL("../lib/data.ts", import.meta.url), "utf8");
  assert.match(dataSource, /id: "shrine-pro"[\s\S]*?price: 0/);
  assert.match(dataSource, /UPDATE themes SET status = 'archived'/);
  const importerSource = await readFile(new URL("../lib/shopify-theme.ts", import.meta.url), "utf8");
  assert.match(importerSource, /disabled: raw\.disabled === true/);
  const previewSource = await readFile(new URL("../app/ShopifyStorePreview.tsx", import.meta.url), "utf8");
  assert.match(previewSource, /main-cart-items/);
  assert.match(previewSource, /main-search/);
  assert.match(previewSource, /header-group/);
  assert.match(previewSource, /footer-group/);
});

test("tema Shopify grande é enxugado, não descartado em silêncio", () => {
  const heavyFiles = Array.from({ length: 9000 }, (_, index) => ({ path: `assets/arquivo-${index}-${"x".repeat(400)}.png`, kind: "asset", size: index }));
  const shopify = {
    themeName: "Tema Grande",
    globalValues: { colors_accent_1: "#6d388b" },
    sourceFiles: heavyFiles,
    pages: [],
  };
  assert.ok(JSON.stringify(shopify).length > 3_000_000, "o cenário precisa passar do limite brando");
  const result = normalizeCustomization({ shopify });
  assert.ok(result.shopify, "o tema deve sobreviver à normalização");
  assert.equal(result.shopify.globalValues.colors_accent_1, "#6d388b");
  assert.equal(result.shopify.sourceFiles.length, 60, "só o inventário de arquivos é cortado");
});
