import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { NICHOS, fotoDoNicho, gerarLogoSvg, gerarMarca, ilustracaoDataUri, ilustracaoDoNicho, logoDaMarca, logoDataUri, nichoPorId, textoSobre } from "../lib/marca-generator.mjs";
import { generateClientSite, sanitizeBrand } from "../lib/site-generator.mjs";

/**
 * Orbis Criativos: a marca gerada a partir do nicho.
 *
 * O que estes testes travam é o que a tela promete: dez nichos de verdade, uma
 * marca completa para cada um, o mesmo resultado para a mesma semente (é o que
 * permite o servidor refazer a marca da prévia) e a logo entrando no pacote.
 */

test("os nichos cobrem o dropshipping e trazem tudo que a marca precisa", () => {
  assert.ok(NICHOS.length >= 10, `esperava ao menos 10 nichos, veio ${NICHOS.length}`);
  const esperados = ["roupas", "oculos", "relogios", "beleza", "casa", "pet", "fitness", "gadgets", "infantil", "joias"];
  for (const id of esperados) assert.ok(NICHOS.some((nicho) => nicho.id === id), `faltou o nicho ${id}`);
  for (const nicho of NICHOS) {
    assert.ok(nicho.raizes.length >= 4 && nicho.sufixos.length >= 3, `vocabulário curto em ${nicho.id}`);
    assert.ok(nicho.paletas.length >= 2, `poucas paletas em ${nicho.id}`);
    assert.ok(nicho.fontes.length >= 2, `poucos pares de fonte em ${nicho.id}`);
    assert.ok(nicho.colecoes.length >= 4, `poucas coleções em ${nicho.id}`);
    assert.ok(nicho.beneficios.length >= 3 && nicho.perguntas.length >= 3, `conteúdo incompleto em ${nicho.id}`);
    for (const paleta of nicho.paletas) {
      for (const cor of [paleta.primaria, paleta.fundo, paleta.destaque]) assert.match(cor, /^#[0-9a-f]{6}$/);
    }
  }
});

test("gerarMarca devolve identidade completa para todo nicho", () => {
  for (const nicho of NICHOS) {
    const marca = gerarMarca({ nicheId: nicho.id, semente: "teste" });
    assert.ok(marca.name.trim().length >= 3, `nome vazio em ${nicho.id}`);
    assert.ok(marca.slogan && marca.description, `copy faltando em ${nicho.id}`);
    assert.match(marca.primaryColor, /^#[0-9a-f]{6}$/);
    assert.match(marca.backgroundColor, /^#[0-9a-f]{6}$/);
    assert.ok(marca.headingFont && marca.bodyFont, `tipografia faltando em ${nicho.id}`);
    assert.ok(marca.voice, `voz faltando em ${nicho.id}`);
    assert.equal(marca.collections.length, 6, `colecoes do nicho em ${nicho.id}`);
    assert.deepEqual(marca.collections, nicho.colecoes.slice(0, 6), `as colecoes tem que ser as do nicho ${nicho.id}`);
    assert.equal(marca.faq.length, nicho.perguntas.length);
    assert.ok(marca.logoSvg.startsWith("<svg"), `logo inválida em ${nicho.id}`);
    assert.ok(marca.logoDataUri.startsWith("data:image/svg+xml;charset=utf-8,"));
  }
});

test("a mesma semente devolve a mesma marca, sementes diferentes divergem", () => {
  const a = gerarMarca({ nicheId: "pet", semente: "abc" });
  const b = gerarMarca({ nicheId: "pet", semente: "abc" });
  assert.deepEqual(a, b, "geração precisa ser determinística: a prévia e o servidor usam a mesma semente");
  const outras = new Set(["s1", "s2", "s3", "s4", "s5", "s6"].map((s) => gerarMarca({ nicheId: "pet", semente: s }).name));
  assert.ok(outras.size > 1, "gerar outra tem que poder mudar a marca");
});

test("o que a pessoa digitou vence o gerado, campo a campo", () => {
  const marca = gerarMarca({
    nicheId: "joias",
    semente: "abc",
    sobrescritas: { name: "Camélia Joias", primaryColor: "#123456" },
  });
  assert.equal(marca.name, "Camélia Joias");
  assert.equal(marca.primaryColor, "#123456");
  const base = gerarMarca({ nicheId: "joias", semente: "abc" });
  assert.equal(marca.bodyFont, base.bodyFont, "o que não foi digitado continua vindo do gerador");
  assert.ok(marca.logoSvg.includes("CJ"), "a logo acompanha o nome escolhido");
});

test("a logo é SVG legível, com contraste, e entra no pacote entregue", () => {
  const svg = gerarLogoSvg({ nome: "Aurora Café", primaria: "#0f172a", destaque: "#d97706", forma: "hexagono" });
  assert.ok(svg.startsWith("<svg") && svg.includes("</svg>"));
  assert.ok(svg.includes(">AC<"), "as iniciais entram no desenho");
  assert.doesNotMatch(svg, /<script|onload=/i, "logo não carrega script");
  assert.equal(textoSobre("#0f172a"), "#ffffff");

  const marca = gerarMarca({ nicheId: "casa", semente: "pacote" });
  const limpa = sanitizeBrand(marca);
  assert.equal(limpa.logoDataUri, logoDataUri(marca.logoSvg), "o sanitizador aceita a logo que o gerador produz");
  const site = generateClientSite({ brand: marca, templateId: "vitrine" });
  assert.ok(Object.keys(site.files).includes("assets/logo.svg"), "a logo vira arquivo do site entregue");
});

test("cada nicho tem a sua arte, e nenhuma repete a do vizinho", () => {
  const vistos = new Map();
  for (const nicho of NICHOS) {
    const svg = ilustracaoDoNicho(nicho.id);
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"), `SVG inválido em ${nicho.id}`);
    assert.ok(svg.includes(nicho.paletas[0].primaria), `a arte de ${nicho.id} não usa a paleta do nicho`);
    assert.ok(svg.includes(`<title>${nicho.nome}</title>`), `a arte de ${nicho.id} não se identifica`);
    assert.doesNotMatch(svg, /<script|onload=/i);
    const anterior = vistos.get(svg);
    assert.equal(anterior, undefined, `${nicho.id} desenha igual a ${anterior}`);
    vistos.set(svg, nicho.id);
  }
  assert.ok(ilustracaoDataUri("pet").startsWith("data:image/svg+xml;charset=utf-8,"));
});

test("toda loja sai com logo, inclusive a preenchida à mão", () => {
  /* o modo manual não passa por gerarMarca: sem isto o cabeçalho do site
     entregue ficava com o espaço da marca vazio */
  const logo = logoDaMarca({ name: "Apenas um jovem", primaryColor: "#1f2937" });
  assert.ok(logo.svg.startsWith("<svg"));
  assert.ok(logo.svg.includes(">AU<"), "as iniciais do nome entram no desenho");
  assert.deepEqual(logoDaMarca({ name: "Apenas um jovem", primaryColor: "#1f2937" }), logo, "servidor e navegador precisam desenhar a mesma logo");

  const site = generateClientSite({ brand: { name: "Apenas um jovem", primaryColor: "#1f2937", logoDataUri: logo.dataUri }, templateId: "essencial" });
  assert.ok(Object.keys(site.files).includes("assets/logo.svg"), "a logo tem que virar arquivo do site");
  assert.match(site.files["index.html"], /<img src="assets\/logo\.svg"/, "o cabeçalho aponta para o arquivo que existe");

  /* sem logo nenhuma, o cabeçalho não pode deixar um <img> quebrado */
  const semLogo = generateClientSite({ brand: { name: "Sem Logo" }, templateId: "essencial" });
  assert.doesNotMatch(semLogo.files["index.html"], /<img src=""/);
  assert.ok(!Object.keys(semLogo.files).includes("assets/logo.svg"));
});

test("a entrega do cliente é um tema Shopify, não um site solto", async () => {
  const rota = await readFile(new URL("../app/api/client-request/route.ts", import.meta.url), "utf8");
  /* o ZIP tem que subir em Temas → Adicionar tema: o topo é o tema, e a
     Shopify recusa sem layout/theme.liquid */
  assert.match(rota, /exportThemeZip/);
  assert.match(rota, /montarTemaShopify/);
  /* a prévia local não pode poluir a raiz do tema */
  assert.match(rota, /previa-local\//);
  assert.match(rota, /loja-\$\{site\.brand\.slug\}\.zip/);
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  assert.match(flow, /Enviar arquivo ZIP/, "a tela precisa dizer o que fazer com o pacote");
});

test("as imagens da loja saem no enquadramento certo, e as coleções são do nicho", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { pecasDaMarca, fallbackDataUri, coresDaMarca } = await server.ssrLoadModule("/lib/marca-imagens.ts");
    const { aspectoValido } = await server.ssrLoadModule("/lib/magnific.ts");

    for (const nicho of NICHOS) {
      const marca = gerarMarca({ nicheId: nicho.id, semente: "img" });
      const pecas = pecasDaMarca({ ...marca, nicheId: nicho.id });
      const porPapel = new Map(pecas.map((peca) => [peca.papel, peca]));
      /* logo, banner de desktop e banner de celular, cada um no seu corte */
      assert.equal(porPapel.get("logo").aspecto, "square_1_1");
      /* Banner de loja, não formato de vídeo. `widescreen_16_9` é 1,78:1 e a
         arte saía 2752×1536 — quase o dobro da altura de um banner. A Shopify
         recomenda 3:1, que a lista fechada do provedor não tem; 20:9 (2,22:1) é
         o mais largo que ele aceita, e a altura final quem decide é o tema. */
      const desktop = porPapel.get("banner-desktop").aspecto;
      assert.equal(desktop, "smartphone_horizontal_20_9");
      const [, largo, alto] = desktop.match(/(\d+)_(\d+)$/);
      assert.ok(Number(largo) / Number(alto) >= 2, "o banner de desktop tem de ser largo, não 16:9");
      /* 1080×1350, a medida de banner de celular da Shopify */
      assert.equal(porPapel.get("banner-mobile").aspecto, "social_post_4_5");
      assert.notEqual(porPapel.get("banner-desktop").aspecto, porPapel.get("banner-mobile").aspecto,
        "o banner do celular não pode sair no corte do desktop");
      for (const peca of pecas) {
        assert.ok(aspectoValido(peca.aspecto), `${peca.chave} usa enquadramento que a API não aceita`);
        assert.ok(peca.fallbackSvg.startsWith("<svg"), `${peca.chave} sem desenho local`);
        assert.ok(fallbackDataUri(peca).startsWith("data:image/svg+xml"));
      }
      /* uma capa por coleção DO NICHO */
      const capas = pecas.filter((peca) => peca.papel === "colecao");
      assert.equal(capas.length, nicho.colecoes.slice(0, 6).length);
      for (const [indice, nome] of nicho.colecoes.slice(0, 6).entries()) {
        assert.ok(capas[indice].prompt.includes(nome), `a capa ${indice + 1} de ${nicho.id} não fala da coleção "${nome}"`);
      }
      /* o modelo desenha só o símbolo: letra em imagem gerada sai errada */
      assert.match(porPapel.get("logo").prompt, /[Ss]em letras/);
      assert.deepEqual(coresDaMarca(marca).slice(0, 1), [marca.primaryColor]);
    }
  } finally {
    await server.close();
  }
});

test("quem já tem marca envia as próprias imagens, com prévia", async () => {
  const bancada = await readFile(new URL("../app/ClientMarcaBancada.tsx", import.meta.url), "utf8");
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  const rota = await readFile(new URL("../app/api/client-request/route.ts", import.meta.url), "utf8");

  /* a bancada ganhou o instrumento das imagens, com envio e prévia por peça */
  assert.match(bancada, /Imagens da loja/);
  assert.match(bancada, /function PainelImagens/);
  assert.match(bancada, /type="file"/);
  assert.match(bancada, /previaLocal/, "cada peça mostra o que vai entrar");
  assert.match(bancada, /Enviar minha logo/, "a logo própria entra no painel da marca");

  /* o arquivo vai para a mídia do usuário, que é de onde o exportador tira */
  assert.match(flow, /fetch\("\/api\/media", \{ method: "POST", body: formulario \}\)/);
  /* e o ZIP precisa levar essas mídias, senão sobe apontando para o nada */
  assert.match(rota, /carregarMidias/);
  assert.match(rota, /exportThemeZip\(tema, originais, midias\)/);
});

test("toda fonte da marca existe na biblioteca da Shopify", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { FONTES_SHOPIFY, familiaSuportada, handleDeFonte } = await server.ssrLoadModule("/lib/shopify-brand.ts");
    const biblioteca = new Set(FONTES_SHOPIFY);

    /* o font_picker não é caixa de texto: família de fora é gravada e depois
       ignorada na loja, e a tipografia da marca some sem aviso nenhum */
    for (const nicho of NICHOS) {
      for (const par of nicho.fontes) {
        for (const familia of [par.titulo, par.corpo]) {
          assert.ok(biblioteca.has(familia), `${nicho.id} usa "${familia}", que não existe na biblioteca da Shopify`);
        }
      }
    }

    /* o que a pessoa digita à mão também tem que cair em algo que existe */
    assert.equal(familiaSuportada("Cormorant Garamond"), "Cormorant", "cai na família mais próxima pelo primeiro nome");
    assert.equal(familiaSuportada("Fonte Que Não Existe"), "Inter");
    assert.equal(familiaSuportada("Alguma Coisa Serif"), "Lora", "serif desconhecida não vira sans");
    assert.equal(familiaSuportada(""), "Inter");
    assert.equal(handleDeFonte("Playfair Display", 7), "playfair_display_n7");
    assert.equal(handleDeFonte("Baloo 2", 7), "inter_n7", "família de fora não escapa pelo handle");
  } finally {
    await server.close();
  }
});

