import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellUrl = new URL("../app/AppShell.tsx", import.meta.url);
const layoutUrl = new URL("../app/layout.tsx", import.meta.url);
const stylesUrl = new URL("../app/globals.css", import.meta.url);

test("entrada pública preserva autenticação e não expõe credenciais de demonstração", async () => {
  const [appShell, layout] = await Promise.all([
    readFile(appShellUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
  ]);
  assert.match(layout, /Orbis · Criação de lojas Shopify/);
  assert.match(appShell, /Seu próximo storefront começa com uma boa base/);
  assert.match(appShell, /signin-with-chatgpt/);
  assert.doesNotMatch(appShell, /local-demo-owner|demo@orbis\.local/);
  assert.doesNotMatch(appShell, /codex-preview|react-loading-skeleton/);
});

test("interface inclui acessibilidade e tratamento responsivo", async () => {
  const [appShell, layout, styles] = await Promise.all([
    readFile(appShellUrl, "utf8"),
    readFile(layoutUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);
  assert.match(layout, /<html lang="pt-BR">/);
  assert.match(appShell, /className="skip-link"/);
  assert.match(appShell, /aria-modal="true"/);
  assert.match(appShell, /aria-label="Navegação principal"/);
  assert.match(styles, /@media \(max-width: 560px\)/);
  assert.match(styles, /prefers-reduced-motion/);
});
