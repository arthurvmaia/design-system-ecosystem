import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * A RODADA DE GERAÇÃO: o que ela pede, quanto tempo espera e o que ela conta.
 *
 * Este arquivo nasceu de uma rodada real que terminou torta: seis peças
 * pedidas, quatro entregues, catorze minutos gastos depois da última chegar, e
 * um resumo dizendo "7 de 6 prontas".
 */

async function comServidor(rodar) {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try { await rodar(server); } finally { await server.close(); }
}

/**
 * A RESOLUÇÃO sai do destino da peça, não de um gosto por nitidez.
 *
 * Já foi 2k para tudo e o banner saía esticado; a correção pôs 4k fixo e criou
 * o defeito oposto — cenas de 17,9 e 19,8 MB, download arrastando a rodada e
 * peça descartada por passar do teto DEPOIS de gerada e paga.
 */
test("banner pede 4k porque é recomposto; capa e símbolo pedem 2k", async () => {
  await comServidor(async (server) => {
    const { resolucaoDaPeca, pecasDaMarca } = await server.ssrLoadModule("/lib/marca-imagens.ts");
    const { FORMATOS } = await server.ssrLoadModule("/lib/banner-compor.ts");

    /* o banner é recomposto em 3000x1000: de uma fonte 2k (2048 px de lado)
       isso é AMPLIAR, e a pixelização deixa de ser teórica */
    assert.ok(FORMATOS.desktop.largura > 2048, "se o alvo couber em 2k, o 4k do banner deixa de se justificar");
    assert.equal(resolucaoDaPeca("banner-desktop"), "4k");
    assert.equal(resolucaoDaPeca("banner-mobile"), "4k");

    /* cena entra como imagem de seção e símbolo é recortado para uns 180 KB:
       baixar 4k para os dois é pagar banda por pixel que se joga fora */
    assert.equal(resolucaoDaPeca("colecao"), "2k");
    assert.equal(resolucaoDaPeca("cena"), "2k");
    assert.equal(resolucaoDaPeca("logo"), "2k");

    /* e cada peça CARREGA a sua, senão a decisão não chega ao provedor */
    const pecas = pecasDaMarca({
      name: "Teste", primaryColor: "#0e7490", backgroundColor: "#ffffff", accentColor: "#0e7490",
      nicheId: "roupas",
    });
    for (const peca of pecas.filter((p) => p.origem === "gerada")) {
      assert.ok(peca.resolucao, `${peca.chave} foi pedida sem resolução`);
    }
    assert.equal(pecas.find((p) => p.chave === "banner-1")?.resolucao, "4k");
    assert.equal(pecas.find((p) => p.chave === "colecao-1")?.resolucao, "2k");
  });
});

test("o corpo do pedido leva a resolução da peça, não uma constante", async () => {
  const fonte = await readFile(new URL("../lib/magnific.ts", import.meta.url), "utf8");
  assert.doesNotMatch(fonte, /resolution: "4k"/, "4k fixo é o defeito que este teste guarda");
  assert.match(fonte, /resolution: resolucao \?\? "2k"/);
  /* e o padrão, quando ninguém disser, é o barato: escolher o caro em silêncio
     foi exatamente como as peças de 20 MB apareceram */
  assert.match(fonte, /resolucao\?: string/);
});

/**
 * TAREFA MORTA e FALHA DEFINITIVA param a espera na hora.
 *
 * Medido na rodada que motivou isto: a última imagem chegou 05:56:51 e o laço
 * só desistiu 06:10:35. Catorze minutos perguntando de dez em dez segundos a
 * tarefas que nunca iam responder.
 */
