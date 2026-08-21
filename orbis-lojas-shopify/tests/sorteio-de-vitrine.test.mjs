import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * DUAS LOJAS DO MESMO TEMA NAO PODEM SER A MESMA LOJA.
 *
 * O sorteio existe para isso, e o risco dele e exatamente o oposto: mexer onde
 * ninguem pediu. Este arquivo cerca os dois lados — que a ordem MUDE entre
 * clientes, e que ela nao arraste nada que tenha dono.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

async function comModulo(caminho, trabalho) {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try { return await trabalho(await server.ssrLoadModule(caminho)); } finally { await server.close(); }
}

const secao = (id, type, blocos = []) => ({ id, type, name: type, settings: {}, blocks: blocos });
const bloco = (id, type) => ({ id, type, settings: {} });

/** Uma home com tres vagas equivalentes, duas unicas e uma secao de tres slides. */
function temaDeTeste() {
  return {
    pages: [
      {
        id: "index", name: "Inicio", template: "templates/index.json",
        sections: [
          secao("s1", "image-banner"),
          secao("s2", "featured-collection"),
          secao("s3", "image-banner"),
          secao("s4", "slideshow", [bloco("b1", "slide"), bloco("b2", "slide"), bloco("b3", "slide")]),
          secao("s5", "image-banner"),
          secao("s6", "newsletter"),
        ],
      },
      {
        id: "product", name: "Produto", template: "templates/product.json",
        sections: [secao("p1", "main-product", [bloco("t1", "text"), bloco("t2", "text")]), secao("p2", "related-products")],
      },
    ],
  };
}

const ordem = (tema, pagina = "index") => tema.pages.find((p) => p.id === pagina).sections.map((s) => s.id);
const tipos = (tema, pagina = "index") => tema.pages.find((p) => p.id === pagina).sections.map((s) => s.type);

test("a mesma semente devolve sempre a mesma loja", async () => {
  await comModulo("/lib/sorteio-de-vitrine.ts", ({ sortearVitrine }) => {
    /**
     * Aleatorio de verdade faria a previa mostrar uma loja e o ZIP sair com
     * outra, e regerar embaralharia a loja que o cliente ja aprovou. E por isso
     * que o sorteio e deterministico, e nao apesar disso.
     */
    const uma = sortearVitrine(temaDeTeste(), "cliente-a").theme;
    const outra = sortearVitrine(temaDeTeste(), "cliente-a").theme;
    assert.deepEqual(ordem(uma), ordem(outra));
  });
});

test("clientes diferentes recebem ordens diferentes", async () => {
  await comModulo("/lib/sorteio-de-vitrine.ts", ({ sortearVitrine }) => {
    /* o pedido inteiro em uma linha: dois clientes, duas lojas */
    const ordens = new Set(["a", "b", "c", "d", "e", "f"].map((s) => ordem(sortearVitrine(temaDeTeste(), s).theme).join(",")));
    assert.ok(ordens.size > 1, "seis clientes cairam todos na mesma ordem");
  });
});

test("so irmaos do mesmo tipo trocam de lugar", async () => {
  await comModulo("/lib/sorteio-de-vitrine.ts", ({ sortearVitrine }) => {
    /**
     * A regra que faz isto funcionar em QUALQUER tema importado, sem conhecer o
     * tema: `type` esta no dado. Tres banners sao tres vagas equivalentes; um
     * `newsletter` no fim continua no fim, porque nao ha outro com quem trocar.
     */
    for (const semente of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const sorteado = sortearVitrine(temaDeTeste(), semente).theme;
      assert.deepEqual(tipos(sorteado), tipos(temaDeTeste()), `a sequencia de TIPOS mudou com a semente ${semente}`);
    }
  });
});

test("nada e inventado nem perdido: a saida e uma permutacao", async () => {
  await comModulo("/lib/sorteio-de-vitrine.ts", ({ sortearVitrine }) => {
    /**
     * E o que separa isto do acidente que derrubou uma home para 404: la um
     * valor NOVO e invalido foi escrito num setting. Aqui so se troca a ordem
     * de ids que ja existiam, entao nao ha template a quebrar.
     */
    const antes = temaDeTeste();
    const depois = sortearVitrine(temaDeTeste(), "cliente-a").theme;
    assert.deepEqual(ordem(depois).slice().sort(), ordem(antes).slice().sort());

    const slides = (tema) => tema.pages[0].sections.find((s) => s.type === "slideshow").blocks.map((b) => b.id);
    assert.deepEqual(slides(depois).slice().sort(), slides(antes).slice().sort());
  });
});

test("o sorteio nao sai da home", async () => {
  await comModulo("/lib/sorteio-de-vitrine.ts", ({ sortearVitrine, PAGINA_SORTEADA }) => {
    /**
     * Pagina de produto tem bloco que e ESTRUTURA, nao vitrine: os dois `text`
     * de `main-product` sao pedacos da descricao, e reordena-los seria mexer
     * onde ninguem pediu.
     */
    assert.equal(PAGINA_SORTEADA, "index");
    for (const semente of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const sorteado = sortearVitrine(temaDeTeste(), semente).theme;
      assert.deepEqual(ordem(sorteado, "product"), ["p1", "p2"]);
      assert.deepEqual(sorteado.pages[1].sections[0].blocks.map((b) => b.id), ["t1", "t2"]);
    }
  });
});

