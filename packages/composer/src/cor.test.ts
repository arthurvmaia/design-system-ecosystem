import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analisarCor, distanciaOk, paraOklch } from './cor.js';

/**
 * O canônico é o que faz `#F69066` e `rgb(246 144 102 / 0.5)` serem a MESMA
 * cor para o cluster. Errar aqui espalha para todo o resto do pipeline.
 */

test('hex de 6 vira canônico minúsculo', () => {
  assert.deepEqual(analisarCor('#F69066'), {
    hexOpaco: '#f69066',
    alfa: undefined,
    literal: '#F69066',
  });
});

test('hex de 3 expande', () => {
  assert.equal(analisarCor('#fff')?.hexOpaco, '#ffffff');
  assert.equal(analisarCor('#0a3')?.hexOpaco, '#00aa33');
});

test('hex de 8 separa o alfa; alfa 1.0 não conta como alfa', () => {
  const meio = analisarCor('#f6906680');
  assert.equal(meio?.hexOpaco, '#f69066');
  assert.equal(meio?.alfa, '0.502');
  // ff = opaco: agrupa com a versão sem alfa.
  assert.equal(analisarCor('#f69066ff')?.alfa, undefined);
});

test('rgb legado com vírgulas', () => {
  const c = analisarCor('rgba(246, 144, 102, .5)');
  assert.equal(c?.hexOpaco, '#f69066');
  assert.equal(c?.alfa, '.5');
});

test('rgb moderno com barra e alfa em var() — o caso Tailwind medido', () => {
  const c = analisarCor('rgb(13 60 31 / var(--tw-bg-opacity, 1))');
  assert.equal(c?.hexOpaco, '#0d3c1f');
  // A expressão viaja CRUA: é ela que a sintaxe relativa vai preservar.
  assert.equal(c?.alfa, 'var(--tw-bg-opacity, 1)');
});

test('hsl converte', () => {
  assert.equal(analisarCor('hsl(0, 100%, 50%)')?.hexOpaco, '#ff0000');
  assert.equal(analisarCor('hsl(120 100% 25%)')?.hexOpaco, '#008000');
});

test('o que não é cor volta null e fica em paz', () => {
  assert.equal(analisarCor('white'), null);
  assert.equal(analisarCor('currentColor'), null);
  assert.equal(analisarCor('var(--cor)'), null);
  assert.equal(analisarCor('color-mix(in srgb, red, blue)'), null);
  assert.equal(analisarCor('url(#f00)'), null);
});

// ── OKLCH contra valores de referência ──────────────────────────────────────
// Os números vêm da especificação do OKLab (Björn Ottosson) e batem com o
// que o próprio Chrome resolve em `oklch()`.

test('branco: L≈1, croma ≈0', () => {
  const c = paraOklch('#ffffff');
  assert.ok(Math.abs(c.l - 1) < 0.01, `l=${c.l}`);
  assert.ok(c.c < 0.01, `c=${c.c}`);
});

test('preto: L=0', () => {
  assert.ok(paraOklch('#000000').l < 0.01);
});

test('vermelho puro: os valores publicados', () => {
  const c = paraOklch('#ff0000');
  assert.ok(Math.abs(c.l - 0.628) < 0.01, `l=${c.l}`);
  assert.ok(Math.abs(c.c - 0.2577) < 0.01, `c=${c.c}`);
  assert.ok(Math.abs(c.h - 29.23) < 1, `h=${c.h}`);
});

test('distância: a mesma cor é 0, vizinhos são pequenos, opostos são grandes', () => {
  const a = paraOklch('#f69066');
  assert.equal(distanciaOk(a, a), 0);
  // Vizinho imediato (1 de diferença num canal): bem abaixo do limiar 0.03.
  assert.ok(distanciaOk(paraOklch('#f69066'), paraOklch('#f69067')) < 0.005);
  // Verde escuro contra laranja: muito acima.
  assert.ok(distanciaOk(paraOklch('#0d3c1f'), paraOklch('#f69066')) > 0.2);
});
