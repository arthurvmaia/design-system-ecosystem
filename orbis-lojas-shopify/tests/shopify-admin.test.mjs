import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * A INSTALAÇÃO NA LOJA DO CLIENTE, sem loja de cliente.
 *
 * Tudo aqui roda contra um `fetch` de mentira: as chamadas são inspecionadas
 * uma a uma — endereço, cabeçalho, corpo — e as respostas são escritas à mão,
 * inclusive as ruins. É o que dá para provar sem uma conta Shopify de verdade,
 * e é justamente a parte que costuma quebrar: ordem das chamadas, formato do
 * corpo, e o que o código faz quando a plataforma diz não.
 *
 * O que ISTO NÃO PROVA está declarado: que a Shopify aceita estes corpos. Essa
 * metade só se prova com uma loja e uma chave de verdade, e é o teste que fica
 * para o dono.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));
/* montados por código: um `\r` escrito à mão neste arquivo seria comido pelo
   próprio editor que causou o bug */
const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);
const TAB = String.fromCharCode(9);


async function comModulo(trabalho) {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try { return await trabalho(await server.ssrLoadModule("/lib/shopify-admin.ts")); } finally { await server.close(); }
}

/** Um relógio que não faz ninguém esperar, e que conta se esperou. */
function relogioDeMentira() {
  const esperas = [];
  return { esperas, relogio: { agora: () => 0, dormir: async (ms) => { esperas.push(ms); } } };
}

/** Um `fetch` que responde de uma fila e guarda o que recebeu. */
function buscaDeMentira(respostas) {
  const chamadas = [];
  const buscar = async (url, init = {}) => {
    chamadas.push({ url: String(url), metodo: init.method ?? "GET", cabecalhos: init.headers ?? {}, corpo: init.body });
    const proxima = respostas.shift() ?? { status: 200, json: {} };
    return {
      ok: proxima.status >= 200 && proxima.status < 300,
      status: proxima.status,
      headers: new Map(Object.entries(proxima.headers ?? {})),
      text: async () => (typeof proxima.json === "string" ? proxima.json : JSON.stringify(proxima.json ?? {})),
    };
  };
  return { chamadas, buscar };
}

const LOJA = { dominio: "minha-loja.myshopify.com", token: "shpat_" + "a".repeat(32) };

test("o endereço da loja é aceito do jeito que a pessoa digita", async () => {
  await comModulo(({ normalizarDominio }) => {
    /* colar o endereço do admin é o gesto mais natural do mundo, e recusar por
       causa de um "https://" é atrito sem motivo */
    for (const escrito of ["minha-loja", "minha-loja.myshopify.com", "https://minha-loja.myshopify.com", "  HTTPS://Minha-Loja.myshopify.com/admin/themes  "]) {
      assert.equal(normalizarDominio(escrito), "minha-loja.myshopify.com", `recusou "${escrito}"`);
    }
    /* domínio próprio NÃO serve: a API só atende pelo .myshopify.com, e aceitar
       aqui daria um erro de autenticação que ninguém entenderia */
    assert.equal(normalizarDominio("minhaloja.com.br"), "");
    assert.equal(normalizarDominio(""), "");
  });
});

test("conferir a loja prova domínio, chave e conexão antes de escrever", async () => {
  await comModulo(async ({ conferirLoja }) => {
    const { chamadas, buscar } = buscaDeMentira([
      { status: 200, json: { shop: { name: "Treino Forte", myshopify_domain: "minha-loja.myshopify.com", plan_display_name: "Basic", email: "a@b.c" } } },
    ]);
    const { relogio } = relogioDeMentira();
    const dados = await conferirLoja(LOJA, { buscar, relogio });

    assert.equal(dados.nome, "Treino Forte");
    assert.equal(chamadas.length, 1, "conferir é UMA pergunta, não uma varredura");
    assert.match(chamadas[0].url, /^https:\/\/minha-loja\.myshopify\.com\/admin\/api\/[\d-]+\/shop\.json$/);
    /* a chave vai no cabeçalho, nunca na URL: URL entra em log de servidor */
    assert.equal(chamadas[0].cabecalhos["X-Shopify-Access-Token"], LOJA.token);
    assert.ok(!chamadas[0].url.includes("shpat_"));
  });
});

