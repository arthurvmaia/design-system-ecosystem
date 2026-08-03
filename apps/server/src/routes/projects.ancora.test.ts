import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SlotDeMidia } from '@ds/shared';
import { avisoDeMidiaPresaARolagem } from './projects.js';

/**
 * O aviso que a geração dá sobre mídia presa à rolagem.
 *
 * A âncora já viaja dentro do contrato da peça; o que se prova aqui é que ela
 * chega a QUEM MONTA O SITE em português, e que ela não vira aviso quando não há
 * o que dizer. Um aviso que aparece sempre deixa de ser lido.
 */

const slot = (id: string, ancoras: SlotDeMidia['ancoras']): SlotDeMidia => ({
  id,
  seletor: ':scope > *:nth-child(1)',
  tipo: 'imagem',
  exibicao: {},
  ancoras,
  obrigatorio: false,
  pareceLogo: false,
});

test('mídia presa à rolagem vira aviso com o efeito e a peça pelo nome', () => {
  const aviso = avisoDeMidiaPresaARolagem('Hero com foto ao fundo', [
    slot('midia-1', [
      { midiaId: 'md_1', efeito: 'parallax', de: 0.2, ate: 0.6, acompanhaRolagem: true },
    ]),
    slot('midia-2', []),
  ]);
  assert.ok(aviso !== null);
  assert.ok(aviso.includes('Hero com foto ao fundo'));
  assert.ok(aviso.includes('parallax'));
  assert.ok(aviso.includes('1 mídia está presa'));
});

test('peça sem mídia presa não gera aviso nenhum', () => {
  assert.equal(avisoDeMidiaPresaARolagem('Grade de 3 cartões', [slot('midia-1', [])]), null);
  // `null` é "ninguém mediu": também não há o que avisar, e inventar um aviso
  // sobre o que não foi medido é pior que ficar calado.
  assert.equal(avisoDeMidiaPresaARolagem('Grade de 3 cartões', [slot('midia-1', null)]), null);
  assert.equal(avisoDeMidiaPresaARolagem('Rodapé', []), null);
});

test('duas mídias presas contam certo e os efeitos não repetem', () => {
  const aviso = avisoDeMidiaPresaARolagem('Galeria em camadas', [
    slot('midia-1', [
      { midiaId: 'md_1', efeito: 'parallax', de: 0, ate: 0.5, acompanhaRolagem: true },
    ]),
    slot('midia-2', [
      { midiaId: 'md_2', efeito: 'parallax', de: 0.5, ate: 1, acompanhaRolagem: true },
      { midiaId: 'md_2', efeito: 'sticky', de: 0.5, ate: 1, acompanhaRolagem: true },
    ]),
  ]);
  assert.ok(aviso !== null);
  assert.ok(aviso.includes('2 mídias estão presas'));
  assert.ok(aviso.includes('parallax, sticky'));
  assert.equal(aviso.split('parallax').length - 1, 1);
});
