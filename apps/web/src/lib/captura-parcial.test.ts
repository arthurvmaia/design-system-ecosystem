import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emMinutos, oQueFaltou, orcamentoSugeridoMs } from './captura-parcial.js';

test('a fase interrompida vira a CONSEQUÊNCIA, não o nome dela', () => {
  // "v2-percurso" não diz nada a quem usa o app. O que importa é o que se
  // perdeu: as dobras de baixo e os efeitos de mouse e rolagem.
  const t = oQueFaltou('v2-percurso');
  assert.ok(t.includes('rolagem'));
  assert.ok(!t.includes('v2-'), 'jargão de pipeline não vai para a tela');
});

test('cada fase conhecida tem uma consequência própria', () => {
  const fases = ['v2-percurso', 'v2-estados', 'v2-candidatos', 'assets-rede', 'v2-compilar'];
  const textos = fases.map(oQueFaltou);
  assert.equal(new Set(textos).size, textos.length, 'duas fases com o mesmo texto não informam');
});

test('fase desconhecida cai no texto geral, sem inventar efeito', () => {
  // Inventar uma consequência específica para uma fase que ninguém mapeou seria
  // pior que a frase genérica: soaria preciso e estaria errado.
  const t = oQueFaltou('v2-fase-que-ainda-nao-existe');
  assert.ok(t.includes('pode faltar conteúdo'));
});

test('sem fase nenhuma ainda sai uma frase legível', () => {
  assert.ok(oQueFaltou(undefined).length > 20);
  assert.ok(oQueFaltou('').length > 20);
});

test('toda frase termina em ponto: ela é seguida de outra na tela', () => {
  for (const f of ['v2-percurso', 'v2-estados', 'segmentar', undefined]) {
    assert.ok(oQueFaltou(f).trim().endsWith('.'), `"${f}" não fecha a frase`);
  }
});

/**
 * O aviso terminava em "Extraia o site de novo para eu completar", e essa frase
 * manda repetir uma ação que dá o mesmo resultado: sem mudar o orçamento, a fase
 * morre no mesmo lugar. Medido neste acervo: a captura cortou o percurso aos
 * 61s; repetida com 900s de orçamento total, a fase recebeu 414s e foi cortada
 * de novo. O que resolve é um NÚMERO, e ele sai do motivo que o motor gravou.
 */

test('sugere mais tempo do que a fase chegou a receber', () => {
  const ms = orcamentoSugeridoMs('orçamento da fase esgotado (414394ms)');
  assert.ok(ms !== null);
  // A fase morreu NO limite dela, então precisa de folga; e como ela recebe
  // cerca de um terço do total, o total pedido é bem maior que o dobro dela.
  assert.ok((ms as number) > 414394 * 2, 'sugeriu pouco para a fase que estourou');
  assert.equal((ms as number) % 60_000, 0, 'o número vai para a tela: minuto inteiro');
});

test('sem número no motivo, não inventa orçamento', () => {
  // Um palpite sem base mandaria a pessoa esperar meia hora à toa. A tela diz
  // que não sabe, que é a verdade.
  assert.equal(orcamentoSugeridoMs(undefined), null);
  assert.equal(orcamentoSugeridoMs('a fase foi cortada'), null);
  assert.equal(orcamentoSugeridoMs('orçamento da fase esgotado (0ms)'), null);
});

test('o orçamento vira minutos legíveis', () => {
  assert.equal(emMinutos(2_520_000), 42);
  assert.equal(emMinutos(60_000), 1);
});
