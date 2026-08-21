import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * O CLIENTE CONECTA A LOJA DELE, e a volta precisa provar que é a volta.
 *
 * Este é o pedaço com superfície de ataque do app: um endereço público que
 * qualquer um alcança, recebendo o que se alega ser uma autorização da Shopify.
 * Duas coisas separam a alegação do fato, e é sobre elas que este arquivo é —
 * a assinatura, que só quem tem o Client Secret produz, e o `state`, que amarra
 * a volta a uma ida nossa.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

async function comModulo(trabalho) {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try { return await trabalho(await server.ssrLoadModule("/lib/shopify-oauth.ts")); } finally { await server.close(); }
}

/** Assina como a Shopify assina, para o teste poder forjar uma volta legítima. */
async function assinarComoAShopify(parametros, segredo) {
  const partes = [...parametros.entries()]
    .filter(([chave]) => chave !== "hmac" && chave !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([chave, valor]) => `${chave}=${valor}`);
  const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(partes.join("&")));
  return [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SEGREDO = "segredo-de-teste";

test("a tela de permissões é montada com escopo, retorno e state", async () => {
  await comModulo(({ enderecoDeAutorizacao, novoEstado, ESCOPOS }) => {
    const estado = novoEstado();
    const endereco = enderecoDeAutorizacao({
      loja: "loja-do-cliente", clientId: "abc", retorno: "https://tunel.exemplo/api/shopify/retorno", estado,
    });
    const url = new URL(endereco);

    assert.equal(url.host, "loja-do-cliente.myshopify.com", "a autorização acontece no domínio DA LOJA");
    assert.equal(url.pathname, "/admin/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "abc");
    assert.equal(url.searchParams.get("state"), estado);
    /* o escopo pedido é o mesmo que a versão do app declara: pedir a mais dá
       erro do lado da Shopify, pedir a menos deixa a instalação sem escrever */
    assert.deepEqual(url.searchParams.get("scope").split(","), [...ESCOPOS]);
  });
});

test("endereço de autorização não nasce pela metade", async () => {
  await comModulo(({ enderecoDeAutorizacao, novoEstado }) => {
    const bom = { loja: "loja", clientId: "abc", retorno: "https://t.exemplo/api/shopify/retorno", estado: novoEstado() };
    /**
     * Vazio é tratado como "não dá para conectar" lá na frente. Montar um
     * endereço incompleto mandaria o cliente para uma página de erro da
     * Shopify, e ele leria isso como defeito da loja dele.
     */
    assert.equal(enderecoDeAutorizacao({ ...bom, loja: "" }), "");
    assert.equal(enderecoDeAutorizacao({ ...bom, clientId: " " }), "");
    assert.equal(enderecoDeAutorizacao({ ...bom, estado: "curto" }), "");
    /* retorno em http puro não serve: a autorização viaja por rede alheia */
    assert.equal(enderecoDeAutorizacao({ ...bom, retorno: "http://t.exemplo/x" }), "");
  });
});

test("a assinatura da volta é conferida, e a errada não passa", async () => {
  await comModulo(async ({ assinaturaValida }) => {
    const base = new URLSearchParams({ code: "cod123", shop: "loja.myshopify.com", state: "a".repeat(32), timestamp: "1700000000" });
    const legitima = new URLSearchParams(base);
    legitima.set("hmac", await assinarComoAShopify(base, SEGREDO));
    assert.ok(await assinaturaValida(legitima, SEGREDO), "a volta legítima foi recusada");

    /**
     * Trocar QUALQUER parâmetro invalida a assinatura, e é isso que impede
     * alguém de pegar uma volta verdadeira e trocar a loja de destino.
     */
    const adulterada = new URLSearchParams(legitima);
    adulterada.set("shop", "loja-do-atacante.myshopify.com");
    assert.ok(!(await assinaturaValida(adulterada, SEGREDO)), "aceitou uma volta adulterada");

    /* e sem o Secret certo ninguém produz assinatura que passe */
    assert.ok(!(await assinaturaValida(legitima, "outro-segredo")));
    /* nem sem assinatura nenhuma */
    assert.ok(!(await assinaturaValida(base, SEGREDO)));
    /* nem com lixo no lugar dela */
    const lixo = new URLSearchParams(base);
    lixo.set("hmac", "não é hexadecimal");
    assert.ok(!(await assinaturaValida(lixo, SEGREDO)));
  });
});

test("a comparação da assinatura é em tempo constante", async () => {
  const { readFile } = await import("node:fs/promises");
  const fonte = await readFile(new URL("../lib/shopify-oauth.ts", import.meta.url), "utf8");
  /**
   * Comparar com `===` vaza, pelo tempo de resposta, quantos caracteres
   * iniciais bateram — e com isso se descobre a assinatura certa um caractere
   * por vez. É ataque conhecido, e a defesa custa três linhas.
   */
  assert.match(fonte, /function igualEmTempoConstante/);
  assert.match(fonte, /diferenca \|= a\.charCodeAt\(i\) \^ b\.charCodeAt\(i\)/);
  const conferencia = fonte.slice(fonte.indexOf("export async function assinaturaValida"));
  assert.doesNotMatch(conferencia.slice(0, conferencia.indexOf("\n}")), /calculado === |=== recebido/, "comparação direta vaza o tempo");
});

test("o código só vira token depois das conferências, e leva o secret no corpo", async () => {
  await comModulo(async ({ trocarCodigoPorToken }) => {
    const chamadas = [];
    const buscar = async (url, init) => {
      chamadas.push({ url: String(url), corpo: init.body });
      return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "shpua_x", scope: "write_products,write_themes,write_files" }) };
    };
    const acesso = await trocarCodigoPorToken("loja-do-cliente", { clientId: "id", clientSecret: SEGREDO }, "codigo123", { buscar });

    assert.equal(acesso.token, "shpua_x");
    assert.equal(chamadas[0].url, "https://loja-do-cliente.myshopify.com/admin/oauth/access_token");
    const corpo = JSON.parse(chamadas[0].corpo);
    assert.equal(corpo.code, "codigo123");
    /* o segredo vai no CORPO, nunca na URL: URL entra em log de servidor */
    assert.ok(!chamadas[0].url.includes(SEGREDO));

    /* código com formato estranho nem chega a virar chamada */
    await assert.rejects(() => trocarCodigoPorToken("loja", { clientId: "id", clientSecret: SEGREDO }, "cod igo", { buscar }));
  });
});

