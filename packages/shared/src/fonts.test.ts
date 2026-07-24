import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildTypographyCss,
  fallbackFor,
  findFont,
  fontStack,
  googleFontsCss2Url,
} from './fonts.js';

test('findFont: acha por família, tolera stack e caixa', () => {
  assert.equal(findFont('Inter')?.family, 'Inter');
  assert.equal(findFont('inter')?.family, 'Inter', 'case-insensitive');
  assert.equal(findFont('Inter, sans-serif')?.family, 'Inter', 'tolera stack antiga');
  assert.equal(findFont('Playfair Display')?.category, 'serif');
  assert.equal(findFont('Fonte Inexistente 123'), undefined);
});

test('fontStack: aspas em família com espaço + fallback da categoria', () => {
  assert.equal(fontStack('Inter'), 'Inter, Arial, Helvetica, sans-serif');
  assert.equal(
    fontStack('Playfair Display'),
    '"Playfair Display", Georgia, "Times New Roman", serif',
  );
  // Família desconhecida ainda gera uma pilha legível.
  assert.match(fontStack('Custom Font'), /"Custom Font", system-ui/);
});

test('googleFontsCss2Url: monta, codifica espaço como +, ordena/deduplica pesos', () => {
  const url = googleFontsCss2Url([{ family: 'Playfair Display', weights: [700, 400, 400] }]);
  assert.ok(url?.includes('family=Playfair+Display:wght@400;700'));
  assert.ok(url?.includes('display=swap'));
  assert.equal(googleFontsCss2Url([]), null, 'vazio → null');
});

test('buildTypographyCss: importa AMBAS as famílias e aplica aos elementos', () => {
  const { importUrl, css } = buildTypographyCss({ display: 'Playfair Display', body: 'Inter' });
  assert.ok(importUrl?.includes('family=Playfair+Display'));
  assert.ok(importUrl?.includes('family=Inter'));
  // Aplica a fonte de títulos nos headings e a de corpo no body (o bug antigo).
  assert.match(css, /h1,h2,h3,h4,h5,h6\{font-family:var\(--font-display\)\}/);
  assert.match(css, /body\{font-family:var\(--font-body\)\}/);
});

test('buildTypographyCss: só os pesos necessários que a família realmente tem', () => {
  const { importUrl } = buildTypographyCss({ display: 'Playfair Display', body: 'Inter' });
  // Título: 600;700 (Playfair tem). Corpo: 400;500;700 (Inter tem).
  assert.ok(importUrl?.includes('Playfair+Display:wght@600;700'));
  assert.ok(importUrl?.includes('Inter:wght@400;500;700'));
});

test('buildTypographyCss: fonte de peso único (Bebas Neue) não pede peso inexistente', () => {
  const { importUrl } = buildTypographyCss({ display: 'Bebas Neue', body: 'Inter' });
  // Bebas só tem 400 — não pode pedir 600/700 (derrubaria o css2).
  assert.ok(importUrl?.includes('Bebas+Neue:wght@400'));
  assert.ok(!importUrl?.includes('Bebas+Neue:wght@600'));
});

test('buildTypographyCss: mesma família em título e corpo vira uma importação só', () => {
  const { importUrl } = buildTypographyCss({ display: 'Inter', body: 'Inter' });
  const ocorrencias = (importUrl?.match(/family=Inter:/g) ?? []).length;
  assert.equal(ocorrencias, 1, 'Inter aparece uma vez, com pesos mesclados');
  assert.ok(importUrl?.includes('Inter:wght@400;500;600;700'));
});

test('buildTypographyCss: família fora do catálogo degrada sem quebrar', () => {
  const { css } = buildTypographyCss({ display: 'Fonte Custom', body: 'Outra Custom' });
  // Sem @import para famílias desconhecidas, mas as variáveis ainda saem legíveis.
  assert.match(css, /--font-display:"Fonte Custom"/);
  assert.match(css, /--font-body:"Outra Custom"/);
});

test('fallbackFor: cada categoria tem um fallback coerente', () => {
  assert.match(fallbackFor('serif'), /serif/);
  assert.match(fallbackFor('monospace'), /monospace/);
  assert.match(fallbackFor('handwriting'), /cursive/);
});
