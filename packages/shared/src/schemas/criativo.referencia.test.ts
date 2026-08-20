import assert from 'node:assert/strict';
import { test } from 'node:test';
import { referenciaDoPedido } from './criativo.js';

/**
 * Contra QUAL pedido a entrega é conferida.
 *
 * O fechamento mede o gasto contra o `tetoDeCreditos` e o texto contra os
 * `autorizacoesDeClaim`. De onde esses dois saem decide se a régua vale.
 */

test('PROVA: havendo retrato, é ELE a régua — e ele não é reescrito', () => {
  // O `fila:concluir` reescrevia o retrato com o payload da fila a cada
  // fechamento, logo antes de conferir o gasto contra ele: o conferido
  // escolhendo a própria régua, e o número continuando a sair como se nada.
  const r = referenciaDoPedido({
    retrato: { tetoDeCreditos: 225, marca: 'como foi pedido' },
    payloadDaFila: { tetoDeCreditos: 9999, marca: 'como está na fila agora' },
  });
  assert.deepEqual(r.pedido, { tetoDeCreditos: 225, marca: 'como foi pedido' });
  assert.equal(r.gravarRetrato, false, 'o lado mutável não sobrescreve o imutável');
  assert.equal(r.ilegivel, false);
});

test('sem retrato, o payload é o que há — e gravá-lo é rede de segurança', () => {
  // Job anterior ao POST, ou pasta que se perdeu. A fila é volátil por desenho:
  // o `fila:limpar` a esvazia, e com ela iria o teto e os claims.
  const payload = { tetoDeCreditos: 225 };
  const r = referenciaDoPedido({ retrato: null, payloadDaFila: payload });
  assert.equal(r.pedido, payload);
  assert.equal(r.gravarRetrato, true);
  assert.equal(r.ilegivel, false);
});

test('PROVA: retrato ILEGÍVEL não vira gravação por cima nem fechamento calado', () => {
  // Gravar por cima apagaria o que não se conseguiu ler, e fechar assim mesmo
  // seria registrar como sucesso um gasto que ninguém pôde medir.
  const r = referenciaDoPedido({ retrato: undefined, payloadDaFila: { tetoDeCreditos: 225 } });
  assert.equal(r.ilegivel, true, 'o fechamento tem de reprovar');
  assert.equal(r.gravarRetrato, false, 'e não pode apagar o que não leu');
});
