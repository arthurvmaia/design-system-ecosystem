import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MidiaParaAncora } from '@ds/shared';
import { ancorasDoSegmento, midiaEstaNoHtml } from './design-systems.js';

/**
 * A âncora de mídia que chega à Galeria.
 *
 * A medida em si mora em `@ds/shared` e já tem teste próprio. O que se prova
 * aqui é a decisão da rota: de quais comportamentos a âncora sai, e de qual
 * peça ela é. Medido no acervo, sem o segundo filtro: o canvas WebGL de fundo
 * da página virava âncora de SEIS peças — hero, cards, galeria, CTA, rodapé e o
 * próprio fundo —, e em cinco delas não há arquivo nenhum para trocar.
 */

const WEBGL: MidiaParaAncora = {
  id: 'md_1',
  kind: 'webgl',
  fingerprint: { id: 'webgl-bg', stableClasses: ['fixed', 'top-0', '-z-20'] },
};

const FOTO: MidiaParaAncora = {
  id: 'md_2',
  kind: 'imagem',
  fingerprint: { id: null, stableClasses: ['w-full', 'object-cover'] },
};

const STICKY_DO_WEBGL = {
  kind: 'sticky',
  start: 0,
  end: 1,
  scrub: false,
  pin: true,
  target: { id: 'webgl-bg', classes: ['fixed', 'top-0', '-z-20'] },
};

const HTML_DO_FUNDO = '<canvas id="webgl-bg" class="fixed top-0 -z-20"></canvas>';
const HTML_DO_HERO = '<section class="relative pt-16"><h1>Manchete</h1></section>';

test('a âncora sai do comportamento deste segmento, e traz a frase junto', () => {
  const achadas = ancorasDoSegmento([WEBGL, FOTO], { scroll: [STICKY_DO_WEBGL] }, HTML_DO_FUNDO);
  assert.equal(achadas.length, 1);
  assert.equal(achadas[0]?.midiaId, 'md_1');
  // O tipo vem da mídia, não do comportamento: é o que a tela usa para dizer
  // "cena 3D" em vez de "midia".
  assert.equal(achadas[0]?.midiaKind, 'webgl');
  assert.ok((achadas[0]?.frase ?? '').length > 0);
  assert.equal(achadas[0]?.acompanhaRolagem, true);
});

test('fundo fixo que só PASSA por baixo da peça não vira âncora dela', () => {
  // O motor associa, e com razão: para desenhar aquela dobra o fundo conta.
  // Mas "esta peça tem mídia presa à rolagem" promete um arquivo para trocar, e
  // no hero não há nenhum. Este é o caso que estava errado no acervo real.
  assert.deepEqual(
    ancorasDoSegmento([WEBGL, FOTO], { scroll: [STICKY_DO_WEBGL] }, HTML_DO_HERO),
    [],
  );
});

test('segmento sem comportamento associado não herda a âncora do vizinho', () => {
  assert.deepEqual(ancorasDoSegmento([WEBGL, FOTO], { scroll: [] }, HTML_DO_FUNDO), []);
  assert.deepEqual(ancorasDoSegmento([WEBGL, FOTO], { scroll: undefined }, HTML_DO_FUNDO), []);
  assert.deepEqual(ancorasDoSegmento([WEBGL, FOTO], null, HTML_DO_FUNDO), []);
});

test('comportamento sem mídia correspondente não vira âncora', () => {
  // Um sticky de navbar é comportamento de verdade, mas não é mídia posicional:
  // não há arquivo para a pessoa trocar, e anunciar um seria ruído.
  const navbar = { ...STICKY_DO_WEBGL, target: { id: 'navbar', classes: ['sticky', 'top-0'] } };
  assert.deepEqual(ancorasDoSegmento([WEBGL, FOTO], { scroll: [navbar] }, HTML_DO_FUNDO), []);
});

test('captura sem mídia nenhuma não inventa âncora', () => {
  assert.deepEqual(ancorasDoSegmento([], { scroll: [STICKY_DO_WEBGL] }, HTML_DO_FUNDO), []);
});

test('midiaEstaNoHtml: id manda, quando existe', () => {
  assert.equal(midiaEstaNoHtml(WEBGL, HTML_DO_FUNDO), true);
  assert.equal(midiaEstaNoHtml(WEBGL, HTML_DO_HERO), false);
  // Id igual em atributo de outra natureza não conta como presença.
  assert.equal(midiaEstaNoHtml(WEBGL, '<div data-alvo="webgl-bg"></div>'), false);
});

test('midiaEstaNoHtml: sem id, as classes têm de estar TODAS no mesmo elemento', () => {
  assert.equal(midiaEstaNoHtml(FOTO, '<img class="w-full object-cover rounded" />'), true);
  // Espalhadas por dois elementos não são o mesmo elemento — casar por pouco é
  // exatamente o que produz âncora inventada.
  assert.equal(
    midiaEstaNoHtml(FOTO, '<div class="w-full"><img class="object-cover" /></div>'),
    false,
  );
});

test('midiaEstaNoHtml: sem id e sem classe não dá para afirmar nada', () => {
  const anonima: MidiaParaAncora = { id: 'md_9', kind: 'video', fingerprint: null };
  assert.equal(midiaEstaNoHtml(anonima, '<video src="a.mp4"></video>'), false);
});