test("chave sem permissão vira frase, não código de status", async () => {
  await comModulo(async ({ conferirLoja }) => {
    const { buscar } = buscaDeMentira([{ status: 401, json: { errors: "[API] Invalid API key or access token" } }]);
    const { relogio } = relogioDeMentira();
    await assert.rejects(
      () => conferirLoja(LOJA, { buscar, relogio }),
      (erro) => {
        assert.equal(erro.status, 401);
        assert.match(erro.mensagem, /Invalid API key/);
        assert.equal(erro.passo, "conferir a loja", "o erro diz em que passo parou");
        return true;
      },
    );
  });
});

test("coleção que já existe é reaproveitada, não duplicada", async () => {
  await comModulo(async ({ criarColecoes }) => {
    const { chamadas, buscar } = buscaDeMentira([
      { status: 200, json: { custom_collections: [{ id: 11, title: "Musculação" }] } },
      { status: 200, json: { custom_collection: { id: 22 } } },
    ]);
    const { relogio } = relogioDeMentira();
    const mapa = await criarColecoes(LOJA, ["Musculação", "Corrida"], { buscar, relogio });

    assert.equal(mapa.get("Musculação"), 11, "a que já existia foi reaproveitada");
    assert.equal(mapa.get("Corrida"), 22);
    /* uma listagem e UMA criação: instalar duas vezes não pode encher a loja
       de "Ofertas" repetidas para o cliente apagar à mão */
    assert.equal(chamadas.length, 2);
    assert.equal(chamadas[1].metodo, "POST");
    assert.match(JSON.parse(chamadas[1].corpo).custom_collection.title, /Corrida/);
  });
});

test("o produto vai com foto por URL e entra na coleção dele", async () => {
  await comModulo(async ({ criarProdutos }) => {
    const { chamadas, buscar } = buscaDeMentira([
      { status: 200, json: { products: [] } },
      { status: 200, json: { product: { id: 99 } } },
      { status: 200, json: { collect: { id: 1 } } },
    ]);
    const { relogio } = relogioDeMentira();
    const resultado = await criarProdutos(
      LOJA,
      [{ handle: "tapete-de-yoga", titulo: "Tapete de yoga", descricaoHtml: "<p>x</p>", precoCentavos: 5990, precoComparadoCentavos: 8855, imagens: ["https://foto/1.jpg"], colecao: "Corrida" }],
      new Map([["Corrida", 42]]),
      { buscar, relogio },
    );

    assert.equal(resultado.criados, 1);
    assert.equal(resultado.semColecao, 0);
    const corpo = JSON.parse(chamadas[1].corpo).product;
    /* a foto vai por ENDEREÇO e quem baixa é a Shopify — é por isso que a
       instalação não precisa mandar imagem de produto nenhuma daqui */
    assert.deepEqual(corpo.images, [{ src: "https://foto/1.jpg" }]);
    /* preço em reais com dois dígitos: centavos crus virariam R$ 5.990,00 */
    assert.equal(corpo.variants[0].price, "59.90");
    assert.equal(corpo.variants[0].compare_at_price, "88.55");
    const vinculo = JSON.parse(chamadas[2].corpo).collect;
    assert.deepEqual(vinculo, { product_id: 99, collection_id: 42 });
  });
});

