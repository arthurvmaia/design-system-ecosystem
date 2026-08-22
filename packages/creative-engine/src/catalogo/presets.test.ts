import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRESETS,
  aceitaProporcao,
  identificadorDe,
  presetPorId,
  proporcoesEmComum,
} from './presets.js';

/**
 * Os testes DOURADOS do catálogo.
 *
 * Eles existem por causa de uma armadilha medida no provedor: o slug
 * `imagen-nano-banana-2` NÃO é o Nano Banana 2 — o catálogo do MCP o chama de
 * "Google Nano Banana Pro". Mapear pelo rótulo pega o modelo errado, gera
 * imagem, cobra crédito e entrega outra coisa, sem erro nenhum no caminho.
 *
 * Um teste que só conferisse "existe um slug" não pegaria isso. Estes conferem
 * a IDENTIDADE de cada mapeamento, e reprovam se alguém "simplificar".
 */

test('D1: o preset padrao de imagem aponta para o FLASH', () => {
  const p = presetPorId('imagem-padrao');
  assert.ok(p !== null);
  assert.equal(identificadorDe(p, 'mcp'), 'imagen-nano-banana-2-flash');
});

test('D2: ARMADILHA — imagen-nano-banana-2 e o PRO, e so o preset de marca o usa', () => {
  // Se alguém trocar o preset padrão para este slug achando que é o "2",
  // este teste cai. É exatamente o engano que ele existe para impedir.
  const padrao = presetPorId('imagem-padrao');
  assert.notEqual(
    identificadorDe(padrao as NonNullable<typeof padrao>, 'mcp'),
    'imagen-nano-banana-2',
    'imagen-nano-banana-2 e o Nano Banana PRO, nao o Nano Banana 2',
  );

  const marca = presetPorId('imagem-marca');
  assert.ok(marca !== null);
  assert.equal(identificadorDe(marca, 'mcp'), 'imagen-nano-banana-2');
});

test('D3: o slug do REST e DIFERENTE do slug do MCP, para o mesmo modelo', () => {
  const p = presetPorId('imagem-padrao');
  assert.ok(p !== null);
  const mcp = identificadorDe(p, 'mcp');
  const rest = identificadorDe(p, 'rest');
  assert.ok(mcp !== null && rest !== null);
  assert.notEqual(mcp, rest, 'copiar o slug de um transporte para o outro nao acha o endpoint');
  assert.equal(rest, 'text-to-image/nano-banana-pro-flash');
});

test('D4: nenhum identificador foi derivado do rotulo do preset', () => {
  for (const p of PRESETS) {
    for (const t of ['mcp', 'rest'] as const) {
      const id = identificadorDe(p, t);
      if (id === null) continue;
      const rotuloComoSlug = p.rotulo.toLowerCase().replace(/\s+/g, '-');
      assert.notEqual(id, rotuloComoSlug, `${p.id}: identificador nao pode sair do rotulo`);
    }
  }
});

test('D5: as proporcoes de faixa (8:1, 4:1) existem SO no MCP', () => {
  const p = presetPorId('imagem-padrao');
  assert.ok(p !== null);
  for (const faixa of ['8:1', '4:1', '1:4', '1:8']) {
    assert.equal(aceitaProporcao(p, 'mcp', faixa), true, `${faixa} deveria existir no MCP`);
    assert.equal(aceitaProporcao(p, 'rest', faixa), false, `${faixa} NAO existe no REST`);
  }
});

test('D6: 3:1 nao e proporcao nativa de transporte nenhum', () => {
  // O formato `banner-3x1` do contrato (1500x500) precisa sair de composição
  // determinística. Se um dia virar nativo, este teste cai e alguém revisa a
  // decisão de propósito, em vez de descobrir por acaso.
  for (const p of PRESETS) {
    assert.equal(aceitaProporcao(p, 'mcp', '3:1'), false);
    assert.equal(aceitaProporcao(p, 'rest', '3:1'), false);
  }
});

test('D7: identificador nao medido e null, nunca um slug provavel', () => {
  const marca = presetPorId('imagem-marca');
  assert.ok(marca !== null);
  assert.equal(identificadorDe(marca, 'rest'), null, 'o REST do Pro nao foi medido');
});

test('D8: todo preset declara data de medicao', () => {
  for (const p of PRESETS) {
    assert.match(p.medidoEm, /^\d{4}-\d{2}-\d{2}$/, `${p.id} sem data de medicao`);
  }
});

test('D9: as proporcoes em comum sao o conjunto seguro, e nao incluem faixa', () => {
  const p = presetPorId('imagem-padrao');
  assert.ok(p !== null);
  const comuns = proporcoesEmComum(p);
  assert.ok(comuns.includes('1:1'));
  assert.ok(comuns.includes('9:16'));
  assert.ok(!comuns.includes('8:1'), 'faixa amarra a peca ao MCP');
});

test('D10: o Pro nao aceita as proporcoes de faixa — por isso o padrao nao e ele', () => {
  const marca = presetPorId('imagem-marca');
  assert.ok(marca !== null);
  assert.equal(
    aceitaProporcao(marca, 'mcp', '8:1'),
    false,
    'e a razao medida de o banner continuar no Flash, mesmo custando igual',
  );
});
