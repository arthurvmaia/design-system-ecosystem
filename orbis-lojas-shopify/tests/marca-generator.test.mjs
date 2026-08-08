import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { NICHOS, gerarLogoSvg, gerarMarca, ilustracaoDataUri, ilustracaoDoNicho, logoDaMarca, logoDataUri, nichoPorId, textoSobre } from "../lib/marca-generator.mjs";
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
    assert.equal(marca.collections.length, 4);
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
