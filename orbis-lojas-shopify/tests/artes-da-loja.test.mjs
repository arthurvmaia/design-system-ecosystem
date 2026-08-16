import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * A regra das DUAS alterações, testada onde ela mora.
 *
 * Esconder o botão resolve quem clica. Não resolve recarregar a página, reabrir
 * o projeto, voltar um passo, apertar "gerar tudo de novo" nem chamar a rota
 * por fora. Por isso a regra é função pura, e é aqui que ela é cobrada.
 */

async function carregar() {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  const modulo = await server.ssrLoadModule("/lib/artes-da-loja.ts");
  return { modulo, fechar: () => server.close() };
}

test("V1 tem duas alterações; V3 não tem mais nenhuma", async () => {
  const { modulo, fechar } = await carregar();
  try {
    const { arteNova, comAlteracao, alteracoesRestantes, podePedirAlteracao, LIMITE_DE_ALTERACOES } = modulo;
    assert.equal(LIMITE_DE_ALTERACOES, 2);

    const v1 = arteNova("/api/media/a");
    assert.equal(v1.versao, 1);
    assert.equal(alteracoesRestantes(v1), 2, "a geração original NÃO conta como alteração");
    assert.equal(podePedirAlteracao(v1), true);

    const v2 = comAlteracao(v1, "/api/media/b");
    assert.equal(v2.versao, 2);
    assert.equal(v2.alteracoes, 1);
    assert.equal(alteracoesRestantes(v2), 1);
    assert.equal(podePedirAlteracao(v2), true);

    const v3 = comAlteracao(v2, "/api/media/c");
    assert.equal(v3.versao, 3);
    assert.equal(v3.alteracoes, 2);
    assert.equal(alteracoesRestantes(v3), 0);
    assert.equal(podePedirAlteracao(v3), false, "não existe terceira tentativa");

    /* e insistir não adianta: a função devolve a MESMA arte, sem versão nova */
    const insistindo = comAlteracao(v3, "/api/media/d");
    assert.deepEqual(insistindo, v3, "chamar de novo não pode furar o limite");
    assert.equal(insistindo.url, "/api/media/c", "a V3 continua sendo a que vale");
  } finally { await fechar(); }
});

test("arte aprovada não é refeita, e o limite vale para GERAR também", async () => {
  const { modulo, fechar } = await carregar();
  try {
    const { arteNova, comAlteracao, aprovar, podePedirAlteracao, podeGerar } = modulo;

    /* aprovar fecha a porta: refazer o que o cliente aprovou troca a decisão
       dele por um sorteio */
    const aprovada = aprovar(arteNova("/api/media/a"));
    assert.equal(podePedirAlteracao(aprovada), false);
    assert.equal(podeGerar(aprovada), false, "aprovada não pode ser sobrescrita");
    assert.deepEqual(comAlteracao(aprovada, "/api/media/x"), aprovada);

    /**
     * "Gerar tudo de novo" passa por `podeGerar`, e é a MESMA pergunta.
     * Enquanto fossem duas perguntas diferentes, o botão de gerar em lote era o
     * caminho aberto para a terceira, quarta e quinta versão.
     */
    assert.equal(podeGerar(null), true, "peça que ainda não existe pode ser gerada");
    assert.equal(podeGerar(arteNova("/api/media/a")), true);
    const noLimite = comAlteracao(comAlteracao(arteNova("/api/media/a"), "/b"), "/c");
    assert.equal(podeGerar(noLimite), false, "no limite, nem em lote");
  } finally { await fechar(); }
});

test("o que vem do disco não é confiável: número inventado não vira crédito", async () => {
  const { modulo, fechar } = await carregar();
  try {
    const { arteLida, alteracoesRestantes } = modulo;

    /* o cofre é localStorage: qualquer pessoa abre o console e escreve o que
       quiser. Ler com limites é o que separa um limite de uma sugestão. */
    const negativo = arteLida({ url: "/api/media/a", alteracoes: -5, aprovada: false });
    assert.equal(negativo.alteracoes, 0);
    assert.equal(alteracoesRestantes(negativo), 2, "não dá para ganhar crédito com número negativo");

    const enorme = arteLida({ url: "/api/media/a", alteracoes: 99 });
    assert.equal(enorme.alteracoes, 2);
    assert.equal(alteracoesRestantes(enorme), 0, "nem perder além do limite");

    const texto = arteLida({ url: "/api/media/a", alteracoes: "0" });
    assert.equal(texto.alteracoes, 0);

    /* a versão é DERIVADA, não lida: duas verdades sobre a mesma coisa divergem */
    assert.equal(arteLida({ url: "/api/media/a", alteracoes: 2, versao: 1 }).versao, 3);

    /* o formato antigo (só a URL) continua sendo lido: as lojas em andamento
       foram gravadas assim */
    const antiga = arteLida("/api/media/z");
    assert.equal(antiga.url, "/api/media/z");
    assert.equal(antiga.versao, 1);
    assert.equal(antiga.aprovada, false);

    assert.equal(arteLida(null), null);
    assert.equal(arteLida({ alteracoes: 1 }), null, "sem URL não é arte");
  } finally { await fechar(); }
});

test("o placar cobra só o que é obrigatório, e a loja recebe só o aprovado", async () => {
  const { modulo, fechar } = await carregar();
  try {
    const { arteNova, aprovar, placarDasArtes, urlsAprovadas, estadoDaArte, comAlteracao } = modulo;
    const artes = {
      logo: aprovar(arteNova("/api/media/logo")),
      "banner-1": arteNova("/api/media/b1"),
      "cena-1": aprovar(arteNova("/api/media/c1")),
    };
    const obrigatorias = ["logo", "banner-1", "cena-1"];
    const placar = placarDasArtes(artes, obrigatorias);
    assert.equal(placar.total, 3);
    assert.equal(placar.aprovadas, 2);
    assert.deepEqual(placar.pendentes, ["banner-1"]);

    /* SÓ o aprovado entra na loja: versão em análise não pode ser entregue
       como se fosse decisão tomada */
    assert.deepEqual(urlsAprovadas(artes), { logo: "/api/media/logo", "cena-1": "/api/media/c1" });

    assert.equal(estadoDaArte(undefined), "ausente");
    assert.equal(estadoDaArte(arteNova("/a")), "aguardando");
    assert.equal(estadoDaArte(arteNova("/a"), true), "gerando");
    assert.equal(estadoDaArte(aprovar(arteNova("/a"))), "aprovada");
    assert.equal(estadoDaArte(comAlteracao(comAlteracao(arteNova("/a"), "/b"), "/c")), "limite");
  } finally { await fechar(); }
});