test("vínculo que falha não derruba a instalação inteira", async () => {
  await comModulo(async ({ criarProdutos }) => {
    /**
     * O produto já está na loja quando o vínculo falha. Abortar aqui deixaria
     * o cliente com três produtos e uma mensagem de erro, em vez de dez
     * produtos e um aviso — e ele prefere o segundo, porque o segundo se
     * conserta com dois cliques.
     */
    const { buscar } = buscaDeMentira([
      { status: 200, json: { products: [] } },
      { status: 200, json: { product: { id: 99 } } },
      { status: 422, json: { errors: { product: ["já está na coleção"] } } },
      { status: 200, json: { product: { id: 100 } } },
      { status: 200, json: { collect: { id: 2 } } },
    ]);
    const { relogio } = relogioDeMentira();
    const produto = (titulo) => ({ handle: titulo.toLowerCase(), titulo, descricaoHtml: "", precoCentavos: 100, precoComparadoCentavos: null, imagens: [], colecao: "Corrida" });
    const resultado = await criarProdutos(LOJA, [produto("A"), produto("B")], new Map([["Corrida", 42]]), { buscar, relogio });

    assert.equal(resultado.criados, 2, "os dois produtos entraram");
    assert.equal(resultado.semColecao, 1, "e o que ficou sem coleção foi contado");
  });
});

test("a arte sobe em três etapas, e o nome do arquivo é preservado", async () => {
  await comModulo(async ({ enviarArquivos }) => {
    const { chamadas, buscar } = buscaDeMentira([
      { status: 200, json: { data: { stagedUploadsCreate: { stagedTargets: [{ url: "https://staging.shopify/x", resourceUrl: "https://recibo/1", parameters: [{ name: "key", value: "abc" }] }], userErrors: [] } } } },
      { status: 200, json: {} },
      { status: 200, json: { data: { fileCreate: { files: [{ id: "gid://F/1" }], userErrors: [] } } } },
    ]);
    const { relogio } = relogioDeMentira();
    const resultado = await enviarArquivos(LOJA, [{ nome: "orbis-banner-1.jpg", tipo: "image/jpeg", dados: new Uint8Array([1, 2, 3]) }], { buscar, relogio });

    assert.equal(resultado.enviados, 1);
    assert.deepEqual(resultado.falhas, []);
    assert.equal(chamadas.length, 3, "preparar, mandar os bytes, registrar");
    /* o meio do caminho é um endereço DA SHOPIFY: é isso que faz o envio
       funcionar de uma máquina sem endereço público */
    assert.equal(chamadas[1].url, "https://staging.shopify/x");
    /* e o NOME vai igual: o tema procura a imagem por ele, e renomear quebra
       a ligação que faz a foto aparecer */
    assert.match(chamadas[0].corpo, /orbis-banner-1\.jpg/);
    assert.match(chamadas[2].corpo, /orbis-banner-1\.jpg/);
  });
});

test("erro de GraphQL vem dentro de uma resposta 200, e não passa por sucesso", async () => {
  await comModulo(async ({ enviarArquivos }) => {
    /* a Shopify responde 200 com o erro no corpo. Sem olhar dentro, falha
       virava sucesso e o relatório mentia para quem instalou. */
    const { buscar } = buscaDeMentira([{ status: 200, json: { errors: [{ message: "Access denied for stagedUploadsCreate" }] } }]);
    const { relogio } = relogioDeMentira();
    const resultado = await enviarArquivos(LOJA, [{ nome: "a.jpg", tipo: "image/jpeg", dados: new Uint8Array([1]) }], { buscar, relogio });

    assert.equal(resultado.enviados, 0);
    assert.equal(resultado.falhas.length, 1);
    assert.match(resultado.falhas[0], /Access denied/);
  });
});

test("o tema entra sem publicar, e a URL do pacote vai no corpo", async () => {
  await comModulo(async ({ instalarTema }) => {
    const { chamadas, buscar } = buscaDeMentira([{ status: 200, json: { theme: { id: 7, name: "Loja · Orbis" } } }]);
    const { relogio } = relogioDeMentira();
    const tema = await instalarTema(LOJA, { nome: "Loja · Orbis", zipUrl: "https://pacote/x.zip" }, { buscar, relogio });

    assert.equal(tema.id, 7);
    const corpo = JSON.parse(chamadas[0].corpo).theme;
    assert.equal(corpo.src, "https://pacote/x.zip");
    /**
     * SEM PUBLICAR, e isso não é conservadorismo: publicar troca a loja no ar
     * do cliente. Quem decide trocar a vitrine que está vendendo é ele.
     */
    assert.equal(corpo.role, "unpublished");
  });
});

