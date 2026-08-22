import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { strToU8, zipSync } from "fflate";

import { DEFINICOES, IDIOMAS, IDIOMA_PADRAO, formatarDinheiro, formatoDeDinheiro, idiomaDe } from "../lib/idiomas.mjs";
import { TEXTOS } from "../lib/textos.mjs";
import { NICHOS_TRADUZIDOS, nichoNoIdioma } from "../lib/nichos-textos.mjs";
import { TRADUCAO_DE_TEMA } from "../lib/traducao-tema.mjs";
import { modeloPadrao, normalizeCustomization } from "../lib/business-rules.mjs";
import { NICHOS, gerarMarca } from "../lib/marca-generator.mjs";
import { brandCustomization } from "../lib/site-generator.mjs";

/**
 * A LOJA FALA UM IDIOMA SÓ, e é o que a pessoa escolheu.
 *
 * Estes testes existem porque o defeito desta funcionalidade não é ela não
 * funcionar: é ela funcionar PELA METADE. Meia dúzia de campos esquecidos numa
 * tabela e a loja em inglês abre com o FAQ em português — e isso não aparece em
 * teste de unidade nenhum, só na tela do cliente.
 */

test("o idioma é resolvido sem nunca estourar, e o que não se reconhece é português", () => {
  assert.equal(idiomaDe("en"), "en");
  assert.equal(idiomaDe("es"), "es");
  assert.equal(idiomaDe("pt-BR"), "pt-BR");
  /* a FAMÍLIA decide: e o que chega de navegador e de tema de outra loja */
  assert.equal(idiomaDe("pt"), "pt-BR");
  assert.equal(idiomaDe("en-US"), "en");
  assert.equal(idiomaDe("es_MX"), "es");
  assert.equal(idiomaDe("PT-br"), "pt-BR");
  /**
   * E o desconhecido cai no PADRÃO, sem exceção.
   *
   * Não é tolerância a lixo: é que toda loja gravada antes desta tela não
   * declara idioma nenhum, e ela é portuguesa. Estourar aqui derrubaria a
   * abertura de todo projeto antigo.
   */
  for (const valor of [undefined, null, "", "  ", "klingon", 42, {}, []]) {
    assert.equal(idiomaDe(valor), IDIOMA_PADRAO, `"${String(valor)}" deveria cair no padrão`);
  }
});

test("o dinheiro muda de símbolo e de pontuação, e NÃO muda de valor", () => {
  /**
   * A decisão está escrita em `idiomas.mjs` e é do dono: o símbolo acompanha o
   * idioma e o número fica igual. Converter exigiria um câmbio e uma data que
   * ninguém forneceu, e inventar câmbio é pior que rotular. O catálogo é
   * demonstração — quem publica troca pelos preços dele.
   *
   * O teste trava justamente o que seria fácil alguém "consertar" sem saber:
   * os três formatos saem do MESMO número de centavos.
   */
  assert.equal(formatarDinheiro(131100, "pt-BR"), "R$ 1.311,00");
  assert.equal(formatarDinheiro(131100, "en"), "$1,311.00");
  assert.equal(formatarDinheiro(131100, "es"), "1.311,00 €");
  /* os centavos não se perdem em nenhum dos três */
  assert.equal(formatarDinheiro(599, "pt-BR"), "R$ 5,99");
  assert.equal(formatarDinheiro(599, "en"), "$5.99");
  assert.equal(formatarDinheiro(599, "es"), "5,99 €");
  assert.equal(formatarDinheiro(0, "en"), "$0.00");
  assert.equal(formatarDinheiro(-1250, "en"), "-$12.50");
  assert.equal(formatarDinheiro(-1250, "es"), "-12,50 €");

  /* e o formato que vai para o Liquid casa com o que escrevemos: dois formatos
     na mesma página é o tipo de coisa que só aparece na loja */
  for (const codigo of IDIOMAS) {
    const { moeda } = DEFINICOES[codigo];
    assert.ok(formatoDeDinheiro(codigo).includes(moeda.simbolo), `${codigo}: o formato do Liquid perdeu o símbolo`);
  }
});

