import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { estadoValido } from "@/lib/shopify-oauth";

/**
 * A TELA PERGUNTA se o cliente já aprovou.
 *
 * A aprovação acontece em OUTRA aba, na Shopify, e a aba de origem não tem como
 * saber quando terminou. Ela pergunta aqui de tempos em tempos.
 *
 * Poderia ser `postMessage` entre as abas, e seria mais elegante — mas
 * dependeria de a aba de origem continuar viva e de as duas se enxergarem. Uma
 * pergunta a cada dois segundos funciona mesmo quando o cliente fecha a aba,
 * volta pela outra janela ou demora a decidir.
 *
 * Devolve o ESTADO e nada mais: nunca o token. O token não tem por que passar
 * pelo navegador — quem instala é o servidor.
 */
export async function GET(request: Request) {
  const identity = await getIdentity();
  if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
  const viewer = await ensureUser(identity);
  await ensureDatabase();

  const estado = new URL(request.url).searchParams.get("estado") ?? "";
  if (!estadoValido(estado)) return Response.json({ error: "ESTADO_INVALIDO" }, { status: 400 });

  /* escopado ao dono: um `state` de outra pessoa não vira resposta aqui */
  const linha = await getD1()
    .prepare("SELECT loja, status FROM shopify_conexoes WHERE estado = ? AND user_id = ?")
    .bind(estado, viewer.id)
    .first<{ loja: string; status: string }>();

  if (!linha) return Response.json({ status: "sumiu" });
  return Response.json({ status: linha.status, loja: linha.loja });
}
