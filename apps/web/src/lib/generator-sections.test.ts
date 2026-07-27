import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LocalDeLogo,
  PresetDeCorpo,
  PresetDeTitulos,
  TOKENS_SEMANTICOS,
  TipoDeLogo,
} from '@ds/shared/schemas';
import { marcaSectionStatus } from './generator-sections.js';
import {
  ROTULO_EIXO,
  ROTULO_LOCAL_DE_LOGO,
  ROTULO_PRESET_CORPO,
  ROTULO_PRESET_TITULOS,
  ROTULO_TIPO_DE_LOGO,
  ROTULO_TOKEN,
} from './marca-rotulos.js';

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

// ── A5: vocabulários novos e campos ricos ────────────────────────────────────

test('todo vocabulário do shared tem rótulo pt-BR (id técnico nunca vaza na tela)', () => {
  for (const t of TipoDeLogo.options) assert.ok(ROTULO_TIPO_DE_LOGO[t], `tipo de logo: ${t}`);
  for (const l of LocalDeLogo.options) assert.ok(ROTULO_LOCAL_DE_LOGO[l], `local: ${l}`);
  for (const tk of TOKENS_SEMANTICOS) assert.ok(ROTULO_TOKEN[tk], `token: ${tk}`);
  for (const p of PresetDeTitulos.options) assert.ok(ROTULO_PRESET_TITULOS[p], `preset: ${p}`);
  for (const p of PresetDeCorpo.options) assert.ok(ROTULO_PRESET_CORPO[p], `preset corpo: ${p}`);
  for (const eixo of [
    'formalidade',
    'energia',
    'proximidade',
    'objetividade',
    'sofisticacao',
    'nivelTecnico',
  ] as const) {
    assert.ok(ROTULO_EIXO[eixo], `eixo: ${eixo}`);
  }
});

test('status da Marca: campos novos enriquecem o resumo e vencem o legado', () => {
  const s = marcaSectionStatus({
    brandName: 'Acme',
    logos: [{ tipo: 'principal' }, { tipo: 'clara' }],
    identidadeVerbal: { tons: ['direto'], arquetipos: ['sabio'] },
    paleta: { cores: [{}, {}, {}, {}, {}] },
    social: { instagram: 'https://instagram.com/acme' },
    sociais: [
      { url: 'https://instagram.com/acme', visivel: true },
      { url: 'https://x.com/acme', visivel: false },
      { url: '', visivel: true },
    ],
  });
  assert.equal(s.marca.resumo, 'Acme · 2 logos');
  assert.equal(s.voz.status, 'configurado');
  assert.equal(s.voz.resumo, 'Direto · Sábio');
  assert.equal(s.paleta.resumo, '5 cores definidas');
  assert.equal(s.redes.resumo, '1 canal', 'oculta e vazia não contam');
});

test('status da voz: observação sozinha (tom legado migrado) já configura', () => {
  const s = marcaSectionStatus({
    identidadeVerbal: { tons: [], arquetipos: [], observacao: 'direto e confiante' },
  });
  assert.equal(s.voz.status, 'configurado');
  assert.equal(s.voz.resumo, 'direto e confiante');
});
