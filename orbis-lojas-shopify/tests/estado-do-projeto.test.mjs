import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * O ESTADO DO PROJETO e o ponto onde o cliente parou.
 *
 * Dois assuntos que parecem um só e não são: o estado é DERIVADO do que já
 * existe (não pode discordar da tela), e o ponto de parada é GUARDADO (não se
 * deduz de nada).
 */

async function carregar() {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  const modulo = await server.ssrLoadModule("/lib/estado-do-projeto.ts");
  const artes = await server.ssrLoadModule("/lib/artes-da-loja.ts");
  return { modulo, artes, fechar: () => server.close() };
}

test("o estado sai do caminho percorrido, na ordem em que as coisas acontecem", async () => {
  const { modulo, artes, fechar } = await carregar();
  try {
    const { estadoDoProjeto } = modulo;
    const { arteNova, aprovar } = artes;
    const vazio = {};
    const algumas = { logo: arteNova("/a"), "banner-1": aprovar(arteNova("/b")) };

    assert.equal(estadoDoProjeto({ passo: 0, artes: vazio }), "editing");
    assert.equal(estadoDoProjeto({ passo: 1, artes: vazio }), "editing");
    /* a etapa das artes só é "aprovando artes" quando existe arte para aprovar:
       quem chegou lá e ainda não gerou nada continua preenchendo */
    assert.equal(estadoDoProjeto({ passo: 2, artes: vazio }), "editing");
    assert.equal(estadoDoProjeto({ passo: 2, artes: algumas }), "asset_review");
    assert.equal(estadoDoProjeto({ passo: 2, artes: algumas, gerando: true }), "generating_assets");
    assert.equal(estadoDoProjeto({ passo: 3, artes: algumas }), "final_review");

    /**
     * A ORDEM das perguntas importa, e é por isso que ela é testada.
     *
     * Um projeto já entregue continua com `passo: 3` e com as artes todas
     * aprovadas. Se "em revisão" fosse perguntado antes de "entregue", ele
     * voltaria a dizer que está sendo revisado depois de pronto.
     */
    assert.equal(estadoDoProjeto({ passo: 3, artes: algumas, entrega: "working" }), "approved");
    assert.equal(estadoDoProjeto({ passo: 3, artes: algumas, entrega: "done" }), "completed");
    /* e gerar durante a montagem não rebaixa um projeto já aprovado */
    assert.equal(estadoDoProjeto({ passo: 3, artes: algumas, gerando: true, entrega: "done" }), "completed");
    /* erro não é estado de projeto: quem falhou ao montar continua em revisão */
    assert.equal(estadoDoProjeto({ passo: 3, artes: algumas, entrega: "error" }), "final_review");
  } finally { await fechar(); }
});

test("o ponto de parada é lido com limites, e restaura só até onde se sustenta", async () => {
  const { modulo, fechar } = await carregar();
  try {
    const { pontoLido, passoRestauravel, PONTO_INICIAL, ROTULO_DO_PROJETO, ESTADOS } = modulo;

    /* o cofre é localStorage: um `passo: 9` gravado à mão abriria a tela num
       passo que não existe, em branco */
    assert.equal(pontoLido({ passo: 9, modo: "gerada" }).passo, 3);
    assert.equal(pontoLido({ passo: -4, modo: "gerada" }).passo, 0);
    assert.equal(pontoLido({ passo: "2", modo: "gerada" }).passo, 2);
    /* modo inventado não passa: nenhuma das duas seções apareceria */
    assert.equal(pontoLido({ modo: "qualquer" }).modo, "");
    assert.equal(pontoLido({ modo: "manual" }).modo, "manual");
    assert.equal(pontoLido({ estado: "inventado" }).estado, "editing");
    assert.equal(pontoLido({ estado: "final_review" }).estado, "final_review");
    assert.deepEqual(pontoLido(null), PONTO_INICIAL);
    assert.deepEqual(pontoLido("texto solto"), PONTO_INICIAL);

    /* voltar alguém para a etapa do tema sem o modo escolhido abre a tela pela
       metade — pior que voltar para o começo */
    assert.equal(passoRestauravel({ ...PONTO_INICIAL, passo: 2 }, true), 0);
    assert.equal(passoRestauravel({ ...PONTO_INICIAL, passo: 2, modo: "gerada" }, true), 0, "sem nicho não dá para gerar marca");
    assert.equal(passoRestauravel({ ...PONTO_INICIAL, passo: 2, modo: "gerada", nicheId: "roupas" }, true), 2);
    assert.equal(passoRestauravel({ ...PONTO_INICIAL, passo: 2, modo: "manual" }, false), 2, "marca própria não depende de nicho");
    /* a revisão pressupõe arte aprovada; sem arte guardada ela abriria vazia */
    assert.equal(passoRestauravel({ ...PONTO_INICIAL, passo: 3, modo: "gerada", nicheId: "roupas" }, false), 2);
    assert.equal(passoRestauravel({ ...PONTO_INICIAL, passo: 3, modo: "gerada", nicheId: "roupas" }, true), 3);

    /* todo estado tem um rótulo: um estado sem texto aparece como vazio na tela */
    for (const estado of ESTADOS) assert.ok(ROTULO_DO_PROJETO[estado], `falta rótulo para ${estado}`);
  } finally { await fechar(); }
});

