import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/**
 * O passo da conta Shopify, entre escolher "sou cliente" e começar a criar.
 *
 * Ele existe por dois motivos que puxam para o mesmo lado: a loja que este app
 * monta é um TEMA da Shopify, então sem conta lá o arquivo entregue não tem
 * onde ser aberto; e é o único ponto do fluxo em que abrir a Shopify já era
 * necessário, que é onde o link de indicação pode viver sem virar propaganda
 * espalhada pelo app.
 */

const RAIZ = fileURLToPath(new URL("..", import.meta.url));

test("o cliente passa pela conta Shopify ANTES de criar, e consegue seguir sem ela", async () => {
  const shell = await readFile(join(RAIZ, "app/AppShell.tsx"), "utf8");

  /* a ordem é o que importa: perguntar isso no fim seria perguntar tarde, com
     marca, cores e produtos já escolhidos */
  const ordem = shell.match(/if \(flow === "client"\)[\s\S]*?if \(flow === "client-criar"\)[\s\S]*?\n/);
  assert.ok(ordem, "o passo da conta precisa vir antes do ClientFlow");
  assert.match(ordem[0], /ContaShopify/);
  assert.match(ordem[0], /ClientFlow/);

  const tela = await readFile(join(RAIZ, "app/ContaShopify.tsx"), "utf8");
  /* quem já tem conta segue direto: barrar trocaria um passo útil por pedágio,
     e o site continua sendo do cliente */
  assert.match(tela, /onSeguir/, "tem de haver saída para quem já tem conta");
  assert.match(tela, /Já tenho conta/);
  /* e dá para voltar ao portão: escolher a porta errada não pode prender */
  assert.match(tela, /onVoltar/);
  /* o link abre FORA, sem levar o endereço do app junto */
  assert.match(tela, /target="_blank"/);
  assert.match(tela, /rel="noreferrer"/);
});

test("o link de indicação mora num lugar só, e o app avisa enquanto não estiver configurado", async () => {
  const modulo = await readFile(join(RAIZ, "app/shopify-afiliado.ts"), "utf8");
  assert.match(modulo, /export const LINK_DE_AFILIADO/);
  assert.match(modulo, /export const SEM_LINK_DE_INDICACAO/);

  /* Uma cópia só. Endereço de comissão espalhado é o tipo de coisa que se troca
     em metade dos lugares: o clique continua funcionando e o dinheiro para de
     chegar, sem nenhum erro na tela. */
  const pastas = ["app", "lib"];
  const arquivos = [];
  for (const pasta of pastas) {
    for (const nome of await readdir(join(RAIZ, pasta), { withFileTypes: true })) {
      if (nome.isFile() && /\.(ts|tsx)$/.test(nome.name)) arquivos.push(join(RAIZ, pasta, nome.name));
    }
  }
  const comEndereco = [];
  for (const arquivo of arquivos) {
    const fonte = await readFile(arquivo, "utf8");
    /* só linhas de código: comentário citando o endereço não é uma cópia viva */
    for (const linha of fonte.split(/\r?\n/)) {
      const limpa = linha.trim();
      if (limpa.startsWith("*") || limpa.startsWith("//") || limpa.startsWith("/*")) continue;
      /* o CDN da Shopify não conta: `cdn.shopify.com` é onde o Liquid busca
         asset da plataforma, não para onde a pessoa é levada */
      if (/["'`]https?:\/\/(www\.)?shopify\.com/i.test(limpa)) { comEndereco.push(arquivo); break; }
    }
  }
  assert.deepEqual(
    comEndereco.map((caminho) => caminho.replace(RAIZ, "")),
    ["app\\shopify-afiliado.ts".replace(/\\/g, process.platform === "win32" ? "\\" : "/")],
    "o endereço da Shopify só pode existir no módulo do link de indicação",
  );

  /* enquanto for o link de fábrica, a tela diz isso: comissão que não existe
     não pode passar por comissão que existe */
  const tela = await readFile(join(RAIZ, "app/ContaShopify.tsx"), "utf8");
  assert.match(tela, /SEM_LINK_DE_INDICACAO &&/);
  assert.match(tela, /não gera comissão/);
});
