import assert from 'node:assert/strict';
import { test } from 'node:test';
import { criarSecaoNoEstilo } from './secoes-no-estilo.js';

const ctx = (over: Partial<Parameters<typeof criarSecaoNoEstilo>[0]> = {}) => ({
  papel: 'about',
  nome: 'Sobre nós',
  instrucao: 'Quem somos\nFazemos pão de fermentação natural desde 2011.',
  marca: { nome: 'Padaria Aurora', chamada: 'Peça o seu', email: 'oi@aurora.com.br' },
  duracaoMs: 300,
  easing: 'ease-out',
  ...over,
});

test('depoimento NAO e inventado: a secao e recusada com o motivo', () => {
  const r = criarSecaoNoEstilo(ctx({ papel: 'testimonials', nome: 'O que dizem' }));
  assert.ok(r.recusa, 'tem de recusar');
  assert.ok(r.recusa?.includes('fala de uma pessoa real'));
  assert.equal(r.html, undefined);
});

test('numeros e logos de cliente tambem sao recusados', () => {
  for (const papel of ['stats', 'logos', 'logo-cloud']) {
    const r = criarSecaoNoEstilo(ctx({ papel, nome: papel }));
    assert.ok(r.recusa, `${papel} tem de ser recusado`);
  }
});

test('com o texto do usuario, a secao nasce com titulo e paragrafo', () => {
  const r = criarSecaoNoEstilo(ctx());
  assert.ok(r.html?.includes('<h2 class="ds-criada-titulo">Quem somos</h2>'));
  assert.ok(r.html?.includes('fermentação natural desde 2011'));
  assert.equal(r.recusa, undefined);
});

test('primeira linha longa NAO vira titulo: h2 gigante desmonta a hierarquia', () => {
  const longa = `${'a'.repeat(90)}\nsegunda linha`;
  const r = criarSecaoNoEstilo(ctx({ instrucao: longa }));
  assert.ok(!r.html?.includes('<h2'), 'linha de 90 caracteres fica como paragrafo');
});

test('linha unica terminada em ponto e paragrafo, nao titulo', () => {
  const r = criarSecaoNoEstilo(ctx({ instrucao: 'Somos uma padaria de bairro.' }));
  assert.ok(!r.html?.includes('<h2'));
  assert.ok(r.html?.includes('Somos uma padaria de bairro.'));
});

test('secao de contato nasce da marca mesmo sem texto: a chamada e o e-mail sao dele', () => {
  const r = criarSecaoNoEstilo(ctx({ papel: 'contact', nome: 'Fale conosco', instrucao: '' }));
  assert.ok(r.html?.includes('ds-criada-cta'));
  assert.ok(r.html?.includes('Peça o seu'));
  assert.ok(r.html?.includes('mailto:oi@aurora.com.br'));
  assert.ok(r.html?.includes('<h2 class="ds-criada-titulo">Fale conosco</h2>'));
});

test('sem texto e sem ser contato, recusa em vez de entregar casca', () => {
  const r = criarSecaoNoEstilo(ctx({ papel: 'features', nome: 'Benefícios', instrucao: '' }));
  assert.ok(r.recusa?.includes('nem texto seu'));
});

test('contato sem material nenhum tambem recusa', () => {
  const r = criarSecaoNoEstilo(
    ctx({ papel: 'contact', nome: 'Contato', instrucao: '', marca: {} }),
  );
  assert.ok(r.recusa);
});

test('o texto do usuario e ESCAPADO: & e < nao viram marcacao', () => {
  const r = criarSecaoNoEstilo(ctx({ instrucao: 'Silva & Filhos\n<script>alert(1)</script>' }));
  assert.ok(r.html?.includes('Silva &amp; Filhos'));
  assert.ok(!r.html?.includes('<script>'), 'nada de tag vinda de campo livre');
  assert.ok(r.html?.includes('&lt;script&gt;'));
});

test('o CSS so usa token da marca, nunca hex solto', () => {
  const r = criarSecaoNoEstilo(ctx());
  assert.ok(r.css?.includes('var(--marca-primary'));
  assert.ok(r.css?.includes('var(--marca-heading'));
  const hexForaDeFallback = (r.css ?? '').replace(/var\([^)]*\)/g, '').match(/#[0-9a-f]{3,6}\b/gi);
  assert.equal(hexForaDeFallback, null, 'hex só pode existir como fallback dentro de var()');
});