test("escopo concedido a menos é descoberto ANTES de escrever", async () => {
  await comModulo(({ escoposFaltando, ESCOPOS }) => {
    /**
     * O cliente pode aprovar uma versão antiga do app, com menos permissão do
     * que a de hoje. Descobrir isso na volta é uma frase clara; descobrir no
     * meio da instalação é meia loja montada.
     */
    assert.deepEqual(escoposFaltando(ESCOPOS.join(",")), []);
    assert.deepEqual(escoposFaltando("write_products,write_files"), ["write_themes"]);
    assert.deepEqual(escoposFaltando(""), [...ESCOPOS]);
    /* espaço em volta não pode virar escopo faltando */
    assert.deepEqual(escoposFaltando(" write_products , write_themes , write_files "), []);
  });
});

test("a volta confere assinatura, state e loja antes de pedir token", async () => {
  const { readFile } = await import("node:fs/promises");
  const rota = await readFile(new URL("../app/api/shopify/retorno/route.ts", import.meta.url), "utf8");
  const corpo = rota.slice(rota.indexOf("export async function GET"));

  /* a ordem importa: trocar primeiro e perguntar depois deixaria qualquer um
     nos fazer pedir tokens à Shopify */
  const ordem = ["assinaturaValida", "shopify_conexoes", "linha.loja !== loja", "trocarCodigoPorToken"];
  let anterior = -1;
  for (const passo of ordem) {
    const onde = corpo.indexOf(passo);
    assert.ok(onde > anterior, `${passo} saiu de ordem na volta`);
    anterior = onde;
  }
  /* e o `state` só serve uma vez: a linha precisa estar pendente */
  assert.match(corpo, /status !== "pendente"/);
});

test("a assinatura confere mesmo quando o valor veio escapado", async () => {
  await comModulo(async ({ assinaturaValida }) => {
    /**
     * O caso que recusou uma volta LEGÍTIMA da Shopify.
     *
     * O `host` do retorno é base64 e pode terminar em `%3D`. Assinando os
     * valores já decodificados, a mensagem sai diferente da que a Shopify
     * assinou — e a autorização verdadeira é recusada com "a assinatura não
     * confere", que é o erro mais cego que existe.
     *
     * Agora as duas formas são aceitas. Isso não afrouxa nada: sem o Client
     * Secret não se produz assinatura válida para nenhuma delas.
     */
    const queryCrua = "code=abc123&host=YWpqMGFmZS15Mw%3D%3D&shop=loja.myshopify.com&state=" + "a".repeat(32) + "&timestamp=1700000000";

    /* a Shopify assinou os pares COMO ELES VIAJAM, com o %3D intacto */
    const pares = queryCrua.split("&").sort().join("&");
    const chave = await crypto.subtle.importKey("raw", new TextEncoder().encode(SEGREDO), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bruto = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(pares));
    const hmac = [...new Uint8Array(bruto)].map((b) => b.toString(16).padStart(2, "0")).join("");

    const comHmac = `${queryCrua}&hmac=${hmac}`;
    const parametros = new URLSearchParams(comHmac);
    assert.ok(await assinaturaValida(parametros, SEGREDO, `?${comHmac}`), "recusou uma volta legítima com valor escapado");

    /* e continua recusando a forjada, com ou sem query crua */
    const adulterada = new URLSearchParams(comHmac);
    adulterada.set("shop", "loja-do-atacante.myshopify.com");
    assert.ok(!(await assinaturaValida(adulterada, SEGREDO, `?${comHmac.replace("loja.myshopify.com", "loja-do-atacante.myshopify.com")}`)));
  });
});
