import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PRESETS, identificadorDe } from '../catalogo/presets.js';
import { AVULSOS, MEDIDO_EM, VALIDA_ATE, estimar, pendenciasDePreco } from './tabela.js';

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

/**
 * O REST de `imagem-padrao` FOI medido em 21/08/2026, gastando de verdade:
 * 4210 -> 4135 numa geração 2k (75) e 4135 -> 3985 numa 4k (150), com teto de
 * 250 declarado pelo dono.
 *
 * Deu o mesmo que o MCP, e isso é um RESULTADO — não a confirmação do óbvio.
 * Enquanto ninguém tinha medido, escrever 75 ali teria sido adivinhação que por
 * acaso acertou; a diferença entre as duas coisas aparece no dia em que o
 * provedor mudar o preço de um transporte e não do outro.
 */
test('o REST de imagem-padrao responde com o numero MEDIDO', () => {
  const doisK = estimar({
    presetId: 'imagem-padrao',
    transporte: 'rest',
    resolucao: '2k',
    hoje: HOJE,
  });
  assert.equal(doisK.ok && doisK.creditos, 75);
  const quatroK = estimar({
    presetId: 'imagem-padrao',
    transporte: 'rest',
    resolucao: '4k',
    hoje: HOJE,
  });
  assert.equal(quatroK.ok && quatroK.creditos, 150);
});

/**
 * E o `1k` continua recusando NO REST, embora o MCP o tenha medido.
 *
 * É a regra inteira num caso só: ninguém gerou 1k por REST, então o 75 do MCP
 * ali seria um número copiado. Recusar é o comportamento certo mesmo quando a
 * resposta "provável" é a mesma dos vizinhos.
 */
test('resolucao nao medida NAQUELE transporte recusa, mesmo medida no outro', () => {
  const r = estimar({ presetId: 'imagem-padrao', transporte: 'rest', resolucao: '1k', hoje: HOJE });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.motivo : '', /não foi medida/);
  /* e no MCP o mesmo 1k responde, porque lá alguém mediu */
  assert.equal(
    estimar({ presetId: 'imagem-padrao', transporte: 'mcp', resolucao: '1k', hoje: HOJE }).ok,
    true,
  );
});

test('os presets SEM endpoint REST continuam recusando', () => {
  for (const presetId of ['imagem-marca', 'imagem-rascunho', 'video-curto']) {
    const r = estimar({ presetId, transporte: 'rest', segundos: 8, hoje: HOJE });
    assert.equal(r.ok, false, presetId);
    assert.match(r.ok === false ? r.motivo : '', /não foi medido/, presetId);
  }
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

/**
 * "NÃO MEDIDO" e "NÃO DÁ PARA MEDIR" são coisas diferentes, e confundi-las
 * transforma limitação em fila de trabalho.
 *
 * O `pnpm criativo:precos` dizia "Pendente de medição (4)" e listava as quatro
 * linhas REST juntas. Três delas não esperam ninguém gastar: `imagem-marca`,
 * `imagem-rascunho` e `video-curto` têm identificador REST `null`, ou seja, não
 * existe endpoint para chamá-las — medi-las não é caro, é impossível.
 *
 * O número importa para quem lê: "4 pendências" sugere uma tarde de trabalho e
 * ~300 créditos. A verdade é UMA linha mensurável, e ela está bloqueada numa
 * credencial, não em dinheiro.
 */
test('a pendencia de preco separa o que da para medir do que nao existe', () => {
  const pendencias = pendenciasDePreco();
  const mensuraveis = pendencias.filter((p) => p.classe === 'mensuravel');
  const semEndpoint = pendencias.filter((p) => p.classe === 'sem-endpoint');

  /* toda pendência tem de cair numa das duas classes, e nenhuma nas duas */
  assert.equal(mensuraveis.length + semEndpoint.length, pendencias.length);

  /* mensurável é exatamente quem TEM endpoint naquele transporte */
  for (const p of mensuraveis) {
    const preset = PRESETS.find((x) => x.id === p.presetId);
    assert.ok(preset, p.presetId);
    assert.notEqual(identificadorDe(preset, p.transporte), null, `${p.presetId}/${p.transporte}`);
  }
  for (const p of semEndpoint) {
    const preset = PRESETS.find((x) => x.id === p.presetId);
    assert.ok(preset, p.presetId);
    assert.equal(identificadorDe(preset, p.transporte), null, `${p.presetId}/${p.transporte}`);
  }

  /* e cada uma diz por quê, com motivo que distingue as duas */
  for (const p of mensuraveis) assert.match(p.motivo, /paga/);
  for (const p of semEndpoint) assert.match(p.motivo, /impossível/);
});

/**
 * O MCP está inteiro. Se um dia aparecer pendência de MCP, ela é regressão:
 * lá existe `simulate_cost`, que é read-only e não cobra — não há desculpa.
 */
test('nenhuma pendencia de preco no MCP: la medir e de graca', () => {
  const noMcp = pendenciasDePreco().filter((p) => p.transporte === 'mcp');
  assert.deepEqual(noMcp, []);
});