test("os três idiomas têm exatamente as MESMAS chaves de texto", () => {
  /**
   * O guarda mais importante deste arquivo.
   *
   * Uma chave que existe em português e falta em inglês não quebra nada: ela
   * cai no `undefined` e vira um campo vazio, ou pior, sobra a frase portuguesa
   * no meio da loja. Nenhum dos dois aparece em teste de comportamento — só na
   * tela do cliente, depois de entregue.
   */
  const caminhos = (objeto, prefixo = "") => {
    const saida = [];
    for (const [chave, valor] of Object.entries(objeto)) {
      const caminho = prefixo ? `${prefixo}.${chave}` : chave;
      if (valor && typeof valor === "object" && !Array.isArray(valor)) saida.push(...caminhos(valor, caminho));
      else saida.push(`${caminho}:${Array.isArray(valor) ? `[${valor.length}]` : typeof valor}`);
    }
    return saida.sort();
  };
  const referencia = caminhos(TEXTOS["pt-BR"]);
  for (const codigo of IDIOMAS) {
    assert.deepEqual(caminhos(TEXTOS[codigo]), referencia, `${codigo}: a tabela de textos divergiu do português`);
  }
  /* e nenhuma frase ficou por traduzir por copiar e colar: fora os nomes
     próprios e o que é igual nas três línguas, o texto tem de ser OUTRO */
  assert.notEqual(TEXTOS.en.modelo.faq.title, TEXTOS["pt-BR"].modelo.faq.title);
  assert.notEqual(TEXTOS.es.modelo.faq.title, TEXTOS["pt-BR"].modelo.faq.title);
  assert.notEqual(TEXTOS.en.modelo.cart.checkoutLabel, TEXTOS["pt-BR"].modelo.cart.checkoutLabel);
});

test("o modelo da loja volta no idioma pedido, e sem idioma volta em português", () => {
  const pt = modeloPadrao("pt-BR");
  const en = modeloPadrao("en");
  const es = modeloPadrao("es");

  assert.equal(pt.announcement.text, "FRETE GRÁTIS EM PEDIDOS SELECIONADOS");
  assert.equal(en.announcement.text, "FREE SHIPPING ON SELECTED ORDERS");
  assert.equal(es.announcement.text, "ENVÍO GRATIS EN PEDIDOS SELECCIONADOS");
  /* cor e medida NÃO têm idioma, e continuar iguais é o que prova que só o
     texto se moveu */
  assert.equal(en.announcement.background, pt.announcement.background);
  assert.equal(en.global.contentWidth, pt.global.contentWidth);
  /* o preço de demonstração acompanha a moeda */
  assert.match(pt.products.items[0].price, /^R\$/);
  assert.match(en.products.items[0].price, /^\$/);
  assert.match(es.products.items[0].price, /€$/);

  /**
   * E o CHÃO da normalização é o modelo NO IDIOMA da loja.
   *
   * Era o modelo em português, sempre: todo campo que o cliente não preencheu
   * voltava em português no meio de uma loja em inglês. É o defeito mais caro
   * desta funcionalidade, porque são dezenas de campos e ninguém preenche
   * todos.
   */
  const semNada = normalizeCustomization({ global: { language: "en" } });
  assert.equal(semNada.cart.checkoutLabel, "Checkout");
  assert.equal(semNada.search.placeholder, "What are you looking for?");
  assert.equal(semNada.faq.items[0].question, "How long does shipping take?");

  /* loja gravada ANTES desta tela não declara idioma, e ela é portuguesa */
  const antiga = normalizeCustomization({ header: { brand: "Sem idioma" } });
  assert.equal(antiga.global.language, "pt-BR");
  assert.equal(antiga.cart.checkoutLabel, "Finalizar compra");
});