test("o ritmo das chamadas respeita o balde da Shopify", async () => {
  await comModulo(async ({ criarColecoes }) => {
    /* a API REST devolve duas chamadas por segundo; disparadas juntas, as
       últimas voltam 429 e a instalação morre no meio */
    const { buscar } = buscaDeMentira([
      { status: 200, json: { custom_collections: [] } },
      { status: 200, json: { custom_collection: { id: 1 } } },
      { status: 200, json: { custom_collection: { id: 2 } } },
    ]);
    const { esperas, relogio } = relogioDeMentira();
    await criarColecoes(LOJA, ["A", "B"], { buscar, relogio });
    assert.ok(esperas.length >= 2, "as chamadas saíram sem intervalo nenhum");
    assert.ok(esperas.every((ms) => ms > 0));
  });
});

test("429 é ritmo, não defeito: espera o que a resposta mandar e insiste", async () => {
  await comModulo(async ({ conferirLoja }) => {
    const { chamadas, buscar } = buscaDeMentira([
      { status: 429, headers: { "retry-after": "1" }, json: {} },
      { status: 200, json: { shop: { name: "Loja" } } },
    ]);
    const { esperas, relogio } = relogioDeMentira();
    const dados = await conferirLoja(LOJA, { buscar, relogio });
    assert.equal(dados.nome, "Loja");
    assert.equal(chamadas.length, 2, "insistiu uma vez");
    assert.ok(esperas.includes(1000), "esperou o que a Shopify pediu");
  });
});

test("o token é PEDIDO pelo app, e ninguém cola chave nenhuma", async () => {
  await comModulo(async ({ obterToken, appConfigurado }) => {
    /**
     * Quem se identifica é o app, com as credenciais do dono. A Shopify devolve
     * um token para AQUELA loja, válido por 24 horas.
     *
     * A versão anterior pedia uma chave `shpat_` colada no formulário pelo
     * cliente. Ela morreu porque a Shopify aposentou os apps personalizados
     * criados no admin, que era de onde ela saía — e o caminho de hoje é melhor
     * de qualquer forma: some um campo da tela.
     */
    const { chamadas, buscar } = buscaDeMentira([
      { status: 200, json: { access_token: "shpua_abc", scope: "write_products,write_themes,write_files", expires_in: 86399 } },
    ]);
    const { relogio } = relogioDeMentira();
    const acesso = await obterToken("minha-loja", { clientId: "id", clientSecret: "segredo" }, { buscar, relogio });

    assert.equal(acesso.token, "shpua_abc");
    assert.equal(acesso.expiraEm, 86399);
    /* o endereço do token é outro: fora de /admin/api/<versão> */
    assert.equal(chamadas[0].url, "https://minha-loja.myshopify.com/admin/oauth/access_token");
    const corpo = JSON.parse(chamadas[0].corpo);
    assert.equal(corpo.grant_type, "client_credentials");
    assert.equal(corpo.client_id, "id");
    /* e o segredo vai no CORPO, nunca na URL: URL entra em log de servidor */
    assert.ok(!chamadas[0].url.includes("segredo"));

    /* sem as duas credenciais não há instalação, e a tela precisa saber disso
       antes de pedir qualquer coisa ao cliente */
    assert.ok(appConfigurado({ clientId: "a", clientSecret: "b" }));
    assert.ok(!appConfigurado({ clientId: "a", clientSecret: "" }));
    assert.ok(!appConfigurado(undefined));
  });
});

