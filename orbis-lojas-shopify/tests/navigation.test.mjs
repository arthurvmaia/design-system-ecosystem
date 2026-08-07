import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellUrl = new URL("../app/AppShell.tsx", import.meta.url);

test("navegação segue a ORDEM DEFINIDA PELO PRODUTO", async () => {
  const source = await readFile(appShellUrl, "utf8");
  const block = source.match(/const navItems = \[[\s\S]*?\];/)?.[0] ?? "";
  const order = [...block.matchAll(/id: "(\w+)" as const/g)].map((match) => match[1]);
  /* 01 Início · 02 Importar temas · 03 Temas · 04 Editor · 05 Editar código · 06 Projetos */
  assert.deepEqual(order, ["home", "extract", "themes", "editor", "code", "projects"]);
  assert.equal(order.at(-1), "projects", "Projetos deve ser a ÚLTIMA área");
  assert.equal(order[1], "extract", "Importar temas vem imediatamente abaixo de Início");
  /* os índices exibidos acompanham a ordem real */
  const indexes = [...block.matchAll(/index: "(\d\d)"/g)].map((match) => match[1]);
  assert.deepEqual(indexes, ["01", "02", "03", "04", "05", "06"]);
  /* as numerações das páginas acompanham o menu */
  assert.match(source, /eyebrow="IMPORTAR · 02"/);
  assert.match(source, /eyebrow="TEMAS · 03"/);
  assert.match(source, /eyebrow="EDITAR CÓDIGO · 05"/);
  assert.match(source, /eyebrow="PROJETOS · 06"/);
});
