import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOVIMENTO_PADRAO, cssDosTokensDeMovimento, tokensDeMovimento } from './movimento.js';

/**
 * O app usa o ritmo do acervo, mas só o NÚMERO atravessa a fronteira: nada de
 * regra de terceiro no shell. Estes testes fixam a leitura e, principalmente, os
 * casos em que ela se recusa a inventar.
 */

test('lê duração e curva de transition', () => {
  const t = tokensDeMovimento('.a{transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1)}');
  assert.equal(t.rapidaMs, 150);
  assert.equal(t.easing, 'cubic-bezier(0.4, 0, 0.2, 1)');
  assert.equal(t.amostras, 1);
});

test('segundos viram milissegundos', () => {
  const t = tokensDeMovimento('.a{animation-duration: 0.9s}');
  assert.equal(t.mediaMs, 900);
});

test('a mediana ignora o exagero isolado', () => {
  // Um carrossel de 30s arrastaria a média para um valor que não descreve o
  // ritmo de nada — e ele nem entra, porque está fora da faixa.
  const css = `
    .a{transition: 200ms}
    .b{transition: 200ms}
    .c{transition: 220ms}
    .d{animation: girar 30s linear infinite}
  `;
  const t = tokensDeMovimento(css);
  assert.ok(t.rapidaMs >= 190 && t.rapidaMs <= 220, `rápida fora de faixa: ${t.rapidaMs}`);
  assert.equal(t.amostras, 3, 'o valor de 30s não podia entrar na amostra');
});

test('separa reação de entrada pela distribuição da própria folha', () => {
  const css = `
    .a{transition: 100ms} .b{transition: 120ms}
    .c{transition: 600ms} .d{transition: 800ms}
  `;
  const t = tokensDeMovimento(css);
  assert.ok(t.rapidaMs < t.mediaMs, 'a rápida tem de ser menor que a média');
  assert.ok(t.rapidaMs <= 120);
  assert.ok(t.mediaMs >= 600);
});

test('a curva mais frequente vence', () => {
  const css = `
    .a{transition-timing-function: ease-out}
    .b{transition-timing-function: ease-out}
    .c{transition-timing-function: linear}
  `;
  assert.equal(tokensDeMovimento(css).easing, 'ease-out');
});

test('folha sem movimento devolve o padrão, e diz que não mediu', () => {
  const t = tokensDeMovimento('.a{color:red}');
  assert.deepEqual(t, MOVIMENTO_PADRAO);
  assert.equal(t.amostras, 0, 'amostras=0 é como o app sabe que não há medida');
});

test('CSS ilegível não inventa ritmo', () => {
  assert.deepEqual(tokensDeMovimento('.a{ não fecha'), MOVIMENTO_PADRAO);
});

test('o CSS gerado é só variável, sem seletor nem regra de terceiro', () => {
  const css = cssDosTokensDeMovimento(tokensDeMovimento('.a{transition: 200ms ease}'));
  assert.ok(css.includes('--orbis-duracao-rapida'));
  assert.ok(!css.includes('{'), 'nenhuma regra: só declarações');
  assert.ok(!css.includes('.a'), 'nenhum seletor do site de origem atravessa');
});