test("todo nicho tem tradução completa, e o nome da marca NÃO traduz", () => {
  for (const nicho of NICHOS) {
    for (const codigo of ["en", "es"]) {
      const tabela = NICHOS_TRADUZIDOS[codigo][nicho.id];
      assert.ok(tabela, `${codigo}: falta o nicho ${nicho.id}`);
      /* a CONTAGEM tem de bater: uma coleção a menos deixa um cartão vazio na
         vitrine, e três perguntas viram duas no FAQ sem ninguém notar */
      assert.equal(tabela.colecoes.length, nicho.colecoes.length, `${codigo}/${nicho.id}: coleções`);
      assert.equal(tabela.beneficios.length, nicho.beneficios.length, `${codigo}/${nicho.id}: benefícios`);
      assert.equal(tabela.perguntas.length, nicho.perguntas.length, `${codigo}/${nicho.id}: perguntas`);
      assert.equal(tabela.manchetes.length, nicho.manchetes.length, `${codigo}/${nicho.id}: manchetes`);
      for (const [pergunta, resposta] of tabela.perguntas) {
        assert.ok(pergunta.trim() && resposta.trim(), `${codigo}/${nicho.id}: pergunta ou resposta vazia`);
      }
    }
  }

  /**
   * A MARCA é a mesma nos três idiomas, e isso é decisão, não esquecimento.
   *
   * Raízes e sufixos não entram na tradução porque nome próprio não se traduz:
   * "Hora Watches" é a mesma marca em qualquer língua. Traduzi-los faria a
   * loja MUDAR DE NOME ao trocar a tela de idioma — com a logo, o slug e a
   * identidade inteira atrás.
   */
  const nomes = IDIOMAS.map((codigo) => gerarMarca({ nicheId: "relogios", semente: "prova", idioma: codigo }).name);
  assert.equal(new Set(nomes).size, 1, `a marca mudou de nome ao trocar de idioma: ${nomes.join(" / ")}`);

  /* mas tudo o que é TEXTO muda */
  const pt = gerarMarca({ nicheId: "relogios", semente: "prova", idioma: "pt-BR" });
  const en = gerarMarca({ nicheId: "relogios", semente: "prova", idioma: "en" });
  assert.notEqual(en.slogan, pt.slogan);
  assert.notEqual(en.collections.join(), pt.collections.join());
  assert.notEqual(en.faq[0].pergunta, pt.faq[0].pergunta);
  assert.notEqual(en.announcement, pt.announcement);
  assert.equal(en.idioma, "en");
  /* e o nicho sem tradução volta como veio, em vez de voltar vazio */
  assert.deepEqual(nichoNoIdioma({ id: "inexistente", nome: "X" }, "en"), { id: "inexistente", nome: "X" });
});

test("a cópia da marca acompanha o idioma", () => {
  const pt = brandCustomization({ name: "Hora Watches", idioma: "pt-BR" });
  const en = brandCustomization({ name: "Hora Watches", idioma: "en" });
  const es = brandCustomization({ name: "Hora Watches", idioma: "es" });
  assert.equal(pt.hero.eyebrow, "LOJA OFICIAL");
  assert.equal(en.hero.eyebrow, "OFFICIAL STORE");
  assert.equal(es.hero.eyebrow, "TIENDA OFICIAL");
  /* o NOME da marca atravessa os três sem ser tocado */
  for (const c of [pt, en, es]) assert.ok(c.footer.copyright.includes("Hora Watches"));
  assert.match(en.footer.copyright, /All rights reserved/);
  assert.match(es.footer.copyright, /derechos reservados/);
});

