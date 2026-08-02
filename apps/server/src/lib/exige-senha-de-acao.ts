import type { Context } from 'hono';
import { CABECALHO_DA_ACAO, senhaDeAcaoConfere } from './portao.js';

/**
 * A guarda das duas ações que custam: extrair um site e gerar outro.
 *
 * Devolve `null` quando pode seguir, ou a RESPOSTA de recusa quando não pode.
 * A forma é essa, e não um middleware, porque só duas rotas usam: um middleware
 * teria de conhecer a lista delas, e essa lista viveria longe das rotas que ela
 * governa — que é como uma rota nova nasce desprotegida sem ninguém notar.
 *
 * O código de recusa é 428 (Precondition Required), e não 401 ou 403. Os dois
 * significam "você não deveria estar aqui", e não é o caso: a sessão é
 * legítima, só falta confirmar ESTE gasto. A interface precisa distinguir, ou
 * ela mandaria a pessoa entrar de novo em vez de pedir a confirmação.
 */
export const exigeSenhaDeAcao = (c: Context): Response | null => {
  if (senhaDeAcaoConfere(c.req.header(CABECALHO_DA_ACAO))) return null;
  return c.json(
    {
      error: 'senha_de_acao',
      message:
        'Esta é das caras, senhor. Antes de eu pôr a máquina para trabalhar, me confirme a credencial.',
    },
    428,
  );
};
