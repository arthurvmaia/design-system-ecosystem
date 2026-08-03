import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  REGIME_DE_ESCALA_PADRAO,
  RegimeDeEscala,
  alinharDegraus,
  escalaDeReferencia,
  nomeDoEspaco,
  nomeDoPasso,
  reguaDaOrigem,
  reguasParaOrigem,
} from './escala-do-site.js';
import type { EscalaDaOrigem, OrigemConsolidada } from './kit-design-system.js';

/**
 * O núcleo da régua única: quem manda na escala e para onde vai cada degrau.
 *
 * ## O que estes testes protegem
 *
 * Não é a aritmética do deslocamento — é o CRITÉRIO. Duas coisas quebram feio se
 * alguém mexer sem querer: o corpo deixar de cair no corpo (e aí o texto de
 * leitura de duas origens sai de tamanhos diferentes, que é o defeito que este
 * módulo existe para consertar), e a escolha da referência deixar de ser
 * determinística (e aí duas gerações do MESMO kit produzem sites diferentes, sem
 * ninguém ter mudado nada).
 *
 * ## A degradação também está aqui
 *
 * Sem escala medida, as réguas saem VAZIAS. É o que segura a promessa de que
 * ligar o regime não mexe em projeto antigo: mapa vazio significa que ninguém
 * reescreve nada e o literal de origem continua valendo.
 */

// ── Fixtures ─────────────────────────────────────────────────────────────────

const escala = (p: Partial<EscalaDaOrigem>): EscalaDaOrigem => ({
  degraus: [],
  corpo: null,
  display: null,
  espacos: [],
  raios: [],
  ...p,
});

const origem = (designSystemId: string, e?: EscalaDaOrigem): OrigemConsolidada => ({
  designSystemId,
  tema: 'claro',
  clusters: [],
  fontes: [],
  ...(e === undefined ? {} : { escala: e }),
});

// ── O contrato do regime ─────────────────────────────────────────────────────

test('o regime tem dois valores e o padrão é o da marca', () => {
  assert.deepEqual(RegimeDeEscala.options, ['da-marca', 'de-cada-origem']);
  assert.equal(REGIME_DE_ESCALA_PADRAO, 'da-marca');
  assert.equal(RegimeDeEscala.safeParse('da-nasa').success, false);
});

test('os tokens são numerados a partir de 1, não de 0', () => {
  // Quem lê `--marca-passo-1` no CSS espera o primeiro degrau. Índice base zero
  // vazando para o nome do token seria armadilha na primeira leitura humana.
  assert.equal(nomeDoPasso(0), '--marca-passo-1');
  assert.equal(nomeDoPasso(7), '--marca-passo-8');
  assert.equal(nomeDoEspaco(0), '--marca-espaco-1');
  assert.equal(nomeDoEspaco(3), '--marca-espaco-4');
});

// ── Quem rege a escala ───────────────────────────────────────────────────────

test('a preferência declarada ganha, mesmo tendo menos degraus', () => {
  // Escolha explícita do usuário não perde para contagem: se ele disse que o
  // site segue a régua do `ds_b`, contar degraus por cima disso seria o app
  // desfazendo a decisão dele em silêncio.
  const origens = [
    origem('ds_a', escala({ degraus: [12, 14, 16, 20, 28, 40, 64] })),
    origem('ds_b', escala({ degraus: [14, 18, 32] })),
  ];
  assert.equal(escalaDeReferencia(origens, 'ds_b')?.designSystemId, 'ds_b');
});

test('sem preferência, ganha a régua com mais degraus medidos', () => {
  const origens = [
    origem('ds_curta', escala({ degraus: [16, 32] })),
    origem('ds_rica', escala({ degraus: [12, 14, 16, 20, 28, 40] })),
    origem('ds_media', escala({ degraus: [14, 16, 24, 40] })),
  ];
  assert.equal(escalaDeReferencia(origens)?.designSystemId, 'ds_rica');
  assert.equal(escalaDeReferencia(origens, null)?.designSystemId, 'ds_rica');
});

test('empate de degraus resolve pelo id, e a ordem de entrada não interfere', () => {
  // Determinismo: duas gerações do mesmo kit têm de produzir o mesmo site. Se a
  // ordem em que as origens chegam mudasse a referência, o site mudaria de
  // tamanho sem ninguém ter mexido nele.
  const zebra = origem('ds_zebra', escala({ degraus: [12, 16, 24, 40] }));
  const alfa = origem('ds_alfa', escala({ degraus: [14, 18, 28, 48] }));

  assert.equal(escalaDeReferencia([zebra, alfa])?.designSystemId, 'ds_alfa');
  assert.equal(escalaDeReferencia([alfa, zebra])?.designSystemId, 'ds_alfa');
});

