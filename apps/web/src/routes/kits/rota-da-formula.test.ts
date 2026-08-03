import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PADRAO_DA_ROTA_DA_FORMULA, aplicarPadrao, rotaDaFormula } from './rota-da-formula.js';

test('o link que a tela monta é exatamente o caminho que o roteador registra', () => {
  assert.equal(rotaDaFormula('kit_abc'), aplicarPadrao('kit_abc'));
});

test('a fórmula fica debaixo de Kits, que é o que mantém a navegação acesa', () => {
  // `itemDaRota` (topo-core) casa por segmento: um caminho fora de
  // `/design-systems/` apagaria o item "Kits" enquanto se lê a fórmula do kit.
  assert.ok(PADRAO_DA_ROTA_DA_FORMULA.startsWith('/design-systems/'));
  assert.ok(rotaDaFormula('kit_abc').startsWith('/design-systems/'));
});

test('o padrão tem o parâmetro que a página lê', () => {
  assert.ok(PADRAO_DA_ROTA_DA_FORMULA.includes(':kitId'));
});