test("credencial errada vira frase que diz o que conferir", async () => {
  await comModulo(async ({ obterToken }) => {
    const { buscar } = buscaDeMentira([{ status: 401, json: { error: "invalid_client" } }]);
    const { relogio } = relogioDeMentira();
    await assert.rejects(
      () => obterToken("minha-loja", { clientId: "x", clientSecret: "y" }, { buscar, relogio }),
      (erro) => {
        /* 401 aqui é quase sempre uma de duas coisas, e dizer QUAIS poupa a
           tarde de quem está configurando */
        assert.match(erro.mensagem, /Client ID e o Secret/);
        assert.match(erro.mensagem, /instalado nesta loja/);
        return true;
      },
    );
  });
});

test("instalar duas vezes não duplica produto", async () => {
  await comModulo(async ({ criarProdutos }) => {
    /**
     * Instalar de novo é o gesto mais comum de quem está testando. Sem esta
     * conferência, a segunda rodada criava dez produtos repetidos para o
     * cliente apagar um a um — e as coleções já eram reaproveitadas, então a
     * diferença não tinha motivo nenhum.
     */
    const { chamadas, buscar } = buscaDeMentira([
      { status: 200, json: { products: [{ id: 7, handle: "ja-esta-la" }] } },
      { status: 200, json: { product: { id: 8 } } },
      { status: 200, json: { collect: { id: 1 } } },
    ]);
    const { relogio } = relogioDeMentira();
    const produto = (handle) => ({ handle, titulo: handle, descricaoHtml: "", precoCentavos: 100, precoComparadoCentavos: null, imagens: [], colecao: "C" });
    const resultado = await criarProdutos(LOJA, [produto("ja-esta-la"), produto("nova")], new Map([["C", 42]]), { buscar, relogio });

    assert.equal(resultado.jaExistiam, 1, "o repetido tinha de ser reconhecido");
    assert.equal(resultado.criados, 1, "e só o novo entra");
    /* a listagem, a criação do novo e o vínculo dele: nada mais */
    assert.equal(chamadas.length, 3);
    assert.equal(JSON.parse(chamadas[1].corpo).product.handle, "nova");
  });
});

test("as credenciais chegam limpas do arquivo, e nenhuma rota as lê crua", async () => {
  await comModulo(({ credenciaisDoApp }) => {
    /**
     * O bug que custou três tentativas cegas.
     *
     * Um `.dev.vars` salvo no Windows é CRLF, e cada valor chegava ao worker
     * com um retorno de carro colado no fim — 39 bytes onde o Client Secret
     * tem 38. Quase nada reclamava: a Shopify tolera o caractere no endpoint
     * de token (o `client_credentials` devolvia 200 e a loja era instalada
     * inteira) e o parser de URL descarta controle no fim sozinho. Só a
     * assinatura HMAC usa a chave byte a byte, e por um caractere invisível
     * ela nunca batia — com a tela dizendo apenas "não confere".
     */
    const sujo = credenciaisDoApp("abc123" + CR, "shpss_umsegredo" + CR);
    assert.equal(sujo.clientId, "abc123");
    assert.equal(sujo.clientSecret, "shpss_umsegredo");
    /* e o resto do que um arquivo editado à mão traz de brinde */
    assert.equal(credenciaisDoApp("  abc  ", LF + " shpss_x " + TAB).clientSecret, "shpss_x");
    /* faltando, some — é o que `appConfigurado` usa para dizer "não dá" */
    assert.deepEqual(credenciaisDoApp(undefined, null), { clientId: "", clientSecret: "" });
  });

  /**
   * E a limpeza tem de valer para TODAS as portas. Uma rota que leia a variável
   * direto reintroduz o bug numa só, e a falha volta a ser invisível.
   */
  const { readFile } = await import("node:fs/promises");
  for (const rota of ["shopify-instalar/route.ts", "shopify/entrar/route.ts", "shopify/retorno/route.ts"]) {
    const fonte = await readFile(new URL(`../app/api/${rota}`, import.meta.url), "utf8");
    for (const linha of fonte.split(LF)) {
      if (!linha.includes("env.SHOPIFY_CLIENT_SECRET")) continue;
      assert.ok(linha.includes("credenciaisDoApp("), `${rota} lê o segredo sem limpar: ${linha.trim()}`);
    }
  }
});