test('origem sem escala medida não concorre a referência', () => {
  // `escala` ausente é captura antiga; `degraus: []` é medição que não achou
  // nada. Nenhuma das duas pode reger o site: não há degrau de onde tirar token.
  const origens = [
    origem('ds_antiga'),
    origem('ds_vazia', escala({ degraus: [] })),
    origem('ds_medida', escala({ degraus: [16, 24] })),
  ];
  assert.equal(escalaDeReferencia(origens)?.designSystemId, 'ds_medida');
});

test('preferência que aponta para origem sem escala cai na regra dos degraus', () => {
  // Preferir uma origem que não tem régua não pode devolver uma referência sem
  // degraus — isso reintroduziria o problema disfarçado de escolha.
  const origens = [origem('ds_antiga'), origem('ds_medida', escala({ degraus: [16, 24, 32] }))];
  assert.equal(escalaDeReferencia(origens, 'ds_antiga')?.designSystemId, 'ds_medida');
});

test('sem nenhuma origem com escala, não há referência', () => {
  assert.equal(escalaDeReferencia([]), null);
  assert.equal(escalaDeReferencia([origem('ds_antiga')], 'ds_antiga'), null);
  assert.equal(escalaDeReferencia([origem('ds_vazia', escala({ degraus: [] }))]), null);
});

// ── A âncora: corpo cai no corpo ─────────────────────────────────────────────

test('O TESTE CENTRAL: o corpo da origem cai no corpo da referência', () => {
  // Réguas de comprimentos DIFERENTES e com o corpo em posições diferentes: 5
  // degraus com corpo no índice 2, contra 8 degraus com corpo no índice 3. Por
  // posição relativa o corpo iria parar em outro lugar; pela âncora, não.
  const daOrigem = [12, 14, 16, 20, 32];
  const daReferencia = [11, 13, 15, 18, 24, 40, 64, 96];

  const destinos = alinharDegraus(daOrigem, daReferencia, { origem: 16, referencia: 18 });

  assert.equal(daOrigem.indexOf(16), 2, 'a régua de origem tem o corpo no índice 2');
  assert.equal(daReferencia.indexOf(18), 3, 'a de referência, no índice 3');
  assert.equal(destinos[2], 3, 'o corpo casou com o corpo');

  // E o token que o corpo passa a usar é o do corpo da referência.
  const { porValor } = reguaDaOrigem(daOrigem, daReferencia, nomeDoPasso, {
    origem: 16,
    referencia: 18,
  });
  assert.equal(porValor.get(16), nomeDoPasso(3));
});

test('a hierarquia em volta do corpo se preserva por deslocamento', () => {
  const daOrigem = [12, 14, 16, 20, 32];
  const daReferencia = [11, 13, 15, 18, 24, 40, 64, 96];
  const destinos = alinharDegraus(daOrigem, daReferencia, { origem: 16, referencia: 18 });

  assert.deepEqual(destinos, [1, 2, 3, 4, 5]);
  // Um acima do corpo continua um acima; um abaixo continua um abaixo. O que
  // era destaque continua destaque, o que era miúdo continua miúdo.
  const corpo = destinos[2] as number;
  assert.equal(destinos[3], corpo + 1);
  assert.equal(destinos[1], corpo - 1);
  // E a ordem nunca se inverte.
  assert.deepEqual(
    [...destinos].sort((a, b) => a - b),
    destinos,
  );
});

test('corpo medido fora dos degraus cai no degrau mais próximo', () => {
  // A medição dá o tamanho que o navegador pintou; ele não precisa coincidir
  // com um degrau da lista. 17px está a 1 de 16 e a 3 de 20: vale 16.
  const destinos = alinharDegraus([12, 16, 20], [10, 14, 18, 24], {
    origem: 17,
    referencia: 14,
  });
  assert.equal(destinos[1], 1, 'o corpo da origem (16) foi para o índice do 14');
});

// ── Limites ──────────────────────────────────────────────────────────────────

test('deslocamento que estouraria a régua é limitado ao primeiro e ao último degrau', () => {
  // Origem de 8 degraus contra referência de 3: por baixo e por cima sobra
  // gente. Estourar seria índice inválido e token inexistente; o certo é
  // encostar na ponta e parar ali.
  const daOrigem = [10, 12, 14, 16, 18, 24, 32, 48];
  const daReferencia = [14, 16, 20];
  const destinos = alinharDegraus(daOrigem, daReferencia, { origem: 16, referencia: 16 });

  assert.deepEqual(destinos, [0, 0, 0, 1, 2, 2, 2, 2]);
  assert.ok(
    destinos.every((i) => i >= 0 && i < daReferencia.length),
    'todo destino é um índice existente na referência',
  );
  assert.equal(destinos[3], 1, 'mesmo achatando as pontas, o corpo continua no corpo');
});

// ── Sem âncora ───────────────────────────────────────────────────────────────

