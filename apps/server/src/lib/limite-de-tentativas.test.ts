import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ATRASO_MAXIMO_MS,
  atrasoDaTentativa,
  falhasAtuais,
  registrarAcerto,
  registrarFalha,
} from './limite-de-tentativas.js';

/**
 * A curva que decide se a porta é forçável.
 *
 * O login respondia na mesma velocidade para senha certa e errada, sem contador
 * e sem espera — e com o app publicado por túnel isso aceita quantos palpites a
 * rede aguentar contra UMA senha compartilhada.
 */

test('a primeira falha ja custa alguma coisa', () => {
  assert.equal(atrasoDaTentativa(0), 0, 'quem nao errou nao espera');
  assert.ok(atrasoDaTentativa(1) > 0);
});

test('o atraso dobra, e para de dobrar no teto', () => {
  assert.equal(atrasoDaTentativa(2), atrasoDaTentativa(1) * 2);
  assert.equal(atrasoDaTentativa(3), atrasoDaTentativa(1) * 4);
  assert.equal(atrasoDaTentativa(50), ATRASO_MAXIMO_MS, 'o teto existe: castigo nao vira bloqueio');
});

test('mil tentativas ficam caras, sem trancar ninguem', () => {
  // A soma é a conta que importa: quem chuta 1000 vezes paga mais de uma hora,
  // e quem digitou errado uma vez paga um quarto de segundo.
  let total = 0;
  for (let n = 1; n <= 1000; n++) total += atrasoDaTentativa(n);
  assert.ok(
    total > 60 * 60 * 1000,
    `1000 palpites deviam custar mais de uma hora, custam ${total}`,
  );
  assert.ok(atrasoDaTentativa(1) < 1000, 'e o engano honesto continua barato');
});

test('acertar zera o contador', () => {
  registrarAcerto();
  registrarFalha();
  registrarFalha();
  assert.equal(falhasAtuais(), 2);
  registrarAcerto();
  assert.equal(falhasAtuais(), 0, 'entrar limpa a conta: o proximo engano volta a ser barato');
});
