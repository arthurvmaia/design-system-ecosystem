import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SecaoDoSite } from '@ds/shared/schemas';
import { soltarSecaoSobre } from './arrastar-secao.js';
import type { PecaDoKit } from './estrutura-checagens.js';

/**
 * A regra do arrasto: a seção solta ASSUME A POSIÇÃO da que recebeu, e o resto
 * empurra. E o que não é movimento não pode virar salvamento.
 */

const secao = (id: string, componentIds: string[] = []): SecaoDoSite => ({
  id,
  nome: id,
  componentIds,
});

const PECAS: PecaDoKit[] = [
  { id: 'c_hero', name: 'Abertura', category: 'hero', kind: 'section' },
  { id: 'c_fundo', name: 'Fundo animado', category: 'background', kind: 'background' },
];

const ordem = (lista: readonly SecaoDoSite[]): string[] => lista.map((s) => s.id);

test('arrastar para baixo: a solta fica no lugar da que recebeu', () => {
  const lista = [secao('a'), secao('b'), secao('c'), secao('d')];
  assert.deepEqual(ordem(soltarSecaoSobre(lista, PECAS, 'a', 'c')), ['b', 'c', 'a', 'd']);
});

test('arrastar para cima: a solta fica no lugar da que recebeu', () => {
  const lista = [secao('a'), secao('b'), secao('c'), secao('d')];
  assert.deepEqual(ordem(soltarSecaoSobre(lista, PECAS, 'd', 'b')), ['a', 'd', 'b', 'c']);
});

test('a última vai ao topo em um gesto, que é o motivo de o arrasto existir', () => {
  const lista = [secao('a'), secao('b'), secao('c'), secao('d'), secao('e')];
  assert.deepEqual(ordem(soltarSecaoSobre(lista, PECAS, 'e', 'a')), ['e', 'a', 'b', 'c', 'd']);
});

test('soltar sobre si mesma não mexe em nada', () => {
  const lista = [secao('a'), secao('b')];
  assert.deepEqual(ordem(soltarSecaoSobre(lista, PECAS, 'b', 'b')), ['a', 'b']);
});

test('alvo que não está na lista não move nada', () => {
  const lista = [secao('a'), secao('b')];
  assert.deepEqual(ordem(soltarSecaoSobre(lista, PECAS, 'a', 'inexistente')), ['a', 'b']);
});

test('a lista devolvida é sempre nova, para o autosave não ler a mesma referência', () => {
  const lista = [secao('a'), secao('b')];
  assert.notEqual(soltarSecaoSobre(lista, PECAS, 'a', 'a'), lista);
});

test('seção que só hospeda fundo não conta como posição da tela', () => {
  // Ela não aparece na árvore (o fundo tem bloco próprio), então soltar sobre a
  // terceira linha da tela tem de acertar a terceira VISÍVEL, não a terceira do
  // modelo de dados.
  const lista = [secao('a'), secao('fundo', ['c_fundo']), secao('b'), secao('c'), secao('d')];
  const movida = soltarSecaoSobre(lista, PECAS, 'd', 'b');
  assert.deepEqual(ordem(movida), ['a', 'd', 'b', 'c', 'fundo']);
});

test('seção com peça de conteúdo E fundo continua sendo uma linha da tela', () => {
  const lista = [secao('a', ['c_hero', 'c_fundo']), secao('b')];
  assert.deepEqual(ordem(soltarSecaoSobre(lista, PECAS, 'b', 'a')), ['b', 'a']);
});
