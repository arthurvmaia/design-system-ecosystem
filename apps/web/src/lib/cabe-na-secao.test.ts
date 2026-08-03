import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SlotDeMidia } from '@ds/shared/schemas';
import type { KitContratoResumo } from './api.js';
import { avaliarMidia, oQueCabe } from './cabe-na-secao.js';

/**
 * A regra: RECUSA o descasamento de tipo, AVISA o resto.
 *
 * Vídeo num espaço de imagem (e o contrário) é o único caso em que o app tem
 * certeza de que o arquivo não tem onde entrar, e é o único que bloqueia.
 * Proporção é preferência medida no original, então ela avisa e deixa passar:
 * bloquear preferência é o que faz ferramenta brigar com quem usa.
 */

const slot = (tipo: SlotDeMidia['tipo'], proporcao?: number): SlotDeMidia => ({
  id: `midia-${tipo}`,
  seletor: ':scope > *:nth-child(1)',
  tipo,
  exibicao: proporcao === undefined ? {} : { proporcao },
  obrigatorio: false,
  pareceLogo: false,
});

const contrato = (midias: SlotDeMidia[]): KitContratoResumo => ({
  id: 'cmp_a',
  disponivel: true,
  textos: 0,
  links: 0,
  logos: 0,
  midias,
});

// Proporções de verdade, para o teste falar a mesma língua de quem escolhe o
// arquivo: 16:9 panorâmico, 3:2 de câmera, 4:3 antigo, 9:16 de celular.
const PANORAMICO = 16 / 9;
const CAMERA = 3 / 2;
const ANTIGO = 4 / 3;
const EM_PE = 9 / 16;

// ── O que a seção diz que espera ────────────────────────────────────────────

test('diz o que a seção espera, somando as peças', () => {
  const c = [contrato([slot('imagem'), slot('imagem')]), contrato([slot('video')])];
  assert.equal(oQueCabe(c), 'espera 2 imagens e 1 vídeo');
});

test('fundo de CSS e ícone contam como imagem na frase', () => {
  // A recusa usa esta mesma fronteira. Se a linha ficasse calada aqui, a seção
  // de fundo recusaria o vídeo sem nunca ter dito que só cabe imagem.
  const c = [contrato([slot('background-image'), slot('icone')])];
  assert.equal(oQueCabe(c), 'espera 2 imagens');
});

test('seção sem contrato não promete nada', () => {
  assert.equal(oQueCabe([]), '');
  assert.equal(oQueCabe([contrato([])]), '');
});

// ── A recusa: descasamento de tipo ──────────────────────────────────────────

test('vídeo onde todos os espaços são de imagem é recusado', () => {
  const a = avaliarMidia({ tipo: 'video', contratos: [contrato([slot('imagem')])] });
  assert.equal(a.aceita, false);
  assert.match(a.texto, /imagem parada/);
});

test('imagem onde todos os espaços são de vídeo é recusada', () => {
  const a = avaliarMidia({ tipo: 'image', contratos: [contrato([slot('video')])] });
  assert.equal(a.aceita, false);
});

test('a recusa diz o motivo e a saída, nunca só que o arquivo é inválido', () => {
  for (const a of [
    avaliarMidia({ tipo: 'video', contratos: [contrato([slot('imagem')])] }),
    avaliarMidia({ tipo: 'image', contratos: [contrato([slot('video')])] }),
  ]) {
    assert.equal(a.aceita, false);
    // O motivo (o que a seção tem) e a saída (mídias gerais) na mesma frase.
    assert.match(a.texto, /Os espaços desta seção são todos de/);
    assert.match(a.texto, /mídias gerais/);
  }
});

test('fundo de CSS não toca vídeo: a seção de fundo recusa o vídeo', () => {
  const a = avaliarMidia({ tipo: 'video', contratos: [contrato([slot('background-image')])] });
  assert.equal(a.aceita, false);
});

test('basta um espaço do tipo certo em qualquer peça da seção', () => {
  const a = avaliarMidia({
    tipo: 'video',
    contratos: [contrato([slot('imagem')]), contrato([slot('video')])],
  });
  assert.equal(a.aceita, true);
  assert.equal(a.texto, '');
});

