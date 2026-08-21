import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

/**
 * O NOME DE VITRINE, a partir do anúncio do fornecedor.
 *
 * O dono abriu a loja gerada e viu isto num cartão de produto:
 *
 *     "Cão dormindo com um cachorro abraço pato brinquedos para aliviar o
 *      tédio do pequeno pato amarelo animal de estimação bon"
 *
 * Quatro linhas para dizer "pato de pelúcia", terminando num "bon" que não é
 * palavra. Não era defeito de tela: 88 dos 100 títulos do catálogo chegam
 * cortados em exatamente 120 caracteres, no meio da palavra, porque foi assim
 * que a coleta os trouxe da AliExpress.
 *
 * Estes testes travam as duas metades do conserto: o nome fica curto e
 * inteiro, e NADA nele é inventado.
 */

const raiz = fileURLToPath(new URL("..", import.meta.url));

async function comServidor(trabalho) {
  const server = await createServer({ configFile: false, root: raiz, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
  try { return await trabalho(server); } finally { await server.close(); }
}

const semAcento = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Palavra de LIGAÇÃO é gramática, não conteúdo.
 *
 * A promessa que vale a pena cobrar é sobre substantivo, adjetivo, número e
 * marca: é aí que mora a mercadoria. Exigir que "de" e "para" também venham do
 * anúncio impediria escrever "Pato de pelúcia macio 50cm" a partir de "50cm
 * macio colorido pato brinquedo de pelúcia", que é exatamente o trabalho de
 * pôr as palavras do fornecedor na ordem em que uma loja as escreve.
 */
const LIGACAO = new Set(["de", "do", "da", "dos", "das", "para", "com", "sem", "em", "no", "na", "nos", "nas", "e", "ou", "a", "o", "as", "os", "por", "ao", "um", "uma"]);
const palavrasDe = (texto) => semAcento(texto).split(/[^0-9a-z]+/).filter((p) => p && !LIGACAO.has(p));

test("o anúncio do fornecedor vira nome curto, inteiro e sem invenção", async () => {
  await comServidor(async (server) => {
    const { nomeDeProduto, caracteristicasDoProduto, descricaoDoProduto } = await server.ssrLoadModule("/lib/nome-de-produto.ts");

    /* o caso que o dono mostrou, letra por letra */
    const oPato = "Cão dormindo com um cachorro abraço pato brinquedos para aliviar o tédio do pequeno pato amarelo animal de estimação bon";
    const nome = nomeDeProduto(oPato);
    assert.ok(nome.length <= 48, `nome com ${nome.length} caracteres`);
    assert.ok(!nome.endsWith("bon"), "o pedaço de palavra da coleta ficou no nome");
    assert.ok(!/\s(de|para|com|e|do|da|no|na|em|sem|ou)$/i.test(nome), "nome terminando em ligação parece frase interrompida");

    /* a lista de palavras-chave vira nome no primeiro trecho */
    assert.equal(
      nomeDeProduto("Bola de brinquedo para cães, bola de brinquedo não tóxica resistente à mordida para cães de estimação, filhote de cachor"),
      "Bola de brinquedo para cães",
    );

    /* o LOTE do anúncio não é o produto — e a abreviação com cedilha é a
       armadilha: para o JavaScript "ç" não é letra, então um `\\b` mal posto
       deixava a loja abrir com "Çs rolo de gelo facial" */
    assert.equal(nomeDeProduto("1pc feminino sexy cor sólida camisola"), "Feminino sexy cor sólida camisola");
    assert.ok(!nomeDeProduto("1/2/3 pçs rolo de gelo facial cuidados com a pele").startsWith("Çs"));
    assert.ok(nomeDeProduto("1/2/3 pçs rolo de gelo facial cuidados com a pele").startsWith("Rolo de gelo"));

    /* e nome não começa em ligação, pelo mesmo motivo que não termina */
    assert.equal(nomeDeProduto("De remendos de acne estrela multicoloridos"), "Remendos de acne estrela multicoloridos");

    /* marca não é minúscula: baixar tudo para "sentence case" apagaria UGREEN */
    assert.ok(nomeDeProduto("UGREEN Studio Pro 48dB ANC Fones de ouvido sem fio").startsWith("UGREEN"));

    /* a característica não repete o nome: quando o anúncio não tem vírgula até
       tarde, o primeiro trecho É o nome com um pedaço a mais */
    const comRepeticao = "Addiesdive relógio de aço inoxidável masculino europeu e americano negócios lazer relógio de quartzo à prova dwaterproof";
    for (const item of caracteristicasDoProduto(comRepeticao)) {
      assert.ok(!semAcento(item).startsWith(semAcento(nomeDeProduto(comRepeticao))), `característica repete o nome: ${item}`);
    }

    /* a descrição não devolve o pedaço de palavra pela porta dos fundos */
    assert.ok(!descricaoDoProduto({ title: oPato, rating: 4.9, sold: "10.000+  vendido(s)" }).includes("bon<"));
    /* e o volume de vendas chega sem o espaço duplo do fornecedor */
    assert.ok(descricaoDoProduto({ title: oPato, rating: 4.9, sold: "10.000+  vendido(s)" }).includes("10.000+ vendido(s)"));
  });
});

test("nada inventado: toda palavra do nome já estava no anúncio", async () => {
  await comServidor(async (server) => {
    const { nomeDeVitrine, caracteristicasDoProduto } = await server.ssrLoadModule("/lib/nome-de-produto.ts");
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");
    const todos = Object.values(PRODUTOS_POR_NICHO).flat();
    assert.equal(todos.length, 100, "o acervo mudou de tamanho; confira o catálogo");

    for (const produto of todos) {
      const entrada = new Set(semAcento(produto.title).split(/[^0-9a-z]+/).filter(Boolean));
      const nome = nomeDeVitrine(produto);

      /**
       * A regra da casa, medida palavra por palavra: este módulo ENCURTA o que
       * o fornecedor escreveu, nunca acrescenta. Nome de produto inventado é
       * promessa sobre mercadoria que ninguém conferiu.
       */
      for (const palavra of palavrasDe(nome)) {
        assert.ok(entrada.has(palavra), `"${palavra}" não estava no anúncio de ${produto.handle}`);
      }
      for (const item of caracteristicasDoProduto(produto.title)) {
        for (const palavra of palavrasDe(item)) {
          assert.ok(entrada.has(palavra), `característica inventou "${palavra}" em ${produto.handle}`);
        }
      }

      /* e o retrato do acervo inteiro: nenhum vazio, nenhum comprido, nenhum
         terminando em ligação, nenhum de uma palavra só */
      assert.ok(nome.length >= 8, `nome curto demais em ${produto.handle}: "${nome}"`);
      assert.ok(nome.length <= 48, `nome comprido em ${produto.handle}: ${nome.length}`);
      assert.ok(nome.includes(" "), `nome de uma palavra só em ${produto.handle}: "${nome}"`);
      assert.ok(!/\s(de|do|da|dos|das|para|com|sem|em|no|na|e|ou|por)$/i.test(nome), `ligação no fim em ${produto.handle}: "${nome}"`);
      assert.ok(!/^(de|do|da|para|com|em|no|na|e|ou)\s/i.test(nome), `ligação no começo em ${produto.handle}: "${nome}"`);
    }
  });
});

test("a loja e o CSV mostram o MESMO nome: um lugar decide", async () => {
  await comServidor(async (server) => {
    const { nomeDeVitrine } = await server.ssrLoadModule("/lib/nome-de-produto.ts");
    const { csvDeProdutos, COLUNAS_CSV } = await server.ssrLoadModule("/lib/catalogo-csv.ts");
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");

    /**
     * O CSV é a loja que o cliente sobe na Shopify de verdade. Se a prévia
     * mostrar o nome curto e o arquivo levar o título cru, o cliente aprova uma
     * loja e recebe outra — que é o defeito que este app existe para não ter.
     */
    const csv = csvDeProdutos("pet", ["Brinquedos"]);
    for (const produto of PRODUTOS_POR_NICHO.pet) {
      assert.ok(csv.includes(nomeDeVitrine(produto)), `o CSV não leva o nome de ${produto.handle}`);
      assert.ok(!csv.includes(produto.title), `o CSV ainda leva o título cru de ${produto.handle}`);
    }
    assert.ok(COLUNAS_CSV.includes("Title"));
  });
});

/**
 * A TABELA DE NOMES CURADOS não pode virar letra morta.
 *
 * Ela é casada com o catálogo pelo `handle`, e o catálogo é um arquivo GERADO:
 * rodar o extrator de novo troca os handles e, sem ninguém perceber, todo nome
 * escrito à mão para de ser usado — a loja volta a mostrar a ordem de palavras
 * do marketplace e ninguém vê erro nenhum na tela, porque a regra automática
 * continua respondendo. Este teste é o alarme.
 */
test("todo nome curado pertence a um produto que existe, e cobre o acervo", async () => {
  await comServidor(async (server) => {
    const { NOMES_CURADOS } = await server.ssrLoadModule("/lib/nomes-curados.ts");
    const { PRODUTOS_POR_NICHO } = await server.ssrLoadModule("/lib/catalogo-nichos.ts");
    const todos = Object.values(PRODUTOS_POR_NICHO).flat();
    const porHandle = new Map(todos.map((produto) => [produto.handle, produto]));

    const orfaos = Object.keys(NOMES_CURADOS).filter((handle) => !porHandle.has(handle));
    assert.deepEqual(orfaos, [], "nome curado apontando para produto que não existe mais");

    const semNome = todos.filter((produto) => !NOMES_CURADOS[produto.handle]).map((p) => p.handle);
    assert.deepEqual(semNome, [], "produto do acervo sem nome curado; escreva o dele ou aceite a regra automática aqui");

    /* e o nome curado obedece à mesma regra dos outros: palavra que não estava
       no anúncio não entra, por mais bonito que fique */
    for (const [handle, nome] of Object.entries(NOMES_CURADOS)) {
      const entrada = new Set(semAcento(porHandle.get(handle).title).split(/[^0-9a-z]+/).filter(Boolean));
      for (const palavra of palavrasDe(nome)) {
        assert.ok(entrada.has(palavra), `"${palavra}" foi inventado no nome de ${handle}`);
      }
    }
  });
});
