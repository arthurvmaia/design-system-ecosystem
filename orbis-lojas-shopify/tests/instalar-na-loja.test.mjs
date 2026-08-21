import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * ONDE a permissão é pedida, e o que ela nunca pode custar.
 *
 * Instalar na loja do cliente exige uma chave que escreve produtos e temas na
 * conta dele. Isso muda três coisas de lugar, e é sobre essas três que este
 * arquivo é: o MOMENTO de pedir, a SAÍDA que continua existindo se der errado,
 * e o DESTINO da chave depois do uso.
 */

const ler = (caminho) => readFile(new URL(caminho, import.meta.url), "utf8");

test("a permissão é pedida no fim, e o portão pergunta só o endereço", async () => {
  const portao = await ler("../app/ContaShopify.tsx");
  const painel = await ler("../app/InstalarNaLoja.tsx");

  /**
   * O portão pergunta o ENDEREÇO, que não é permissão nenhuma: é o nome da
   * loja, e a pessoa acabou de escolhê-lo na aba ao lado.
   *
   * O que ele NÃO pede é a chave. Uma tela dizendo "este app quer gerenciar
   * seus produtos e temas" logo depois do cadastro é uma pergunta sem resposta
   * boa: quem chegou ali ainda não viu um pixel da loja dele. Pior: o app
   * ficaria guardando chave de escrita de gente que desistiu no meio.
   */
  assert.match(portao, /conta-shopify-endereco/, "o portão precisa perguntar o endereço");
  assert.doesNotMatch(portao, /shpat_|chave de acesso|Admin API/i, "chave não se pede no portão");

  /**
   * E o painel do fim NÃO pede chave nenhuma.
   *
   * A versão anterior pedia uma chave de acesso e ensinava, em quatro passos,
   * como criá-la no painel da Shopify. Isso morreu por dois motivos, e o
   * segundo bastaria sozinho: a Shopify aposentou os apps personalizados
   * criados no admin (de onde a chave saía), e pôr um cliente para criar app é
   * colo demais para quem só quer a loja no ar.
   *
   * Quem se identifica agora é o APP, com as credenciais do dono. O cliente diz
   * onde é a loja dele, e é só isso que a tela pergunta.
   */
  assert.doesNotMatch(painel, /type="password"/, "voltou a existir um campo de chave na tela do cliente");
  assert.doesNotMatch(painel, /shpat_|Desenvolver apps|escopos da Admin API/i, "o cliente não configura app nenhum");
  assert.match(painel, /Endereço da loja/, "o endereço é a única coisa perguntada");
});

