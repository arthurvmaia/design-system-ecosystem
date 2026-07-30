import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SecaoDoSite } from '@ds/shared/schemas';
import {
  MOTIVO_DO_PAPEL,
  PAPEIS_OBRIGATORIOS,
  type PecaDoKit,
  adicionarFundo,
  agruparPecasParaSecao,
  ehFundo,
  fundosDisponiveis,
  moverSecaoVisivel,
  papeisObrigatoriosFaltantes,
  papelEfetivoDaSecao,
  selinhoDaPeca,
  separarFundos,
  tirarFundo,
} from './estrutura-checagens.js';

const peca = (id: string, over: Partial<PecaDoKit> = {}): PecaDoKit => ({
  id,
  name: `Peça ${id}`,
  category: 'card',
  ...over,
});

const secao = (id: string, over: Partial<SecaoDoSite> = {}): SecaoDoSite => ({
  id,
  nome: `Seção ${id}`,
  componentIds: [],
  ...over,
});

const KIT: PecaDoKit[] = [
  peca('nav1', { category: 'nav' }),
  peca('hero1', { category: 'hero' }),
  peca('card1', { category: 'card' }),
  peca('fundo1', { category: 'background' }),
  peca('efeito1', { category: 'other', kind: 'effect' }),
];

// ── Obrigatórias ─────────────────────────────────────────────────────────────

test('estrutura vazia deve os três papéis, na ordem da página', () => {
  assert.deepEqual(papeisObrigatoriosFaltantes([], KIT), ['nav', 'hero', 'footer']);
});

test('papel declarado E papel inferido pela peça contam como presentes', () => {
  // A navegação vem por inferência (peça nav, sem papel declarado); a abertura
  // vem declarada. Cobrar qualquer uma seria pedir o que já existe.
  const secoes = [
    secao('a', { componentIds: ['nav1'] }),
    secao('b', { papel: 'hero' }),
    secao('c', { papel: 'footer' }),
  ];
  assert.deepEqual(papeisObrigatoriosFaltantes(secoes, KIT), []);
});

test('peça de fundo não satisfaz papel nenhum', () => {
  const secoes = [secao('a', { componentIds: ['fundo1'] })];
  assert.deepEqual(papeisObrigatoriosFaltantes(secoes, KIT), ['nav', 'hero', 'footer']);
});

test('todo papel obrigatório tem motivo escrito — o aviso não pode ficar mudo', () => {
  for (const p of PAPEIS_OBRIGATORIOS) {
    assert.ok(MOTIVO_DO_PAPEL[p].trim().length > 10, `motivo de "${p}" curto demais`);
  }
});

// ── Papel efetivo e selinho ──────────────────────────────────────────────────

test('papelEfetivoDaSecao: declarado vence, senão infere pela primeira peça', () => {
  assert.equal(papelEfetivoDaSecao(secao('a', { papel: 'faq' }), KIT), 'faq');
  assert.equal(papelEfetivoDaSecao(secao('b', { componentIds: ['hero1'] }), KIT), 'hero');
  assert.equal(papelEfetivoDaSecao(secao('c'), KIT), undefined);
});

test('selinhoDaPeca diz onde a peça funciona, e cala quando não sabe', () => {
  assert.equal(selinhoDaPeca('nav'), 'boa para navegação');
  assert.equal(selinhoDaPeca('hero'), 'boa para abertura');
  // background não pertence a papel nenhum: sem selinho, em vez de chute.
  assert.equal(selinhoDaPeca('background'), undefined);
});

// ── Agrupamento da grade ─────────────────────────────────────────────────────

test('agruparPecasParaSecao separa por papel e nunca oferece fundo', () => {
  const { encaixam, outras } = agruparPecasParaSecao(KIT, 'nav');
  assert.deepEqual(
    encaixam.map((c) => c.id),
    ['nav1'],
  );
  assert.deepEqual(
    outras.map((c) => c.id),
    ['hero1', 'card1'],
  );
});

test('seção sem papel não tem grupo "encaixa": tudo vira "outras"', () => {
  const { encaixam, outras } = agruparPecasParaSecao(KIT, undefined);
  assert.equal(encaixam.length, 0);
  assert.deepEqual(
    outras.map((c) => c.id),
    ['nav1', 'hero1', 'card1'],
  );
});

// ── Fundo da página ──────────────────────────────────────────────────────────

