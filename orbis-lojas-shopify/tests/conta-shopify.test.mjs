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

test("o cliente passa pela conta Shopify ANTES de criar, e a unica saida passa pelo link", async () => {
  const shell = await readFile(join(RAIZ, "app/AppShell.tsx"), "utf8");

  /* a ordem é o que importa: perguntar isso no fim seria perguntar tarde, com
     marca, cores e produtos já escolhidos */
  const ordem = shell.match(/if \(flow === "client"\)[\s\S]*?if \(flow === "client-criar"\)[\s\S]*?\n/);
  assert.ok(ordem, "o passo da conta precisa vir antes do ClientFlow");
  assert.match(ordem[0], /ContaShopify/);
  assert.match(ordem[0], /ClientFlow/);

  const tela = await readFile(join(RAIZ, "app/ContaShopify.tsx"), "utf8");

  /**
   * A ÚNICA saída para a criação passa pelo link de indicação.
   *
   * O atalho "já tenho conta" pulava o link sem pular a necessidade da conta,
   * e era por ali que a indicação se perdia. Agora `onSeguir` só existe depois
   * que a Shopify foi aberta.
   */
  assert.doesNotMatch(tela, /Já tenho conta/, "o atalho que pulava o link não pode voltar");
  const liberado = tela.match(/\{abriu \?[\s\S]*?\)\}/);
  assert.ok(liberado, "o seguir precisa depender de ter aberto a Shopify");
  assert.match(liberado[0], /onClick=\{onSeguir\}/, "o seguir mora no ramo de depois do clique");
  assert.match(tela, /onClick=\{\(\) => setAbriu\(true\)\}/, "abrir o link é o que libera");

  /* e a tela não presume o que não viu: ela sabe que a aba abriu, não que a
     conta foi mesmo criada. O comentário do arquivo pode falar disso; o que
     não pode é a FRASE DE TELA afirmar. */
  const semComentarios = tela.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(semComentarios, /[Cc]onta criada|[Cc]onta confirmada/);

  /* dá para voltar ao portão: escolher a porta errada não pode prender */
  assert.match(tela, /onVoltar/);
  /* o link abre FORA, sem levar o endereço do app junto */
  assert.match(tela, /target="_blank"/);
  assert.match(tela, /rel="noreferrer"/);
});

test("o link em uso é o de indicação, com o rid que liga a conta à origem", async () => {
  const modulo = await readFile(join(RAIZ, "app/shopify-afiliado.ts"), "utf8");
  const emUso = modulo.match(/export const LINK_DE_AFILIADO = "([^"]+)"/)?.[1] ?? "";
  assert.ok(emUso, "o link precisa estar escrito, não derivado");
  /* o rid é o identificador da indicação: sem ele o link continua abrindo o
     cadastro e a comissão simplesmente não acontece */
  assert.match(emUso, /[?&]rid=[0-9a-f-]{8,}/i, `link sem rid: ${emUso}`);
  assert.match(emUso, /^https:\/\/accounts\.shopify\.com\/signup/, "o destino é o cadastro, não a home");
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
      /* qualquer host da Shopify para onde a PESSOA é levada — accounts, www ou
         o domínio nu. O CDN fica de fora: `cdn.shopify.com` é onde o Liquid
         busca asset da plataforma, não destino de clique. */
      if (/["'`]https?:\/\/(?!cdn\.)([a-z0-9-]+\.)*shopify\.com/i.test(limpa)) { comEndereco.push(arquivo); break; }
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

/**
 * UM teto de imagem no app inteiro, e ele é o da Shopify.
 *
 * Eram três: 5 MB no envio pelo editor, 20 MB no asset de tema, 20 MB ao
 * salvar o que o gerador devolve. O de 5 MB recusava foto que a Shopify aceita
 * sem reclamar, e o número não tinha justificativa escrita em lugar nenhum.
 *
 * Teto duplicado é como a discordância nasce: alguém sobe um e esquece o
 * outro, e o app passa a discordar de si mesmo sem nenhum erro na tela.
 */
test("o teto de imagem é um só, vale 20 MB, e nenhuma tela cita outro número", async () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const regras = await readFile(join(raiz, "lib/business-rules.mjs"), "utf8");
  assert.match(regras, /export const MAX_UPLOAD_BYTES = 20 \* 1024 \* 1024;/);
  assert.match(regras, /size > MAX_UPLOAD_BYTES/, "a validação usa a constante, não um número solto");

  /* ninguém pode ter a própria cópia do teto */
  const arquivos = [
    "lib/shopify-theme.ts",
    "app/api/marca-imagens/route.ts",
    "app/ClientFlow.tsx",
    "app/AppShell.tsx",
    "app/ClientMarcaBancada.tsx",
  ];
  for (const caminho of arquivos) {
    const fonte = await readFile(join(raiz, caminho), "utf8");
    for (const linha of fonte.split(/\r?\n/)) {
      const limpa = linha.trim();
      if (limpa.startsWith("*") || limpa.startsWith("//") || limpa.startsWith("/*")) continue;
      assert.doesNotMatch(limpa, /\b5 \* 1024 \* 1024\b/, `${caminho} tem o teto antigo de 5 MB`);
      assert.doesNotMatch(limpa, /até 5 MB/, `${caminho} promete 5 MB na tela`);
    }
    assert.match(fonte, /MAX_UPLOAD_(BYTES|MB)/, `${caminho} precisa usar o teto compartilhado`);
  }
});
