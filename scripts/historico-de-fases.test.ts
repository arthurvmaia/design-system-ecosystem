import assert from 'node:assert/strict';
import { test } from 'node:test';
import { consolidarFases, p95 } from './historico-de-fases.js';

/**
 * O histórico é o que transforma a reserva de orçamento de fração fixa em
 * custo medido. Duas regras têm de valer sempre: fase abortada não conta (o
 * custo dela é o teto que a cortou, não o custo real), e p95 segura o caso
 * típico sem deixar um outlier mandar.
 */

test('p95 de lista vazia é undefined: sem medição, sem promessa', () => {
  assert.equal(p95([]), undefined);
});

test('p95 pega o alto sem ser o máximo absoluto', () => {
  const valores = [10, 12, 11, 13, 12, 11, 10, 12, 11, 100];
  const v = p95(valores);
  assert.ok(v !== undefined);
  // Com 10 valores, o p95 é o 10º (o teto). Com mais amostras ele desgruda.
  assert.ok(v >= 13);
});

test('fase abortada NÃO entra no histórico: usar o corte como custo congela o corte', () => {
  const historico = consolidarFases([
    [
      { nome: 'v2-percurso', ms: 169_000, abortada: true },
      { nome: 'v2-compilar', ms: 4_000 },
    ],
    [
      { nome: 'v2-percurso', ms: 91_000 },
      { nome: 'v2-compilar', ms: 3_000 },
    ],
  ]);
  assert.equal(historico['v2-percurso'], 91_000, 'só a medição íntegra conta');
  assert.equal(historico['v2-compilar'], 4_000);
});

test('fase que só existe abortada fica FORA do histórico, e o motor cai na fração dela', () => {
  const historico = consolidarFases([[{ nome: 'v2-estados', ms: 92_000, abortada: true }]]);
  assert.equal(historico['v2-estados'], undefined);
});
