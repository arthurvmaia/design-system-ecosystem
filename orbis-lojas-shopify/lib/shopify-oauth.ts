import { normalizarDominio, type Ambiente, type CredenciaisDoApp } from "./shopify-admin";

/**
 * O CLIENTE CONECTA A LOJA DELE, e não cria app nenhum.
 *
 * É o caminho que existe para atender terceiros. O outro — `obterToken`, com as
 * credenciais do dono — só funciona dentro da MESMA organização Shopify: serve
 * para o dono testar, e recusa a loja de qualquer cliente.
 *
 * Aqui o gesto é o de sempre na internet: o cliente é levado a uma tela DA
 * SHOPIFY listando o que o app quer fazer, aprova, e volta. A senha dele nunca
 * passa por nós; o que recebemos é um código, e o código vira token.
 *
 * ## As duas provas que a volta precisa dar
 *
 * Quem chega no endereço de retorno alega ser a Shopify trazendo uma
 * autorização. Duas coisas separam a alegação do fato, e as duas são conferidas
 * antes de qualquer token ser pedido:
 *
 * 1. **A assinatura (`hmac`).** Só quem tem o Client Secret consegue assiná-la,
 *    e o Secret está em duas mãos: as da Shopify e as nossas. Sem isso, qualquer
 *    um forjaria uma volta e nos faria instalar numa loja que não pediu nada.
 * 2. **O `state`.** Sorteado na ida e conferido na volta. É o que impede alguém
 *    de fazer o navegador de um cliente completar uma autorização que ele não
 *    começou.
 *
 * ## Onde isto exige um endereço público
 *
 * A Shopify REDIRECIONA de volta, e para redirecionar precisa de um endereço
 * que ela alcance. `localhost` não serve, e é a mesma fronteira do ZIP do tema:
 * um túnel resolve local, e hospedar resolve de vez.
 */

/**
 * O que o app pede para poder montar a loja.
 *
 * Os mesmos três da versão do app no Dev Dashboard, e por um motivo prático: a
 * tela de permissões lista o que se pede aqui, mas a Shopify só concede o que a
 * versão publicada declara. Pedir a mais aqui daria um erro do lado dela; pedir
 * a menos deixaria a instalação sem poder escrever.
 */
export const ESCOPOS = ["write_products", "write_themes", "write_files"] as const;

/** Um `state` sorteado, para provar que a volta é da ida. */
export function novoEstado(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function estadoValido(estado: string): boolean {
  return /^[0-9a-f]{32}$/.test(String(estado ?? ""));
}

/**
 * A tela de permissões da Shopify, para onde o cliente é mandado.
 *
 * Devolve vazio quando falta qualquer peça, e vazio é tratado como "não dá para
 * conectar" lá na frente. Montar um endereço pela metade mandaria o cliente
 * para uma página de erro da Shopify, e ele leria isso como defeito da loja
 * dele.
 */
export function enderecoDeAutorizacao({
  loja, clientId, retorno, estado,
}: { loja: string; clientId: string; retorno: string; estado: string }): string {
  const dominio = normalizarDominio(loja);
  if (!dominio || !clientId.trim() || !estadoValido(estado)) return "";
  if (!/^https:\/\//i.test(retorno)) return "";
  const parametros = new URLSearchParams({
    client_id: clientId.trim(),
    scope: ESCOPOS.join(","),
    redirect_uri: retorno,
    state: estado,
  });
  return `https://${dominio}/admin/oauth/authorize?${parametros.toString()}`;
}

/**
 * A ASSINATURA da volta confere?
 *
 * A Shopify assina os parâmetros com o Client Secret. A conta é: tira o `hmac`,
 * ordena o resto por nome, junta como `chave=valor&…` e assina com SHA-256. Se
 * bater, a volta é dela.
 *
 * A comparação é feita em TEMPO CONSTANTE. Comparar com `===` vaza, pelo tempo
 * de resposta, quantos caracteres iniciais bateram — e com isso se descobre a
 * assinatura certa um caractere por vez. É um ataque conhecido e a defesa custa
 * três linhas.
 */
export async function assinaturaValida(
  parametros: URLSearchParams,
  clientSecret: string,
  queryCrua = "",
): Promise<boolean> {
  const recebido = parametros.get("hmac") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(recebido) || !clientSecret.trim()) return false;

  /**
   * DUAS FORMAS da mesma mensagem, e a razão é empírica.
   *
   * A documentação diz "remova o hmac da query string e junte o resto". Só que
   * "o resto" tem duas leituras: os valores como VIERAM (ainda percent-encoded)
   * ou já decodificados. As bibliotecas oficiais não concordam entre si — a de
   * Node usa decodificado, os exemplos em Ruby e PHP usam a query crua — e a
   * diferença só aparece quando algum valor tem caractere escapado. O `host`
   * do retorno é base64 e pode terminar em `%3D`, que é exatamente esse caso.
   *
   * Medido aqui: a volta legítima da Shopify foi recusada com a forma
   * decodificada. Aceitar as duas não afrouxa nada — sem o Client Secret não se
   * produz assinatura válida para nenhuma delas.
   */
  const mensagens = [mensagemDecodificada(parametros), mensagemCrua(queryCrua)].filter(Boolean);
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(clientSecret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  let confere = false;
  for (const mensagem of mensagens) {
    const assinatura = await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(mensagem));
    const calculado = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, "0")).join("");
    /* sem `break`: sair no primeiro acerto faria o tempo de resposta contar
       qual das formas bateu, e tempo que varia é informação vazando */
    if (igualEmTempoConstante(calculado, recebido.toLowerCase())) confere = true;
  }
  return confere;
}