test("a revisão só abre com as artes obrigatórias aprovadas", async () => {
  const { modulo, artes, fechar } = await carregar();
  try {
    const { podeRevisar } = modulo;
    const { arteNova, aprovar } = artes;

    /* quem não tem arte obrigatória nenhuma não é barrado: é o caminho de quem
       chegou com a marca pronta */
    assert.equal(podeRevisar({}, []), true);
    assert.equal(podeRevisar({}, ["logo"]), true, "antes de gerar não há o que aprovar");

    const meio = { logo: aprovar(arteNova("/a")), "banner-1": arteNova("/b") };
    assert.equal(podeRevisar(meio, ["logo", "banner-1"]), false);
    const tudo = { logo: aprovar(arteNova("/a")), "banner-1": aprovar(arteNova("/b")) };
    assert.equal(podeRevisar(tudo, ["logo", "banner-1"]), true);
  } finally { await fechar(); }
});

/**
 * A FIAÇÃO na tela, e no servidor.
 *
 * A regra pura já é testada acima. O que este cobre é o que uma função pura não
 * alcança: se ninguém a chamar, ela continua verde e a tela continua errada.
 */
test("o fluxo grava o ponto de parada e restaura dele, e o servidor fecha o projeto", async () => {
  const { readFile } = await import("node:fs/promises");
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");

  /* a leitura é valor INICIAL de useState, não efeito: efeito com setState
     síncrono provoca render em cascata e faria a tela piscar no passo 1 antes
     de pular para o 3 */
  assert.match(flow, /const \[ponto\] = useState\(lerPonto\)/);
  assert.doesNotMatch(flow, /useEffect\(\(\) => \{\s*set(Passo|Modo|NicheId)\(/);
  assert.match(flow, /useState\(\(\) => passoRestauravel\(ponto/);
  assert.match(flow, /useState<Modo \| null>\(\(\) => \(ponto\.modo/);
  assert.match(flow, /useState\(\(\) => ponto\.themeId\)/, "o tema escolhido tem de voltar");

  /* o que a pessoa DIGITOU volta: coleções, nome e cores não saem de semente */
  assert.match(flow, /useState<Partial<MarcaCliente>>\(\(\) => lerEdicoes\(ponto\.nicheId\)\)/);
  /* e a marca é RECONSTRUÍDA da semente guardada, não gravada inteira */
  assert.match(flow, /marcaGerada\(ponto\.nicheId, lerSemente\(ponto\.nicheId\)/);

  /* grava a cada mudança, com o estado junto como registro */
  assert.match(flow, /setItem\(CHAVE_DO_PONTO, JSON\.stringify\(\{\s*passo, modo: modo \?\? "", nicheId, themeId, estado,/);
  /* e recomeçar apaga: senão a abertura seguinte voltaria para a loja recomeçada */
  const recomecar = flow.match(/function recomecar\(\)[\s\S]*?\n  \}/)?.[0] ?? "";
  assert.match(recomecar, /removeItem\(CHAVE_DO_PONTO\)/);

  /* o estado é DERIVADO no render, não guardado num useState que diverge */
  assert.match(flow, /const estado: EstadoDoProjeto = estadoDoProjeto\(\{/);
  assert.doesNotMatch(flow, /useState<EstadoDoProjeto>/);

  /* e o banco fecha o projeto quando o pacote existe, não quando ele começa */
  const rota = await readFile(new URL("../app/api/client-request/route.ts", import.meta.url), "utf8");
  assert.match(rota, /UPDATE projects SET status = 'completed'/);
  const antes = rota.indexOf("UPDATE projects SET status = 'completed'");
  assert.ok(antes > rota.indexOf("const zip ="), "marcar como pronto antes do ZIP existir é mentir sobre o resultado");
});