test("nenhum data URI entra em setting de tema, nem sobrevive à exportação", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { aplicarMarcaNoTema } = await server.ssrLoadModule("/lib/shopify-brand.ts");
    const marca = gerarMarca({ nicheId: "roupas", semente: "404" });

    const tema = {
      format: "shopify-os-2.0", themeName: "Tema", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [{ name: "Marca", settings: [{ id: "logo", type: "image_picker", label: "Logo" }] }],
      globalValues: { logo: "" },
      sectionSchemas: [{
        type: "slideshow", name: "Slideshow", blocks: [], presets: [],
        settings: [{ id: "image", type: "image_picker", label: "Imagem" }],
      }],
      pages: [{ id: "index", name: "Início", template: "templates/index.json", sections: [{ id: "s1", type: "slideshow", name: "Slideshow", settings: { image: "shopify://shop_images/original.png" }, blocks: [] }] }],
    };

    /* a arte local é SVG em data URI: serve à prévia, e em setting de tema
       derruba o template inteiro (a home da loja publicada virou 404) */
    const comArteLocal = aplicarMarcaNoTema(tema, { ...marca, imagens: { logo: `data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E`, "banner-desktop": "data:image/png;base64,AAAA" } });
    const texto = JSON.stringify(comArteLocal.theme);
    assert.doesNotMatch(texto, /"data:image\//, "data URI não pode entrar em setting de tema");
    assert.equal(comArteLocal.theme.globalValues.logo, "", "sem imagem real, o campo fica como estava");
    assert.equal(comArteLocal.theme.pages[0].sections[0].settings.image, "shopify://shop_images/original.png", "a imagem que o tema já tinha continua");

    /* imagem de verdade entra */
    const comMidia = aplicarMarcaNoTema(tema, { ...marca, imagens: { logo: "/api/media/abcdef0123456789abcd" } });
    assert.equal(comMidia.theme.globalValues.logo, "/api/media/abcdef0123456789abcd");

    /* cinto de segurança: se algum data URI escapar, o exportador o remove */
    const { exportThemeZip } = await server.ssrLoadModule("/lib/theme-export.ts");
    const sujo = JSON.parse(JSON.stringify(tema));
    sujo.pages[0].sections[0].settings.image = "data:image/svg+xml;charset=utf-8,%3Csvg%3E%3C%2Fsvg%3E";
    const arquivos = new Map([
      ["layout/theme.liquid", new TextEncoder().encode("{{ content_for_layout }}")],
      ["sections/slideshow.liquid", new TextEncoder().encode("{% schema %}{\"name\":\"Slideshow\"}{% endschema %}")],
      ["templates/index.json", new TextEncoder().encode(JSON.stringify({ sections: { s1: { type: "slideshow", settings: {} } }, order: ["s1"] }))],
    ]);
    const { zip, warnings } = exportThemeZip(sujo, arquivos);
    const { unzipSync } = await import("fflate");
    const saida = unzipSync(zip);
    const indexJson = new TextDecoder().decode(saida["templates/index.json"]);
    assert.doesNotMatch(indexJson, /data:image\//, "o exportador tem que remover o data URI que não sabe converter");
    assert.ok(warnings.some((aviso) => /data URI/i.test(aviso)), "a remoção precisa aparecer como aviso");
  } finally {
    await server.close();
  }
});

