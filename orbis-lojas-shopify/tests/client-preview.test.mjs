import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

/** Fase 5: prévia no fluxo do cliente, alimentada pela marca que o gerador usa. */

test("o fluxo do cliente mostra a prévia reativa com a marca e o modelo escolhidos", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  assert.match(flow, /<ClientSitePreview brand=\{marca\} sections=\{template\.sections\}/, "a prévia recebe a MESMA marca e o MESMO modelo que vão ao gerador");
  assert.match(flow, /className="cf-preview"/, "coluna de prévia presente");
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
