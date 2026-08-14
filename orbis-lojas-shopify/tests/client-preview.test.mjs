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

test("o nicho é o CATÁLOGO e vale nos dois caminhos; a marca é outra pergunta", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  const rota = await readFile(new URL("../app/api/client-request/route.ts", import.meta.url), "utf8");

  /* As duas caixas do passo 1 decidem QUEM ESCREVE A MARCA. O nicho decide o
     que a loja VENDE. Enquanto o seletor de nicho morava dentro do caminho "a
     Orbis cria minha marca", quem chegava com marca própria — o cliente real,
     que já tem nome e logo — recebia a loja com a vitrine VAZIA sem nunca ter
     visto a pergunta. Duas decisões independentes coladas numa só. */
  assert.doesNotMatch(
    flow,
    /\{modo === "gerada" && \(\s*<>\s*<span className="cf-secao-titulo">/,
    "o seletor de nicho não pode voltar a existir só no modo gerado",
  );
  /* trocar para "eu já tenho minha marca" não pode apagar o nicho escolhido */
  assert.doesNotMatch(flow, /setModo\("manual"\);\s*setNicheId\(""\)/);
  /* e o nicho viaja nos dois modos */
  assert.match(flow, /nicheId: nicheId \|\| undefined/);

  /* Quem escreve a marca passa a ser DITO, não deduzido da presença do nicho.
     Com a dedução, escolher o nicho só para ter catálogo fazia o servidor
     inventar identidade por cima dos campos em branco de quem já tem marca. */
  assert.match(flow, /criarMarca: modo === "gerada"/);
  assert.match(rota, /criarMarca: z\.boolean\(\)\.optional\(\)/);
  assert.match(rota, /const criarMarca = parsed\.data\.criarMarca \?\? Boolean\(parsed\.data\.nicheId\)/);
  assert.match(rota, /criarMarca && parsed\.data\.nicheId\s*\?\s*gerarMarca/);

  /* e a revisão diz o que a loja vai vender — inclusive quando não vai vender
     nada, que é o caso que a pessoa descobria com a loja pronta */
  assert.match(flow, /Sem catálogo: a loja sai com a vitrine vazia/);
});
