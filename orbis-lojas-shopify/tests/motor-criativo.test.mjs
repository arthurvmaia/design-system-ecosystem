import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createServer } from "vite";

/**
 * O MOTOR CRIATIVO é um, e esta frente usa o mesmo.
 *
 * A regra do `CLAUDE.md` é explícita: imagem, vídeo e criação de marca saem de
 * `@ds/creative`, não importa se quem pediu foi a geração de site, a loja
 * Shopify ou a frente Criativos. Uma segunda implementação de qualquer parte
 * visual é defeito, porque a divergência aparece tarde e como "a logo da loja
 * não é a mesma do site".
 *
 * Esta frente não pode IMPORTAR o motor: é projeto separado, com
 * `package-lock.json` e deploy próprios. Então o núcleo do motor vem espelhado
 * em `lib/motor/`, regravado por `pnpm motor:espelhar` do outro lado. Este
 * arquivo mede o que o espelho vale DAQUI — que é onde ele é usado.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

async function comVite(usar) {
  const server = await createServer({
    configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent",
  });
  try {
    return await usar(server);
  } finally {
    await server.close();
  }
}

/**
 * A DIVERGÊNCIA QUE ESTE TESTE FECHA, medida antes de existir.
 *
 * `modeloPadrao("imagem")` devolvia `"mystic"` — o primeiro item de uma lista
 * de segurança, escolhido pela ordem em que a lista foi escrita. A tela nunca
 * manda `modelo`, então TODA imagem de TODA loja saía dele: um modelo que o
 * produto nunca declarou, cujo preço ninguém mediu, e que não aparece em
 * catálogo nenhum. Enquanto isso, a frente Criativos gerava pelo preset
 * `imagem-padrao`. Duas frentes do mesmo app, dois modelos, nenhum aviso.
 */
test("o modelo padrão da loja sai do CATÁLOGO do motor, não da lista de segurança", async () => {
  await comVite(async (server) => {
    const magnific = await server.ssrLoadModule("/lib/magnific.ts");
    const { presetPorId, identificadorDe } = await server.ssrLoadModule("/lib/motor/presets.ts");

    const preset = presetPorId("imagem-padrao");
    assert.ok(preset, "o catálogo tem de conhecer o preset padrão de imagem");
    const doCatalogo = identificadorDe(preset, "rest");
    assert.ok(doCatalogo, "e ele tem de ter identificador REST medido");

    assert.equal(magnific.modeloPadrao("imagem"), doCatalogo);
    /* e o que ele NÃO pode voltar a ser */
    assert.notEqual(magnific.modeloPadrao("imagem"), "mystic");

    /* a lista de segurança continua existindo e continua fechada: ela é a
       fronteira de para onde a chave é enviada, e isso não é papel do catálogo */
    assert.ok(magnific.modeloValido("imagem", doCatalogo), "o modelo do catálogo tem de passar na lista de segurança");
    assert.equal(magnific.modeloValido("imagem", "modelo-inventado"), false);
  });
});

/**
 * O `null` do catálogo não pode virar palpite.
 *
 * O mesmo modelo tem nome diferente no MCP e no REST, e dois deles se
 * contradizem: `imagen-nano-banana-2` é o **Pro**, não o 2. Copiar o slug de um
 * transporte para o outro gera imagem, cobra crédito e entrega outra coisa —
 * sem erro nenhum na tela. Por isso identificador não medido é `null`.
 */
test("preset sem identificador REST medido devolve null, e não um nome parecido", async () => {
  await comVite(async (server) => {
    const magnific = await server.ssrLoadModule("/lib/magnific.ts");
    assert.equal(magnific.modeloDoPreset("imagem-marca"), null);
    assert.equal(magnific.modeloDoPreset("video-curto"), null);
    assert.equal(magnific.modeloDoPreset("preset-que-nao-existe"), null);
  });
});

/**
 * O que ainda não está no catálogo aparece numa LISTA, não numa fatura.
 *
 * Fallback silencioso é como `mystic` durou: ninguém decidiu por ele, ele só
 * estava em primeiro. Aqui o que cai no fallback tem de se declarar, com
 * motivo, para a dívida ser lida antes de ser paga.
 */
test("os papéis fora do catálogo se declaram, com motivo", async () => {
  await comVite(async (server) => {
    const magnific = await server.ssrLoadModule("/lib/magnific.ts");
    const fora = magnific.papeisForaDoCatalogo();

    /* imagem NÃO pode estar aqui: é o caminho que toda loja usa */
    assert.equal(fora.some((f) => f.papel === "imagem"), false, "imagem tem de sair do catálogo");
    /* vídeo está, e o motivo é o preço/identificador REST não medido */
    const video = fora.find((f) => f.papel === "video");
    assert.ok(video, "vídeo ainda cai no fallback e tem de dizer isso");
    assert.match(video.motivo, /REST/);
    for (const item of fora) assert.ok(item.motivo.length > 20, `motivo curto demais em ${item.papel}`);
  });
});

/**
 * O núcleo espelhado tem de ser USÁVEL daqui, não só existir.
 *
 * Um espelho que o bundler não resolve compila do lado de lá e explode do lado
 * de cá — e do lado de cá não há CI. Carregar os três de verdade é a prova.
 */
