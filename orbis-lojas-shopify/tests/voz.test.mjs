import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/**
 * A voz do Orbis é a mesma nas três frentes da suíte.
 *
 * Este app fala com a mesma pessoa que o app de design system e o portal, e o
 * dono pediu um tom só: direto, sem travessão, como quem conversa com o chefe.
 * O app de design system tem um teste igual a este; ter os dois é o que impede
 * as duas casas de irem se afastando frase a frase.
 *
 * Comentário de código fica de fora: ali o travessão é do programador para o
 * programador. E fica de fora o site GERADO para o cliente, que não é o Orbis
 * falando: numa citação, o traço antes do nome de quem falou é tipografia.
 */

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, "..");
const PASTAS = ["app", "lib"];

/**
 * Dois traços que não são fala, e por isso ficam.
 *
 * Numa citação do site do cliente, o traço antes do nome de quem falou é
 * tipografia. Na tabela de comparação, o traço é o símbolo de "esta não tem",
 * e trocá-lo por outro caractere só tornaria a ausência menos legível.
 */
const NAO_E_FALA = [/<strong[^>]*>—\s*\$\{/, /<i key=\{[\s\S]*?\}>—<\/i>/];

function arquivos(dir, achados = []) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const caminho = join(dir, item.name);
    if (item.isDirectory()) {
      if (!/node_modules|dist|\.next|\.wrangler/.test(item.name)) arquivos(caminho, achados);
      continue;
    }
    if (/\.(ts|tsx|mjs)$/.test(item.name) && !/\.test\./.test(item.name)) achados.push(caminho);
  }
  return achados;
}

/** As linhas que são código, sem as que são comentário de bloco ou de linha. */
function linhasDeCodigo(fonte) {
  const saida = [];
  let dentroDeBloco = false;
  fonte.split("\n").forEach((linha, i) => {
    const t = linha.trim();
    if (dentroDeBloco) {
      if (t.includes("*/")) dentroDeBloco = false;
      return;
    }
    if (t.startsWith("/*") || t.startsWith("{/*")) {
      if (!t.includes("*/")) dentroDeBloco = true;
      return;
    }
    if (t.startsWith("*") || t.startsWith("//")) return;
    saida.push({ n: i + 1, texto: linha });
  });
  return saida;
}

test("o app inteiro é lido, senão o teste não prova nada", () => {
  const lidos = PASTAS.flatMap((p) => arquivos(join(RAIZ, p)));
  assert.ok(lidos.length > 10, `esperava o app inteiro, li ${lidos.length} arquivos`);
});

test("nenhuma frase de tela usa travessão", () => {
  const ofensas = [];
  for (const arquivo of PASTAS.flatMap((p) => arquivos(join(RAIZ, p)))) {
    const fonte = readFileSync(arquivo, "utf8");
    if (!fonte.includes("—")) continue;
    for (const { n, texto } of linhasDeCodigo(fonte)) {
      if (!texto.includes("—")) continue;
      if (NAO_E_FALA.some((p) => p.test(texto))) continue;
      ofensas.push(`${relative(RAIZ, arquivo)}:${n}  ${texto.trim().slice(0, 90)}`);
    }
  }
  assert.deepEqual(
    ofensas,
    [],
    `travessão em texto de tela. Troque por vírgula, dois pontos ou ponto final:\n${ofensas.join("\n")}`,
  );
});
