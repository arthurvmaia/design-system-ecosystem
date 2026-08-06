import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type ComponenteDoKitResumo,
  DEFAULT_LAYOUT,
  ROLE_CATEGORIES,
  type SecaoResolvida,
  SectionRole,
  ehPecaDeFundo,
  normalizarProjectLayout,
  papelParaCategoria,
  separarCamadasDePagina,
} from './layout.js';

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

// ── Camadas de página ───────────────────────────────────────────────────────

// O `kind` vai como campo extra: `ComponenteDoKitResumo` não o declara, mas o
// componente do kit no payload o carrega, e é assim que ele chega em runtime.
const peca = (
  id: string,
  name: string,
  category: string,
  kind = 'component',
): ComponenteDoKitResumo & { kind: string } => ({ id, name, category, kind });

const secao = (over: Partial<SecaoResolvida> & { id: string }): SecaoResolvida => ({
  nome: '',
  slug: 'secao',
  pecas: [],
  origem: 'kit',
  ...over,
});

test('ehPecaDeFundo: categoria background ou kind effect bastam; peça comum não é fundo', () => {
  assert.equal(ehPecaDeFundo({ category: 'background', kind: 'component' }), true);
  assert.equal(ehPecaDeFundo({ category: 'other', kind: 'effect' }), true);
  assert.equal(ehPecaDeFundo({ category: 'hero', kind: 'component' }), false);
});

test('separarCamadasDePagina: seção que só tinha o fundo sai da lista, com aviso nominal', () => {
  const fundo = peca('cmp_f', 'Fundo animado da página', 'background');
  const r = separarCamadasDePagina([
    secao({ id: 'sec_1', nome: 'Fundo', origem: 'kit', pecas: [fundo] }),
  ]);
  assert.deepEqual(r.secoes, []);
  assert.deepEqual(r.camadas, [fundo]);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0] ?? '', /"Fundo animado da página"/, 'o aviso nomeia o fundo');
  assert.match(r.avisos[0] ?? '', /a seção saiu/, 'o aviso diz que a seção saiu');
});

test('separarCamadasDePagina: seção com outras peças perde só o fundo e fica', () => {
  const fundo = peca('cmp_f', 'Partículas', 'other', 'effect');
  const abertura = peca('cmp_h', 'Abertura', 'hero');
  const r = separarCamadasDePagina([
    secao({ id: 'sec_1', nome: 'Abertura', origem: 'kit', pecas: [fundo, abertura] }),
  ]);
  assert.equal(r.secoes.length, 1);
  assert.deepEqual(r.secoes[0]?.pecas, [abertura]);
  assert.equal(r.secoes[0]?.origem, 'kit', 'o que sobrou continua vindo inteiro do kit');
  assert.deepEqual(r.camadas, [fundo]);
  assert.equal(r.avisos.length, 1);
  assert.match(r.avisos[0] ?? '', /"Partículas"/, 'o aviso nomeia a peça que virou camada');
});

test('separarCamadasDePagina: a instrução segura a seção mesmo sem sobrar peça', () => {
  const fundo = peca('cmp_f', 'Gradiente', 'background');
  const r = separarCamadasDePagina([
    secao({
      id: 'sec_1',
      nome: 'Clima',
      origem: 'kit',
      pecas: [fundo],
      instrucao: 'falar do clima do estúdio',
    }),
  ]);
  assert.equal(r.secoes.length, 1);
  assert.deepEqual(r.secoes[0]?.pecas, []);
  // Sem peça nenhuma, a seção passa a ser criada no estilo do kit; manter
  // `kit` mentiria a procedência no data-origem do site gerado.
  assert.equal(r.secoes[0]?.origem, 'criada');
  assert.equal(r.secoes[0]?.instrucao, 'falar do clima do estúdio');
  assert.equal(r.avisos.length, 1);
});

test('separarCamadasDePagina: sem peça de fundo, a entrada sai intacta e sem aviso', () => {
  const entrada = [
    secao({ id: 'sec_1', nome: 'Abertura', origem: 'kit', pecas: [peca('cmp_h', 'Hero', 'hero')] }),
    secao({ id: 'sec_2', nome: 'Contato', origem: 'criada' }),
  ];
  const r = separarCamadasDePagina(entrada);
  assert.deepEqual(r.secoes, entrada);
  assert.deepEqual(r.camadas, []);
  assert.deepEqual(r.avisos, []);
});

test('separarCamadasDePagina: a ordem das seções restantes preserva, e camada repetida sai UMA vez', () => {
  const fundo = peca('cmp_f', 'Fundo', 'background');
  const r = separarCamadasDePagina([
    secao({ id: 'sec_a', nome: 'A', origem: 'kit', pecas: [peca('cmp_1', 'Nav', 'nav')] }),
    secao({ id: 'sec_b', nome: 'B', origem: 'kit', pecas: [fundo] }),
    secao({
      id: 'sec_c',
      nome: 'C',
      origem: 'kit',
      pecas: [peca('cmp_2', 'Rodapé', 'footer'), fundo],
    }),
  ]);
  assert.deepEqual(
    r.secoes.map((s) => s.id),
    ['sec_a', 'sec_c'],
  );
  assert.deepEqual(r.camadas, [fundo], 'o mesmo fundo em duas seções vira uma camada só');
});

test('fase 3: toda categoria que a segmentação produz tem destino na geração', () => {
  // 45 de 190 segmentos do acervo (24%) não tinham papel de destino: team com
  // lista vazia, gallery sem papel, logo-cloud e stats órfãos. Classificar
  // melhor não adianta enquanto a classe não tiver para onde ir.
  assert.equal(papelParaCategoria('team'), 'team');
  assert.equal(papelParaCategoria('logo-cloud'), 'logos');
  assert.equal(papelParaCategoria('stats'), 'stats');
  assert.equal(papelParaCategoria('gallery'), 'gallery');
  assert.equal(papelParaCategoria('accordion'), 'faq');
  assert.equal(papelParaCategoria('timeline'), 'about');
});