test("a instalação é um caminho A MAIS: o ZIP continua de pé", async () => {
  const fluxo = await ler("../app/ClientFlow.tsx");

  /**
   * O pacote é a saída que funciona sempre: sem conta conectada, com chave
   * errada, com permissão faltando, com a loja fora do ar. Trocar o download
   * pelo painel seria apostar a entrega inteira numa integração que depende de
   * uma plataforma de terceiro estar de pé no momento exato.
   */
  assert.match(fluxo, /Baixar o ZIP/, "o download não pode sair da tela de pronto");
  assert.match(fluxo, /<InstalarNaLoja projectId=\{projetoEntregue\}/);
  /* e o painel só aparece com projeto entregue: pedir chave sem ter o que
     instalar é pedir permissão por pedir */
  assert.match(fluxo, /\{projetoEntregue && <InstalarNaLoja/);
});

test("as credenciais são do app, e o token não fica guardado", async () => {
  const rota = await ler("../app/api/shopify-instalar/route.ts");

  /**
   * As credenciais são do DONO do app e moram em variável de ambiente, como a
   * chave da Magnific. Elas nunca passam pelo navegador nem pelo formulário: a
   * rota lê o `env` e pede o token à Shopify.
   *
   * O token que volta vale 24 horas e não é gravado em lugar nenhum. Guardar
   * exigiria decidir onde, por quanto tempo e como invalidar; pedir de novo
   * custa uma chamada, e a instalação leva segundos.
   */
  assert.match(rota, /env\.SHOPIFY_CLIENT_ID/, "a credencial vem do ambiente, não da tela");
  assert.match(rota, /env\.SHOPIFY_CLIENT_SECRET/);
  assert.match(rota, /await obterToken\(dominio, credenciais\)/);
  /* e quem não configurou recebe uma frase que diz isso, não um erro da Shopify */
  assert.match(rota, /APP_NAO_CONFIGURADO/);
  assert.doesNotMatch(rota, /INSERT INTO[\s\S]{0,200}token/i, "o token não pode ir para o banco");
  assert.doesNotMatch(rota, /UPDATE[\s\S]{0,120}token\s*=/i);

  /* conferir prova domínio, chave e conexão ANTES de escrever: descobrir no
     meio que a chave era de outra loja deixa meia loja montada na conta errada */
  assert.match(rota, /await conferirLoja\(loja\)/);
  /* a ordem é lida no CORPO do handler, não no arquivo inteiro: a lista de
     imports está em ordem alfabética e mentia sobre a sequência de execução */
  const corpo = rota.slice(rota.indexOf("export async function POST"));
  const ordem = ["obterToken", "conferirLoja", "criarColecoes", "criarProdutos", "enviarArquivos", "instalarTema"];
  let anterior = -1;
  for (const passo of ordem) {
    const onde = corpo.indexOf(passo);
    assert.ok(onde > anterior, `${passo} saiu de ordem na instalação`);
    anterior = onde;
  }

  /* e a ação "conferir" não escreve: ela existe para a pessoa aprovar sabendo
     o tamanho do que autorizou */
  const conferir = rota.slice(rota.indexOf('=== "conferir"'), rota.indexOf("const relatorio"));
  assert.doesNotMatch(conferir, /criarColecoes|criarProdutos|enviarArquivos|instalarTema/);
});

test("o tema não é publicado por conta, e o que ficou de fora é declarado", async () => {
  const admin = await ler("../lib/shopify-admin.ts");
  const rota = await ler("../app/api/shopify-instalar/route.ts");

  /**
   * Publicar troca a loja NO AR do cliente. Quem decide trocar a vitrine que
   * está vendendo é ele, e o tema nasce fora do ar esperando essa decisão.
   */
  assert.match(admin, /role: "unpublished"/);
  assert.doesNotMatch(admin, /role: "main"/, "publicar sozinho troca a loja no ar do cliente");

  /**
   * E o relatório conta o que NÃO aconteceu com o mesmo destaque do que
   * aconteceu. O tema depende de um endereço público para a Shopify baixar o
   * pacote (é a única chamada assim, e a limitação é da plataforma): sem ele, o
   * relatório diz que ficou de fora em vez de fingir que instalou.
   */
  assert.match(rota, /motivo: "sem endereço público para o pacote/);
  assert.match(rota, /relatorio\.avisos\.push/);
});

/**
 * DUAS PORTAS DE ENTRADA, um caminho só de instalação.
 *
 * O token pode vir de dois lugares: das credenciais do dono (que a Shopify só
 * aceita dentro da mesma organização, servindo para ele testar) ou de uma
 * autorização que o CLIENTE deu (OAuth, que atende qualquer loja).
 *
 * Do ponto em que o token existe para a frente, o instalador não sabe a
 * diferença — e é esse o ponto. Dois instaladores divergiriam no primeiro
 * conserto feito só de um lado.
 */
test("o token vem do cliente ou do dono, e o instalador é o mesmo", async () => {
  const rota = await ler("../app/api/shopify-instalar/route.ts");
  const corpo = rota.slice(rota.indexOf("export async function POST"));

  /* a porta do cliente: um `state` de conexão aprovada */
  assert.match(corpo, /shopify_conexoes WHERE estado = \? AND user_id = \? AND status = 'conectado'/);
  /* a porta do dono: as credenciais do ambiente */
  assert.match(corpo, /await obterToken\(dominio, credenciais\)/);
  /* e as duas desembocam no MESMO ponto */
  assert.match(corpo, /conexao\?\.token \?\? \(await obterToken/);

  /**
   * A loja autorizada tem de ser a do pedido.
   *
   * Sem esta conferência, um `state` de uma loja serviria para escrever em
   * outra: bastaria pedir a instalação com outro domínio no corpo.
   */
  assert.match(corpo, /linha\.loja !== dominio/);
  assert.match(corpo, /LOJA_DIVERGENTE/);

  /* e a conexão é consumida: o token do cliente não sobrevive à instalação */
  assert.match(corpo, /DELETE FROM shopify_conexoes WHERE estado = \? AND user_id = \?/);
});

test("a tela leva o cliente à Shopify, e o token nunca passa pelo navegador", async () => {
  const painel = await ler("../app/InstalarNaLoja.tsx");
  const estadoRota = await ler("../app/api/shopify/estado/route.ts");

  /* a aba é aberta DENTRO do clique: abrir depois de uma resposta assíncrona
     cai no bloqueador de pop-up e o cliente não vê nada acontecer */
  const conectar = painel.slice(painel.indexOf("async function conectar"), painel.indexOf("async function chamar"));
  assert.ok(conectar.indexOf("window.open") < conectar.indexOf("await fetch"), "a janela precisa abrir antes do fetch");

  /* a espera tem teto: cliente que desistiu não deixa a tela girando para sempre */
  assert.match(conectar, /Date\.now\(\) > limite/);

  /**
   * E sem endereço público a tela CAI no caminho do dono, em vez de recusar.
   *
   * O OAuth precisa que a Shopify redirecione de volta; sem isso ele não
   * acontece. Mas o outro caminho continua existindo, e transformar a falta do
   * túnel em "não dá para instalar" tiraria do dono justamente o modo como ele
   * testa nas lojas dele.
   */
  assert.match(conectar, /SEM_ENDERECO_PUBLICO/);
  assert.match(conectar, /await chamar\("conferir", ""\)/);

  /**
   * E a rota de acompanhamento devolve o ESTADO, nunca o token. Quem instala é
   * o servidor; o token não tem por que passar pelo navegador em momento algum.
   */
  /* mirado na CONSULTA e na resposta, não no arquivo: o comentário da rota
     fala de token justamente para explicar por que ele não vai — e um
     `doesNotMatch` amplo reprova a explicação junto com o defeito */
  assert.match(estadoRota, /SELECT loja, status FROM shopify_conexoes/, "a consulta não pode nem buscar o token");
  const resposta = estadoRota.slice(estadoRota.indexOf("return Response.json({ status"));
  assert.doesNotMatch(resposta, /token/i, "o token não pode chegar ao navegador");
  assert.match(estadoRota, /AND user_id = \?/, "o state de outra pessoa não vira resposta");
});
