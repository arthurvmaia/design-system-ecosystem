import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import type { LinhaDeBase } from './fidelidade.js';
import {
  comparar,
  contarInstrumentacao,
  contarRegras,
  contarSeletoresMortos,
  cssDaOrigem,
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

test('o defeito é comparado em PROPORÇÃO: acervo maior não vira falso alarme', () => {
  // Numa medição real, "bundles com seletor morto" subiu de 95 para 122 e
  // parecia piora — o acervo tinha ido de 285 para 338. Contar cabeças mente
  // quando o denominador muda, e um medidor que dá o susto errado faz perder
  // tempo investigando uma piora que não existe.
  const linha = (n: number, total: number): LinhaDeBase => ({
    gravadoEm: 0,
    bundles: [],
    resumo: {
      total,
      retencaoMedia: 80,
      retencaoMinima: 80,
      retencaoMaxima: 80,
      comSeletorMorto: n,
      comInstrumentacao: 0,
      comScriptAusente: 0,
      comIconeVazio: 0,
    },
  });
  // 50 de 100 (50%) para 60 de 200 (30%): mais cabeças, menos proporção.
  const r = comparar(linha(50, 100), linha(60, 200));
  const morto = r.find((x) => x.linha.startsWith('Bundles com seletor morto'));
  assert.ok(morto !== undefined);
  assert.equal(morto.melhorou, true, 'a fração caiu: isso é melhora');
  assert.ok(morto.linha.includes('50%'));
  assert.ok(morto.linha.includes('30%'));
  assert.ok(morto.linha.includes('60 de 200'), 'a quantidade continua à vista, entre parênteses');
});

test('proporção que sobe continua sendo piora, mesmo com menos cabeças', () => {
  const linha = (n: number, total: number): LinhaDeBase => ({
    gravadoEm: 0,
    bundles: [],
    resumo: {
      total,
      retencaoMedia: null,
      retencaoMinima: null,
      retencaoMaxima: null,
      comSeletorMorto: 0,
      comInstrumentacao: 0,
      comScriptAusente: 0,
      comIconeVazio: n,
    },
  });
  // 20 de 200 (10%) para 15 de 50 (30%).
  const r = comparar(linha(20, 200), linha(15, 50));
  const icone = r.find((x) => x.linha.startsWith('Bundles com ícone vazio'));
  assert.equal(icone?.melhorou, false);
});

test('seletor que JÁ estava morto na origem não conta como perda nossa', () => {
  // Medido no acervo: os 8 bundles com "seletor morto" tinham todos a mesma
  // âncora, `body.flex.justify-center`, e o <body> do site de origem nunca teve
  // essas duas classes juntas. Era CSS que o próprio site carregava sem usar, e
  // nós levávamos a culpa por ele.
  const css = 'body.flex.justify-center .x{color:red}';
  const doBundle = '<html><body class="bg-preto"><div class="x"></div></body></html>';
  const daOrigem = '<html><body class="bg-preto"><div class="x"></div></body></html>';
  assert.equal(contarSeletoresMortos(css, doBundle), 1, 'sem a origem, conta');
  assert.equal(contarSeletoresMortos(css, doBundle, daOrigem), 0, 'com a origem, não conta');
});

test('o que estava VIVO na origem e morreu no bundle continua contando', () => {
  // Este é o defeito de verdade: o documento não viajou com o segmento.
  const css = 'html.dark .card{color:#fff}';
  const doBundle = '<html><body><div class="card"></div></body></html>';
  const daOrigem = '<html class="dark"><body><div class="card"></div></body></html>';
  assert.equal(contarSeletoresMortos(css, doBundle, daOrigem), 1);
});

test('vivo nos dois não conta em lugar nenhum', () => {
  const css = 'html.dark .card{color:#fff}';
  const doc = '<html class="dark"><body><div class="card"></div></body></html>';
  assert.equal(contarSeletoresMortos(css, doc, doc), 0);
});

test('cssDaOrigem ignora as cópias .orig.css: contá-las dobrava o denominador', () => {
  // Medido no acervo real: um site com 4 folhas + 4 cópias .orig.css saía com
  // retenção "50,0%" cravada em todos os 24 bundles (920 regras = 2 × 460).
  const dir = mkdtempSync(join(tmpdir(), 'fid-orig-'));
  mkdirSync(join(dir, 'css'), { recursive: true });
  writeFileSync(join(dir, 'css', 'a.css'), '.x{color:red}.y{color:blue}', 'utf8');
  writeFileSync(join(dir, 'css', 'a.orig.css'), '.x{color:red}.y{color:blue}', 'utf8');
  const origem = cssDaOrigem({ dirAssetsCaptura: dir });
  assert.equal(contarRegras(origem), 2, 'a cópia não pode contar de novo');
});

test('retenção nunca passa de 100: acima disso o número não mede nada', () => {
  // O compilador divide regras ao reescrever as folhas, então o bundle pode
  // contar MAIS regras que a origem. "106,5%" era aritmética, não fidelidade.
  const dir = mkdtempSync(join(tmpdir(), 'fid-teto-'));
  writeFileSync(
    join(dir, 'index.html'),
    '<html><head><link rel="stylesheet" href="b.css"></head><body></body></html>',
    'utf8',
  );
  writeFileSync(join(dir, 'b.css'), '.a{color:red}.b{color:blue}.c{color:green}', 'utf8');
  const captura = mkdtempSync(join(tmpdir(), 'fid-teto-origem-'));
  mkdirSync(join(captura, 'css'), { recursive: true });
  writeFileSync(join(captura, 'css', 'unica.css'), '.a{color:red}', 'utf8');
  const m = medirBundle(dir, { dirAssetsCaptura: captura });
  assert.ok(m !== null);
  assert.equal(m.regrasNaOrigem, 1);
  assert.equal(m.retencao, 100, 'três regras sobre uma seria 300; o teto segura em 100');
});
