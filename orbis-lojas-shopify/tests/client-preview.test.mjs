import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Fase 5: prévia no fluxo do cliente, alimentada pela marca que o gerador usa. */

test("a prévia do cliente é a home real do tema, com a marca aplicada", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  const previa = await readFile(new URL("../app/ClientPreviaReal.tsx", import.meta.url), "utf8");
  const rota = await readFile(new URL("../app/api/theme-render/route.ts", import.meta.url), "utf8");

  assert.match(flow, /className="cf-preview"/, "coluna de prévia presente");
  /* a prévia recebe o tema escolhido e a MESMA marca que vai ao gerador */
  assert.match(flow, /<ClientPreviaReal themeId=\{themeId\} nicheId=\{nicheId\}/);
  /* e renderiza o tema de verdade, pelo mesmo motor da entrega */
  assert.match(previa, /\/api\/theme-render/);
  assert.match(rota, /aplicarMarcaNoTema\(base, marca\)/, "o servidor aplica a marca antes de renderizar");
  /* vitrine, não editor: o quadro não navega nem compra */
  const sandbox = previa.match(/sandbox="([^"]*)"/)?.[1] ?? "";
  assert.equal(sandbox, "allow-same-origin", `o quadro da prévia não pode ganhar mais permissão que ler: veio "${sandbox}"`);
});

test("a prévia só usa dados da marca; sem copy inventada", async () => {
  const preview = await readFile(new URL("../app/ClientSitePreview.tsx", import.meta.url), "utf8");
  assert.match(preview, /SECTION_LABELS/, "os nomes de seção vêm do gerador, não de strings soltas");
  assert.match(preview, /brand\.logoDataUri/, "logo do cliente aparece");
  assert.match(preview, /Minha Marca/, "fallback claro quando o nome está vazio");
  assert.match(preview, /csp-placeholder/, "ausência de dado aparece como placeholder declarado");
  assert.doesNotMatch(preview, /Compre agora|Comprar agora|Frete grátis/i, "nenhuma frase de loja inventada");
  /* a pendência da integração com a área de Marca do design system fica
     declarada no próprio arquivo e no plano */
  assert.match(preview, /plano-editor-visual\.md/);
});
