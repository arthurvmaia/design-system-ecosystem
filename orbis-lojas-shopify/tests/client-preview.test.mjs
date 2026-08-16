import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

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

/**
 * AS COLEÇÕES são escritas por quem vende, e chegam inteiras ao pacote.
 *
 * O nicho sugere um ponto de partida, mas quem sabe as categorias da própria
 * loja é o dono dela: uma loja de roupa pode querer "Moda Fitness" e outra
 * "Verão", e nenhuma lista nossa acerta as duas.
 *
 * O caminho é longo e tinha um buraco na porta: `collections` não estava no
 * schema da rota, então o que a pessoa digitava era descartado e o servidor
 * regerava as coleções PADRÃO do nicho por cima. "Moda Fitness" virava
 * "Alfaiataria" no pacote, sem nenhum aviso.
 */
test("as coleções que o cliente escreve vencem as do nicho e chegam ao pacote", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const bancada = await readFile(join(raiz, "app/ClientMarcaBancada.tsx"), "utf8");

  /* a opção fica logo abaixo de Marca e ANTES das imagens: é ela que decide
     quantas capas a arte precisa cobrir */
  const ordem = bancada.match(/const INSTRUMENTOS[\s\S]*?\];/)?.[0] ?? "";
  const ids = [...ordem.matchAll(/id: "([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["marca", "colecoes", "imagens", "voz", "paleta", "tipografia", "contato", "redes"]);

  /* nome vazio e nome repetido são barrados na ENTRADA, não três telas adiante
     quando já viraram arquivo */
  assert.match(bancada, /Escreva o nome da coleção/);
  assert.match(bancada, /já está na lista/);
  assert.match(bancada, /const jaExiste = /);
  /* e o resumo da linha conta quantas existem */
  assert.match(bancada, /coleções definidas/);

  const flow = await readFile(join(raiz, "app/ClientFlow.tsx"), "utf8");
  assert.match(flow, /collections: marca\.collections\.map/, "o navegador precisa ENVIAR as coleções");
  const rota = await readFile(join(raiz, "app/api/client-request/route.ts"), "utf8");
  assert.match(rota, /collections: z\.array\(z\.string\(\)\.max\(40\)\)\.max\(12\)\.optional\(\)/, "e a rota precisa ACEITAR");

  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { gerarMarca } = await server.ssrLoadModule("/lib/marca-generator.mjs");
    const { csvDeProdutos } = await server.ssrLoadModule("/lib/catalogo-csv.ts");
    const minhas = ["Vestidos", "Bolsas", "Calçados", "Moda Fitness"];

    /* o que a pessoa escreveu vence o nicho */
    const comEscolha = gerarMarca({ nicheId: "roupas", semente: "x", sobrescritas: { collections: [...minhas, "  ", ""] } });
    assert.deepEqual(comEscolha.collections, minhas, "vazio e espaço em branco não entram");
    /* apagar tudo devolve as do nicho: loja sem categoria nenhuma é pior */
    const semNada = gerarMarca({ nicheId: "roupas", semente: "x", sobrescritas: { collections: ["  "] } });
    assert.deepEqual(semNada.collections, gerarMarca({ nicheId: "roupas", semente: "x" }).collections);

    /* e elas chegam ao CSV, que é o que a Shopify lê para CRIAR as coleções */
    const csv = csvDeProdutos("roupas", minhas);
    const naPrimeiraColuna = [...new Set(csv.split(/\r?\n/).slice(1).filter(Boolean).map((l) => l.split(",")[0].replace(/^"|"$/g, "")))].filter(Boolean);
    assert.deepEqual(naPrimeiraColuna, minhas, "a coluna Collection do CSV precisa ter as coleções do cliente");
  } finally {
    await server.close();
  }
});

/**
 * A PRÉVIA sai do passo da marca.
 *
 * Ali a pessoa escreve nome, cores, coleções e contato, e nada disso se julga
 * numa miniatura de 340px — a coluna só tirava largura de onde a decisão
 * acontece. Nos outros passos ela fica: escolher tema e revisar são justamente
 * as horas em que ver a loja é a pergunta.
 */
test("o passo da marca não tem coluna de prévia, e usa a largura que sobra", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const flow = await readFile(join(raiz, "app/ClientFlow.tsx"), "utf8");
  assert.match(flow, /\{passo !== 1 && \(\s*<aside className="cf-preview"/, "a prévia não pode aparecer no passo 02");
  assert.match(flow, /passo === 1 \? "cf-layout-cheio" : ""/);

  const css = await readFile(join(raiz, "app/globals.css"), "utf8");
  /* uma coluna reservada e vazia é pior que não ter coluna */
  assert.match(css, /\.cf-layout-cheio \{ grid-template-columns: minmax\(0, 1fr\)/);
});
