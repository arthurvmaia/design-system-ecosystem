import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * O PACOTE PUBLICADO POR MINUTOS, e a única porta sem senha do app.
 *
 * Ela existe porque a Shopify instala tema de um jeito só: recebe uma URL e os
 * servidores DELA baixam o arquivo. Eles não fazem login e não mandam cabeçalho
 * nenhum, então uma rota autenticada aqui seria uma rota inacessível a quem
 * precisa acessá-la.
 *
 * Sem senha, o que segura a porta são três coisas, e é sobre elas que este
 * arquivo é: a chave imprevisível, o prazo curto e o alcance estreito.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

async function comModulo(trabalho) {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try { return await trabalho(await server.ssrLoadModule("/lib/pacote-publico.ts")); } finally { await server.close(); }
}

test("a chave é sorteada, e duas nunca se repetem", async () => {
  await comModulo(({ novaChaveDePacote, chaveDePacoteValida }) => {
    const chaves = new Set(Array.from({ length: 200 }, () => novaChaveDePacote()));
    assert.equal(chaves.size, 200, "chave repetida é endereço reaproveitado");
    for (const chave of chaves) {
      assert.ok(chaveDePacoteValida(chave), `chave fora do formato: ${chave}`);
      assert.equal(chave.length, 32, "32 hexadecimais: adivinhar não é estratégia");
    }
  });
});

test("a chave não vira caminho para outra coisa", async () => {
  await comModulo(({ chaveDePacoteValida }) => {
    /**
     * É a validação que impede a rota pública de virar um leitor do
     * armazenamento inteiro. Sem ela, a chave entra crua na montagem do caminho
     * e um `..` passeia pelo bucket.
     */
    for (const perigo of [
      "../../themes/local-demo-owner/abc",
      "abc/../../segredo",
      "a".repeat(31),
      "a".repeat(33),
      "ABCDEF0123456789abcdef0123456789",
      "0123456789abcdef0123456789abcde/",
      "",
      undefined,
    ]) {
      assert.ok(!chaveDePacoteValida(perigo), `aceitou uma chave que não devia: ${String(perigo)}`);
    }
  });
});

test("o prazo é curto, e o que perdeu o prazo é tratado como expirado", async () => {
  await comModulo(({ prazoDoPacote, pacoteExpirou, VALIDADE_MS }) => {
    const agora = 1_000_000;
    const prazo = prazoDoPacote(agora);

    assert.ok(VALIDADE_MS <= 30 * 60 * 1000, "prazo longo demais é janela de exposição");
    assert.ok(!pacoteExpirou(prazo, agora + 60_000), "morreu antes da hora");
    assert.ok(pacoteExpirou(prazo, agora + VALIDADE_MS + 1), "sobreviveu ao próprio prazo");

    /**
     * Sem prazo gravado, a resposta é SIM.
     *
     * Um arquivo cujo prazo se perdeu é um arquivo sem prazo, e endereço
     * público sem prazo é o contrário do que este módulo existe para fazer.
     * Tratar a ausência como "ainda vale" seria deixar a porta encostada.
     */
    for (const semPrazo of [undefined, "", "amanhã", "0", "-5"]) {
      assert.ok(pacoteExpirou(semPrazo, agora), `prazo inválido passou por válido: ${String(semPrazo)}`);
    }
  });
});

test("o endereço só existe com base https, e some sem ela", async () => {
  await comModulo(({ enderecoDoPacote, novaChaveDePacote }) => {
    const chave = novaChaveDePacote();
    assert.equal(enderecoDoPacote("https://algo.trycloudflare.com", chave), `https://algo.trycloudflare.com/api/pacote/${chave}`);
    /* barra sobrando no fim não pode virar barra dupla no meio */
    assert.equal(enderecoDoPacote("https://algo.trycloudflare.com/", chave), `https://algo.trycloudflare.com/api/pacote/${chave}`);

    /**
     * Sem base configurada, o endereço é vazio e o tema fica declaradamente de
     * fora. É melhor que a alternativa: um endereço que a Shopify não alcança
     * faria a instalação falhar com um erro dela, e não com a nossa frase.
     */
    assert.equal(enderecoDoPacote(undefined, chave), "");
    assert.equal(enderecoDoPacote("", chave), "");
    /* e nada de http puro: o ZIP viaja por uma rede que não é a nossa */
    assert.equal(enderecoDoPacote("http://algo.com", chave), "");
    /* chave inválida não vira endereço nem com base boa */
    assert.equal(enderecoDoPacote("https://algo.com", "../segredo"), "");
  });
});

test("a rota pública confere formato, prazo e prefixo antes de servir", async () => {
  const { readFile } = await import("node:fs/promises");
  const rota = await readFile(new URL("../app/api/pacote/[chave]/route.ts", import.meta.url), "utf8");

  /* o formato da chave é conferido ANTES de ela virar caminho */
  assert.match(rota, /if \(!chaveDePacoteValida\(chave\)/);
  /* e o alcance é um só: nada fora de `pacotes/` é servido */
  assert.match(rota, /PREFIXO_DO_PACOTE/);
  assert.doesNotMatch(rota, /env\.MEDIA\.get\(chave\)/, "a chave não pode ser o caminho inteiro");

  /* expirado é APAGADO, não só recusado: prazo curto só vale se o arquivo some */
  assert.match(rota, /pacoteExpirou/);
  assert.match(rota, /await env\.MEDIA\.delete/);

  /**
   * E nada de cache. O endereço morre em minutos, e uma cópia guardada por um
   * intermediário sobreviveria ao prazo que é a própria proteção.
   */
  assert.match(rota, /"cache-control": "no-store"/);

  /* esta é a única rota do app sem autenticação, e isso é declarado nela */
  assert.match(rota, /ÚNICA rota do app sem autenticação/);
  assert.doesNotMatch(rota, /getIdentity/, "autenticar aqui tornaria a rota inútil, e o comentário explica por quê");
});

test("o pacote não é apagado ao instalar: a Shopify baixa depois de responder", async () => {
  const { readFile } = await import("node:fs/promises");
  const rota = await readFile(new URL("../app/api/shopify-instalar/route.ts", import.meta.url), "utf8");

  /**
   * `themes.json` responde assim que aceita o pedido; o download e o
   * processamento acontecem DEPOIS, do lado da Shopify. Apagar ao receber a
   * resposta puxaria o arquivo de baixo dos pés dela.
   *
   * Foi um defeito real deste arquivo, pego antes de rodar: a primeira versão
   * apagava logo após a instalação "dar certo".
   */
  const corpo = rota.slice(rota.indexOf("export async function POST"));
  assert.doesNotMatch(corpo, /MEDIA\.delete/, "apagar aqui quebra a instalação do tema");
  assert.match(rota, /processamento do ZIP acontecem DEPOIS/);
});
