import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MENSAGEM_API_BLOQUEADA, apiPagaPermitida } from './anthropic.js';

/**
 * O caminho de API paga só abre com decisão explícita. Medido na auditoria:
 * uma troca de EXECUTION_MODE ligaria um agente de 10 a 35 dólares por site,
 * sem teto de gasto, com a chave já no .env. A regra do produto é custo zero.
 */

test('sem a permissão explícita, a API paga fica bloqueada', () => {
  const antes = process.env.DS_PERMITIR_API_PAGA;
  try {
    process.env.DS_PERMITIR_API_PAGA = '';
    assert.equal(apiPagaPermitida(), false);
    process.env.DS_PERMITIR_API_PAGA = '0';
    assert.equal(apiPagaPermitida(), false);
    process.env.DS_PERMITIR_API_PAGA = 'true';
    assert.equal(apiPagaPermitida(), false, 'só o valor exato "1" abre');
    process.env.DS_PERMITIR_API_PAGA = '1';
    assert.equal(apiPagaPermitida(), true);
  } finally {
    process.env.DS_PERMITIR_API_PAGA = antes ?? '';
  }
});

test('a mensagem de bloqueio diz o custo e o caminho certo', () => {
  assert.match(MENSAGEM_API_BLOQUEADA, /10 a 35 dólares/);
  assert.match(MENSAGEM_API_BLOQUEADA, /EXECUTION_MODE=queue/);
  assert.match(MENSAGEM_API_BLOQUEADA, /DS_PERMITIR_API_PAGA=1/);
});
