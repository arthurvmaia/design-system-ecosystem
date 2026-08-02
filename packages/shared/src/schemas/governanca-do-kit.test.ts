import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type PecaParaRegra,
  baseSugerida,
  regraDaCategoria,
  violacoesDoKit,
} from './governanca-do-kit.js';

/**
 * A regra que o Arthur formulou, virada em código: *"o botão só poderia ter 1
 * design system para os botões, não pode misturar vários, senão fica bagunça"*.
 *
 * O que estes testes protegem não é a conta — é o CRITÉRIO. Toda vez que a
 * função é generosa demais ela deixa passar a bagunça; toda vez que é severa
 * demais ela reprova um kit que estava certo. As duas falhas são caras, e as
 * duas estão testadas aqui.
 */

const peca = (id: string, category: string, designSystemId: string | null): PecaParaRegra => ({
  id,
  name: id,
  category,
  designSystemId,
});

const semGovernanca = { origemBase: null, origemPorCategoria: {} };

// ── A regra por família ──────────────────────────────────────────────────────

test('cada família tem a sua regra, e ela sai da taxonomia', () => {
  assert.equal(regraDaCategoria('typography'), 'origem-unica'); // fundamentos
  assert.equal(regraDaCategoria('button'), 'origem-por-categoria'); // peças
  assert.equal(regraDaCategoria('card'), 'origem-por-categoria');
  assert.equal(regraDaCategoria('hero'), 'livre'); // dobras
  assert.equal(regraDaCategoria('pricing'), 'livre');
  assert.equal(regraDaCategoria('interaction'), 'livre'); // efeitos
});

test('categoria que o banco tem e o schema não conhece é livre', () => {
  // Categoria vinda de extração antiga ou de dado torto não pode derrubar a
  // validação do kit inteiro. Na dúvida, não impor.
  assert.equal(regraDaCategoria('inventada-em-2019'), 'livre');
  assert.equal(regraDaCategoria(''), 'livre');
});

// ── O que é violação ─────────────────────────────────────────────────────────

test('botões de duas origens: a minoria é a violação', () => {
  const v = violacoesDoKit(
    [peca('b1', 'button', 'ds_a'), peca('b2', 'button', 'ds_a'), peca('b3', 'button', 'ds_b')],
    semGovernanca,
  );
  assert.equal(v.length, 1);
  assert.equal(v[0]?.componentId, 'b3');
  assert.equal(v[0]?.origemEsperada, 'ds_a');
  assert.match(v[0]?.motivo ?? '', /vem de uma captura só/);
});

test('a escolha do usuário vence a maioria', () => {
  // Se ele decidiu que os botões vêm de `ds_b`, os dois de `ds_a` é que estão
  // fora — mesmo sendo maioria. A regra existe para ele decidir, não para o app
  // contar votos.
  const v = violacoesDoKit(
    [peca('b1', 'button', 'ds_a'), peca('b2', 'button', 'ds_a'), peca('b3', 'button', 'ds_b')],
    { origemBase: null, origemPorCategoria: { button: 'ds_b' } },
  );
  assert.deepEqual(v.map((x) => x.componentId).sort(), ['b1', 'b2']);
});

test('dobras e efeitos de origens diferentes NÃO são violação', () => {
  // É o produto inteiro: hero de um site, preços de outro, parallax de um
  // terceiro. Reprovar isso mataria a razão de o app existir.
  const v = violacoesDoKit(
    [
      peca('h', 'hero', 'ds_a'),
      peca('p', 'pricing', 'ds_b'),
      peca('f', 'footer', 'ds_c'),
      peca('i', 'interaction', 'ds_d'),
    ],
    semGovernanca,
  );
  assert.deepEqual(v, []);
});

test('cada categoria de peça é julgada por si', () => {
  // Botões de `ds_a` e cards de `ds_b` é um kit VÁLIDO: a regra é uma origem
  // por categoria, não uma origem para todas as peças.
  const v = violacoesDoKit([peca('b', 'button', 'ds_a'), peca('c', 'card', 'ds_b')], semGovernanca);
  assert.deepEqual(v, []);
});

test('empate não elege ninguém, e ninguém é reprovado', () => {
  // Um botão de cada origem: escolher por desempate arbitrário faria o app
  // reprovar metade das peças por uma decisão que ele mesmo inventou.
  const v = violacoesDoKit(
    [peca('b1', 'button', 'ds_a'), peca('b2', 'button', 'ds_b')],
    semGovernanca,
  );
  assert.deepEqual(v, []);
});

test('kit coerente não gera violação nenhuma', () => {
  const v = violacoesDoKit(
    [peca('b1', 'button', 'ds_a'), peca('b2', 'button', 'ds_a'), peca('h', 'hero', 'ds_b')],
    semGovernanca,
  );
  assert.deepEqual(v, []);
});

test('peça sem origem não é acusada de violar', () => {
  // Componente de extração antiga tem `designSystemId` nulo. Ele não pode ser
  // atribuído a origem nenhuma, então acusá-lo seria acusar o que não se sabe.
  const v = violacoesDoKit(
    [peca('b1', 'button', 'ds_a'), peca('b2', 'button', 'ds_a'), peca('b3', 'button', null)],
    semGovernanca,
  );
  assert.equal(v.length, 1);
  assert.equal(v[0]?.componentId, 'b3');
  assert.equal(v[0]?.origemDaPeca, null);
});

test('kit vazio não viola nada', () => {
  assert.deepEqual(violacoesDoKit([], semGovernanca), []);
});

// ── A base sugerida ──────────────────────────────────────────────────────────

test('a base sugerida é a origem que mais contribui', () => {
  assert.equal(
    baseSugerida([
      peca('a', 'hero', 'ds_a'),
      peca('b', 'button', 'ds_a'),
      peca('c', 'card', 'ds_b'),
    ]),
    'ds_a',
  );
});

test('empate não sugere base: quem escolhe é a pessoa', () => {
  assert.equal(baseSugerida([peca('a', 'hero', 'ds_a'), peca('b', 'card', 'ds_b')]), null);
});