test('imagem entra no espaço de fundo e no de ícone', () => {
  const a = avaliarMidia({
    tipo: 'image',
    contratos: [contrato([slot('background-image'), slot('icone')])],
  });
  assert.equal(a.aceita, true);
});

test('tipo de espaço desconhecido conta como imagem e não recusa nada', () => {
  // Valor novo do schema chegando a um cliente antigo: a degradação segura é
  // tratar como espaço de imagem, nunca recusar o que não se entende.
  const desconhecido = { ...slot('imagem'), tipo: 'holograma' as SlotDeMidia['tipo'] };
  assert.equal(avaliarMidia({ tipo: 'image', contratos: [contrato([desconhecido])] }).aceita, true);
});

test('sem contrato não há recusa: a peça não declarou nada', () => {
  // É o caso que zerava a etapa na regra antiga. Silêncio aqui é o certo.
  const a = avaliarMidia({ tipo: 'video', contratos: [] });
  assert.equal(a.aceita, true);
  assert.equal(a.texto, '');
});

// ── O aviso: proporção ──────────────────────────────────────────────────────

test('proporção dentro da tolerância não rende aviso', () => {
  // 3:2 num espaço 16:9: 18% de diferença, uma faixa fina de corte.
  const a = avaliarMidia({
    tipo: 'image',
    proporcao: CAMERA,
    contratos: [contrato([slot('imagem', PANORAMICO)])],
  });
  assert.equal(a.texto, '');
});

test('arquivo mais alto que o espaço avisa o corte, e ainda assim entra', () => {
  // 4:3 num espaço 16:9: 33% de diferença, um quarto da altura some.
  const a = avaliarMidia({
    tipo: 'image',
    proporcao: ANTIGO,
    contratos: [contrato([slot('imagem', PANORAMICO)])],
  });
  assert.equal(a.aceita, true);
  assert.equal(a.forte, false);
  assert.match(a.texto, /mais alto/);
  assert.match(a.texto, /o topo e o pé/);
});

test('arquivo mais largo que o espaço é cortado nas laterais', () => {
  const a = avaliarMidia({
    tipo: 'image',
    proporcao: PANORAMICO,
    contratos: [contrato([slot('imagem', ANTIGO)])],
  });
  assert.equal(a.aceita, true);
  assert.match(a.texto, /mais largo/);
  assert.match(a.texto, /as laterais/);
});

test('orientação invertida é aviso forte, e mesmo assim aceita', () => {
  const a = avaliarMidia({
    tipo: 'image',
    proporcao: EM_PE,
    contratos: [contrato([slot('imagem', PANORAMICO)])],
  });
  assert.equal(a.aceita, true);
  assert.equal(a.forte, true);
  assert.match(a.texto, /em pé/);
  assert.match(a.texto, /sobrar só o meio/);
});

test('o espaço mais parecido decide: com um que serve, não há aviso', () => {
  const a = avaliarMidia({
    tipo: 'image',
    proporcao: EM_PE,
    contratos: [contrato([slot('imagem', PANORAMICO), slot('imagem', EM_PE)])],
  });
  assert.equal(a.texto, '');
});

test('espaço sem proporção declarada não vira aviso', () => {
  // O original não disse largura e altura: não há com o que comparar, e chutar
  // seria pior que calar.
  const a = avaliarMidia({
    tipo: 'image',
    proporcao: EM_PE,
    contratos: [contrato([slot('imagem')])],
  });
  assert.equal(a.texto, '');
});

test('arquivo que o navegador não mediu não vira aviso', () => {
  const a = avaliarMidia({
    tipo: 'image',
    contratos: [contrato([slot('imagem', PANORAMICO)])],
  });
  assert.equal(a.aceita, true);
  assert.equal(a.texto, '');
});

test('a proporção do vídeo é comparada com o espaço de vídeo, não com o de imagem', () => {
  // O espaço de imagem é 16:9 e o de vídeo é em pé (uma dobra de celular). Um
  // vídeo em pé cabe: o espaço de imagem não é da conta dele.
  const a = avaliarMidia({
    tipo: 'video',
    proporcao: EM_PE,
    contratos: [contrato([slot('imagem', PANORAMICO), slot('video', EM_PE)])],
  });
  assert.equal(a.texto, '');
});