test('sem corpo medido, o alinhamento cai para posição relativa', () => {
  // Pior âncora que o corpo, melhor que nenhuma: as pontas casam com as pontas
  // e o meio se distribui.
  assert.deepEqual(alinharDegraus([12, 16, 32], [10, 14, 18, 24, 40]), [0, 2, 4]);
  assert.deepEqual(alinharDegraus([12, 16, 32], [10, 14, 18, 24, 40], undefined), [0, 2, 4]);
  // Corpo em uma só das duas réguas não é âncora: falta o par.
  assert.deepEqual(
    alinharDegraus([12, 16, 32], [10, 14, 18, 24, 40], { origem: 16, referencia: null }),
    [0, 2, 4],
  );
});

test('régua de um degrau só aponta para o primeiro', () => {
  // Não há proporção a preservar quando não há segundo ponto — e dividir por
  // zero aqui daria NaN virando índice.
  assert.deepEqual(alinharDegraus([16], [10, 14, 18, 24, 40]), [0]);
});

test('régua vazia de qualquer lado não alinha nada', () => {
  assert.deepEqual(alinharDegraus([], [10, 20]), []);
  assert.deepEqual(alinharDegraus([12, 16], []), []);
  assert.deepEqual(alinharDegraus([12, 16], [], { origem: 16, referencia: 16 }), []);
});

// ── O mapa que a reescrita consome ───────────────────────────────────────────

test('reguaDaOrigem mapeia valor medido para o nome do token', () => {
  const { porValor } = reguaDaOrigem([12, 16, 32], [10, 14, 18, 24, 40], nomeDoEspaco);
  assert.deepEqual(
    [...porValor.entries()],
    [
      [12, '--marca-espaco-1'],
      [16, '--marca-espaco-3'],
      [32, '--marca-espaco-5'],
    ],
  );
});

test('reguasParaOrigem: tipografia ancora no corpo, espaço vai por posição', () => {
  // Respiro não tem "corpo": nomear um degrau de espaço como o principal
  // exigiria saber a intenção de quem desenhou, e a medição não separa isso.
  const daOrigem = escala({ degraus: [12, 16, 40], corpo: 16, espacos: [4, 12, 48] });
  const daReferencia = escala({
    degraus: [10, 14, 18, 24, 40],
    corpo: 18,
    espacos: [8, 16, 32, 64, 96],
  });

  const { tipografia, espaco } = reguasParaOrigem(daOrigem, daReferencia);

  assert.equal(tipografia.porValor.get(16), '--marca-passo-3', 'corpo 16 → corpo 18');
  assert.equal(tipografia.porValor.get(12), '--marca-passo-2');
  assert.equal(tipografia.porValor.get(40), '--marca-passo-4');
  // Os espaços não têm âncora: pontas nas pontas.
  assert.equal(espaco.porValor.get(4), '--marca-espaco-1');
  assert.equal(espaco.porValor.get(12), '--marca-espaco-3');
  assert.equal(espaco.porValor.get(48), '--marca-espaco-5');
});

// ── A degradação que segura tudo ─────────────────────────────────────────────

test('escala ausente devolve mapas VAZIOS dos dois lados', () => {
  // É este teste que sustenta a promessa de que ligar o regime `da-marca` não
  // muda projeto que já existe: sem régua medida não há substituição nenhuma, e
  // o literal de tamanho da origem continua valendo.
  const medida = escala({ degraus: [12, 16, 40], corpo: 16, espacos: [4, 12, 48] });

  for (const [a, b] of [
    [undefined, undefined],
    [medida, undefined],
    [undefined, medida],
  ] as const) {
    const { tipografia, espaco } = reguasParaOrigem(a, b);
    assert.equal(tipografia.porValor.size, 0);
    assert.equal(espaco.porValor.size, 0);
  }
});

test('escala presente mas sem degraus medidos também não substitui nada', () => {
  // `degraus: []` é medição que não achou nada, e não é o mesmo que uma régua.
  const vazia = escala({ degraus: [], espacos: [] });
  const medida = escala({ degraus: [12, 16, 40], corpo: 16, espacos: [4, 12, 48] });

  const semOrigem = reguasParaOrigem(vazia, medida);
  assert.equal(semOrigem.tipografia.porValor.size, 0);
  assert.equal(semOrigem.espaco.porValor.size, 0);

  const semReferencia = reguasParaOrigem(medida, vazia);
  assert.equal(semReferencia.tipografia.porValor.size, 0);
  assert.equal(semReferencia.espaco.porValor.size, 0);
});

test('só um dos eixos medido não derruba o outro', () => {
  // Origem com tipografia medida e espaços não. A régua de tipografia sai; a de
  // espaço sai vazia. Perder um eixo não pode custar o outro.
  const daOrigem = escala({ degraus: [12, 16, 40], corpo: 16, espacos: [] });
  const daReferencia = escala({ degraus: [10, 14, 18, 24, 40], corpo: 18, espacos: [8, 16, 32] });

  const { tipografia, espaco } = reguasParaOrigem(daOrigem, daReferencia);
  assert.equal(tipografia.porValor.get(16), '--marca-passo-3');
  assert.equal(espaco.porValor.size, 0);
});
