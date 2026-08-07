import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellUrl = new URL("../app/AppShell.tsx", import.meta.url);

test("navegação: Editor em destaque acima de Temas e Projetos por último", async () => {
  const source = await readFile(appShellUrl, "utf8");
  const block = source.match(/const navItems = \[[\s\S]*?\];/)?.[0] ?? "";
  const order = [...block.matchAll(/id: "(\w+)" as const/g)].map((match) => match[1]);
  assert.deepEqual(order, ["home", "editor", "themes", "extract", "code", "projects"]);
  assert.equal(order.at(-1), "projects", "Projetos deve ser a última área");
  assert.ok(order.indexOf("editor") < order.indexOf("themes"), "Editor vem antes de Temas");
  /* os índices exibidos acompanham a ordem real */
  const indexes = [...block.matchAll(/index: "(\d\d)"/g)].map((match) => match[1]);
  assert.deepEqual(indexes, ["01", "02", "03", "04", "05", "06"]);
});