test('o wrapper NAO declara background: o fundo e da pagina', () => {
  const r = criarSecaoNoEstilo(ctx());
  const regraDoWrapper = /\.ds-criada\{([^}]*)\}/.exec(r.css ?? '')?.[1] ?? '';
  assert.ok(!/background/.test(regraDoWrapper));
});

test('o ritmo medido do kit chega ao CSS', () => {
  const r = criarSecaoNoEstilo(ctx({ duracaoMs: 420, easing: 'cubic-bezier(.2,0,0,1)' }));
  assert.ok(r.css?.includes('420ms cubic-bezier(.2,0,0,1)'));
});

test('alvo de toque de 44px vale para o CTA criado', () => {
  const r = criarSecaoNoEstilo(ctx({ papel: 'cta', nome: 'Chamada' }));
  assert.ok(r.css?.includes('min-height:44px'));
});

test('modo prototipo: depoimento nasce com placeholder VISIVEL, entre colchetes', () => {
  const r = criarSecaoNoEstilo(
    ctx({ papel: 'testimonials', nome: 'O que dizem', modo: 'prototipo' }),
  );
  assert.equal(r.recusa, undefined, 'em prototipo a secao nasce');
  assert.ok(r.html?.includes('[depoimento 1'), 'o texto e visivelmente placeholder');
  assert.ok(r.html?.includes('[nome do cliente]'));
  assert.ok(r.html?.includes('data-ds-placeholder'), 'a secao se declara no proprio HTML');
});

test('o placeholder nao inventa nome nem empresa plausivel', () => {
  const r = criarSecaoNoEstilo(ctx({ papel: 'testimonials', modo: 'prototipo' }));
  // Fora do titulo (que e do usuario), TODO texto visivel esta entre colchetes:
  // nada pode ser lido como afirmacao real se a previa for compartilhada.
  const semTitulo = (r.html ?? '').replace(/<h2[^>]*>[\s\S]*?<\/h2>/, '');
  const textos = [...semTitulo.matchAll(/>([^<>]+)</g)]
    .map((m) => m[1]?.trim() ?? '')
    .filter((t) => t !== '');
  assert.ok(textos.length >= 6, 'tres cartoes, cada um com fala e autoria');
  for (const t of textos) {
    assert.ok(t.startsWith('['), `"${t}" tem de ser placeholder marcado`);
  }
});

test('numeros e logos tambem nascem em prototipo, e continuam marcados', () => {
  const nums = criarSecaoNoEstilo(ctx({ papel: 'stats', nome: 'Números', modo: 'prototipo' }));
  assert.ok(nums.html?.includes('[00]'));
  assert.ok(nums.html?.includes('[o que o número 1 mede]'));
  const logos = criarSecaoNoEstilo(ctx({ papel: 'logos', nome: 'Parceiros', modo: 'prototipo' }));
  assert.ok(logos.html?.includes('[logo 1]'));
  assert.ok(logos.html?.includes('aria-label="Espaço para logo 1"'));
});

test('modo ENTREGA (o padrao) continua recusando: o erro ali custa caro', () => {
  assert.ok(criarSecaoNoEstilo(ctx({ papel: 'testimonials' })).recusa);
  assert.ok(criarSecaoNoEstilo(ctx({ papel: 'stats', modo: 'entrega' })).recusa);
});

test('o cartao de prototipo usa fundo com ALFA: a pagina segue uma superficie', () => {
  const r = criarSecaoNoEstilo(ctx({ papel: 'testimonials', modo: 'prototipo' }));
  assert.ok(r.css?.includes('color-mix(in srgb,var(--marca-surface'));
  assert.ok(r.css?.includes('transparent)'));
});

test('a grade do prototipo desce para uma coluna sozinha no celular', () => {
  const r = criarSecaoNoEstilo(ctx({ papel: 'stats', modo: 'prototipo' }));
  assert.ok(r.css?.includes('auto-fit,minmax(16rem,1fr)'));
});