test("a marca aplicada nunca produz valor que a Shopify recusaria", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { aplicarMarcaNoTema, violacoesDoTema, paraRichtext } = await server.ssrLoadModule("/lib/shopify-brand.ts");

    /* richtext exige tag de bloco; texto puro faz a Shopify REJEITAR o arquivo
       inteiro na importação, e a página some da loja (o site deu 404) */
    assert.equal(paraRichtext("Peças de vestuário"), "<p>Peças de vestuário</p>");
    assert.equal(paraRichtext("<p>já é html</p>"), "<p>já é html</p>");
    assert.equal(paraRichtext("<ul><li>lista</li></ul>"), "<ul><li>lista</li></ul>");
    assert.equal(paraRichtext("  "), "");
    assert.equal(paraRichtext("a < b & c"), "<p>a &lt; b &amp; c</p>", "o texto entra escapado");

    const tema = {
      format: "shopify-os-2.0", themeName: "Tema", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [{ name: "Marca", settings: [{ id: "brand_story", type: "richtext", label: "História da marca", default: "" }] }],
      globalValues: { brand_story: "" },
      sectionSchemas: [{
        type: "featured-collection", name: "Coleção", presets: [],
        settings: [
          { id: "title", type: "text", label: "Título", default: "Coleção" },
          { id: "description", type: "richtext", label: "Descrição", default: "" },
          { id: "image", type: "image_picker", label: "Imagem" },
        ],
        blocks: [{ type: "texto", name: "Texto", settings: [{ id: "corpo", type: "richtext", label: "Corpo", default: "" }] }],
      }],
      pages: [{
        id: "index", name: "Início", template: "templates/index.json",
        sections: [{
          id: "s1", type: "featured-collection", name: "Coleção",
          settings: { title: "Coleção", description: "" },
          blocks: [{ id: "b1", type: "texto", settings: { corpo: "" } }],
        }],
      }],
    };

    /* o mesmo teste para os dez nichos: a copy muda, a regra não */
    for (const nicho of NICHOS) {
      const marca = gerarMarca({ nicheId: nicho.id, semente: "richtext" });
      const { theme, violacoes } = aplicarMarcaNoTema(tema, marca);
      assert.deepEqual(violacoes, [], `${nicho.id} produziu valor inválido: ${violacoes.join("; ")}`);
      const descricao = theme.pages[0].sections[0].settings.description;
      if (descricao) assert.match(descricao, /^</, `${nicho.id}: richtext de seção sem tag de bloco`);
      const corpo = theme.pages[0].sections[0].blocks[0].settings.corpo;
      if (corpo) assert.match(corpo, /^</, `${nicho.id}: richtext de bloco sem tag de bloco`);
    }

    /* o detector precisa mesmo detectar, senão o teste acima não vale nada */
    const quebrado = JSON.parse(JSON.stringify(tema));
    quebrado.pages[0].sections[0].settings.description = "texto puro";
    quebrado.pages[0].sections[0].settings.image = "data:image/svg+xml;charset=utf-8,%3Csvg%3E";
    const achados = violacoesDoTema(quebrado);
    assert.equal(achados.length, 2, `esperava 2 violações, veio ${achados.length}: ${achados.join("; ")}`);
    assert.ok(achados.some((v) => /richtext/.test(v)));
    assert.ok(achados.some((v) => /image_picker/.test(v)));
  } finally {
    await server.close();
  }
});

