import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type Lancamento,
  conferirComSaldo,
  lerRazao,
  podeProduzir,
  reservaAberta,
} from './razao.js';

/**
 * "Parar ao zerar o teto" só é executável se alguém souber, ANTES da chamada,
 * quanto já está comprometido.
 *
 * O comprometido não é só o que saiu da conta: é o que saiu MAIS o que está em
 * voo. Sem contar o em-voo, duas produções da mesma rodada olham o mesmo saldo,
 * cada uma se acha dentro do teto, e juntas estouram.
 */

const l = (tipo: Lancamento['tipo'], referencia: string, creditos: number, em = 1): Lancamento => ({
  tipo,
  referencia,
  creditos,
  em,
  motivo: null,
});

test('reserva sem desfecho conta contra o teto', () => {
  const r = lerRazao([l('reserva', 'v1', 75)]);
  assert.deepEqual(r, { gasto: 0, empenhado: 75, comprometido: 75 });
});

test('debito tira do empenho e entra no gasto', () => {
  const r = lerRazao([l('reserva', 'v1', 75), l('debito', 'v1', 75, 2)]);
  assert.deepEqual(r, { gasto: 75, empenhado: 0, comprometido: 75 });
});

test('liberacao some da conta: nao saiu e nao vai sair', () => {
  const r = lerRazao([l('reserva', 'v1', 75), l('liberacao', 'v1', 75, 2)]);
  assert.deepEqual(r, { gasto: 0, empenhado: 0, comprometido: 0 });
});

test('o provedor cobrou diferente do reservado: vale o DEBITO', () => {
  // Reservar é previsão; debitar é fato. O que conta contra o teto no fim é o
  // que saiu da conta.
  const r = lerRazao([l('reserva', 'v1', 75), l('debito', 'v1', 90, 2)]);
  assert.equal(r.gasto, 90);
  assert.equal(r.comprometido, 90);
});

test('PROVA: a segunda producao da rodada ve a primeira em voo', () => {
  // É o caso que o empenho existe para impedir: sem ele, as duas olhariam
  // "gasto: 0" e as duas passariam.
  const emVoo = [l('reserva', 'v1', 150)];
  const v = podeProduzir({
    lancamentos: emVoo,
    custo: 150,
    tetoDoPedido: 225,
    tetoDoLote: null,
    saldoReal: null,
  });
  assert.equal(v.pode, false);
  assert.match(v.pode === false ? v.motivo : '', /teto do pedido/);
});

test('cabe no teto: o veredito diz onde a conta fica depois', () => {
  const v = podeProduzir({
    lancamentos: [l('reserva', 'v1', 75)],
    custo: 75,
    tetoDoPedido: 225,
    tetoDoLote: null,
    saldoReal: null,
  });
  assert.equal(v.pode, true);
  assert.equal(v.pode === true ? v.comprometidoDepois : 0, 150);
});

test('vence o MENOR teto, e a recusa diz qual foi', () => {
  const base = { lancamentos: [], custo: 300, tetoDoPedido: 1000 } as const;

  const porLote = podeProduzir({ ...base, tetoDoLote: 200, saldoReal: null });
  assert.equal(porLote.pode, false);
  assert.match(porLote.pode === false ? porLote.motivo : '', /rodada/);

  const porSaldo = podeProduzir({ ...base, tetoDoLote: null, saldoReal: 100 });
  assert.equal(porSaldo.pode, false);
  assert.match(porSaldo.pode === false ? porSaldo.motivo : '', /provedor/);
});

test('teto do lote ausente nao vira teto zero', () => {
  const v = podeProduzir({
    lancamentos: [],
    custo: 75,
    tetoDoPedido: 225,
    tetoDoLote: null,
    saldoReal: null,
  });
  assert.equal(v.pode, true, 'nao declarar teto de lote nao pode travar tudo');
});

test('custo invalido recusa antes de qualquer conta', () => {
  for (const custo of [0, -1, Number.NaN]) {
    const v = podeProduzir({
      lancamentos: [],
      custo,
      tetoDoPedido: 225,
      tetoDoLote: null,
      saldoReal: null,
    });
    assert.equal(v.pode, false, `custo ${custo} deveria recusar`);
  }
});

test('PROVA: reserva DEPOIS de um debito da mesma referencia continua em voo', () => {
  // O caso real: a variação sai feia e o agente refaz com a mesma referência.
  // A versão anterior marcava a referência inteira como resolvida ao ver o
  // primeiro débito, e a segunda reserva nascia cancelada — 75 em voo virando
  // `empenhado: 0`, e `podeProduzir` liberando o que já não cabia.
  const r = lerRazao([l('reserva', 'v1', 75), l('debito', 'v1', 75, 2), l('reserva', 'v1', 75, 3)]);
  assert.equal(r.gasto, 75);
  assert.equal(r.empenhado, 75, 'a segunda reserva nao pode ser apagada pelo debito da primeira');
  assert.equal(r.comprometido, 150);
});

test('PROVA: com o pareamento certo, a terceira producao NAO cabe', () => {
  // A consequência do defeito, medida: sem o pareamento, isto liberava e o job
  // gastava 300 num teto de 225.
  const lancamentos = [
    l('reserva', 'v1', 75),
    l('debito', 'v1', 75, 2),
    l('reserva', 'v1', 75, 3),
    l('reserva', 'v2', 75, 4),
  ];
  const v = podeProduzir({
    lancamentos,
    custo: 75,
    tetoDoPedido: 225,
    tetoDoLote: null,
    saldoReal: null,
  });
  assert.equal(v.pode, false, '75 gastos + 150 em voo + 75 = 300, e o teto e 225');
});

test('cada desfecho fecha UMA reserva, na ordem', () => {
  const r = lerRazao([
    l('reserva', 'v1', 75),
    l('reserva', 'v1', 75, 2),
    l('liberacao', 'v1', 75, 3),
  ]);
  assert.equal(r.empenhado, 75, 'uma liberacao fecha uma reserva, nao as duas');
});

test('reservaAberta ve o que ainda esta em voo', () => {
  assert.equal(reservaAberta([l('reserva', 'v1', 75)], 'v1'), 75);
  assert.equal(reservaAberta([l('reserva', 'v1', 75), l('debito', 'v1', 75, 2)], 'v1'), null);
  assert.equal(reservaAberta([l('debito', 'v1', 75)], 'v1'), null, 'debito solto nao e reserva');
  assert.equal(reservaAberta([l('reserva', 'v2', 75)], 'v1'), null, 'outra referencia nao conta');
});

test('a conferencia com o saldo real acha a divergencia', () => {
  const lancamentos = [l('reserva', 'v1', 75), l('debito', 'v1', 75, 2)];

  const bate = conferirComSaldo({ saldoAntes: 1000, saldoDepois: 925, lancamentos });
  assert.deepEqual(bate, { bate: true, consumidoNaConta: 75, registrado: 75 });

  // A conta é compartilhada com a loja Shopify: divergir não prova defeito, mas
  // é achado, e achado que ninguém olha vira gasto que ninguém explica.
  const diverge = conferirComSaldo({ saldoAntes: 1000, saldoDepois: 850, lancamentos });
  assert.equal(diverge.bate, false);
  assert.equal(diverge.consumidoNaConta, 150);
  assert.equal(diverge.registrado, 75);
});