/** Os valores já decodificados, que é como a biblioteca de Node monta. */
function mensagemDecodificada(parametros: URLSearchParams): string {
  const partes: string[] = [];
  for (const [chave, valor] of [...parametros.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (chave === "hmac" || chave === "signature") continue;
    partes.push(`${chave}=${valor}`);
  }
  return partes.join("&");
}

/** Os pares como chegaram na URL, sem tocar no que está escapado. */
function mensagemCrua(query: string): string {
  const limpa = String(query ?? "").replace(/^\?/, "");
  if (!limpa) return "";
  return limpa
    .split("&")
    .filter((par) => par && !/^(hmac|signature)=/.test(par))
    .sort()
    .join("&");
}

function igualEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferenca === 0;
}

/**
 * O CÓDIGO vira token, e o token é daquela loja.
 *
 * Última etapa da volta, e a única que fala com a Shopify. Só acontece depois
 * de a assinatura e o `state` terem sido conferidos: trocar primeiro e
 * perguntar depois seria deixar qualquer um nos fazer pedir tokens.
 */
export async function trocarCodigoPorToken(
  loja: string,
  credenciais: CredenciaisDoApp,
  codigo: string,
  ambiente: Ambiente = {},
): Promise<{ token: string; escopos: string }> {
  const buscar = ambiente.buscar ?? fetch;
  const dominio = normalizarDominio(loja);
  if (!dominio) throw new Error("o endereço da loja não é um .myshopify.com válido");
  if (!/^[0-9a-zA-Z._-]{6,255}$/.test(String(codigo ?? ""))) throw new Error("o código da autorização não veio no formato esperado");

  const resposta = await buscar(`https://${dominio}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_id: credenciais.clientId.trim(),
      client_secret: credenciais.clientSecret.trim(),
      code: codigo,
    }),
  });
  const corpo = await resposta.text();
  let dados: { access_token?: string; scope?: string; error_description?: string; error?: string } = {};
  try { dados = JSON.parse(corpo); } catch { /* resposta sem JSON vira erro abaixo */ }
  if (!resposta.ok || !dados.access_token) {
    throw new Error(dados.error_description ?? dados.error ?? `a Shopify recusou a troca (${resposta.status})`);
  }
  return { token: dados.access_token, escopos: dados.scope ?? "" };
}

/**
 * O escopo concedido cobre o que a instalação vai fazer?
 *
 * O cliente pode aprovar uma versão antiga do app, com menos permissão do que a
 * de hoje. Descobrir isso ANTES de começar a escrever é a diferença entre uma
 * frase clara e meia loja montada.
 */
export function escoposFaltando(concedidos: string): string[] {
  const tem = new Set(String(concedidos ?? "").split(",").map((e) => e.trim()).filter(Boolean));
  return ESCOPOS.filter((escopo) => !tem.has(escopo));
}