test("templates de mercado da loja de origem não entram no ZIP", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { exportThemeZip } = await server.ssrLoadModule("/lib/theme-export.ts");
    const { unzipSync } = await import("fflate");
    const bytes = (texto) => new TextEncoder().encode(texto);
    const arquivos = new Map([
      ["layout/theme.liquid", bytes("{{ content_for_layout }}")],
      ["templates/index.json", bytes(JSON.stringify({ sections: {}, order: [] }))],
      /* mercado da loja de origem: em outra loja esse id não existe e a
         Shopify recusa o arquivo na importação */
      ["templates/index.context.04d13b88-4025-4eda-aa29-07fdfbea8470.json", bytes(JSON.stringify({ parent: "index.json", sections: {} }))],
      ["templates/product.context.international.json", bytes(JSON.stringify({ parent: "product.json", sections: {} }))],
    ]);
    const tema = {
      format: "shopify-os-2.0", themeName: "T", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [], globalValues: {}, sectionSchemas: [], pages: [],
    };
    const { zip, warnings } = exportThemeZip(tema, arquivos);
    const saida = Object.keys(unzipSync(zip));
    assert.ok(saida.includes("templates/index.json"), "o template normal continua");
    assert.equal(saida.filter((n) => /\.context\./.test(n)).length, 0, "nenhum template contextual no ZIP");
    assert.ok(warnings.some((aviso) => /mercado da loja de origem/.test(aviso)), "a remoção precisa aparecer como aviso");
  } finally {
    await server.close();
  }
});