test("a rede de tradução do tema cobre os mesmos assuntos nos dois idiomas", () => {
  const chavesEn = Object.keys(TRADUCAO_DE_TEMA.en).sort();
  const chavesEs = Object.keys(TRADUCAO_DE_TEMA.es).sort();
  assert.deepEqual(chavesEn, chavesEs, "a rede divergiu entre inglês e espanhol");
  /* os marcadores do tema passam INTEIROS: é o Liquid que os preenche, e um
     `{{ price }}` traduzido vira texto literal na tela */
  for (const [codigo, tabela] of Object.entries(TRADUCAO_DE_TEMA)) {
    for (const [chave, valor] of Object.entries(tabela)) {
      const doPt = /\{\{\s*(price|title|terms|quantity|product|count|collection_name)\s*\}\}/g;
      const marcadores = [...String(valor).matchAll(doPt)].map((m) => m[1]).sort();
      if (chave.includes("_html") || /\{\{/.test(valor)) {
        assert.ok(marcadores.length > 0, `${codigo}/${chave}: perdeu o marcador do Liquid`);
      }
    }
  }
  /* e o português não tem rede: os temas daqui já são portugueses */
  assert.equal(TRADUCAO_DE_TEMA["pt-BR"], undefined);
});

/**
 * O ARQUIVO DE TRADUÇÃO DO TEMA é escolhido pelo CONTEÚDO, não pelo nome.
 *
 * Medido no acervo: num Dawn baixado de uma loja brasileira, `locales/en.json`
 * está byte a byte igual ao `pt-BR.default.json` — a Shopify renomeia o arquivo
 * padrão ao trocar o idioma da loja e deixa uma cópia no nome antigo. Confiar
 * no nome entregava uma loja "em inglês" com o carrinho inteiro em português.
 */
test("locale que é cópia do padrão não conta como tradução", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, themeFilesFromZip } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { renderThemePage } = await server.ssrLoadModule("/lib/theme-render.ts");

    const emPortugues = JSON.stringify({ products: { product: { add_to_cart: "Adicionar ao carrinho" } } });
    const emEspanhol = JSON.stringify({ products: { product: { add_to_cart: "Agregar al carrito" } } });
    const schema = JSON.stringify([{ name: "theme_info", theme_name: "T", theme_version: "1", theme_author: "a" }]);
    const zip = zipSync(Object.fromEntries(Object.entries({
      "config/settings_schema.json": schema,
      "config/settings_data.json": JSON.stringify({ current: {} }),
      "layout/theme.liquid": "<html><body>{{ content_for_layout }}</body></html>",
      "sections/hero.liquid": `<p>botao={{ 'products.product.add_to_cart' | t }}</p>{% schema %}{"name":"Hero"}{% endschema %}`,
      "templates/index.json": JSON.stringify({ sections: { hero: { type: "hero", settings: {} } }, order: ["hero"] }),
      /* o padrão do tema é português, o "inglês" é uma CÓPIA dele, e o
         espanhol é tradução de verdade — o retrato exato do acervo */
      "locales/pt-BR.default.json": emPortugues,
      "locales/en.json": emPortugues,
      "locales/es.json": emEspanhol,
    }).map(([caminho, valor]) => [`Tema/${caminho}`, strToU8(valor)])));

    const theme = extractShopifyThemeBytes(zip, "copia.zip");
    const files = themeFilesFromZip(zip);
    const desenhar = (idioma) => renderThemePage({ theme, files, pageId: "index", assetBase: (p) => `/x/${p}`, idioma });

    /* espanhol: o tema tem tradução de verdade, e ELE vence */
    assert.match(await desenhar("es"), /botao=Agregar al carrito/);
    /* português: o padrão do próprio tema */
    assert.match(await desenhar("pt-BR"), /botao=Adicionar ao carrinho/);
    /**
     * inglês: o arquivo existe, é cópia, e a REDE assume. Sem isto a loja
     * abriria com o botão em português — e o `en.json` no ZIP faria parecer
     * que a tradução estava lá.
     */
    const emIngles = await desenhar("en");
    assert.match(emIngles, /botao=Add to cart/);
    /* o CORPO, sem o script do carrinho: aquele runtime leva comentarios em
       portugues de propósito — quem os le e quem mantem o motor, nao o
       comprador — e procurar a palavra na pagina inteira acusaria uma sobra
       que nao existe */
    const corpo = emIngles.replace(/<script[\s\S]*?<\/script>/g, "");
    assert.doesNotMatch(corpo, /Adicionar ao carrinho/);
  } finally {
    await server.close();
  }
});

