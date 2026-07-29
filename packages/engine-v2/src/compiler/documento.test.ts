import assert from 'node:assert/strict';
import { test } from 'node:test';
import { limparInstrumentacao } from '../instrumentation/init-script.js';
import { atributosDoDocumento, scriptsExternosDoDocumento } from './documento.js';

/**
 * O documento que o recorte deixava para trás.
 *
 * Estes três — atributos de `<html>`/`<body>`, scripts externos e a marcação da
 * captura — eram perdas silenciosas: a prévia da Galeria montava o head da
 * página original por fora do bundle, então na tela ficava tudo certo e o
 * defeito só nascia no site entregue.
 */

test('os atributos de html e body são preservados como estão', () => {
  const html = `<!doctype html><html lang="en" class="dark scroll-smooth" data-theme="noite">
    <head></head><body class="bg-[#03020A] text-white overflow-x-hidden">oi</body></html>`;
  const a = atributosDoDocumento(html);
  assert.match(a.html ?? '', /class="dark scroll-smooth"/);
  assert.match(a.html ?? '', /data-theme="noite"/);
  assert.match(a.body ?? '', /bg-\[#03020A\]/, 'é a classe que pintava o fundo da página');
});

test('documento sem atributo nenhum não inventa atributo', () => {
  assert.deepEqual(atributosDoDocumento('<html><head></head><body>oi</body></html>'), {});
});

test('os scripts externos saem na ordem do documento, sem repetir', () => {
  const html = `<html><head>
    <script src="/cdn/tailwind.js"></script>
    <script type="application/ld+json">{"@type":"Org"}</script>
    </head><body>
    <script>const x = 1;</script>
    <script src="/js/lucide.js" defer></script>
    <script src="/cdn/tailwind.js"></script>
    </body></html>`;
  assert.deepEqual(scriptsExternosDoDocumento(html), ['/cdn/tailwind.js', '/js/lucide.js']);
});

test('script de DADO não conta como runtime', () => {
  // JSON-LD e importmap têm caminho próprio no bundle (inline no head). Tratá-los
  // como runtime os faria carregar duas vezes.
  const html = `<script type="application/ld+json" src="/nao.json"></script>
    <script type="importmap" src="/map.json"></script>`;
  assert.deepEqual(scriptsExternosDoDocumento(html), []);
});

test('script de módulo conta, porque é runtime de verdade', () => {
  assert.deepEqual(scriptsExternosDoDocumento('<script type="module" src="/app.js"></script>'), [
    '/app.js',
  ]);
});

test('a limpeza cobre o namespace inteiro da instrumentação', () => {
  // O `data-dsx-scroll` é escrito pelo amostrador de scroll e nunca apagado por
  // ele. Como o HTML das seções é lido DEPOIS, a marcação viajava para dentro
  // dos bundles e dali para o site entregue.
  const sujo =
    '<div data-dsx2="12" data-dsx-scroll="54" class="hero" data-dsx-pointer=3>' +
    "<span data-dsx2='7'>oi</span></div>";
  const limpo = limparInstrumentacao(sujo);
  assert.ok(!limpo.includes('data-dsx'), `sobrou instrumentação: ${limpo}`);
  assert.match(limpo, /class="hero"/, 'o que não é instrumentação fica intacto');
  assert.match(limpo, />oi</);
});

test('a limpeza não come atributo de nome parecido', () => {
  const html = '<div data-dsxavier="1" data-x="2">oi</div>';
  // `data-dsxavier` casa com `data-dsx[\w-]*` de propósito — é o namespace. O que
  // não pode acontecer é comer `data-x`, que não tem nada a ver.
  assert.match(limparInstrumentacao(html), /data-x="2"/);
});
