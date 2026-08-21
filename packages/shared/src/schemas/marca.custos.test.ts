import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COLECOES_QUANDO_O_ORBIS_DECIDE,
  LIMITE_DE_COLECOES,
  TETO_DA_MARCA_COMPLETA,
  custosDaMarca,
} from './marca.js';

/**
 * A conta da marca acompanha a escolha, e é ela que vira o TETO do pedido.
 *
 * O defeito que estes testes fecham foi medido na tela: com oito coleções
 * nomeadas ela continuava dizendo "1200 créditos, no máximo" e "As capas de
 * coleção 300". O pedido nasceria com teto de 1200 para 1500 de trabalho, e o
 * razão recusaria as quatro últimas capas no meio do job — corretamente, e com
 * o cliente ficando com a vitrine pela metade.
 */
test('sem escolha, a conta é a do padrão: o Orbis decide quantas', () => {
  assert.equal(custosDaMarca().teto, TETO_DA_MARCA_COMPLETA);
  // Zero é "decida por mim", e não "nenhuma capa".
  assert.equal(custosDaMarca(0).teto, TETO_DA_MARCA_COMPLETA);
  assert.equal(custosDaMarca(COLECOES_QUANDO_O_ORBIS_DECIDE).teto, TETO_DA_MARCA_COMPLETA);
});

test('cada coleção a mais custa uma geração a mais, e o teto cresce junto', () => {
  const padrao = custosDaMarca();
  const oito = custosDaMarca(LIMITE_DE_COLECOES);
  const aMais = LIMITE_DE_COLECOES - COLECOES_QUANDO_O_ORBIS_DECIDE;

  assert.equal(oito.teto, padrao.teto + 75 * aMais);
  assert.equal(oito.geracoes, padrao.geracoes + aMais);

  const capas = oito.estagios.find((e) => e.id === 'colecao');
  assert.equal(capas?.geracoes, LIMITE_DE_COLECOES);
  assert.equal(capas?.creditos, 75 * LIMITE_DE_COLECOES);
});

test('só o estágio das capas muda; o resto da marca custa o mesmo', () => {
  const padrao = custosDaMarca();
  const uma = custosDaMarca(1);
  for (const e of padrao.estagios) {
    if (e.id === 'colecao') continue;
    const igual = uma.estagios.find((x) => x.id === e.id);
    assert.equal(igual?.creditos, e.creditos, `${e.id} mudou e não devia`);
    assert.equal(igual?.geracoes, e.geracoes, `${e.id} mudou e não devia`);
  }
});

test('o teto é sempre a soma dos estágios, e nunca um número escolhido', () => {
  for (const n of [1, 2, 4, 7, LIMITE_DE_COLECOES]) {
    const c = custosDaMarca(n);
    assert.equal(
      c.teto,
      c.estagios.reduce((t, e) => t + e.creditos, 0),
      `com ${n} coleções a soma não fecha`,
    );
  }
});