test("o produto muda de idioma inteiro: nome, descrição e catálogo", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");
    const { CATALOGO_TRADUZIDO } = await server.ssrLoadModule("/lib/catalogo-idiomas.ts");
    const { nomeDeVitrine, descricaoDoProduto } = await server.ssrLoadModule("/lib/nome-de-produto.ts");

    /**
     * TODO produto do acervo tem os dois campos nos dois idiomas.
     *
     * Nome sem título deixaria o cartão em inglês e a página do produto em
     * português — a descrição é DERIVADA do título, não escrita. Por isso os
     * dois juntos, e por isso a contagem é cobrada aqui.
     */
    const doAcervo = Object.values(PRODUTOS_POR_NICHO).flat();
    for (const codigo of ["en", "es"]) {
      const tabela = CATALOGO_TRADUZIDO[codigo];
      for (const produto of doAcervo) {
        const traduzido = tabela[produto.handle];
        assert.ok(traduzido, `${codigo}: falta o produto ${produto.handle}`);
        assert.ok(traduzido.nome.trim(), `${codigo}/${produto.handle}: nome vazio`);
        assert.ok(traduzido.titulo.trim(), `${codigo}/${produto.handle}: título vazio`);
        /* 48 é o que cabe em duas linhas no cartão do Dawn; passar disso é o
           bloco de quatro linhas que empurra o preço para fora */
        assert.ok(traduzido.nome.length <= 48, `${codigo}/${produto.handle}: nome com ${traduzido.nome.length} caracteres`);
        /**
         * E o título fica ABAIXO de 118 caracteres, que é onde a coleta cortou
         * os originais. O motor usa esse comprimento para descartar o pedaço de
         * palavra do fim; um título traduzido mais longo perderia um trecho
         * inteiro sem motivo, porque nada aqui foi cortado.
         */
        assert.ok(traduzido.titulo.length < 118, `${codigo}/${produto.handle}: título com ${traduzido.titulo.length} caracteres seria cortado`);
      }
      /* e nada de handle que não existe mais: tradução órfã é trabalho que não
         chega a loja nenhuma */
      const doCatalogo = new Set(doAcervo.map((p) => p.handle));
      for (const handle of Object.keys(tabela)) {
        assert.ok(doCatalogo.has(handle), `${codigo}: ${handle} não existe mais no catálogo`);
      }
    }

    const relogio = PRODUTOS_POR_NICHO.relogios[0];
    assert.notEqual(nomeDeVitrine(relogio, "en"), nomeDeVitrine(relogio, "pt-BR"));
    assert.notEqual(descricaoDoProduto(relogio, "en"), descricaoDoProduto(relogio, "pt-BR"));
    /* a nota é da ORIGEM nos três idiomas, e o texto diz isso */
    assert.match(descricaoDoProduto(relogio, "pt-BR"), /na origem/);
    assert.match(descricaoDoProduto(relogio, "en"), /at the source/);
    assert.match(descricaoDoProduto(relogio, "es"), /en el origen/);
    /* produto que o extrator traga amanhã e que ninguém traduziu ainda sai no
       idioma de origem — visível e corrigível — em vez de sumir da vitrine */
    const novo = { handle: "produto-que-nao-existe-000000", title: "Coisa nova do fornecedor" };
    assert.ok(nomeDeVitrine(novo, "en").length > 0);
  } finally {
    await server.close();
  }
});

test("o idioma viaja no marcador e volta na reimportação", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const shopifyTheme = await server.ssrLoadModule("/lib/shopify-theme.ts");
    /**
     * Pelo mesmo motivo do nicho e das capas: sem o idioma no marcador, ele
     * existia só no banco desta máquina, e a loja em inglês voltava em
     * português assim que alguém a reabria noutro computador.
     */
    const marcador = JSON.parse(shopifyTheme.marcadorDaLoja("relogios", {}, { nome: "Hora", slug: "hora", idioma: "en" }));
    assert.equal(marcador.orbisIdioma, "en");
    /* sem idioma declarado o campo nem aparece: marcador com campo vazio faz
       quem lê achar que a loja disse "sem idioma" */
    const semIdioma = JSON.parse(shopifyTheme.marcadorDaLoja("relogios", {}, { nome: "Hora", slug: "hora" }));
    assert.equal(semIdioma.orbisIdioma, undefined);
  } finally {
    await server.close();
  }
});

