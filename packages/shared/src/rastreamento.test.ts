import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { rastreamentoDeTerceiro, rastreamentoDoBundle } from './rastreamento.js';

/**
 * Esta régua decidia se um site entregue leva o analytics de OUTRA empresa, e
 * até agora não tinha teste nenhum — vivia privada dentro do montador de página.
 * Os quatro ramos abaixo são os quatro caminhos que ela sabe responder.
 */

const SNIPPET = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','G-ABCD1234');`;

test('o snippet de inicialização, sozinho, é PURO: sai inteiro e nada se perde', () => {
  assert.equal(rastreamentoDeTerceiro(SNIPPET), 'puro');
  assert.ok(SNIPPET.length < 400, 'o caso real cabe em poucas centenas de bytes');
});

test('o MESMO snippet dentro de um arquivo grande com listeners é MISTURADO', () => {
  // 20 KB de carrossel de verdade em volta: tirar o arquivo levaria o
  // comportamento embora, e é exatamente por isso que a peça não serve a um kit.
  const carrossel = `document.addEventListener('click',function(e){slide(e)});${'/* slide */'.repeat(2000)}`;
  assert.equal(rastreamentoDeTerceiro(`${SNIPPET}\n${carrossel}`), 'misturado');
});

test('carregar o fornecedor pelo endereço é PURO — o script é o vendedor', () => {
  const grande = `var s=document.createElement('script');s.src='https://www.googletagmanager.com/gtag/js?id=G-ABCD1234';document.addEventListener('load',function(){});${'x'.repeat(9000)}`;
  assert.equal(rastreamentoDeTerceiro(grande), 'puro');
});

test('script de carrossel sem marca nenhuma não é rastreamento', () => {
  assert.equal(
    rastreamentoDeTerceiro("document.addEventListener('click',function(){next()});"),
    null,
  );
});

// ── O bundle em disco ───────────────────────────────────────────────────────

const bundle = (arquivos: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), 'rastreio-'));
  for (const [rel, conteudo] of Object.entries(arquivos)) {
    const alvo = join(dir, ...rel.split('/'));
    mkdirSync(join(alvo, '..'), { recursive: true });
    writeFileSync(alvo, conteudo, 'utf8');
  }
  return dir;
};

test('o pior estado vence: um arquivo misturado condena o bundle inteiro', () => {
  const dir = bundle({
    'index.html': '<html><body><div>oi</div></body></html>',
    'assets/js/a.js': SNIPPET,
    'assets/js/b.js': `${SNIPPET}\ndocument.addEventListener('scroll',function(){});${'y'.repeat(9000)}`,
  });
  const r = rastreamentoDoBundle(dir);
  assert.equal(r.estado, 'misturado');
  assert.deepEqual(r.arquivos, ['assets/js/b.js'], 'o motivo sabe nomear o arquivo');
});

test('o `<script>` INLINE do index.html também é lido', () => {
  const dir = bundle({ 'index.html': `<html><body><script>${SNIPPET}</script></body></html>` });
  assert.equal(rastreamentoDoBundle(dir).estado, 'puro');
});

test('um `<script src>` do fornecedor conta pelo ENDEREÇO, mesmo sem corpo', () => {
  // Sem esta leitura, o bundle que só carrega a `gtag.js` sairia "sem rastreio".
  const dir = bundle({
    'index.html':
      '<html><head><script src="https://www.googletagmanager.com/gtag/js?id=G-ABCD1234"></script></head><body></body></html>',
  });
  assert.equal(rastreamentoDoBundle(dir).estado, 'puro');
});

test('bundle sem rastreio nenhum responde null, não "puro por precaução"', () => {
  const dir = bundle({
    'index.html': '<html><body></body></html>',
    'assets/js/carrossel.js': "document.addEventListener('click',function(){next()});",
  });
  assert.deepEqual(rastreamentoDoBundle(dir), { estado: null, arquivos: [] });
});

test('diretório que não existe não acusa a peça', () => {
  assert.equal(rastreamentoDoBundle(join(tmpdir(), 'nao-existe-mesmo-123')).estado, null);
});