test("o que não vai mudar não é perguntado de novo", async () => {
  const rota = await readFile(new URL("../app/api/marca-imagens/route.ts", import.meta.url), "utf8");

  /* o provedor tem fins de linha, e o código só conhecia COMPLETED */
  assert.match(rota, /const TERMINOU_MAL = new Set\(\[/);
  for (const morto of ["FAILED", "ERROR", "CANCELED", "EXPIRED", "TIMEOUT"]) {
    assert.match(rota, new RegExp(`"${morto}"`), `${morto} precisa encerrar a espera`);
  }
  assert.match(rota, /TERMINOU_MAL\.has\(tarefa\.status\.toUpperCase\(\)\)/);
  assert.match(rota, /pronta: false, erro:/, "tarefa morta precisa DIZER que morreu");

  /* arquivo grande, tipo errado e resposta vazia devolvem sempre o mesmo:
     insistir neles gasta o relógio das peças que ainda tinham chance */
  assert.match(rota, /const definitivo = \/\^\(ARQUIVO_GRANDE\|ARQUIVO_VAZIO\|TIPO_INVALIDO\|URL_INVALIDA\)\//);
  assert.match(rota, /status: definitivo \? 422 : 502/);

  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  assert.match(flow, /if \(corpo\.definitivo \|\| \(resposta\.status >= 400 && resposta\.status < 500\)\)/);
  assert.match(flow, /falhas\[chave\] = corpo\.error/);
});

/**
 * "7 de 6 prontas": o número que não podia existir.
 *
 * O numerador contava todas as chaves prontas — inclusive as versões do símbolo
 * e o par de celular dos banners, que o denominador não conta. Quatro geradas
 * mais três derivadas davam sete de seis.
 */
test("o resumo conta o mesmo conjunto dos dois lados do 'de'", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  assert.match(flow, /const quantasGeradas = pecasGeradas\.filter\(\(peca\) => prontas\[peca\.chave\]\)\.length/);
  assert.match(flow, /\$\{quantasGeradas\} de \$\{pecasGeradas\.length\} prontas/);
  assert.doesNotMatch(flow, /\$\{Object\.keys\(prontas\)\.length\} de \$\{pecasGeradas\.length\}/,
    "contar chaves de `prontas` contra peças geradas é a origem do 7 de 6");
  /* e o motivo aparece junto: "sem imagem" sem por quê é um enigma */
  assert.match(flow, /const porque = \[\.\.\.new Set\(Object\.values\(falhas\)\.map\(motivoLegivel\)\)\]/);
  /* e o motivo sai em português: o servidor fala em código porque código serve
     para decidir, mas quem lê a tela é o dono da loja, e
     ARQUIVO_GRANDE_23.4MB_TETO_40MB não é um motivo, é um susto */
  assert.match(flow, /function motivoLegivel\(bruto: string\): string/);
  assert.match(flow, /a imagem veio com \$\{grande\[1\]\} MB/);
});

/**
 * O teto da arte GERADA não é o teto do upload do cliente.
 *
 * Recusar o arquivo que o cliente escolheu é barato: ele escolhe outro. Recusar
 * o que o app mandou gerar e pagou deixa a pessoa sem a peça.
 */
test("arte gerada tem teto próprio, e o limite da Shopify vira aviso", async () => {
  await comServidor(async (server) => {
    const regras = await server.ssrLoadModule("/lib/business-rules.mjs");
    assert.ok(regras.MAX_ARTE_GERADA_BYTES > regras.MAX_UPLOAD_BYTES,
      "arte paga não pode ser recusada pelo mesmo corte que o upload do cliente");
    assert.equal(regras.MAX_UPLOAD_MB, 20, "os 20 MB da Shopify continuam valendo para o upload");
  });

  const rota = await readFile(new URL("../app/api/marca-imagens/route.ts", import.meta.url), "utf8");
  assert.match(rota, /dados\.byteLength > MAX_ARTE_GERADA_BYTES/);
  /* passar do limite da Shopify não impede de guardar: vira aviso, porque a
     peça serve na prévia e quem for subir precisa saber antes */
  assert.match(rota, /acima dos \$\{MAX_UPLOAD_MB\} MB que a Shopify aceita/);
});

/**
 * O PEDIDO DA CAPA é liderado pelo nome da coleção.
 *
 * Medido numa loja de joias entregue: a capa de "Colares" veio com anéis, a de
 * "Brincos" com um anel e a de "Pulseiras" com duas BOLSAS. O nome da coleção
 * já estava escrito no pedido — não era falta de menção, era peso. O pedido
 * abria com "uma loja de semijoias, bijuterias e acessórios de uso diário", e o
 * modelo obedeceu ao que se repetia: a loja, e a palavra "acessórios" dentro
 * dela. A coleção aparecia uma vez, no meio de quinhentos caracteres.
 */
test("o pedido da capa abre pelo nome da coleção, e o nicho entra curto", async () => {
  await comServidor(async (server) => {
    const { pecasDaMarca } = await server.ssrLoadModule("/lib/marca-imagens.ts");
    const pecas = pecasDaMarca({
      name: "Prata Studio", primaryColor: "#3f3529", backgroundColor: "#faf7f2", accentColor: "#c9a227",
      nicheId: "joias", collections: ["Colares", "Brincos", "Pulseiras"],
    });
    const capa = (n) => pecas.find((peca) => peca.chave === `colecao-${n}`);

    /* o nome abre o pedido e volta logo depois: duas menções a ele contra uma
       ao nicho, que é o contrário da conta que produziu a bolsa */
    assert.ok(capa(1).prompt.startsWith("Colares."), `abriu com: ${capa(1).prompt.slice(0, 40)}`);
    assert.ok((capa(1).prompt.match(/Colares/g) ?? []).length >= 2, "o nome tem de aparecer duas vezes");

    for (const n of [1, 2, 3]) {
      /* a descrição LARGA da loja fica fora, e com ela a palavra que roubou a
         capa de "Pulseiras" */
      assert.doesNotMatch(capa(n).prompt, /acessórios/i, "o pedido não pode carregar 'acessórios'");
      assert.doesNotMatch(capa(n).prompt, /bijuterias/i);
      assert.match(capa(n).prompt, /loja de joias/, "o nicho entra curto, como contexto");
      /* e o pedido cabe no teto da rota: cortado, ele perde o fim, que é onde
         mora "sem letras" — e a peça voltaria com texto escrito dentro */
      assert.ok(capa(n).prompt.length <= 1200, `pedido com ${capa(n).prompt.length} caracteres`);
      assert.match(capa(n).prompt, /Sem letras/);
    }

    /* cada capa continua com o enquadramento dela: sem isso saem seis fotos
       iguais com cores diferentes */
    const enquadramento = (n) => capa(n).prompt.match(/Enquadramento: ([^.]+)/)[1];
    assert.notEqual(enquadramento(1), enquadramento(2));

    /* e a segunda dobra pede o PRODUTO antes do fundo. O pedido antigo abria
       por "o produto em close, com a textura do material bem visível" e
       terminava em "fundo de papel envelhecido com grão": voltou a foto de um
       papel, sem produto nenhum no quadro. Duas menções a textura contra uma. */
    /**
     * E o assunto que abre é uma COISA, não o nome do ramo.
     *
     * "joias em close" ainda era abstrato o bastante para funcionar, mas o
     * mesmo pedido em fitness virava "artigos de treino em close" — e não
     * existe objeto com esse nome. Medido: voltou um retângulo verde liso, sem
     * produto nenhum no quadro. O assunto agora sai de `cenas` no catálogo do
     * nicho, onde alguém escreveu o que a câmera consegue ver.
     */
    const dobraDeClose = pecas.find((peca) => peca.chave === "banner-2");
    assert.ok(dobraDeClose.prompt.startsWith("um colar fino e um par de brincos sobre veludo, em close"), dobraDeClose.prompt.slice(0, 60));
    assert.ok(!dobraDeClose.prompt.startsWith("joias em close"), "o nome do ramo não abre a foto");
    assert.doesNotMatch(dobraDeClose.prompt, /papel envelhecido/);
  });
});

/**
 * A CAPA DE CADA COLEÇÃO chega ao cartão daquela coleção.
 *
 * Gerar uma capa por coleção não resolve nada se ela não chegar ao cartão. E o
 * caminho que os cartões usam de verdade é o `settings` do bloco, não a busca
 * `collections['handle']` escrita no Liquid: era por isso que a vitrine
 * continuava com foto de produto sorteada mesmo com as capas prontas.
 */
test("a capa vai para o cartão pelo settings, que é por onde o tema pergunta", async () => {
  const fonte = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");

  /* a capa E o nome viajam por aqui: é a mesma passagem, e é por ela que o
     tema pergunta pelo cartão de coleção. Comparação literal em vez de
     expressão regular: a linha tem parêntese, chave e crase demais, e
     escapar tudo isso é onde o teste vira armadilha para quem vem depois */
  assert.ok(
    fonte.includes('if (type === "collection") { resolved[id] = demoCollection(helpers.loja, typeof value === "string" ? value : "", helpers.capas ?? {}, helpers.vaga, helpers.nomes ?? {}); continue; }'),
    "o cartão de coleção deixou de receber a capa e o nome pelo settings",
  );
  /* e a lista de coleções mostra as DA LOJA: a lista fixa de colecao-1..4
     inventava quatro cartões no lugar das que a pessoa escreveu */
  assert.match(fonte, /const daLoja = Object\.keys\(helpers\.capas \?\? \{\}\)/);
  /* a capa gerada vence a foto sorteada, que vira só a reserva */
  assert.match(fonte, /const foto = capas\[handle\] \?\? fotoDaColecao\(loja, handle, vaga\)/);

  /* e a rota casa capa com coleção pela POSIÇÃO, que é o que liga colecao-2 a
     "Básicos": as duas listas saem da mesma lista de nomes */
  const rota = await readFile(new URL("../app/api/theme-render/route.ts", import.meta.url), "utf8");
  assert.match(rota, /`colecao-\$\{indice \+ 1\}`/);
  assert.match(rota, /handleDeColecao\(String\(nome\)\)/);
});

/**
 * A CAPA SOBREVIVE AO FLUXO, senão ela só existe na tela que a criou.
 *
 * Medido numa loja de óculos aberta no Editor: seis cartões, nenhum com a capa
 * gerada, e o mesmo estojo repetido em TRÊS deles. O mapa handle → capa era
 * montado na hora, a partir da marca em memória do fluxo do cliente, e morria
 * com o pedido. O Editor abre o tema salvo e não tem marca nenhuma: caía na
 * foto de produto sorteada pelo hash do handle, que com poucos produtos
 * colide.
 */
test("a capa fica gravada no tema, e é dela que o editor lê", async () => {
  const cliente = await readFile(new URL("../app/api/client-request/route.ts", import.meta.url), "utf8");
  /* a entrega grava o mapa no tema do projeto, casado por handle */
  assert.match(cliente, /orbisCapas: capasDeColecao/);
  assert.match(cliente, /handleDeColecao\(String\(nome\)\)/);

  const render = await readFile(new URL("../app/api/theme-render/route.ts", import.meta.url), "utf8");
  /* e quem não traz capa no pedido — o Editor — lê a do tema */
  assert.match(render, /capasDeColecao: extras\.capasDeColecao \?\? shopify\.orbisCapas/);

  const renderizador = await readFile(new URL("../lib/theme-render.ts", import.meta.url), "utf8");
  /* sem capa nenhuma, a reserva usa a VAGA do cartão e não o hash do handle:
     é o que impede a mesma foto de aparecer em três cartões vizinhos */
  assert.match(renderizador, /function fotoDaColecao\(loja: Loja, handle: string, vaga\?: number\)/);
  assert.match(renderizador, /typeof vaga === "number" \? vaga :/);
  assert.match(renderizador, /vaga: index, imageFor/);
});

/**
 * A VITRINE mostra o que a loja tem, sem dar a volta na lista.
 *
 * O Dawn traz sete cartões de coleção; a loja tinha seis coleções, e o resto da
 * divisão fazia "Novidades" aparecer duas vezes na mesma vitrine, com fotos
 * diferentes — o que é pior, porque parece duas coleções.
 */
test("cartão sem coleção é apagado, nunca preenchido com uma repetida", async () => {
  const brand = await readFile(new URL("../lib/shopify-brand.ts", import.meta.url), "utf8");
  assert.doesNotMatch(brand, /colecoes\[proximaColecao\+\+ % colecoes\.length\]/, "o resto da divisão é a origem da coleção repetida");
  assert.match(brand, /if \(proximaColecao >= colecoes\.length\) \{ vagasSobrando\.push/);
  assert.match(brand, /secao\.blocks\.splice\(indice, 1\)/);
});

/**
 * ARITMÉTICA DE INTEIRO: o motor tem de contar como a Shopify conta.
 *
 * O Liquid da Shopify é Ruby, e `divided_by` entre dois inteiros devolve
 * inteiro. O LiquidJS devolve float. A diferença apareceu na tela, no selo de
 * oferta: o tema faz `delta | divided_by: compare`, a Shopify mostra "73% OFF"
 * e a prévia mostrava "73.95709177592371% OFF".
 *
 * O tema estava certo. Quem contava errado era o motor, e isso vale para
 * qualquer tema: divisão inteira é uma das contas mais comuns em Liquid de
 * loja.
 */
test("divided_by entre inteiros devolve inteiro, como no Liquid da Shopify", async () => {
  const { zipSync, strToU8 } = await import("fflate");
  const layout = "<!doctype html><html><body>{{ content_for_layout }}</body></html>";
  /* os números da tela: 5034 e 1311 centavos, que davam 73.95709177592371 */
  const secao = `<p class="selo">{{ 5034 | minus: 1311 | times: 100 | divided_by: 5034 }}</p>
<p class="meio">{{ 5 | divided_by: 3 }}</p>
<p class="float">{{ 5 | divided_by: 2.0 }}</p>
<p class="escala">{{ 100 | divided_by: 100.0 }}</p>
<p class="negativo">{{ 0 | minus: 7 | divided_by: 2 }}</p>
<p class="resto">{{ 0 | minus: 7 | modulo: 3 }}</p>
<p class="zero">{{ 9 | divided_by: 0 }}</p>
{% schema %}{"name":"Selo"}{% endschema %}`;
  const zip = zipSync({
    "layout/theme.liquid": strToU8(layout),
    "sections/selo.liquid": strToU8(secao),
    "templates/index.json": strToU8(JSON.stringify({ sections: { selo: { type: "selo" } }, order: ["selo"] })),
    "config/settings_schema.json": strToU8(JSON.stringify([{ name: "theme_info", theme_name: "Conta", theme_version: "1.0" }])),
    "config/settings_data.json": strToU8(JSON.stringify({ current: {} })),
  });

  await comServidor(async (server) => {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");
    const theme = await extractShopifyThemeBytes(zip, "conta.zip");
    const html = await renderThemePage({ theme, files: themeFilesFromZip(zip), pageId: "index", assetBase: (p) => `/assets/${p}` });
    const ler = (classe) => html.match(new RegExp(`<p class="${classe}">(.*?)</p>`))?.[1];

    assert.equal(ler("selo"), "73", "o selo de oferta é o caso que trouxe este defeito");
    assert.equal(ler("meio"), "1", "5/3 é 1 na Shopify, não 1.6666666666666667");
    /* basta um lado fracionário para a conta voltar a ser em ponto flutuante:
       é por isso que os temas escrevem `divided_by: 100.0` quando querem casa
       decimal, e quebrar isso estragaria toda escala de fonte do tema */
    assert.equal(ler("float"), "2.5");
    assert.equal(ler("escala"), "1");
    /* Ruby arredonda para BAIXO, não trunca */
    assert.equal(ler("negativo"), "-4");
    /* e o resto acompanha o sinal do divisor */
    assert.equal(ler("resto"), "2");
    /* dividir por zero não pode derrubar a página inteira */
    assert.equal(ler("zero"), "0");
  });
});

/**
 * A CAPA DE PRATELEIRA mostra o produto da loja, e não a fachada dela.
 *
 * "Lançamentos" e "Ofertas" dizem QUANDO o produto chegou e POR QUANTO ele
 * sai — não existe objeto com esse nome para fotografar. Pedindo a palavra, o
 * modelo devolvia o que ela sugere: medido nesta loja de relógios, uma vitrine
 * iluminada e uma fachada com placa escrita "Offetas" (letreiro inventado,
 * apesar do "sem letras" no pedido). As quatro coleções com nome de produto,
 * na mesma rodada, vieram certas.
 */
test("capa de prateleira mostra o produto da loja, não a fachada", async () => {
  await comServidor(async (server) => {
    const { pecasDaMarca } = await server.ssrLoadModule("/lib/marca-imagens.ts");
    const capas = (marca) => pecasDaMarca(marca).filter((peca) => peca.papel === "colecao");
    const base = { name: "Hora Watches", primaryColor: "#ff7300", backgroundColor: "#f6f7f9" };

    /* com nicho, o assunto é o produto do nicho */
    const comNicho = capas({ ...base, nicheId: "relogios" });
    const ofertas = comNicho.find((peca) => peca.titulo.includes("Ofertas"));
    assert.ok(ofertas.prompt.startsWith("relógios."), ofertas.prompt.slice(0, 40));
    assert.ok(!ofertas.prompt.includes("Ofertas"), "a palavra da prateleira volta escrita numa placa");
    /* e a vizinha com nome de produto continua exatamente como era */
    assert.ok(comNicho[0].prompt.startsWith("Smartwatches."), comNicho[0].prompt.slice(0, 40));

    /* sem nicho o app não sabe o que a loja vende, então empresta o assunto de
       uma coleção IRMÃ que tenha nome de produto */
    const proprio = capas({ ...base, collections: ["Camisetas", "Ofertas"] });
    assert.ok(proprio[1].prompt.startsWith("Camisetas."), proprio[1].prompt.slice(0, 40));
    /* o TÍTULO continua o da coleção: é por ele que a pessoa reconhece a peça
       na bancada, e é a coleção que ela vai aprovar */
    assert.match(proprio[1].titulo, /Ofertas/);

    /* nenhuma delas pede ponto de venda */
    for (const capa of [...comNicho, ...proprio]) {
      assert.match(capa.prompt, /sem fachada de loja, sem vitrine e sem letreiro/);
    }
  });
});

/**
 * O BANNER TEM ASSUNTO, e a CAPA não é o banner de novo.
 *
 * Duas queixas do dono na mesma loja de fitness. A primeira: o segundo banner
 * voltou um retângulo verde liso, sem produto nenhum. A segunda: as capas de
 * coleção saíram com a mesma cara do banner.
 *
 * As duas têm a mesma raiz — o pedido não dizia o que fotografar. "Artigos de
 * treino" não é objeto, e o modelo, sem assunto, obedeceu ao resto do pedido
 * ("fundo liso", "margem larga") e devolveu só o fundo. E metade dos
 * enquadramentos de capa era emprestada do banner, então a página inteira
 * parecia a mesma campanha repetida.
 */
test("banner pede uma coisa que existe; capa fala a língua do catálogo", async () => {
  await comServidor(async (server) => {
    const { pecasDaMarca } = await server.ssrLoadModule("/lib/marca-imagens.ts");
    const { NICHOS } = await server.ssrLoadModule("/lib/marca-generator.mjs");

    for (const nicho of NICHOS) {
      const pecas = pecasDaMarca({ name: "X", primaryColor: "#123456", backgroundColor: "#ffffff", nicheId: nicho.id });
      const de = (chave) => pecas.find((peca) => peca.chave === chave).prompt;

      /* todo nicho declara o que a câmera vê, nas duas cenas */
      assert.ok(nicho.cenas?.pessoa && nicho.cenas?.produto, `nicho ${nicho.id} sem cenas declaradas`);
      assert.ok(de("banner-1").startsWith(nicho.cenas.pessoa), `banner-1 de ${nicho.id} não abre pela cena`);
      assert.ok(de("banner-2").startsWith(nicho.cenas.produto), `banner-2 de ${nicho.id} não abre pela cena`);
      /* e nenhum dos dois abre pela palavra do ramo, que é o que esvaziou o quadro */
      assert.ok(!de("banner-2").startsWith(nicho.produto), `banner-2 de ${nicho.id} voltou a abrir pelo nome do ramo`);

      /* as duas famílias, separadas: banner é CENA, capa é CATÁLOGO */
      for (const chave of ["banner-1", "banner-2"]) {
        assert.match(de(chave), /campanha/, `${chave} de ${nicho.id} deixou de ser cena de campanha`);
      }
      const capas = pecas.filter((peca) => peca.papel === "colecao");
      assert.ok(capas.length, `nicho ${nicho.id} sem capa`);
      for (const capa of capas) {
        assert.match(capa.prompt, /Fotografia de catálogo/, "a capa voltou a pedir campanha");
        assert.match(capa.prompt, /Sem pessoas no quadro/, "capa com gente é o banner de novo");
        assert.ok(!/em close/.test(capa.prompt), "close é o enquadramento do banner 2");
      }
      /* e duas capas vizinhas nunca caem no mesmo enquadramento */
      const molduras = capas.map((capa) => capa.prompt.match(/Enquadramento: ([^.]+)\./)?.[1]);
      assert.equal(new Set(molduras).size, molduras.length, `capas repetidas em ${nicho.id}`);

      /* e a cor da marca não pinta o produto, em peça nenhuma */
      for (const peca of [...capas, { prompt: de("banner-1") }, { prompt: de("banner-2") }]) {
        assert.match(peca.prompt, /cada produto mantém as cores reais dele/);
      }
    }
  });
});