test("a tela de idiomas lê do registro, e não de uma lista repetida", async () => {
  const { readFile } = await import("node:fs/promises");
  const tela = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  /* lista de idioma digitada na tela é a segunda fonte da verdade, e ela fica
     para trás no dia em que um quarto idioma entrar */
  assert.match(tela, /IDIOMAS\.map|\(IDIOMAS as string\[\]\)\.map/);
  assert.match(tela, /DEFINICOES\[/);
  /* e o pedido leva o idioma: sem isto a escolha morre na tela */
  assert.match(tela, /idioma,/);
  /* trocar de idioma REGERA a marca: manchete, coleções e FAQ vêm do nicho
     traduzido, e deixá-los como estavam entregaria meia loja em cada língua */
  assert.match(tela, /function trocarIdioma/);
  assert.match(tela, /setMarca\(marcaGerada\(nicheId, semente, lerEdicoes\(nicheId\), codigo\)\)/);
});

/**
 * O TEXTO QUE O TEMA JÁ TRAZIA ESCRITO também muda de língua.
 *
 * É a metade que faltou na primeira volta, e o cliente a viu na tela: as
 * coleções em inglês com "Nossas Coleções" por cima, "Ofertas Imperdíveis" no
 * meio da página e "Links rápidos" no rodapé. Não são chaves de tradução — são
 * settings que o lojista da loja de ORIGEM digitou, e a regra "só escreve onde
 * o tema não escreveu nada de próprio" os protegia.
 *
 * Medido no Dawn do acervo, gerando uma loja de roupas em inglês: 24 settings
 * em português antes, 1 depois — e o que sobra é um marcador do importador que
 * só aparece no Editor.
 */
test("o texto próprio do tema muda de língua, e só quando a língua difere", async () => {
  const server = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { extractShopifyThemeBytes, idiomaDoConteudoDoTema } = await server.ssrLoadModule("/lib/shopify-theme.ts");
    const { aplicarMarcaNoTema } = await server.ssrLoadModule("/lib/shopify-brand.ts");

    const schema = JSON.stringify([{ name: "theme_info", theme_name: "T", theme_version: "1", theme_author: "a" }]);
    const secao = (nome, settings) => `<div></div>{% schema %}${JSON.stringify({ name: nome, settings })}{% endschema %}`;
    const zip = zipSync(Object.fromEntries(Object.entries({
      "config/settings_schema.json": schema,
      "config/settings_data.json": JSON.stringify({ current: {} }),
      "layout/theme.liquid": "{{ content_for_layout }}",
      "sections/collection-list.liquid": secao("Lista", [{ type: "text", id: "title", label: "Título" }]),
      "templates/index.json": JSON.stringify({
        sections: { lista: { type: "collection-list", settings: { title: "Nossas Coleções" } } },
        order: ["lista"],
      }),
      /* é o arquivo de tradução PADRÃO que declara a língua do tema */
      "locales/pt-BR.default.json": JSON.stringify({ general: {} }),
    }).map(([caminho, valor]) => [`Tema/${caminho}`, strToU8(valor)])));

    const base = extractShopifyThemeBytes(zip, "pt.zip");
    assert.equal(idiomaDoConteudoDoTema(base), "pt-BR", "o tema declara a língua no nome do locale padrão");

    const titulo = (idioma) => {
      const { theme } = aplicarMarcaNoTema(base, { name: "Aurora", idioma, primaryColor: "#111111", backgroundColor: "#ffffff" });
      return theme.pages.find((p) => p.id === "index").sections[0].settings.title;
    };
    assert.equal(titulo("en"), "Our collections");
    assert.equal(titulo("es"), "Nuestras colecciones");
    /**
     * E a loja em PORTUGUÊS sobre tema português não encosta em nada.
     *
     * É a metade que protege o dono: sobrescrever o que o lojista digitou é
     * apagar decisão dele, e só a diferença de língua autoriza a troca.
     */
    assert.equal(titulo("pt-BR"), "Nossas Coleções");

    /* tema sem locale padrão não declara língua, e sem declaração não se mexe:
       adivinhar aqui trocaria texto certo por texto traduzido à toa */
    const arquivosSemLocale = {
      "config/settings_schema.json": schema,
      "config/settings_data.json": JSON.stringify({ current: {} }),
      "layout/theme.liquid": "{{ content_for_layout }}",
      "sections/collection-list.liquid": secao("Lista", [{ type: "text", id: "title", label: "Título" }]),
      "templates/index.json": JSON.stringify({ sections: { lista: { type: "collection-list", settings: { title: "Nossas Coleções" } } }, order: ["lista"] }),
    };
    const zipSemLocale = zipSync(Object.fromEntries(Object.entries(arquivosSemLocale).map(([caminho, valor]) => [`Tema/${caminho}`, strToU8(valor)])));
    const semLocale = extractShopifyThemeBytes(zipSemLocale, "sem-locale.zip");
    assert.equal(idiomaDoConteudoDoTema(semLocale), "");
    const { theme: intocado } = aplicarMarcaNoTema(semLocale, { name: "Aurora", idioma: "en", primaryColor: "#111111", backgroundColor: "#ffffff" });
    assert.equal(intocado.pages.find((p) => p.id === "index").sections[0].settings.title, "Nossas Coleções");

    /* e a MARCA passa a ser dona do tema, para o rodapé parar de dizer o nome
       do tema de origem: era o "© 2026, Dawn" na loja do cliente */
    const { theme: comMarca } = aplicarMarcaNoTema(base, { name: "Aurora Wear", idioma: "en", primaryColor: "#111111", backgroundColor: "#ffffff" });
    assert.equal(comMarca.orbisLoja?.nome, "Aurora Wear");
    assert.equal(comMarca.orbisLoja?.slug, "aurora-wear");
  } finally {
    await server.close();
  }
});