test("o núcleo espelhado carrega, e ele é o mesmo do motor", async () => {
  await comVite(async (server) => {
    const presets = await server.ssrLoadModule("/lib/motor/presets.ts");
    const precos = await server.ssrLoadModule("/lib/motor/precos.ts");
    const razao = await server.ssrLoadModule("/lib/motor/razao.ts");

    assert.ok(Array.isArray(presets.PRESETS) && presets.PRESETS.length >= 4);
    assert.equal(typeof precos.estimar, "function");
    assert.equal(typeof razao.lerRazao, "function");

    /* a tabela de preço tem validade, e vencida ela RECUSA em vez de responder
       com um número que virou ficção */
    const vencida = precos.estimar({ presetId: "imagem-padrao", transporte: "mcp", hoje: "2099-01-01" });
    assert.equal(vencida.ok, false);
    assert.match(vencida.motivo, /venceu/);

    /* e o transporte que ninguém mediu recusa, em vez de copiar o outro */
    const semMedida = precos.estimar({ presetId: "imagem-padrao", transporte: "rest", hoje: precos.MEDIDO_EM });
    assert.equal(semMedida.ok, false);
    assert.match(semMedida.motivo, /não foi medido/);
  });
});

/**
 * E os espelhos dizem, no próprio arquivo, que não são o original.
 *
 * Quem abre um deles para consertar precisa achar o original sem perguntar a
 * ninguém — senão o conserto fica aqui, o outro lado segue como estava, e a
 * divergência volta pela porta que o espelho existia para fechar.
 */
test("todo arquivo de lib/motor avisa que é espelho e nomeia o original", async () => {
  for (const arquivo of ["motor/presets.ts", "motor/precos.ts", "motor/razao.ts", "logo-derivar.ts"]) {
    const fonte = await readFile(new URL(`../lib/${arquivo}`, import.meta.url), "utf8");
    assert.match(fonte, /ARQUIVO ESPELHADO\. NÃO EDITE AQUI/, arquivo);
    assert.match(fonte, /pnpm motor:espelhar/, arquivo);
    assert.match(fonte, /packages\/creative-engine\/src\//, arquivo);
  }
});

/**
 * O GASTO passa a ser DECLARADO no ponto onde ele acontece.
 *
 * O `CLAUDE.md` cobra que orçamento generativo seja "declarado e contado". Esta
 * rota não fazia nem uma coisa nem outra: abria a tarefa na Magnific e seguia.
 * Agora ela declara — com a MESMA tabela medida que as outras duas frentes
 * usam, e não com um número escrito aqui.
 *
 * A rota não pode ser importada num teste (`cloudflare:workers` só existe no
 * workerd), então a conferência é sobre a fonte, como nos outros testes de rota
 * deste projeto.
 */
test("a rota de geração declara o custo pela tabela do motor, não por número próprio", async () => {
  const rota = await readFile(new URL("../app/api/marca-imagens/route.ts", import.meta.url), "utf8");

  assert.match(rota, /from "@\/lib\/motor\/precos"/, "o custo sai do motor");
  assert.match(rota, /custoDeclarado\(papel, corpo\.resolucao\)/, "e ele acompanha a resposta da geração");
  assert.match(rota, /transporte: "rest"/, "declarado no transporte que esta frente usa");
  /* e o papel vira PRESET antes de virar preço: é o preset que atravessa as três frentes */
  assert.match(rota, /PRESET_DO_PAPEL\[papel\]/);

  /* nenhum número de crédito escrito à mão nesta rota */
  const linhasDeCredito = rota.split("\n").filter((l) => /cr[eé]dito/i.test(l) && /[0-9]{2,}/.test(l));
  assert.deepEqual(linhasDeCredito, [], `crédito com número na rota: ${linhasDeCredito.join(" | ")}`);
});

/**
 * E o que ele declara HOJE é uma ausência, com o motivo escrito.
 *
 * A tabela do motor não tem linha REST medida: a API REST não tem endpoint de
 * simulação, então não dá para medi-la sem gastar. Copiar o número do MCP faria
 * a resposta parecer uma conta sendo um palpite — o erro que o catálogo inteiro
 * existe para impedir.
 *
 * Este teste trava a ausência DECLARADA. Quando alguém medir o REST e a tabela
 * ganhar a linha, ele reprova — e é isso que se quer: o dia em que o número
 * existir é o dia de ligar o razão, que já está espelhado ao lado.
 */
test("o custo em créditos ainda é uma ausência declarada, e não um palpite", async () => {
  await comVite(async (server) => {
    const { estimar } = await server.ssrLoadModule("/lib/motor/precos.ts");
    const hoje = new Date().toISOString().slice(0, 10);
    for (const presetId of ["imagem-padrao", "video-curto"]) {
      const conta = estimar({ presetId, transporte: "rest", quantidade: 1, segundos: 8, comAudio: true, hoje });
      assert.equal(conta.ok, false, presetId);
      assert.match(conta.motivo, /não foi medido/, presetId);
      /* o motivo tem de nomear o transporte: "não medido" sem dizer onde manda
         adivinhar se o problema é o preset, a resolução ou o caminho */
      assert.match(conta.motivo, /rest/, presetId);
    }
  });
});
