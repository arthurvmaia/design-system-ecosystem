import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ancorasDeMidia, explicarAncora } from './midia-posicional.js';

/**
 * A âncora é MEDIDA, nunca inventada. Casar por pouco produziria uma âncora
 * falsa, e âncora falsa é pior que âncora nenhuma: ela promete um enquadramento
 * que não existe.
 */

const midia = (id: string, fp: { id?: string; stableClasses?: string[] }) => ({
  id,
  kind: 'image',
  fingerprint: fp,
});

const comportamento = (over: Partial<Parameters<typeof ancorasDeMidia>[1][number]> = {}) => ({
  kind: 'parallax',
  start: 0.2,
  end: 0.6,
  scrub: true,
  pin: false,
  target: { id: 'hero-bg', classes: ['fixed', 'inset-0'] },
  ...over,
});

test('mídia e comportamento no mesmo id viram âncora', () => {
  const a = ancorasDeMidia([midia('md_1', { id: 'hero-bg' })], [comportamento()]);
  assert.equal(a.length, 1);
  assert.equal(a[0]?.efeito, 'parallax');
  assert.equal(a[0]?.de, 0.2);
  assert.equal(a[0]?.acompanhaRolagem, true);
});

test('as classes só casam quando TODAS batem', () => {
  // Duas divs com `fixed` em comum não são o mesmo elemento.
  const poucas = ancorasDeMidia(
    [midia('md_1', { stableClasses: ['fixed'] })],
    [comportamento({ target: { classes: ['fixed', 'inset-0', 'z-10'] } })],
  );
  assert.equal(poucas.length, 1, 'subconjunto da classe do alvo casa');

  const demais = ancorasDeMidia(
    [midia('md_1', { stableClasses: ['fixed', 'inset-0', 'outra'] })],
    [comportamento({ target: { classes: ['fixed', 'inset-0'] } })],
  );
  assert.equal(demais.length, 0, 'classe que o alvo não tem impede o casamento');
});

test('comportamento sem alvo não gera âncora', () => {
  // Sem saber de quem é o efeito, não se atribui — a mesma regra da conferência
  // de pixel.
  assert.equal(
    ancorasDeMidia([midia('md_1', { id: 'x' })], [comportamento({ target: null })]).length,
    0,
  );
});

test('mídia sem impressão digital não casa com nada', () => {
  assert.equal(ancorasDeMidia([{ id: 'md_1', kind: 'image' }], [comportamento()]).length, 0);
});

test('a frase diz a faixa e o tipo de movimento', () => {
  const [a] = ancorasDeMidia([midia('md_1', { id: 'hero-bg' })], [comportamento()]);
  const t = explicarAncora(a as NonNullable<typeof a>);
  assert.match(t, /20%/);
  assert.match(t, /60%/);
  assert.match(t, /quadro a quadro/);
});

test('efeito na página inteira não vira "entre 0% e 100%"', () => {
  const [a] = ancorasDeMidia(
    [midia('md_1', { id: 'hero-bg' })],
    [comportamento({ start: 0, end: 1, scrub: false, pin: true })],
  );
  assert.match(explicarAncora(a as NonNullable<typeof a>), /página inteira/);
});
