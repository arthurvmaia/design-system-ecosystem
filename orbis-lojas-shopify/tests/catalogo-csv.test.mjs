import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * O catálogo que o tema NÃO pode levar.
 *
 * Produto não é arquivo de tema: o ZIP leva Liquid, CSS, JS e configurações, e
 * catálogo é dado da loja. Era por isso que a loja entregue subia bonita e
 * vazia. O caminho oficial é o CSV de importação da Shopify, cujo cabeçalho
 * está travado aqui contra o template publicado por eles.
 */

/** Conta campos respeitando aspas — CSV com vírgula dentro do texto é a regra, não a exceção. */
function campos(linha) {
  let n = 1;
  let dentroDeAspas = false;
  for (const c of linha) {
    if (c === '"') dentroDeAspas = !dentroDeAspas;
    else if (c === "," && !dentroDeAspas) n++;
  }
  return n;
}

test("o CSV do nicho tem o cabeçalho da Shopify e uma linha por imagem", async () => {
  const server = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("..", import.meta.url)),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const { csvDeProdutos, COLUNAS_CSV } = await server.ssrLoadModule("/lib/catalogo-csv.ts");
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");

    const COLECOES = ["Analogicos", "Digitais", "Smartwatches"];
    const csv = csvDeProdutos("relogios", COLECOES);
    assert.ok(csv.startsWith("﻿"), "sem BOM o Excel abre os acentos quebrados");
    const linhas = csv.split("\r\n").filter(Boolean);

    /* cabeçalho idêntico ao declarado, e o declarado é o do template oficial */
    assert.equal(linhas[0].replace(/^﻿/, ""), COLUNAS_CSV.join(","));
    assert.ok(COLUNAS_CSV.includes("Title"), "Title é a única coluna obrigatória da Shopify");
    assert.ok(COLUNAS_CSV.includes("Product image URL"), "a foto entra por URL: a Shopify baixa na importação");
    assert.ok(COLUNAS_CSV.includes("Compare-at price"));

    /* toda linha tem a mesma largura: uma coluna a menos e a importação
       desalinha tudo silenciosamente */
    const larguras = new Set(linhas.map(campos));
    assert.equal(larguras.size, 1, `linhas com larguras diferentes: ${[...larguras]}`);
    assert.equal([...larguras][0], COLUNAS_CSV.length);

    /* uma linha por imagem, e nenhuma linha de imagem repete os dados do
       produto — repetir cria variante a mais na importação */
    const produtos = PRODUTOS_POR_NICHO.relogios;
    const totalDeImagens = produtos.reduce((n, p) => n + Math.max(p.images.length, 1), 0);
    assert.equal(linhas.length - 1, totalDeImagens);
    const colunaDoTitulo = COLUNAS_CSV.indexOf("Title");
    const semTitulo = linhas.slice(1).filter((l) => l.split(",")[colunaDoTitulo] === "").length;
    assert.equal(semTitulo, totalDeImagens - produtos.length, "linhas extras são só de imagem");

    /**
     * A COLUNA `Collection`, que é o que faz os cartões pararem de nascer
     * vazios.
     *
     * A loja gerada abria com "Moda Masculina", "Pet Shop" — as coleções da
     * loja de ORIGEM do tema, que não existem na loja do cliente. Apontar para
     * as do nicho só passou a ser honesto quando a importação passou a CRIAR
     * essas coleções: é a única coluna extra que a Shopify aceita.
     */
    assert.equal(COLUNAS_CSV[0], "Collection");
    const colunaDaColecao = COLUNAS_CSV.indexOf("Collection");
    const atribuidas = linhas
      .slice(1)
      .map((l) => l.split(",")[colunaDaColecao])
      .filter(Boolean);
    /* toda coleção recebe pelo menos um produto: coleção vazia é cartão vazio */
    assert.deepEqual(new Set(atribuidas), new Set(COLECOES));
    assert.equal(atribuidas.length, produtos.length, "uma coleção por PRODUTO, não por linha de imagem");

    /* sem coleção pedida, a coluna existe e fica vazia: o formato não muda */
    const semColecao = csvDeProdutos("relogios");
    assert.equal(semColecao.split("\r\n")[0].replace(/^﻿/, ""), COLUNAS_CSV.join(","));

    /* preço em reais com ponto, nunca em centavos */
    const primeiro = produtos[0];
    assert.match(csv, new RegExp(`,${(primeiro.price / 100).toFixed(2)},`));

    /* sem nicho não existe arquivo: loja sem catálogo não ganha CSV vazio */
    assert.equal(csvDeProdutos(undefined), "");
    assert.equal(csvDeProdutos("nicho-que-nao-existe"), "");
  } finally {
    await server.close();
  }
});

test("o pacote entregue leva o CSV e o passo a passo, fora da raiz do tema", async () => {
  const rota = await readFile(new URL("../app/api/client-request/route.ts", import.meta.url), "utf8");
  /* as coleções vão junto: é a importação que as cria */
  assert.match(rota, /csvDeProdutos\(parsed\.data\.nicheId, marca\.collections \?\? \[\]\)/);
  /* dentro de previa-local: arquivo solto na raiz é risco de a Shopify recusar
     a importação do tema, que exige layout/theme.liquid no topo */
  assert.match(rota, /previa-local\/produtos-para-importar\.csv/);
  assert.match(rota, /previa-local\/COMO-SUBIR-OS-PRODUTOS\.txt/);
  assert.doesNotMatch(rota, /arquivos\["produtos-para-importar\.csv"\]/);
});
