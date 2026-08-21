import { env } from "cloudflare:workers";
import { ensureDatabase, getD1 } from "@/lib/data";
import { credenciaisDoApp, normalizarDominio } from "@/lib/shopify-admin";
import { assinaturaValida, escoposFaltando, estadoValido, trocarCodigoPorToken } from "@/lib/shopify-oauth";

/**
 * A VOLTA: a Shopify traz a autorização, e nós provamos que é ela.
 *
 * Esta rota não tem sessão para se apoiar — quem chega é um redirecionamento
 * vindo de fora. Então ela não pergunta "quem é você"; ela CONFERE, e confere
 * três coisas antes de tocar em qualquer token:
 *
 * 1. **A assinatura.** Só quem tem o Client Secret consegue produzi-la. Sem
 *    isso, qualquer um forjaria uma volta e nos faria instalar numa loja que
 *    não pediu nada.
 * 2. **O `state`.** Tem de existir na tabela, pendente, e ter sido sorteado por
 *    uma ida nossa. É o que amarra esta volta àquela ida.
 * 3. **A loja.** A que voltou tem de ser a mesma que foi. Divergiu, para tudo.
 *
 * Só depois disso o código vira token — trocar antes e perguntar depois seria
 * deixar qualquer um nos fazer pedir tokens à Shopify.
 */
export async function GET(request: Request) {
  await ensureDatabase();
  const url = new URL(request.url);
  const parametros = url.searchParams;
  const estado = parametros.get("state") ?? "";
  const loja = normalizarDominio(parametros.get("shop") ?? "");
  const codigo = parametros.get("code") ?? "";

  if (!estadoValido(estado) || !loja || !codigo) return pagina("Autorização incompleta", "Faltou informação no retorno da Shopify.");

  const credenciais = credenciaisDoApp(env.SHOPIFY_CLIENT_ID, env.SHOPIFY_CLIENT_SECRET);
  if (!(await assinaturaValida(parametros, credenciais.clientSecret, url.search))) {
    /**
     * Diagnóstico sem vazamento.
     *
     * Assinatura recusada é o erro mais cego que existe: a tela diz "não
     * confere" e não há por onde começar — pode ser segredo trocado, pode ser
     * a mensagem montada de um jeito e assinada de outro.
     *
     * Então aqui sai a query COMO ELA CHEGOU, com os dois únicos campos
     * sensíveis trocados pelo formato deles: o `hmac`, que é a prova, e o
     * `code`, que ainda vale uma troca por token. O resto (`shop`, `state`,
     * `timestamp`, `host`) não é segredo, e é justamente onde mora a diferença
     * de codificação que derruba a conferência.
     */
    console.warn("[orbis] assinatura recusada", {
      /* o TAMANHO, nunca o valor: 38 é o esperado, e foi um 39 — um retorno
         de carro do arquivo CRLF — que derrubou a conferência a primeira vez */
      tamanhoDoSegredo: credenciais.clientSecret.length,
      cruaDifere: decodeURIComponent(url.search) !== url.search,
      query: url.search.replace(/^\?/, "").replace(/(^|&)(hmac|code)=([^&]*)/g, (_t, antes, campo, valor) => `${antes}${campo}=<${valor.length} caracteres>`),
    });
    /* a mensagem é curta de propósito: quem forjou não ganha pista de qual das
       conferências reprovou */
    return pagina("Autorização recusada", "A assinatura desta autorização não confere.");
  }

  const linha = await getD1()
    .prepare("SELECT loja, status FROM shopify_conexoes WHERE estado = ?")
    .bind(estado)
    .first<{ loja: string; status: string }>();
  if (!linha || linha.status !== "pendente") return pagina("Autorização recusada", "Esta autorização não corresponde a nenhum pedido em aberto.");
  if (linha.loja !== loja) return pagina("Autorização recusada", "A loja que voltou não é a mesma que foi.");

  let acesso;
  try {
    acesso = await trocarCodigoPorToken(loja, credenciais, codigo);
  } catch (erro) {
    return pagina("Não consegui concluir", (erro as Error).message);
  }

  /**
   * O escopo CONCEDIDO é conferido aqui, e não na hora de escrever.
   *
   * O cliente pode ter aprovado uma versão antiga do app, com menos permissão
   * do que a de hoje. Descobrir isso agora é uma frase clara; descobrir no meio
   * da instalação é meia loja montada.
   */
  const faltando = escoposFaltando(acesso.escopos);
  if (faltando.length) {
    await getD1().prepare("DELETE FROM shopify_conexoes WHERE estado = ?").bind(estado).run();
    return pagina("Faltou permissão", `A loja não concedeu: ${faltando.join(", ")}. Remova o app da loja e conecte de novo.`);
  }

  await getD1()
    .prepare("UPDATE shopify_conexoes SET token = ?, escopos = ?, status = 'conectado' WHERE estado = ?")
    .bind(acesso.token, acesso.escopos, estado)
    .run();

  return pagina("Loja conectada", "Pode fechar esta aba: a instalação continua na outra janela.", true);
}


function pagina(titulo: string, mensagem: string, sucesso = false): Response {
  const limpo = (texto: string) => texto.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>${limpo(titulo)}</title>
     <style>body{background:#050c0c;color:#cbd7d7;font:15px/1.6 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px}
     div{max-width:520px;border:1px solid ${sucesso ? "#1c4a52" : "#4a2420"};padding:24px;background:#020607;text-align:center}
     b{color:${sucesso ? "#22d3ee" : "#ffc0ba"};font-size:17px}</style>
     <div><b>${limpo(titulo)}</b><p>${limpo(mensagem)}</p></div>
     ${sucesso ? "<script>setTimeout(() => window.close(), 2500)</script>" : ""}`,
    { status: sucesso ? 200 : 400, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}
