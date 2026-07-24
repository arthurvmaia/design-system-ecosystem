import assert from 'node:assert/strict';
import { test } from 'node:test';
import { marcaSectionStatus } from './generator-sections.js';

test('marca sem nome → não iniciado; com nome → configurado com resumo', () => {
  assert.equal(marcaSectionStatus({}).marca.status, 'nao-iniciado');
  const comNome = marcaSectionStatus({ brandName: 'Alche' });
  assert.equal(comNome.marca.status, 'configurado');
  assert.equal(comNome.marca.resumo, 'Alche');
});

test('paleta com 3+ cores → configurado', () => {
  const s = marcaSectionStatus({ primary: '#c62828', background: '#fff', foreground: '#000' });
  assert.equal(s.paleta.status, 'configurado');
  assert.match(s.paleta.resumo, /cores/);
});

test('tipografia mostra as duas famílias no resumo', () => {
  const s = marcaSectionStatus({ fontDisplay: 'Playfair Display', fontBody: 'Inter' });
  assert.equal(s.tipografia.status, 'configurado');
  assert.equal(s.tipografia.resumo, 'Playfair Display + Inter');
});

test('redes é opcional quando vazio, configurado quando há canais', () => {
  assert.equal(marcaSectionStatus({}).redes.status, 'opcional');
  const s = marcaSectionStatus({ social: { instagram: 'https://x', linkedin: 'https://y' } });
  assert.equal(s.redes.status, 'configurado');
  assert.equal(s.redes.resumo, '2 canais');
});
