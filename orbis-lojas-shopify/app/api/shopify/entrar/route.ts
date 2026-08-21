import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { credenciaisDoApp, normalizarDominio } from "@/lib/shopify-admin";
import { enderecoDeAutorizacao, novoEstado } from "@/lib/shopify-oauth";

/**
 * A IDA: prepara a viagem até a tela de permissões da Shopify.
 *
 * É a metade visível do OAuth, e o motivo de ele existir: o cliente não cria
 * app, não marca escopo e não copia chave. Ele clica, lê o que o app quer fazer
 * na tela DA SHOPIFY, e aprova.
 *
 * Esta rota não fala com a Shopify: ela sorteia um `state`, guarda o recado e
 * devolve para onde ir. Quem conversa é a volta.
 *
 * ## Por que ela devolve JSON em vez de redirecionar
 *
 * Quem acompanha a autorização é a TELA, e para acompanhar ela precisa do
 * `state` — que é sorteado aqui, no servidor. Redirecionando direto, o `state`
 * ficaria só com a Shopify e com a aba nova, e a janela de origem não teria
 * como saber quando o cliente aprovou.
 *
 * Assim a tela abre a aba, guarda o `state` e pergunta de tempos em tempos se
 * já foi.
 */
export async function POST(request: Request) {
  const identity = await getIdentity();
  if (!identity) return new Response("Authentication required", { status: 401 });
  const viewer = await ensureUser(identity);
  await ensureDatabase();

  const corpo = (await request.json().catch(() => ({}))) as { loja?: string; projectId?: string };
  const loja = normalizarDominio(corpo.loja ?? "");
  const projectId = String(corpo.projectId ?? "").slice(0, 80);
  if (!loja || !projectId) return recusa("Faltou o endereço da loja ou o projeto.");

  const credenciais = credenciaisDoApp(env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET);
  /**
   * O endereço de retorno é DERIVADO do endereço público do app, nunca do
   * pedido. Aceitar um retorno vindo do navegador seria deixar qualquer um
   * escolher para onde a autorização volta — que é exatamente o ataque que o
   * `redirect_uri` registrado na Shopify existe para impedir.
   */
  const retorno = `${String(env.ORBIS_PUBLIC_URL ?? "").trim().replace(/\/+$/, "")}/api/shopify/retorno`;
  if (!credenciais.clientId.trim()) return recusa("O app ainda não tem as credenciais da Shopify configuradas.");
  if (!/^https:\/\//i.test(retorno)) {
    return recusa(
      "Para o cliente conectar a loja dele, a Shopify precisa devolver a autorização num endereço público. Configure ORBIS_PUBLIC_URL (um túnel local ou o domínio do app) e registre esse mesmo endereço, com /api/shopify/retorno no fim, nas URLs de redirecionamento do app.",
      "SEM_ENDERECO_PUBLICO",
    );
  }

  const estado = novoEstado();
  const destino = enderecoDeAutorizacao({ loja, clientId: credenciais.clientId, retorno, estado });
  if (!destino) return recusa("Não consegui montar o endereço de autorização com esses dados.");

  /* o recado é gravado ANTES do redirecionamento: se a volta chegar sem linha
     correspondente, ela não veio de uma ida nossa e é recusada */
  await getD1()
    .prepare("INSERT INTO shopify_conexoes(estado, user_id, project_id, loja, status) VALUES (?, ?, ?, ?, 'pendente')")
    .bind(estado, viewer.id, projectId, loja)
    .run();

  return Response.json({ estado, destino });
}

/**
 * A recusa é DADO, não página.
 *
 * Quem chama esta rota agora é a tela do app, e é ela que sabe onde pôr a
 * frase. Devolver HTML aqui obrigaria a tela a exibi-lo em algum lugar, e
 * "algum lugar" costuma virar uma aba em branco.
 */
function recusa(mensagem: string, erro = "NAO_DEU"): Response {
  return Response.json({ error: erro, mensagem }, { status: 400 });
}
