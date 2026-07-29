import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  contarInstrumentacao,
  contarRegras,
  contarSeletoresMortos,
  medirBundle,
  medirIcones,
  medirScripts,
  resumir,
} from './fidelidade.js';

test('contarRegras não conta o @media como regra, só o que está dentro', () => {
  const css = '.a{color:red}@media (min-width:100px){.b{color:blue}.c{color:green}}';
  // .a, .b, .c = 3 regras. O @media abre bloco e não conta.
  assert.equal(contarRegras(css), 3);
});

test('contarRegras ignora chave dentro de comentário', () => {
  assert.equal(contarRegras('/* .fake { } */ .real{color:red}'), 1);
});

test('seletor ancorado em classe que o documento não tem conta como morto', () => {
  const css = 'html.dark .card{color:#fff} body.tema-a .x{color:#000} .livre{color:red}';
  const html = '<html lang="pt"><body><div class="card"></div></body></html>';
  // As duas âncoras (html.dark, body.tema-a) estão mortas; .livre não é âncora.
  assert.equal(contarSeletoresMortos(css, html), 2);
});

test('a mesma âncora, com a classe presente, está viva', () => {
  const css = 'html.dark .card{color:#fff}';
  const html = '<html class="dark"><body><div class="card"></div></body></html>';
  assert.equal(contarSeletoresMortos(css, html), 0);
});

test('atributo de documento também conta: html[data-theme] sem o atributo é morto', () => {
  const css = 'html[data-theme] .x{color:red}';
  assert.equal(contarSeletoresMortos(css, '<html><body></body></html>'), 1);
  assert.equal(contarSeletoresMortos(css, '<html data-theme="a"><body></body></html>'), 0);
});

test('instrumentação vazada é contada com e sem valor', () => {
  const html = '<div data-dsx-ref="4" data-dsx-hash="ab"><span data-dsxlayer></span></div>';
  assert.equal(contarInstrumentacao(html), 3);
});

test('ícone sem SVG dentro conta como vazio; com SVG inline conta como desenhado', () => {
  const vazio = '<iconify-icon icon="solar:database-linear"></iconify-icon>';
  assert.deepEqual(medirIcones(vazio), { inline: 0, vazios: 1 });

  const desenhado = '<span data-ds-icone="inline"><svg viewBox="0 0 24 24"></svg></span>';
  assert.deepEqual(medirIcones(desenhado), { inline: 1, vazios: 0 });
});

test('o motor que declarou a falha é contado como vazio, não escondido', () => {
  const html = '<span data-ds-icone="nao-desenhado" data-ds-icone-origem="mdi:home"></span>';
  assert.equal(medirIcones(html).vazios, 1);
});

test('script local ausente é separado do remoto', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'fid-'));
  mkdirSync(join(dir, 'assets'), { recursive: true });
  writeFileSync(join(dir, 'assets', 'existe.js'), '//', 'utf8');
  const html = [
    '<script src="assets/existe.js"></script>',
    '<script src="assets/sumiu.js"></script>',
    '<script src="https://cdn.tailwindcss.com"></script>',
  ].join('');
  assert.deepEqual(medirScripts(html, dir), { declarados: 2, ausentes: 1, remotos: 1 });
  t.diagnostic(`medido em ${dir}`);
});

test('medirBundle devolve null quando não há index.html', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fid-vazio-'));
  assert.equal(medirBundle(dir), null);
});

test('sem origem para comparar, a retenção fica nula em vez de inventada', () => {
  const dir = mkdtempSync(join(tmpdir(), 'fid-semorigem-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<html><head><link rel="stylesheet" href="a.css"></head><body></body></html>',
    'utf8',
  );
  writeFileSync(join(dir, 'a.css'), '.x{color:red}', 'utf8');
  const m = medirBundle(dir);
  assert.ok(m !== null);
  assert.equal(m.regras, 1);
  assert.equal(m.retencao, null);
  assert.equal(m.regrasNaOrigem, null);
});

test('o resumo separa quem tem defeito de quem não tem', () => {
  const base = {
    dir: '',
    nome: '',
    regras: 10,
    regrasNaOrigem: 20,
    retencao: 50,
    seletoresMortos: 0,
    instrumentacaoVazada: 0,
    scriptsDeclarados: 0,
    scriptsAusentes: 0,
    scriptsRemotos: 0,
    iconesVazios: 0,
    iconesInline: 0,
  };
  const r = resumir([
    { ...base, nome: 'a' },
    { ...base, nome: 'b', retencao: 90, seletoresMortos: 3, iconesVazios: 2 },
  ]);
  assert.equal(r.resumo.total, 2);
  assert.equal(r.resumo.retencaoMedia, 70);
  assert.equal(r.resumo.retencaoMinima, 50);
  assert.equal(r.resumo.retencaoMaxima, 90);
  assert.equal(r.resumo.comSeletorMorto, 1);
  assert.equal(r.resumo.comIconeVazio, 1);
  assert.equal(r.resumo.comInstrumentacao, 0);
});
