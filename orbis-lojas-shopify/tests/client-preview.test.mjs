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

/**
 * Sem tema, a prévia DIZ que não há tema.
 *
 * Ela ficava em "Montando a prévia da loja…" para sempre: o efeito saía na
 * primeira linha por falta de `themeId` e o texto de espera continuava na tela,
 * prometendo algo que ninguém estava montando. Espera eterna é a pior tela de
 * erro que existe — não dá para saber se espera mais ou se quebrou.
 *
 * Foi o que aconteceu quando os temas do estúdio foram apagados: a área do
 * cliente não tinha o que renderizar e não contava isso a ninguém.
 */
test("a prévia não fica prometendo uma loja quando não há tema", async () => {
  const previa = await readFile(new URL("../app/ClientPreviaReal.tsx", import.meta.url), "utf8");

  /* o estado é DERIVADO: sem tema é indisponível por construção, e ninguém
     precisa lembrar de corrigir isso dentro de um efeito */
  assert.match(previa, /const indisponivel = !themeId \|\| falhou;/);
  /* e o HTML de um tema antigo não fica na tela depois que o tema sai */
  assert.match(previa, /const paraMostrar = themeId && !falhou \? html : null;/);
  /* e o texto do vazio vem de fora: só quem chamou sabe se falta escolher um
     tema ou se não existe nenhum importado */
  assert.match(previa, /semTema\?: string/);
  assert.match(previa, /semTema \|\|/);

  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  /* os três motivos são distintos: procurando, nenhum importado, nenhum escolhido */
  assert.match(flow, /Procurando os temas do estúdio/);
  assert.match(flow, /Nenhum tema importado ainda/);
  assert.match(flow, /Escolha um tema para ver a prévia/);
});

/**
 * A arte gerada sobrevive a fechar a aba.
 *
 * O mapa das imagens vivia só em memória. Recarregar, sair para ver outra
 * coisa, voltar depois: tudo apagava, e a loja nascia sem nenhuma imagem, com
 * os arquivos parados no banco, pagos e intactos. Medido neste computador: as
 * seis peças geradas às 17:50 e a loja criada às 23:15 com ZERO imagens.
 */
test("as imagens geradas sobrevivem ao recarregar, presas à marca que as pediu", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");

  /* o cofre guarda a SEMENTE junto: ela é sorteada a cada escolha de nicho,
     então guardar só as imagens não bastava — ao voltar, a marca seria outra e
     a arte da anterior ficaria órfã de qualquer jeito */
  assert.match(flow, /orbis:marca:\$\{nicho\}/);
  /* grava sempre que o mapa muda, e some quando ele esvazia */
  assert.match(flow, /setItem\(cofre, JSON\.stringify\(\{ semente, imagens: imagensGeradas \}\)\)/);
  /* a leitura é EVENTO, não efeito: efeito com setState síncrono provoca
     render em cascata, e o lint do projeto reprova */
  assert.match(flow, /const abrirCofre = useCallback/);
  assert.match(flow, /const guardada = abrirCofre\(id\)/, "escolher o nicho traz de volta a marca dele");
  assert.match(flow, /const sementeNova = guardada \|\| novaSemente\(\)/, "a semente guardada devolve a MESMA marca");
  /* gerar outra marca é decisão deliberada: cofre limpo, arte da anterior fora */
  assert.match(flow, /marca nova, cofre limpo/);
  /* recomeçar é recomeçar: o cofre da marca antiga sai junto */
  const recomecar = flow.match(/function recomecar\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(recomecar, /removeItem\(cofre\)/);
});
