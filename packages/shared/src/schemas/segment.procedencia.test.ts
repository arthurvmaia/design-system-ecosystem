import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Procedencia, procedenciaDaPrevia } from './segment.js';

/**
 * A procedência responde uma pergunta só: o que estou vendo é o ARQUIVO que vai
 * no site, ou é a região desenhada com o CSS da página de origem por fora?
 *
 * As duas coisas aparecem iguais na tela. A diferença só se revelava no `.zip`,
 * depois de a pessoa já ter escolhido a peça pelo que viu.
 */

test('com pacote próprio, a prévia é o entregável e a representação viaja junto', () => {
  const p = procedenciaDaPrevia({ representacao: 'componente-portatil' });
  assert.equal(p.fonte, 'entregavel');
  assert.equal(p.entregavel, 'proprio');
  assert.equal(p.representacao, 'componente-portatil');
  assert.ok(p.frase.length > 0);
  // A forma é contrato: o card do outro lado lê isto.
  assert.deepEqual(Procedencia.parse(p), p);
});

test('cada representação tem a sua frase, porque elas entregam coisas diferentes', () => {
  const frases = (['componente-portatil', 'capsula-runtime', 'referencia-visual'] as const).map(
    (representacao) => procedenciaDaPrevia({ representacao }).frase,
  );
  assert.equal(new Set(frases).size, 3, 'referência visual não entrega o mesmo que um portátil');
  for (const f of frases) assert.ok(f.length > 0);
});

test('sem pacote nenhum, a prévia é a origem e não há entregável a prometer', () => {
  const p = procedenciaDaPrevia({});
  assert.equal(p.fonte, 'origem');
  assert.equal(p.entregavel, null);
  assert.equal(p.representacao, null);
  // A frase precisa dizer o que está em jogo: sem ela, "origem" é um rótulo que
  // só quem escreveu o código entende.
  assert.match(p.frase, /origem/i);
});

test('recorte de dentro de uma seção: a prévia é a origem, o entregável é do pai', () => {
  // O subcomponente nunca tem pacote próprio (os pacotes são das seções), mas o
  // arquivo dele existe: a promoção troca o corpo do documento do pai pelo
  // recorte. Dizer só "origem" aqui esconderia metade da verdade.
  const p = procedenciaDaPrevia({ representacao: null, paiTemPacote: true });
  assert.equal(p.fonte, 'origem');
  assert.equal(p.entregavel, 'do-pai');
  assert.notEqual(p.frase, procedenciaDaPrevia({}).frase);
});

test('o pacote próprio manda, mesmo quando o pai também tem um', () => {
  const p = procedenciaDaPrevia({ representacao: 'capsula-runtime', paiTemPacote: true });
  assert.equal(p.entregavel, 'proprio');
});

test('nenhuma frase usa travessão', () => {
  const todas = [
    procedenciaDaPrevia({}),
    procedenciaDaPrevia({ paiTemPacote: true }),
    ...(['componente-portatil', 'capsula-runtime', 'referencia-visual'] as const).map(
      (representacao) => procedenciaDaPrevia({ representacao }),
    ),
  ];
  for (const p of todas) assert.doesNotMatch(p.frase, /—/, p.frase);
});
