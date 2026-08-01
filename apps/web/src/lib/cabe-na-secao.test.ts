import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { KitContratoResumo } from './api.js';
import { avisoDeMidia, oQueCabe } from './cabe-na-secao.js';

const contrato = (midias: { tipo: string }[]): KitContratoResumo => ({
  id: 'cmp_a',
  disponivel: true,
  textos: 0,
  links: 0,
  logos: 0,
  midias,
});

/**
 * O contrato de mídia AVISA, não bloqueia. A regra antiga ("só pede upload quem
 * tem espaço declarado") zerava a etapa: um kit cujas peças não declaram mídia
 * deixava a tela vazia e quem queria subir um banner não tinha onde.
 */

test('diz o que a seção espera, somando as peças', () => {
  const c = [contrato([{ tipo: 'imagem' }, { tipo: 'imagem' }]), contrato([{ tipo: 'video' }])];
  assert.equal(oQueCabe(c), 'espera 2 imagens e 1 vídeo');
});

test('seção sem contrato não promete nada', () => {
  assert.equal(oQueCabe([]), '');
  assert.equal(oQueCabe([contrato([])]), '');
});

test('vídeo onde a peça só tem imagem vira aviso forte', () => {
  const a = avisoDeMidia({ tipo: 'video', contratos: [contrato([{ tipo: 'imagem' }])] });
  assert.ok(a.texto.length > 0);
  assert.equal(a.forte, true);
});

test('vídeo onde cabe vídeo não avisa nada', () => {
  const a = avisoDeMidia({
    tipo: 'video',
    contratos: [contrato([{ tipo: 'imagem' }, { tipo: 'video' }])],
  });
  assert.equal(a.texto, '');
});

test('imagem nunca é recusada', () => {
  // Imagem cabe em qualquer espaço de mídia: o pior caso é um corte, e corte
  // não justifica atrapalhar quem sabe o que quer.
  const a = avisoDeMidia({ tipo: 'image', contratos: [contrato([{ tipo: 'video' }])] });
  assert.equal(a.texto, '');
});

test('sem contrato não há aviso: a peça não declarou nada', () => {
  // É o caso que zerava a etapa na regra antiga. Silêncio aqui é o certo.
  assert.equal(avisoDeMidia({ tipo: 'video', contratos: [] }).texto, '');
});