test("o distribuidor não repete o mesmo título em duas seções iguais", async () => {
  const { distribuidorDeTextos } = await import("../lib/textos-do-tema.mjs");
  const dar = distribuidorDeTextos("en");
  /* a home tem DUAS `featured-collection`; as duas com o mesmo nome seriam duas
     vitrines chamadas a mesma coisa */
  assert.equal(dar("featured-collection.title"), "You may also like");
  assert.equal(dar("featured-collection.title"), "Special offers");
  /* acabando a lista, a última repete: repetir é feio, ficar em português é pior */
  const ultimo = dar("featured-collection.title");
  assert.equal(dar("featured-collection.title"), ultimo);
  /* chave que ninguém traduziu devolve nada, e o texto do tema fica como veio */
  assert.equal(dar("secao-desconhecida.title"), undefined);
  /* português não tem tabela: tema daqui já fala a língua da loja */
  assert.equal(distribuidorDeTextos("pt-BR")("collection-list.title"), undefined);
});

test("os marcadores do tema atravessam a tradução inteiros", async () => {
  const { CONTEUDO_DE_TEMA } = await import("../lib/textos-do-tema.mjs");
  /* `[amount]`, `[timer]` e `[amount_saved]` são preenchidos pelo tema; um
     marcador traduzido vira texto morto na tela do comprador */
  const chavesEn = Object.keys(CONTEUDO_DE_TEMA.en).sort();
  assert.deepEqual(chavesEn, Object.keys(CONTEUDO_DE_TEMA.es).sort(), "as duas tabelas divergiram");
  for (const [codigo, tabela] of Object.entries(CONTEUDO_DE_TEMA)) {
    for (const [chave, lista] of Object.entries(tabela)) {
      for (const texto of lista) {
        for (const marcador of ["[amount]", "[timer]", "[amount_saved]"]) {
          const noPt = chave.includes("progress_message") && marcador === "[amount]"
            || chave.includes("timer_text") && marcador === "[timer]"
            || chave.includes("_caption") && marcador === "[amount_saved]";
          if (noPt) assert.ok(texto.includes(marcador), `${codigo}/${chave} perdeu ${marcador}`);
        }
      }
    }
  }
});