test('ehFundo pega tanto category background quanto kind effect', () => {
  assert.equal(ehFundo(peca('x', { category: 'background' })), true);
  assert.equal(ehFundo(peca('y', { category: 'other', kind: 'effect' })), true);
  assert.equal(ehFundo(peca('z', { category: 'card' })), false);
});

test('seção que só carrega o fundo some da lista; o fundo aparece no bloco', () => {
  const secoes = [
    secao('a', { componentIds: ['hero1'] }),
    secao('b', { componentIds: ['fundo1'] }),
  ];
  const { visiveis, fundos } = separarFundos(secoes, KIT);
  assert.deepEqual(
    visiveis.map((s) => s.id),
    ['a'],
  );
  assert.deepEqual(fundos, [{ secaoId: 'b', peca: KIT[3], secaoSoDeFundo: true }]);
});

test('seção mista fica na lista, mas o fundo dela vai para o bloco também', () => {
  const secoes = [secao('a', { componentIds: ['hero1', 'fundo1'] })];
  const { visiveis, fundos } = separarFundos(secoes, KIT);
  assert.equal(visiveis.length, 1);
  assert.equal(fundos[0]?.secaoSoDeFundo, false);
});

test('seção de fundo COM instrução continua visível: ainda há o que gerar nela', () => {
  const secoes = [secao('a', { componentIds: ['fundo1'], instrucao: 'fale do atendimento' })];
  const { visiveis, fundos } = separarFundos(secoes, KIT);
  assert.equal(visiveis.length, 1);
  assert.equal(fundos[0]?.secaoSoDeFundo, false);
});

test('fundosDisponiveis oferece só o fundo que ainda não está em uso', () => {
  const secoes = [secao('a', { componentIds: ['fundo1'] })];
  const { fundos } = separarFundos(secoes, KIT);
  assert.deepEqual(
    fundosDisponiveis(KIT, fundos).map((c) => c.id),
    ['efeito1'],
  );
});

test('adicionarFundo cria a hospedeira nomeada no fim, com id injetável', () => {
  const lista = adicionarFundo([secao('a')], 'fundo1', () => 'sec_novo');
  assert.equal(lista.length, 2);
  assert.deepEqual(lista[1], {
    id: 'sec_novo',
    nome: 'Fundo da página',
    componentIds: ['fundo1'],
  });
});

test('tirarFundo derruba a hospedeira que só existia para o fundo', () => {
  const secoes = [
    secao('a', { componentIds: ['hero1'] }),
    secao('b', { componentIds: ['fundo1'] }),
  ];
  assert.deepEqual(
    tirarFundo(secoes, KIT, 'b', 'fundo1').map((s) => s.id),
    ['a'],
  );
});

test('tirarFundo de seção mista só tira a peça; a seção fica', () => {
  const secoes = [secao('a', { componentIds: ['hero1', 'fundo1'] })];
  const depois = tirarFundo(secoes, KIT, 'a', 'fundo1');
  assert.deepEqual(depois[0]?.componentIds, ['hero1']);
});

test('tirarFundo de par inexistente não muda nada', () => {
  const secoes = [secao('a', { componentIds: ['hero1'] })];
  assert.deepEqual(tirarFundo(secoes, KIT, 'a', 'fundo1'), secoes);
});

// ── Mover entre visíveis ─────────────────────────────────────────────────────

test('moverSecaoVisivel pula a hospedeira escondida no meio', () => {
  // A hospedeira "f" está entre as duas visíveis. Mover "a" para baixo tem de
  // trocá-la com "b" na tela, não com "f" (o que pareceria não mover nada).
  const secoes = [
    secao('a', { componentIds: ['hero1'] }),
    secao('f', { componentIds: ['fundo1'] }),
    secao('b', { componentIds: ['card1'] }),
  ];
  const depois = moverSecaoVisivel(secoes, KIT, 'a', 'baixo');
  assert.deepEqual(
    depois.map((s) => s.id),
    ['b', 'a', 'f'],
  );
});

test('movimento nulo preserva a ordem original, hospedeiras incluídas', () => {
  const secoes = [
    secao('f', { componentIds: ['fundo1'] }),
    secao('a', { componentIds: ['hero1'] }),
  ];
  assert.deepEqual(
    moverSecaoVisivel(secoes, KIT, 'a', 'baixo').map((s) => s.id),
    ['f', 'a'],
  );
});
