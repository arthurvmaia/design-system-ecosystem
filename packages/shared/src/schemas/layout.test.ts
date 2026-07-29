import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_LAYOUT, ROLE_CATEGORIES, SectionRole, normalizarProjectLayout } from './layout.js';

/**
 * O que sobrou depois que os blueprints saíram.
 *
 * Os testes de `sugerirDistribuicao`, `resolverPlacements` e da lista de
 * estruturas embutidas foram embora junto com as funções: a estrutura passou a
 * ser montada pelo usuário, e o comportamento novo está em `secoes.test.ts`.
 */

test('todo papel de seção tem entrada no mapa papel→categoria', () => {
  // Trava histórica que continua valendo: papel novo sem categoria quebraria a
  // sugestão de peças em silêncio, na tela, em vez de no build.
  for (const role of SectionRole.options) {
    assert.ok(role in ROLE_CATEGORIES, `papel sem categorias: ${role}`);
  }
});

test('o layout default não inventa estrutura nenhuma', () => {
  // A sugestão precisa do kit para ser útil, e o default não conhece kit
  // nenhum. Uma lista fixa aqui apareceria em projeto novo antes de a pessoa
  // escolher as peças, e não teria nada a ver com o que ela curou.
  assert.deepEqual(DEFAULT_LAYOUT.secoes, []);
  assert.equal(DEFAULT_LAYOUT.density, 'equilibrado');
  assert.equal(DEFAULT_LAYOUT.motion, 'sutil');
});

test('JSON corrompido vira o default em vez de derrubar a leitura', () => {
  const layout = normalizarProjectLayout('{isto não é json');
  assert.deepEqual(layout, DEFAULT_LAYOUT);
});

test('seção sem nome e sem peça atravessa o schema', () => {
  // É o estado de uma seção recém-criada, meio segundo depois do clique em
  // "adicionar". O autosave grava esse estado; recusá-lo aqui devolveria 400 no
  // meio de uma edição normal.
  const layout = normalizarProjectLayout(
    JSON.stringify({ secoes: [{ id: 'sec_1', nome: '', componentIds: [] }] }),
  );
  assert.equal(layout.secoes.length, 1);
  assert.equal(layout.secoes[0]?.nome, '');
});
