/**
 * O razão de crédito de um job: o que foi empenhado, o que foi gasto, e o que
 * ainda cabe.
 *
 * ## Por que empenhar antes de gastar
 *
 * O contrato manda PARAR ao zerar o teto. Parar exige saber, antes de chamar o
 * provedor, se aquela chamada cabe — e "cabe" não é só o que já saiu da conta:
 * é o que já saiu MAIS o que está em voo. Sem o empenho, duas produções
 * disparadas na mesma rodada olham o mesmo saldo, cada uma se acha dentro do
 * teto, e juntas estouram.
 *
 * ## Por que o lançamento é append-only
 *
 * Porque ele é a PROVA do gasto, não o placar. Um saldo que se sobrescreve não
 * responde "quando isso foi cobrado, e por quê"; uma lista que só cresce
 * responde, e ainda deixa a divergência aparecer quando o saldo real do
 * provedor não bate com a soma.
 *
 * ## O ciclo de uma referência
 *
 * `reserva` → `debito` (o provedor cobrou) ou `liberacao` (não cobrou).
 * Enquanto nenhum dos dois chegou, a reserva conta contra o teto: é dinheiro
 * que pode sair a qualquer momento. Falha técnica ANTES de o provedor aceitar
 * libera; falha depois debita, porque o crédito já saiu.
 */

import { z } from 'zod';

export const TipoDeLancamento = z.enum(['reserva', 'debito', 'liberacao']);
export type TipoDeLancamento = z.infer<typeof TipoDeLancamento>;

export const Lancamento = z.object({
  tipo: TipoDeLancamento,
  /** O que este lançamento cobre: uma variação, uma tentativa, um passo. */
  referencia: z.string().min(1),
  creditos: z.number().min(0),
  /** Quando. Injetado por quem grava, para o teste não depender do relógio. */
  em: z.number().int().positive(),
  /** Por que, quando não é óbvio. */
  motivo: z.string().min(1).nullable().default(null),
});
export type Lancamento = z.infer<typeof Lancamento>;

/**
 * O arquivo do razão, como ele vive em `criativos/<job>/razao.json`.
 *
 * `formato` existe para o dia em que a forma mudar: um arquivo que não diz a
 * própria versão obriga quem o lê a adivinhar, e adivinhar sobre dinheiro é o
 * que este arquivo existe para evitar.
 */
export const ArquivoDoRazao = z.object({
  formato: z.literal(1).default(1),
  lancamentos: z.array(Lancamento).default([]),
});
export type ArquivoDoRazao = z.infer<typeof ArquivoDoRazao>;

export type Razao = {
  /** Créditos que já saíram da conta, comprovadamente. */
  readonly gasto: number;
  /** Créditos em voo: reservados e ainda sem desfecho. */
  readonly empenhado: number;
  /** O que o teto já não cobre mais. */
  readonly comprometido: number;
};

/**
 * Lê a lista e diz onde a conta está.
 *
 * Uma referência com `debito` deixa de contar como empenho — o dinheiro saiu de
 * verdade e passou para `gasto`. Uma com `liberacao` some da conta: não saiu e
 * não vai sair.
 */
export const lerRazao = (lancamentos: readonly Lancamento[]): Razao => {
  /**
   * Cada desfecho consome a reserva ABERTA MAIS ANTIGA daquela referência.
   *
   * A versão anterior marcava a referência inteira como resolvida assim que via
   * um débito, o que apagava também as reservas POSTERIORES. O caso é comum: a
   * variação sai feia, o agente refaz com a mesma referência, e a segunda
   * reserva nasce já cancelada por um débito de antes. O razão então mostrava
   * `empenhado: 0` com dinheiro em voo, e `podeProduzir` liberava as próximas —
   * medido: 300 créditos num teto de 225, sem uma linha de erro.
   */
  const abertas = new Map<string, number[]>();
  let gasto = 0;

  for (const l of lancamentos) {
    if (l.tipo === 'reserva') {
      const fila = abertas.get(l.referencia) ?? [];
      fila.push(l.creditos);
      abertas.set(l.referencia, fila);
      continue;
    }
    const fila = abertas.get(l.referencia);
    if (fila !== undefined && fila.length > 0) fila.shift();
    // Débito sem reserva ainda conta como gasto: o dinheiro saiu de qualquer
    // jeito, e esconder isso seria o oposto do que este arquivo existe para
    // fazer. Quem impede débito solto é o comando, não a leitura.
    if (l.tipo === 'debito') gasto += l.creditos;
  }

  let empenhado = 0;
  for (const fila of abertas.values()) {
    for (const c of fila) empenhado += c;
  }
  return { gasto, empenhado, comprometido: gasto + empenhado };
};