test("marca própria é 100% manual; as artes da Orbis só existem no caminho gerado", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");

  /* um caminho de imagem só, e ele se chama Artes da Orbis */
  assert.match(flow, /Artes da Orbis/);
  assert.doesNotMatch(flow, /Gerar por IA/, "o segundo cartão saiu da tela");
  assert.doesNotMatch(flow, /\bcomIa\b/, "o estado do cartão antigo saiu junto");

  /* quem já tem marca não vê botão de gerar, e nada gerado é enviado */
  assert.match(flow, /modo === "manual" \? \(/, "o passo do tema separa os dois caminhos");
  assert.match(flow, /imagens: \{ \.\.\.marca\.imagens, \.\.\.\(modo === "gerada" \? imagensGeradas : \{\}\) \}/);

  /* as fotos são pedidas como fotografia profissional, não como desenho */
  const imagens = await readFile(new URL("../lib/marca-imagens.ts", import.meta.url), "utf8");
  assert.match(imagens, /const QUALIDADE = /);
  const pedacos = imagens.split("prompt: [").slice(1);
  const fotos = pedacos.filter((trecho) => /Fotografia|Foto de catálogo/.test(trecho.slice(0, 200)));
  /* cinco: as DUAS dobras de banner (desktop e celular cada) mais a capa de
     coleção. A segunda dobra existe porque um tema com dois banners recebia a
     mesma foto nos dois, e a loja abria repetindo a imagem. */
  assert.equal(fotos.length, 5, "duas dobras de banner (desktop e celular) e a capa de coleção são fotografia");
  /* e a segunda dobra tem de pedir uma cena DIFERENTE da primeira: dois
     pedidos com o mesmo texto voltam praticamente iguais */
  assert.match(imagens, /chave: "banner-desktop-2"/);
  assert.match(imagens, /DETALHE[\s\S]{0,200}sem pessoas no quadro/);
  for (const foto of fotos) assert.ok(foto.slice(0, 600).includes("QUALIDADE"), "toda foto pede qualidade comercial");
  /* a logo continua sendo símbolo sem letra: modelo de imagem erra texto */
  assert.match(imagens, /Símbolo de marca minimalista[\s\S]{0,400}Sem letras/);
});

