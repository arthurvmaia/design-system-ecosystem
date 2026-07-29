import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FASE_V2, tetoDaFase } from './engine.js';

/**
 * O teto de fase produzia fome com comida na mesa.
 *
 * Medido numa página real: com 600 s de orçamento, o percurso morreu no teto de
 * 204 s (34% de 600) enquanto a captura inteira usou 320 s — 280 segundos
 * sobraram sem dono, e a única fase que precisava deles foi cortada. Aumentar o
 * total não resolvia: a fração subia junto, e o desperdício também.
 */

const TOTAL = 600_000;

test('sem saber o restante, o teto é a fração — o comportamento antigo', () => {
  assert.equal(tetoDaFase(FASE_V2.percurso, TOTAL), 204_000);
});

test('com tempo livre, a fase cresce em vez de morrer com a sobra ao lado', () => {
  // Quase nada foi gasto ainda: o percurso pode usar o que resta menos o que
  // está prometido às fases seguintes.
  const teto = tetoDaFase(FASE_V2.percurso, TOTAL, 595_000);
  assert.ok(teto !== undefined);
  assert.ok(teto > 204_000, `a fração era o teto: ${teto}`);
  // Prometido adiante: candidatos 4% + estados 22% + segmentar 6% + compilar
  // 10% + comparar 6% = 48% de 600s = 288s. Margem: min(18% de 600s, 45s) =
  // 45s. Livre = 595 - 288 - 45 = 262s.
  assert.equal(teto, 262_000);
});

test('a fração é o PISO: fase apertada não fica com menos do que lhe cabe', () => {
  // Restam só 100s. O livre daria negativo; a fração protege o quinhão dela.
  const teto = tetoDaFase(FASE_V2.percurso, TOTAL, 100_000);
  assert.equal(teto, 204_000, 'a fração continua garantida');
});

test('as fases seguintes continuam com o quinhão reservado', () => {
  // Se o percurso pudesse levar TUDO que resta, as próximas fases nasceriam
  // sem nada — que é o erro oposto e igualmente grave.
  const doPercurso = tetoDaFase(FASE_V2.percurso, TOTAL, 595_000) ?? 0;
  const prometidoAdiante = 595_000 - doPercurso;
  assert.ok(prometidoAdiante >= 288_000, 'o que sobra tem de cobrir as fases seguintes');
});

test('a última fase com teto não tem ninguém adiante, mas ainda respeita a margem', () => {
  // Nada prometido depois dela; o que a segura é a reserva do fechamento.
  assert.equal(tetoDaFase(FASE_V2.comparar, TOTAL, 200_000), 155_000);
});

test('num orçamento apertado a redistribuição não faz nada: não há folga', () => {
  // É o caso do teste da resposta pendurada. Com 150s, o livre do percurso dá
  // exatamente a fração, e a captura continua cabendo dentro do orçamento.
  const teto = tetoDaFase(FASE_V2.percurso, 150_000, 150_000);
  assert.equal(teto, Math.round(150_000 * 0.34));
});

test('fase sem fração declarada continua sem teto próprio', () => {
  assert.equal(tetoDaFase('v2-fase-inexistente', TOTAL, 500_000), undefined);
});

test('a soma das frações continua abaixo de 1: a margem existe de propósito', () => {
  // Carregar, estabilizar, drenar e fechar não têm fração e vivem da margem.
  const comFracao = [
    FASE_V2.percurso,
    FASE_V2.candidatos,
    FASE_V2.estados,
    FASE_V2.segmentar,
    FASE_V2.compilar,
    FASE_V2.comparar,
  ];
  const soma = comFracao.reduce((n, f) => n + (tetoDaFase(f, TOTAL) ?? 0), 0);
  assert.ok(soma < TOTAL, `as frações somam ${soma} de ${TOTAL}`);
});
