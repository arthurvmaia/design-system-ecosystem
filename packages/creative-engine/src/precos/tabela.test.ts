import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AVULSOS, MEDIDO_EM, VALIDA_ATE, estimar } from './tabela.js';

/**
 * A tabela existe para o transporte que NÃO sabe o preço.
 *
 * O MCP tem `simulate_cost` exato; a API REST não tem endpoint de simulação
 * nenhum. Um worker autônomo só existe por REST, então ou ele estima de uma
 * tabela medida, ou gasta às cegas.
 */

const HOJE = '2026-08-20';

test('imagem: linear na quantidade, como foi medido', () => {
  const um = estimar({ presetId: 'imagem-padrao', transporte: 'mcp', quantidade: 1, hoje: HOJE });
  const quatro = estimar({
    presetId: 'imagem-padrao',
    transporte: 'mcp',
    quantidade: 4,
    hoje: HOJE,
  });
  assert.deepEqual(um, { ok: true, creditos: 75 });
  assert.deepEqual(quatro, { ok: true, creditos: 300 });
});

test('MEDIDO: 1k e 2k custam IGUAL, e 4k custa o dobro', () => {
  // É por isso que o preset padrão é 2k: a resolução maior é de graça, e
  // entregar 1k obrigaria a esticar a peça para 1080px.
  const em = (r: string) =>
    estimar({ presetId: 'imagem-padrao', transporte: 'mcp', resolucao: r, hoje: HOJE });
  assert.deepEqual(em('1k'), { ok: true, creditos: 75 });
  assert.deepEqual(em('2k'), { ok: true, creditos: 75 });
  assert.deepEqual(em('4k'), { ok: true, creditos: 150 });
});

test('MEDIDO: o preset de marca custa o mesmo que o padrao', () => {
  // O Pro é o modelo de maior fidelidade e sai pelo mesmo preço. Usar o mais
  // fraco no ativo final seria perder qualidade de graça.
  const padrao = estimar({ presetId: 'imagem-padrao', transporte: 'mcp', hoje: HOJE });
  const marca = estimar({ presetId: 'imagem-marca', transporte: 'mcp', hoje: HOJE });
  assert.deepEqual(marca, padrao);
});

test('video: linear no segundo, e o audio e adicional declarado', () => {
  const mudo = estimar({ presetId: 'video-curto', transporte: 'mcp', segundos: 8, hoje: HOJE });
  const comAudio = estimar({
    presetId: 'video-curto',
    transporte: 'mcp',
    segundos: 8,
    comAudio: true,
    hoje: HOJE,
  });
  assert.deepEqual(mudo, { ok: true, creditos: 320 });
  assert.deepEqual(comAudio, { ok: true, creditos: 520 }, 'audio nativo custa 200 a mais');
  assert.deepEqual(
    estimar({ presetId: 'video-curto', transporte: 'mcp', segundos: 4, hoje: HOJE }),
    {
      ok: true,
      creditos: 160,
    },
  );
});

test('o REST recusa em vez de copiar o numero do MCP', () => {
  const r = estimar({ presetId: 'imagem-padrao', transporte: 'rest', hoje: HOJE });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /não foi medido/);
});

test('PROVA: tabela vencida faz o motor RECUSAR, nao estimar', () => {
  const r = estimar({ presetId: 'imagem-padrao', transporte: 'mcp', hoje: '2027-01-01' });
  assert.equal(r.ok, false, 'numero velho respondendo com confianca e o defeito que isto impede');
  assert.match(r.ok === false ? r.motivo : '', /venceu/);
});

test('resolucao nao medida recusa', () => {
  const r = estimar({
    presetId: 'imagem-padrao',
    transporte: 'mcp',
    resolucao: '8k',
    hoje: HOJE,
  });
  assert.equal(r.ok, false);
});

test('preset desconhecido recusa', () => {
  assert.equal(estimar({ presetId: 'nao-existe', transporte: 'mcp', hoje: HOJE }).ok, false);
});

test('a tabela declara quando foi medida e ate quando vale', () => {
  assert.match(MEDIDO_EM, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(VALIDA_ATE, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(VALIDA_ATE > MEDIDO_EM);
});

test('a operacao paga mais barata do provedor e a de remover fundo', () => {
  // É com ela que a Fase 4 prova o caminho do dinheiro sem apostar.
  const valores = Object.values(AVULSOS);
  assert.equal(AVULSOS.removerFundo, 3);
  assert.equal(Math.min(...valores), 3);
});