test("cada nicho tem foto real de produto, com o desenho como reserva", async () => {
  const { readdir, stat } = await import("node:fs/promises");
  const pasta = new URL("../public/nichos/", import.meta.url);
  const arquivos = await readdir(pasta);
  for (const nicho of NICHOS) {
    const nome = `${nicho.id}.jpg`;
    assert.ok(arquivos.includes(nome), `falta a foto do nicho ${nicho.id}`);
    const { size } = await stat(new URL(nome, pasta));
    /* leve o bastante para o cartão não ficar vazio esperando, e pesado o
       bastante para ser foto e não um pixel */
    assert.ok(size > 8 * 1024, `${nome} pequeno demais (${size} bytes)`);
    assert.ok(size < 400 * 1024, `${nome} grande demais (${size} bytes)`);
    assert.equal(fotoDoNicho(nicho.id), `/nichos/${nicho.id}.jpg`);
  }

  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  assert.match(flow, /src=\{fotoDoNicho\(nicho\.id\)\}/, "o cartão usa a foto");
  assert.match(flow, /onError=[\s\S]{0,120}ilustracaoDataUri\(nicho\.id\)/, "e cai no desenho se o arquivo faltar");
  /* carregar tarde deixava o cartão vazio quando a aba não compõe quadros */
  assert.doesNotMatch(flow, /cf-nicho-arte[\s\S]{0,200}loading="lazy"/);
});

test("as abas dos passos levam de volta, e não adiante do que falta", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  assert.match(flow, /passoMaisLonge/, "a tela lembra até onde a pessoa chegou");
  assert.match(flow, /disabled=\{!liberado \|\| indice === passo\}/, "passo futuro e passo atual não são clicáveis");
  assert.match(flow, /onClick=\{\(\) => irPara\(indice\)\}/);
  assert.match(flow, /function irPara/);
});

test("SVG de terceiro não passa pelo sanitizador", () => {
  const malicioso = `data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')}`;
  assert.equal(sanitizeBrand({ name: "X", logoDataUri: malicioso }).logoDataUri, "");
});

test("nichoPorId cai no primeiro nicho quando o id não existe", () => {
  assert.equal(nichoPorId("nao-existe").id, NICHOS[0].id);
});

test("a marca gerada pinta os settings reais de um tema importado", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { aplicarMarcaNoTema, handleDeFonte, handleDeColecao } = await server.ssrLoadModule("/lib/shopify-brand.ts");
    assert.equal(handleDeFonte("Playfair Display", 7), "playfair_display_n7");
    assert.equal(handleDeColecao("Óculos de sol"), "oculos-de-sol");

    const marca = gerarMarca({ nicheId: "oculos", semente: "tema" });
    const tema = {
      format: "shopify-os-2.0", themeName: "Tema", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [{
        name: "Cores", settings: [
          { id: "colors_background_1", type: "color", label: "Fundo", default: "#ffffff" },
          { id: "colors_text", type: "color", label: "Texto", default: "#000000" },
          { id: "colors_accent_1", type: "color", label: "Botão", default: "#008060" },
          { id: "colors_solid_button_labels", type: "color", label: "Texto do botão", default: "#ffffff" },
          { id: "colors_outline_button_labels", type: "color", label: "Texto do botão vazado", default: "#000000" },
          { id: "type_header_font", type: "font_picker", label: "Títulos", default: "assistant_n4" },
          { id: "type_body_font", type: "font_picker", label: "Corpo", default: "assistant_n4" },
          { id: "shop_name", type: "text", label: "Nome da loja", default: "" },
        ],
      }],
      globalValues: {
        color_schemes: { scheme1: { settings: { background: "#ffffff", text: "#121212", button: "#008060", button_label: "#ffffff" } } },
        colors_background_1: "#ffffff", colors_text: "#000000", colors_accent_1: "#008060",
        type_header_font: "assistant_n4", type_body_font: "assistant_n4", shop_name: "",
      },
      sectionSchemas: [{
        type: "featured-collection", name: "Coleção", blocks: [], presets: [],
        settings: [
          { id: "title", type: "text", label: "Título", default: "Coleção em destaque" },
          { id: "collection", type: "collection", label: "Coleção" },
        ],
      }],
      pages: [{ id: "index", name: "Início", sections: [{ id: "s1", type: "featured-collection", name: "Coleção", settings: { title: "Coleção em destaque" }, blocks: [] }] }],
    };

    const { theme, alterados } = aplicarMarcaNoTema(tema, marca);
    assert.equal(theme.globalValues.colors_background_1, marca.backgroundColor);
    assert.equal(theme.globalValues.colors_accent_1, marca.accentColor);
    /* rótulo de botão é o texto EM CIMA dele: contraste, não a cor do botão */
    const { textoSobre: contrasteDe } = await import("../lib/marca-generator.mjs");
    assert.equal(theme.globalValues.colors_solid_button_labels, contrasteDe(marca.accentColor));
    assert.equal(theme.globalValues.colors_outline_button_labels, marca.accentColor);
    assert.equal(theme.globalValues.type_header_font, handleDeFonte(marca.headingFont, 7));
    assert.equal(theme.globalValues.shop_name, marca.name);
    assert.equal(theme.globalValues.color_schemes.scheme1.settings.background, marca.backgroundColor);
    assert.equal(theme.globalValues.color_schemes.scheme1.settings.button, marca.accentColor);
    assert.equal(theme.pages[0].sections[0].settings.collection, handleDeColecao(marca.collections[0]));
    assert.equal(theme.pages[0].sections[0].settings.title, marca.slogan, "título ainda no padrão do schema recebe a copy da marca");
    assert.ok(alterados.length >= 6, `esperava vários settings alterados, veio ${alterados.length}`);
    /* o tema de origem não pode ter sido tocado */
    assert.equal(tema.globalValues.colors_background_1, "#ffffff");
  } finally {
    await server.close();
  }
});