/**
 * OS DEZ NICHOS, NAS TRES LINGUAS, sem uma palavra fora do lugar.
 *
 * O defeito desta funcionalidade nunca foi um nicho quebrado: foi UM campo
 * esquecido em UM nicho, que ninguem ve ate a loja daquele nicho ser gerada. Um
 * teste por nicho e caro e nao cobre o que importa; este varre os trinta pares
 * de uma vez, sobre a marca inteira que cada nicho produz.
 *
 * O detector usa so o que NAO existe em espanhol — `-cao/-coes/-oes`, `voce`,
 * `nao`, `frete`, `preco`, `nossa`, `tambem`, `ate`, `mais` —, senao a loja em
 * espanhol se acusaria sozinha.
 */
test("os 10 nichos geram marca inteira nos 3 idiomas, sem sobra de portugues", async () => {
  const { NICHOS: nichos, gerarMarca: gerar } = await import("../lib/marca-generator.mjs");
  const { textosDoIdioma: textos } = await import("../lib/textos.mjs");

  const SO_PORTUGUES = /\b\w*(ção|ções|ões)\b|\b(você|vocês|não|frete|preço|preços|nossa|nosso|nossas|nossos|também|até|mais|são|seu|sua|seus|suas|então)\b/i;

  for (const nicho of nichos) {
    for (const idioma of ["en", "es"]) {
      const marca = gerar({ nicheId: nicho.id, semente: "varredura", idioma });
      /* TUDO o que o nicho manda para a loja, num saco só: manchete, descrição,
         faixa de anúncio, coleções, benefícios e as três perguntas do FAQ */
      const doNicho = [
        marca.slogan,
        marca.description,
        marca.announcement,
        ...marca.collections,
        ...marca.benefits,
        ...marca.faq.flatMap((item) => [item.pergunta, item.resposta]),
      ];
      for (const frase of doNicho) {
        assert.ok(
          !SO_PORTUGUES.test(String(frase)),
          `${nicho.id}/${idioma}: sobrou português em ${JSON.stringify(frase)}`,
        );
      }
      /* e nada VAZIO: um campo em branco não acusa português, mas deixa a loja
         com uma seção muda, que é o mesmo estrago pelo outro lado */
      for (const frase of doNicho) assert.ok(String(frase ?? "").trim().length > 0, `${nicho.id}/${idioma}: campo vazio`);
      /* as contagens acompanham o português: coleção a menos é cartão vazio na
         vitrine, pergunta a menos é FAQ mais curto sem ninguém notar */
      const emPortugues = gerar({ nicheId: nicho.id, semente: "varredura", idioma: "pt-BR" });
      assert.equal(marca.collections.length, emPortugues.collections.length, `${nicho.id}/${idioma}: coleções`);
      assert.equal(marca.benefits.length, emPortugues.benefits.length, `${nicho.id}/${idioma}: benefícios`);
      assert.equal(marca.faq.length, emPortugues.faq.length, `${nicho.id}/${idioma}: FAQ`);
      /* e a frase de cola do nicho é a do idioma, não a portuguesa */
      assert.ok(marca.announcement.includes(textos(idioma).marca.envio), `${nicho.id}/${idioma}: a faixa não usou a frase de envio do idioma`);
    }
  }
});

test("o cartão de nicho da tela acompanha o idioma escolhido", async () => {
  const { readFile } = await import("node:fs/promises");
  const tela = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  /**
   * O cartão diz o que a loja VENDE, e quem o lê acabou de escolher a língua
   * dela. "Roupas e moda" logo abaixo de uma escolha de inglês faz a pessoa
   * duvidar se a escolha pegou. O rótulo do app em volta continua português: o
   * app é a ferramenta, a loja é o produto.
   */
  assert.match(tela, /nichosNoIdioma/);
  assert.match(tela, /nichoNoIdioma\(nicho, idioma\)/);
  /* e a lista traduzida é a MESMA em todo lugar: o cartão, o resumo da revisão
     e a linha do catálogo. Duas fontes divergem na primeira mudança. */
  assert.doesNotMatch(tela, /NICHOS\.find\(/, "a revisão voltou a ler o nicho em português");
});
