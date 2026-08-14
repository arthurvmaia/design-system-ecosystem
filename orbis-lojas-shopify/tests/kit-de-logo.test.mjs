import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * O kit de logo.
 *
 * A peça "logo" pedida ao gerador de imagem voltava FOTO DE PRODUTO — um
 * frasco, uma bolsa — porque é o que um modelo de imagem faz bem. E quando
 * acertava o símbolo, vinha num PNG quadrado com o fundo pintado dentro do
 * arquivo, que no cabeçalho vira um retângulo colado sobre a página.
 *
 * Logo é geometria e cor, e a regra do projeto é clara: isso se calcula, não se
 * gera. Estes testes travam o que a decisão promete.
 */

test("o kit tem todas as variações pedidas, em vetor e com nome estável", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const { kitDeLogo, iniciaisDe, textoSobre, FORMAS_DE_MONOGRAMA } =
      await server.ssrLoadModule("/lib/kit-de-logo.ts");

    const marca = {
      name: "Cais Moda",
      primaryColor: "#7a3b2e",
      backgroundColor: "#f5efe8",
      accentColor: "#c9a227",
      headingFont: "Playfair Display",
    };
    const kit = kitDeLogo(marca);
    const porArquivo = new Map(kit.map((p) => [p.arquivo, p]));

    /* as variações que o dono pediu, uma a uma */
    for (const esperado of [
      "logo-extenso",
      "logo-extenso-fundo-branco",
      "logo-extenso-fundo-preto",
      "logo-horizontal",
      "favicon",
      "rede-social-perfil",
      "monograma-fundo-branco",
      "monograma-fundo-preto",
    ]) {
      assert.ok(porArquivo.has(esperado), `faltou a peça ${esperado}`);
    }
    /* "várias de monograma": uma por forma */
    for (const forma of FORMAS_DE_MONOGRAMA) {
      assert.ok(porArquivo.has(`monograma-${forma}`), `faltou o monograma ${forma}`);
    }
    assert.ok(kit.length >= 14, `kit curto demais: ${kit.length} peças`);

    /* nome de arquivo estável é o que permite automatizar a subida depois */
    for (const p of kit) {
      assert.match(p.arquivo, /^[a-z0-9-]+$/, `nome de arquivo instável: ${p.arquivo}`);
      assert.ok(p.uso && p.titulo, `${p.arquivo} sem explicação de uso`);
    }
    assert.equal(new Set(kit.map((p) => p.arquivo)).size, kit.length, "nome de arquivo repetido");

    /* SVG de verdade, sem script, com o nome da marca dentro */
    for (const p of kit) {
      assert.ok(p.svg.startsWith("<svg") && p.svg.endsWith("</svg>"), `${p.arquivo} não é SVG`);
      assert.doesNotMatch(p.svg, /<script|onload=|javascript:/i, `${p.arquivo} carrega script`);
      assert.match(p.svg, new RegExp(`width="${p.largura}"`), `${p.arquivo} sem a largura declarada`);
    }

    /* TRANSPARENTE é o padrão: fundo pintado dentro do arquivo é o defeito que
       este módulo existe para não repetir */
    for (const nome of ["logo-extenso", "logo-horizontal", ...FORMAS_DE_MONOGRAMA.map((f) => `monograma-${f}`)]) {
      const svg = porArquivo.get(nome).svg;
      assert.doesNotMatch(svg, /<rect width="\d+" height="\d+" fill="#(ffffff|101010)"/, `${nome} tem fundo pintado`);
    }
    /* e as versões que PROMETEM fundo, têm fundo */
    assert.match(porArquivo.get("logo-extenso-fundo-branco").svg, /fill="#ffffff"/);
    assert.match(porArquivo.get("logo-extenso-fundo-preto").svg, /fill="#101010"/);

    /* o nome da loja aparece por extenso, e as iniciais no monograma */
    assert.match(porArquivo.get("logo-extenso").svg, /Cais Moda/);
    assert.equal(iniciaisDe("Cais Moda"), "CM");
    assert.equal(iniciaisDe("Volare"), "VO");
    assert.match(porArquivo.get("monograma-circulo").svg, />CM</);

    /* contraste: o texto sobre a cor da marca nunca pode sumir */
    assert.equal(textoSobre("#ffffff"), "#101010");
    assert.equal(textoSobre("#101010"), "#ffffff");

    /* a fonte da marca vai na frente, mas sempre com reserva: um SVG aberto
       fora do navegador tem de continuar legível */
    assert.match(porArquivo.get("logo-extenso").svg, /'Playfair Display', Georgia/);

    /* nome comprido não pode transbordar o quadro */
    const comprido = kitDeLogo({ ...marca, name: "Atelier de Roupas e Acessorios Finos" });
    const corpo = Number(comprido.find((p) => p.arquivo === "logo-extenso").svg.match(/font-size="(\d+)"/)[1]);
    assert.ok(corpo <= 96 && corpo >= 38, `corpo de letra fora da faixa: ${corpo}`);
  } finally {
    await server.close();
  }
});

test("o kit sai no pacote entregue, com o leia-me ao lado", async () => {
  const rota = await readFile(new URL("../app/api/client-request/route.ts", import.meta.url), "utf8");
  assert.match(rota, /kitDeLogo\(marca\)/);
  assert.match(rota, /previa-local\/logo-da-marca\/\$\{peca\.arquivo\}\.svg/);
  assert.match(rota, /COMO-USAR-O-LOGO\.txt/);
});