test("a área do cliente oferece os temas do estúdio e os dois caminhos de criação", async () => {
  const flow = await readFile(new URL("../app/ClientFlow.tsx", import.meta.url), "utf8");
  const bancada = await readFile(new URL("../app/ClientMarcaBancada.tsx", import.meta.url), "utf8");
  /* a lista de temas é a mesma do estúdio, com a home real como miniatura */
  assert.match(flow, /\/api\/bootstrap/);
  assert.match(flow, /RealHomeThumbnail/);
  assert.match(flow, /api\/theme-render\?themeId=/);
  /* os dois caminhos: gerada por nicho ou preenchida à mão */
  assert.match(flow, /NICHOS/);
  assert.match(flow, /"gerada" \| "manual"/);
  /* a bancada da marca, um instrumento por vez */
  for (const instrumento of ["Voz da marca", "Paleta", "Tipografia", "Contato", "Redes"]) {
    assert.ok(bancada.includes(instrumento), `faltou o instrumento ${instrumento}`);
  }
  assert.match(bancada, /Orbis Criativos/);
});

test("o provedor de imagem por IA é opcional e só aceita modelo da lista", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { magnificDisponivel, modeloValido, modeloPadrao, promptDaVitrine } = await server.ssrLoadModule("/lib/magnific.ts");
    assert.equal(magnificDisponivel(undefined), false, "sem chave, a área do cliente segue no gerador local");
    assert.equal(magnificDisponivel("chave-de-teste-123"), true);
    assert.equal(modeloValido("imagem", "mystic"), true);
    assert.equal(modeloValido("imagem", "../../roubar"), false, "o modelo vira caminho de URL: lista fechada");
    assert.equal(modeloValido("video", "mystic"), false);
    assert.ok(modeloPadrao("imagem").length > 0);
    assert.match(promptDaVitrine({ nicho: "óculos", marca: "Vista Co.", paleta: ["#000000"] }), /Vista Co\./);
  } finally {
    await server.close();
  }
});

