import assert from 'node:assert/strict';
import { test } from 'node:test';
import { soltarAncestraisAusentes } from './ancestral-ausente.js';

const solta = (css: string, ids: string[] = []) => soltarAncestraisAusentes(css, new Set(ids));

test('o id que o recorte deixou para trás é solto, e a regra volta a valer', () => {
  // Medido: a peça saiu de dentro de `#platform`, e o override de celular que a
  // origem escreveu preso a ele parou de casar. No site, a seção saía 72px fora
  // da tela no 390.
  const r = solta('#platform .split-section{grid-template-columns:1fr}');
  assert.match(r.css, /^\.split-section\{/);
  assert.equal(r.relaxados, 1);
  assert.equal(r.descartados, 0);
});

test('id que EXISTE na página não é tocado — ele ainda qualifica alguma coisa', () => {
  const css = '#platform .split-section{color:red}';
  assert.equal(solta(css, ['platform']).css, css);
  assert.equal(solta(css, ['platform']).relaxados, 0);
});

test('sem âncora nenhuma, a regra é DESCARTADA em vez de solta', () => {
  // `#platform:hover` solto viraria `:hover`, que casa com a página inteira:
  // trocaria uma regra morta por uma que pinta o que não devia.
  const r = solta('#platform:hover{background:red}');
  assert.doesNotMatch(r.css, /:hover/);
  assert.equal(r.descartados, 1);
});

test('a lista de seletores perde só o que ficou sem âncora', () => {
  const r = solta('#sumiu:hover, .fica{color:red}');
  assert.match(r.css, /^\.fica\{/);
  assert.equal(r.descartados, 1);
});

test('dentro de @media também, que é onde moram os overrides de celular', () => {
  const r = solta('@media (max-width:980px){#platform .x{display:block}}');
  assert.match(r.css, /@media \(max-width:980px\)\{\.x\{/);
});

test('o escopo por origem sobrevive: só o id sai do seletor', () => {
  const r = solta(':where([data-ds-corpo="ds_a"]) #platform .card{color:red}');
  assert.match(r.css, /:where\(\[data-ds-corpo="ds_a"\]\) \.card\{/);
});

test('id colado numa classe deixa a classe de pé', () => {
  const r = solta('#sumiu.aviso{color:red}');
  assert.match(r.css, /^\.aviso\{/);
  assert.equal(r.descartados, 0);
});

test('CSS sem id nenhum não é reescrito', () => {
  const css = '.a{color:red}\n.b{color:blue}';
  const r = solta(css);
  assert.equal(r.relaxados, 0);
  assert.equal(r.descartados, 0);
});