/**
 * Há reserva ABERTA para esta referência?
 *
 * Serve ao comando: reservar duas vezes a mesma referência sem desfecho é o
 * caminho para o dinheiro em voo virar invisível, e debitar sem reserva é gasto
 * que ninguém autorizou.
 */
export const reservaAberta = (
  lancamentos: readonly Lancamento[],
  referencia: string,
): number | null => {
  let abertas = 0;
  let ultima: number | null = null;
  for (const l of lancamentos) {
    if (l.referencia !== referencia) continue;
    if (l.tipo === 'reserva') {
      abertas++;
      ultima = l.creditos;
    } else if (abertas > 0) {
      abertas--;
    }
  }
  return abertas > 0 ? ultima : null;
};

export type Veredito =
  | { readonly pode: true; readonly comprometidoDepois: number }
  | { readonly pode: false; readonly motivo: string };

/**
 * Esta produção cabe?
 *
 * Os tetos entram TODOS, e vence o menor. O teto do pedido é o que o cliente
 * autorizou; o do lote é o que o dono autorizou naquela rodada; o saldo real é
 * o que a conta do provedor tem. Ignorar qualquer um deles transforma "orçamento
 * contado" em frase de efeito: o teto do pedido não protege a conta, e o saldo
 * da conta não protege o cliente.
 */
export const podeProduzir = (opts: {
  readonly lancamentos: readonly Lancamento[];
  readonly custo: number;
  readonly tetoDoPedido: number;
  /** `null` quando o dono não declarou teto de lote nesta rodada. */
  readonly tetoDoLote: number | null;
  /** `null` quando não deu para consultar o saldo do provedor. */
  readonly saldoReal: number | null;
}): Veredito => {
  if (!Number.isFinite(opts.custo) || opts.custo <= 0) {
    return { pode: false, motivo: 'Custo tem de ser um número positivo.' };
  }

  const { comprometido } = lerRazao(opts.lancamentos);
  const depois = comprometido + opts.custo;

  if (depois > opts.tetoDoPedido) {
    return {
      pode: false,
      motivo: `Não cabe no teto do pedido: ${comprometido} já comprometidos + ${opts.custo} = ${depois}, e o teto é ${opts.tetoDoPedido}. Parar aqui é o resultado; estourar em silêncio é que seria defeito.`,
    };
  }
  if (opts.tetoDoLote !== null && depois > opts.tetoDoLote) {
    return {
      pode: false,
      motivo: `Não cabe no teto desta rodada: ${depois} passa de ${opts.tetoDoLote}.`,
    };
  }
  if (opts.saldoReal !== null && depois > opts.saldoReal) {
    return {
      pode: false,
      motivo: `A conta do provedor não tem esse saldo: ${depois} contra ${opts.saldoReal} disponíveis.`,
    };
  }
  return { pode: true, comprometidoDepois: depois };
};

/**
 * O saldo real bate com o que registramos?
 *
 * O razão mede o que o ORBIS acha que gastou. A conta do provedor é
 * compartilhada — a loja Shopify gasta da mesma —, então a diferença não é
 * necessariamente defeito. Mas ela é ACHADO: divergência que ninguém olha vira
 * gasto que ninguém explica.
 */
export const conferirComSaldo = (opts: {
  readonly saldoAntes: number;
  readonly saldoDepois: number;
  readonly lancamentos: readonly Lancamento[];
}): { readonly bate: boolean; readonly consumidoNaConta: number; readonly registrado: number } => {
  const consumidoNaConta = opts.saldoAntes - opts.saldoDepois;
  const { gasto } = lerRazao(opts.lancamentos);
  return { bate: consumidoNaConta === gasto, consumidoNaConta, registrado: gasto };
};
