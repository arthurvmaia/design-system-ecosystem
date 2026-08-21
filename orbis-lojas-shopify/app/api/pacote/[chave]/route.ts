import { env } from "cloudflare:workers";
import { PREFIXO_DO_PACOTE, chaveDePacoteValida, pacoteExpirou } from "@/lib/pacote-publico";

/**
 * O PACOTE DO TEMA, servido para a Shopify buscar.
 *
 * Esta é a ÚNICA rota do app sem autenticação, e ela existe por uma razão só:
 * a Shopify instala tema de um jeito único — a gente entrega uma URL e os
 * servidores DELA baixam o arquivo. Eles não fazem login, não mandam cookie e
 * não mandam cabeçalho. Uma rota que exigisse autenticação aqui simplesmente
 * não seria acessível a quem precisa acessá-la.
 *
 * ## O que segura a porta, já que não há senha
 *
 * - **A chave é imprevisível**: 32 caracteres sorteados por `crypto`. Não há
 *   listagem, não há índice, não há nome adivinhável.
 * - **A validade é curta**: o pacote morre em minutos, e o prazo é conferido
 *   aqui a cada pedido. Passou da hora, some, mesmo que alguém tenha a chave.
 * - **O alcance é um só**: nada fora do prefixo `pacotes/` é servido. A chave
 *   não vira caminho para o resto do armazenamento.
 *
 * ## E o que há dentro, se alguém adivinhar
 *
 * O tema e as artes da marca daquele cliente. Nenhuma credencial, nenhum dado
 * de comprador, nada da conta de ninguém. É o mesmo arquivo que o cliente baixa
 * pelo botão, e o risco de exposição foi pesado contra isso.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ chave: string }> }) {
  const { chave } = await params;
  /* a chave é conferida ANTES de virar caminho: sem isto, um `..` no endereço
     transformaria esta rota num leitor do armazenamento inteiro */
  if (!chaveDePacoteValida(chave) || !env.MEDIA) return new Response("Not found", { status: 404 });

  const objeto = await env.MEDIA.get(`${PREFIXO_DO_PACOTE}${chave}.zip`);
  if (!objeto) return new Response("Not found", { status: 404 });

  if (pacoteExpirou(objeto.customMetadata?.expiraEm)) {
    /* expirado é apagado na hora em que alguém tenta usá-lo: o prazo curto só
       vale de verdade se o arquivo sumir, e não se ele só deixar de ser servido */
    await env.MEDIA.delete(`${PREFIXO_DO_PACOTE}${chave}.zip`);
    return new Response("Not found", { status: 404 });
  }

  return new Response(objeto.body, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": 'attachment; filename="tema.zip"',
      /* nada de cache: o endereço morre em minutos, e uma cópia guardada por
         um intermediário sobreviveria ao prazo que é a própria proteção */
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
