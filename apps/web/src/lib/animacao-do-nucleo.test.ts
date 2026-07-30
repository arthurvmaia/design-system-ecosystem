import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classeDaAnimacao } from '../lib/animacao-do-nucleo.js';

/**
 * A regra é: **o Orbis nunca fica parado.**
 *
 * Ela já foi quebrada uma vez, e não por descuido de quem escreveu a tela: o
 * componente OFERECIA o estado quieto (`esmaecido` sem `pulsando`), e as telas
 * vazias o usavam. Quem chegava numa tela sem nada via um disco imóvel e não
 * sabia se o app estava pensando ou morto.
 *
 * Regra que depende de cada tela lembrar de passar uma prop volta a ser
 * quebrada na próxima tela nova. Por isso ela virou estrutural, e por isso tem
 * teste: se alguém devolver um caminho que produza um Orbis sem animação, aqui
 * falha.
 */

test('em repouso ele respira', () => {
  assert.equal(classeDaAnimacao({}), 'ds-nucleo-pulsa');
});

test('trabalhando ele gira', () => {
  assert.equal(classeDaAnimacao({ girando: true }), 'ds-nucleo-gira');
});

test('girando explicitamente falso continua respirando, nunca parado', () => {
  assert.equal(classeDaAnimacao({ girando: false }), 'ds-nucleo-pulsa');
});

test('NÃO existe combinação que devolva um Orbis parado', () => {
  // A varredura de todas as entradas possíveis. É o teste que de fato guarda a
  // regra: qualquer prop nova que abra um caminho sem animação reprova aqui,
  // sem depender de alguém lembrar de escrever o caso.
  for (const girando of [undefined, true, false]) {
    const classe = classeDaAnimacao({ girando });
    assert.ok(
      classe === 'ds-nucleo-pulsa' || classe === 'ds-nucleo-gira',
      `girando=${String(girando)} devolveu ${String(classe)}`,
    );
  }
});

test('a marca é a única exceção, e ela traz a própria animação', () => {
  // `.ds-marca-orbe` já gira em 26 s dentro do anel. Devolver uma classe aqui
  // poria duas declarações de `animation` no mesmo elemento, e quem venceria
  // seria a ordem da folha de estilo.
  assert.equal(classeDaAnimacao({ animacaoPropria: true }), null);
});

test('a exceção vence o giro: quem traz a própria animação manda', () => {
  assert.equal(classeDaAnimacao({ animacaoPropria: true, girando: true }), null);
});
