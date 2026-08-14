import { PRODUTOS_POR_NICHO, type ProdutoDoNicho } from "./catalogo-nichos";

/**
 * O catálogo do nicho no formato que a Shopify importa.
 *
 * Produto NÃO faz parte de tema. Um ZIP de tema leva Liquid, CSS, JS e
 * configurações; catálogo é dado da loja, e por isso a loja subia bonita e
 * vazia. O caminho oficial para levar mercadoria é o CSV de importação
 * (Admin → Produtos → Importar), e ele resolve de brinde o problema das fotos:
 * a coluna de imagem aceita URL EXTERNA, e a Shopify baixa e re-hospeda cada
 * uma durante a importação. Os produtos do nicho já vêm com URL de foto.
 *
 * O cabeçalho é o do template oficial da Shopify
 * (help.shopify.com/csv/product_template.csv), no subconjunto que temos dado
 * para preencher — a importação aceita subconjunto, só o título é obrigatório.
 * Inventar coluna que não existe no template é o jeito mais rápido de a
 * importação falhar inteira.
 */
export const COLUNAS_CSV = [
  "Title",
  "URL handle",
  "Description",
  "Vendor",
  "Type",
  "Tags",
  "Published on online store",
  "Status",
  "SKU",
  "Option1 name",
  "Option1 value",
  "Price",
  "Compare-at price",
  "Inventory tracker",
  "Inventory quantity",
  "Continue selling when out of stock",
  "Requires shipping",
  "Product image URL",
  "Image position",
  "Image alt text",
] as const;

/** Aspas duplas dobradas e campo entre aspas quando houver vírgula, aspas ou quebra. */
function campo(valor: string | number | null | undefined): string {
  const texto = valor == null ? "" : String(valor);
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Centavos para o decimal que a Shopify espera: ponto, sem separador de milhar. */
function preco(centavos: number | null | undefined): string {
  if (centavos == null || !Number.isFinite(centavos)) return "";
  return (centavos / 100).toFixed(2);
}

/**
 * Uma linha por IMAGEM: é assim que a Shopify recebe várias fotos do mesmo
 * produto. A primeira linha traz o produto inteiro; as seguintes repetem só o
 * handle e a foto, com a posição. Repetir os dados nas linhas de imagem faria
 * a importação criar variante a mais.
 */
function linhasDoProduto(p: ProdutoDoNicho): string[][] {
  const descricao = [
    `<p>${p.title}</p>`,
    p.rating ? `<p>Nota ${p.rating} na origem${p.sold ? `, ${p.sold}` : ""}.</p>` : "",
  ]
    .filter(Boolean)
    .join("");
  const fotos = p.images.length ? p.images : [""];
  const primeira: string[] = [
    p.title,
    p.handle,
    descricao,
    "Curadoria da loja",
    "",
    "",
    "TRUE",
    "active",
    "",
    "Título",
    "Padrão",
    preco(p.price),
    preco(p.compareAtPrice),
    "shopify",
    "10",
    "DENY",
    "TRUE",
    fotos[0],
    "1",
    p.title,
  ];
  const demais = fotos.slice(1).map((src, i) => {
    const linha = COLUNAS_CSV.map(() => "");
    linha[1] = p.handle; // URL handle
    linha[17] = src; // Product image URL
    linha[18] = String(i + 2); // Image position
    linha[19] = p.title; // Image alt text
    return linha;
  });
  return [primeira, ...demais];
}

/**
 * O CSV de um nicho, pronto para Admin → Produtos → Importar.
 *
 * Devolve string vazia quando o nicho não existe: loja sem catálogo não ganha
 * um arquivo vazio para confundir quem abre o pacote.
 */
export function csvDeProdutos(nicheId: string | undefined): string {
  const chave = String(nicheId ?? "").trim();
  const fonte = chave ? PRODUTOS_POR_NICHO[chave] : undefined;
  if (!fonte?.length) return "";
  const linhas = [COLUNAS_CSV.join(",")];
  for (const p of fonte) {
    for (const linha of linhasDoProduto(p)) linhas.push(linha.map(campo).join(","));
  }
  /* BOM: o Excel abre CSV UTF-8 sem ele com os acentos quebrados, e o arquivo
     passa pela mão de quem vende antes de chegar na Shopify. */
  return `﻿${linhas.join("\r\n")}\r\n`;
}