test("cada dobra de banner tem foto própria, e o texto pousa na imagem", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { aplicarMarcaNoTema } = await server.ssrLoadModule("/lib/shopify-brand.ts");
    const marca = gerarMarca({ nicheId: "roupas", semente: "dobras" });

    /* duas dobras de slideshow, como o Dawn de uma loja real */
    const settingsDoSlide = [
      { id: "image", type: "image_picker", label: "Imagem" },
      { id: "mobile_image", type: "image_picker", label: "Imagem do celular" },
      { id: "heading", type: "text", label: "Título", default: "Image slide" },
      { id: "subheading", type: "text", label: "Subtítulo", default: "Tell your story" },
      { id: "button_label", type: "text", label: "Rótulo do botão", default: "Button label" },
      { id: "show_text_box", type: "checkbox", label: "Caixa de texto", default: true },
      { id: "image_overlay_opacity", type: "range", label: "Véu", default: 0 },
      { id: "color_scheme", type: "select", label: "Esquema", default: "background-1",
        options: [{ value: "background-1" }, { value: "inverse" }] },
    ];
    const dobra = (id) => ({
      id, type: "slideshow", name: "Slideshow",
      settings: { slide_height: "adapt_image" },
      blocks: [{ id: `${id}-b`, type: "slide", settings: { show_text_box: true, image_overlay_opacity: 0, link: "shopify://collections/all" } }],
    });
    const tema = {
      format: "shopify-os-2.0", themeName: "Tema", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [], globalValues: {},
      sectionSchemas: [{
        type: "slideshow", name: "Slideshow", presets: [],
        settings: [{ id: "slide_height", type: "select", label: "Altura", default: "medium",
          options: [{ value: "adapt_image" }, { value: "medium" }] }],
        blocks: [{ type: "slide", name: "Slide", settings: settingsDoSlide }],
      }],
      pages: [{ id: "index", name: "Início", template: "templates/index.json", sections: [dobra("s1"), dobra("s2")] }],
    };

    const r = aplicarMarcaNoTema(tema, {
      ...marca,
      imagens: {
        "banner-desktop": "/api/media/1111111111111111aaaa",
        "banner-desktop-2": "/api/media/2222222222222222bbbb",
        "banner-mobile": "/api/media/3333333333333333cccc",
        "banner-mobile-2": "/api/media/4444444444444444dddd",
      },
    });
    const [a, b] = r.theme.pages[0].sections.map((s) => s.blocks[0].settings);

    /* A QUEIXA: as duas dobras abriam com a MESMA foto, e parecia defeito de
       carregamento. Uma chave só (`banner-desktop`) servia todo slot. */
    assert.notEqual(a.image, b.image, "as duas dobras não podem repetir a foto");
    assert.notEqual(a.mobile_image, b.mobile_image, "nem no celular");
    assert.equal(a.image, "/api/media/1111111111111111aaaa");
    assert.equal(b.image, "/api/media/2222222222222222bbbb");

    /* o subtítulo diz o que o título não disse: `subheading` contém "heading",
       casava na regra de título e recebia o mesmo slogan */
    for (const bloco of [a, b]) {
      assert.equal(bloco.heading, marca.slogan);
      assert.equal(bloco.subheading, marca.description);
      assert.notEqual(bloco.heading, bloco.subheading, "título e subtítulo não podem ser a mesma frase");
    }

    /* o texto pousa NA imagem, na paleta da marca — nada de caixa branca */
    for (const bloco of [a, b]) {
      assert.equal(bloco.show_text_box, false);
      assert.equal(bloco.image_overlay_opacity, 20, "véu leve para o texto continuar legível sobre foto");
      assert.equal(bloco.color_scheme, "inverse");
    }

    /* RÓTULO DE BOTÃO É RÓTULO. A regra de sobra enfiava a descrição em todo
       campo de texto restante, e o banner saía com um botão contendo um
       parágrafo inteiro dentro da borda. */
    for (const bloco of [a, b]) {
      assert.ok(bloco.button_label.length <= 24, `rótulo longo demais: ${bloco.button_label}`);
      assert.notEqual(bloco.button_label, marca.description);
      assert.doesNotMatch(bloco.button_label, /Button label/i, "nada de placeholder em inglês na loja publicada");
    }

    /* e a altura da dobra deixa de depender do arquivo */
    for (const secao of r.theme.pages[0].sections) assert.equal(secao.settings.slide_height, "medium");
  } finally {
    await server.close();
  }
});

test("o logo é o NOME da loja escrito; arte gerada não ocupa esse campo", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try {
    const { aplicarMarcaNoTema } = await server.ssrLoadModule("/lib/shopify-brand.ts");
    const marca = gerarMarca({ nicheId: "roupas", semente: "logo" });
    const base = () => ({
      format: "shopify-os-2.0", themeName: "Tema", version: "1", author: "", sourceFile: "t.zip",
      sourceFingerprint: "0000000000000000", importedAt: "", summary: {}, sourceFiles: [], compatibility: {},
      globalGroups: [{ name: "Marca", settings: [{ id: "logo", type: "image_picker", label: "Logo" }] }],
      /* o tema importado aponta para um arquivo da loja de ORIGEM */
      globalValues: { logo: "shopify://shop_images/logo-da-outra-loja.png" },
      sectionSchemas: [], pages: [],
    });

    /* A QUEIXA: a arte de logo da IA é um PNG quadrado com fundo próprio, e no
       cabeçalho vira um retângulo cinza colado sobre a cor da página. Nenhum
       recorte conserta: o fundo está pintado dentro do arquivo. Campo vazio =
       o tema escreve o nome da loja, na tipografia da marca. */
    const gerada = aplicarMarcaNoTema(base(), {
      ...marca,
      imagens: { logo: "/api/media/aaaaaaaaaaaaaaaaaaaa" },
      imagensGeradas: ["logo", "banner-desktop"],
    });
    assert.equal(gerada.theme.globalValues.logo, "", "arte gerada não pode ocupar o campo de logo");

    /* e o valor herdado do tema importado some junto: ele aponta para um
       arquivo que não existe na loja do cliente, e ficaria um vazio no lugar
       do nome */
    const semNada = aplicarMarcaNoTema(base(), { ...marca, imagens: {}, imagensGeradas: [] });
    assert.equal(semNada.theme.globalValues.logo, "");

    /* quem já tem marca tem logo: o arquivo do CLIENTE vence sempre */
    const doCliente = aplicarMarcaNoTema(base(), {
      ...marca,
      imagens: { logo: "/api/media/bbbbbbbbbbbbbbbbbbbb" },
      imagensGeradas: [],
    });
    assert.equal(doCliente.theme.globalValues.logo, "/api/media/bbbbbbbbbbbbbbbbbbbb");
  } finally {
    await server.close();
  }
});
