import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  JANELA_TYPEAHEAD_MS,
  type OpcaoDeSeletor,
  alternarMulti,
  aplicarTypeahead,
  filtrarOpcoes,
  moverAtivo,
  normalizarBusca,
  posicionarFlutuante,
  promoverPrincipal,
} from './seletor-core.js';

const OPCOES: OpcaoDeSeletor[] = [
  { valor: 'a', rotulo: 'Água' },
  { valor: 'b', rotulo: 'Banana', desabilitada: true },
  { valor: 'c', rotulo: 'Café' },
  { valor: 'd', rotulo: 'Damasco' },
  { valor: 'e', rotulo: 'Caju' },
];

test('moverAtivo: setas pulam desabilitada e fazem loop nas duas direções', () => {
  assert.equal(moverAtivo(OPCOES, null, 'ArrowDown'), 0, 'abrir com ↓ ativa a primeira');
  assert.equal(moverAtivo(OPCOES, null, 'ArrowUp'), 4, 'abrir com ↑ ativa a última');
  assert.equal(moverAtivo(OPCOES, 0, 'ArrowDown'), 2, 'pula a desabilitada (índice 1)');
  assert.equal(moverAtivo(OPCOES, 4, 'ArrowDown'), 0, 'loop no fim');
  assert.equal(moverAtivo(OPCOES, 0, 'ArrowUp'), 4, 'loop no começo');
  assert.equal(moverAtivo(OPCOES, 3, 'Home'), 0);
  assert.equal(moverAtivo(OPCOES, 0, 'End'), 4);
});

test('moverAtivo: lista toda desabilitada não ativa nada (sem loop infinito)', () => {
  const todas = OPCOES.map((o) => ({ ...o, desabilitada: true }));
  assert.equal(moverAtivo(todas, null, 'ArrowDown'), null);
  assert.equal(moverAtivo(todas, 2, 'End'), null);
});

test('typeahead: acumula na janela, casa por prefixo sem acento, e repetição cicla', () => {
  let estado = { buffer: '', ultimoMs: 0 };
  let r = aplicarTypeahead(OPCOES, null, estado, 'c', 1000);
  assert.equal(r.ativo, 2, '"c" → Café');
  estado = r.estado;

  r = aplicarTypeahead(OPCOES, r.ativo, estado, 'a', 1200);
  assert.equal(r.ativo, 2, '"ca" continua em Café (prefixo acumulado)');
  estado = r.estado;

  r = aplicarTypeahead(OPCOES, r.ativo, estado, 'j', 1400);
  assert.equal(OPCOES[r.ativo ?? -1]?.rotulo, 'Caju', '"caj" → Caju');

  // Janela expirada: recomeça o buffer.
  r = aplicarTypeahead(
    OPCOES,
    r.ativo,
    { buffer: 'caj', ultimoMs: 1400 },
    'd',
    1400 + JANELA_TYPEAHEAD_MS + 1,
  );
  assert.equal(OPCOES[r.ativo ?? -1]?.rotulo, 'Damasco');

  // Mesma letra repetida cicla entre as que começam com ela.
  const e2 = { buffer: '', ultimoMs: 0 };
  let r2 = aplicarTypeahead(OPCOES, null, e2, 'c', 100);
  assert.equal(OPCOES[r2.ativo ?? -1]?.rotulo, 'Café');
  r2 = aplicarTypeahead(OPCOES, r2.ativo, r2.estado, 'c', 200);
  assert.equal(OPCOES[r2.ativo ?? -1]?.rotulo, 'Caju', 'repetir "c" avança para o próximo C');
  r2 = aplicarTypeahead(OPCOES, r2.ativo, r2.estado, 'c', 300);
  assert.equal(OPCOES[r2.ativo ?? -1]?.rotulo, 'Café', 'e cicla de volta');
});

test('typeahead nunca ativa desabilitada', () => {
  const r = aplicarTypeahead(OPCOES, null, { buffer: '', ultimoMs: 0 }, 'b', 100);
  assert.notEqual(r.ativo, 1, 'Banana está desabilitada');
});

test('filtrarOpcoes: sem acento/caixa; prefixo vem antes de ocorrência interna', () => {
  assert.equal(normalizarBusca('ÁgUa  '), 'agua');
  const r = filtrarOpcoes(OPCOES, 'ca');
  assert.deepEqual(
    r.map((o) => o.rotulo),
    ['Café', 'Caju'],
    'só quem contém "ca", prefixos primeiro',
  );
});

test('filtrarOpcoes inclui ocorrência interna DEPOIS dos prefixos', () => {
  const opcoes: OpcaoDeSeletor[] = [
    { valor: '1', rotulo: 'Roboto' },
    { valor: '2', rotulo: 'Open Sans' },
    { valor: '3', rotulo: 'Source Sans' },
  ];
  const r = filtrarOpcoes(opcoes, 'sans');
  assert.deepEqual(
    r.map((o) => o.rotulo),
    ['Open Sans', 'Source Sans'],
  );
});

test('alternarMulti: respeita limite ao adicionar, remover sempre passa', () => {
  const cheia = ['a', 'b', 'c'];
  const add = alternarMulti(cheia, 'd', 3);
  assert.equal(add.recusadoPorLimite, true);
  assert.deepEqual(add.selecao, cheia);
  const rem = alternarMulti(cheia, 'b', 3);
  assert.equal(rem.recusadoPorLimite, false);
  assert.deepEqual(rem.selecao, ['a', 'c']);
});

test('promoverPrincipal: primeiro da lista é o principal; ausente não entra', () => {
  assert.deepEqual(promoverPrincipal(['a', 'b', 'c'], 'c'), ['c', 'a', 'b']);
  assert.deepEqual(promoverPrincipal(['a', 'b'], 'zz'), ['a', 'b']);
});

test('posicionarFlutuante: flip para cima quando não cabe embaixo; clamp na viewport', () => {
  const vp = { w: 1200, h: 800 };
  const emCima = posicionarFlutuante({ x: 100, y: 40, w: 240, h: 36 }, vp, 320);
  assert.equal(emCima.paraCima, false);
  assert.equal(emCima.y, 40 + 36 + 4);

  const noRodape = posicionarFlutuante({ x: 100, y: 740, w: 240, h: 36 }, vp, 320);
  assert.equal(noRodape.paraCima, true, 'não cabe embaixo → abre para cima');
  assert.ok(noRodape.y >= 8, 'nunca sai da viewport por cima');
  assert.ok(noRodape.maxAltura >= 120, 'altura mínima legível');

  const naBorda = posicionarFlutuante({ x: 1180, y: 100, w: 240, h: 36 }, vp, 200);
  assert.ok(naBorda.x + 240 <= vp.w, 'clamp horizontal');
});