test("sem semente, e sorteado duas vezes, o tema fica como esta", async () => {
  await comModulo("/lib/sorteio-de-vitrine.ts", ({ sortearVitrine }) => {
    /* semente vazia seria ruido, nao variedade */
    assert.deepEqual(ordem(sortearVitrine(temaDeTeste(), "").theme), ordem(temaDeTeste()));
    assert.deepEqual(ordem(sortearVitrine(temaDeTeste(), "   ").theme), ordem(temaDeTeste()));

    /**
     * E a trava: aplicar a permutacao duas vezes NAO e o mesmo que aplica-la
     * uma. Sem isto, um tema ja sorteado que passasse de novo pelo motor sairia
     * com uma terceira ordem, e "estavel para aquele cliente" viraria mentira.
     */
    const uma = sortearVitrine(temaDeTeste(), "cliente-a").theme;
    const duas = sortearVitrine(uma, "cliente-a");
    assert.equal(duas.movidos, 0, "sorteou de novo por cima do proprio sorteio");
    assert.deepEqual(ordem(duas.theme), ordem(uma));
  });
});

test("o sorteio roda ANTES da marca, e o contrato de dobra sobrevive", async () => {
  const { readFile } = await import("node:fs/promises");
  const fonte = await readFile(new URL("../lib/shopify-brand.ts", import.meta.url), "utf8");
  const corpo = fonte.slice(fonte.indexOf("export function aplicarMarcaNoTema"));

  /**
   * A ORDEM das duas coisas e o contrato inteiro.
   *
   * As regras de dobra sao POSICIONAIS e pertencem ao dono: "a primeira dobra
   * fica calada e a segunda escreve" foi pedido por escrito, e a frase da
   * segunda vem assada no pixel. Sortear DEPOIS moveria a dobra que escreve
   * para o topo e passaria por cima disso em silencio.
   */
  const sorteio = corpo.indexOf("sortearVitrine(");
  const dobra = corpo.indexOf("dobraDeBanner");
  assert.ok(sorteio > 0, "o sorteio sumiu de aplicarMarcaNoTema");
  assert.ok(dobra > 0, "a logica de dobra sumiu");
  assert.ok(sorteio < dobra, "o sorteio passou para depois da distribuicao de artes");
});

test("duas sementes, duas homes — e as duas com a primeira dobra calada", async () => {
  await comModulo("/lib/shopify-brand.ts", ({ aplicarMarcaNoTema }) => {
    /**
     * A PROVA que interessa, e a que o teste de fonte acima nao da: rodando o
     * motor inteiro, a ordem muda entre clientes E a regra do dono continua
     * valendo em todos eles.
     *
     * Se algum dia o sorteio voltar para depois da distribuicao de artes, este
     * teste cai — a dobra que escreve aparece no topo em alguma das sementes.
     */
    const settingsDoSlide = [
      { id: "image", type: "image_picker", label: "Imagem" },
      { id: "heading", type: "text", label: "Titulo", default: "Image slide" },
      { id: "subheading", type: "text", label: "Subtitulo", default: "Tell your story" },
    ];
    const dobra = (id) => ({
      id, type: "slideshow", name: "Slideshow", settings: {},
      blocks: [{ id: id + "-b", type: "slide", settings: {} }],
    });
    const tema = () => ({
      format: "shopify-os-2.0", themeName: "Tema", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [], globalValues: {},
      sectionSchemas: [{ type: "slideshow", name: "Slideshow", presets: [], settings: [], blocks: [{ type: "slide", name: "Slide", settings: settingsDoSlide }] }],
      pages: [{ id: "index", name: "Inicio", template: "templates/index.json", sections: [dobra("s1"), dobra("s2"), dobra("s3")] }],
    });
    const marca = {
      name: "Marca de Teste", slogan: "Uma frase curta", primaryColor: "#1f2937", backgroundColor: "#ffffff",
      imagens: { "banner-desktop": "/api/media/1111111111111111aaaa", "banner-desktop-2": "/api/media/2222222222222222bbbb" },
    };

    const ordens = new Set();
    for (const semente of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      const { theme } = aplicarMarcaNoTema(tema(), { ...marca, semente });
      const secoes = theme.pages[0].sections;
      ordens.add(secoes.map((s) => s.id).join(","));

      /* o pedido do dono, em toda semente: a primeira nao escreve */
      assert.equal(secoes[0].blocks[0].settings.heading, "", `a primeira dobra escreveu com a semente ${semente}`);
      assert.ok(secoes[1].blocks[0].settings.heading, `a segunda dobra ficou muda com a semente ${semente}`);
    }
    assert.ok(ordens.size > 1, "oito clientes cairam todos na mesma ordem");
  });
});
