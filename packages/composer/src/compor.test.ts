import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type PecaComposta, compor, envolverEmProxies } from './compor.js';

const peca = (over: Partial<PecaComposta> = {}): PecaComposta => ({
  origem: 'ds_a',
  html: '<section class="hero">oi</section>',
  css: '.hero{color:red}',
  ...over,
});

// ── Os dois proxies ──────────────────────────────────────────────────────────

test('a peça sai dentro de DOIS proxies: raiz e corpo', () => {
  // Um proxy só não bastaria: `html.dark body .card` é seletor comuníssimo
  // (tema no html, tipografia no body) e não teria em que casar.
  const h = envolverEmProxies(peca());
  assert.ok(h.startsWith('<div data-ds-raiz="ds_a"'));
  assert.ok(h.includes('<div data-ds-corpo="ds_a"'));
  assert.ok(h.includes('<section class="hero">oi</section>'));
  assert.ok(h.endsWith('</div></div>'));
});

test('as classes do <html> e do <body> de origem viajam nos proxies', () => {
  // `bg-[#03020A] text-white` escrito no body da origem pinta o fundo da
  // página inteira. Sem isso, a peça vem sem fundo e ninguém sabe o que sumiu.
  const h = envolverEmProxies(
    peca({
      documentoAttrs: { html: 'lang="en" class="dark"', body: 'class="bg-black text-white"' },
    }),
  );
  assert.ok(h.includes('data-ds-raiz="ds_a" class="dark"'));
  assert.ok(h.includes('data-ds-corpo="ds_a" class="bg-black text-white"'));
});

test('atributo de tema também viaja; lang não se repete num div interno', () => {
  const h = envolverEmProxies(
    peca({ documentoAttrs: { html: 'lang="pt-BR" data-theme="escuro"' } }),
  );
  assert.ok(h.includes('data-theme="escuro"'));
  assert.ok(!h.includes('lang="pt-BR"'), 'repetir lang num div confunde leitor de tela');
});

// ── Composição de várias origens ─────────────────────────────────────────────

test('duas origens com a MESMA classe não colidem mais', () => {
  // O caso que motivou o pacote: dois sites com utilitários definem `.flex` e
  // `.p-6` cada um do seu jeito, e o segundo apagava o primeiro.
  const r = compor([
    peca({ origem: 'ds_a', css: '.p-6{padding:24px}' }),
    peca({ origem: 'ds_b', css: '.p-6{padding:1rem}' }),
  ]);
  assert.ok(r.css.includes(':where([data-ds-corpo="ds_a"]) .p-6'));
  assert.ok(r.css.includes(':where([data-ds-corpo="ds_b"]) .p-6'));
});

test('a mesma origem duas vezes escopa o CSS UMA vez', () => {
  // Duas peças do mesmo site têm CSS idêntico; duplicá-lo dobraria o arquivo
  // sem mudar um pixel.
  const r = compor([peca({ origem: 'ds_a' }), peca({ origem: 'ds_a', html: '<div>b</div>' })]);
  const ocorrencias = r.css.split('/* origem: ds_a */').length - 1;
  assert.equal(ocorrencias, 1);
  assert.equal(r.pecas.length, 2, 'mas as duas peças saem no HTML');
});

test('keyframes de nome igual em duas origens: a segunda é renomeada', () => {
  const r = compor([
    peca({ origem: 'ds_a', css: '@keyframes girar{to{opacity:1}}.x{animation:girar 1s}' }),
    peca({ origem: 'ds_b', css: '@keyframes girar{to{opacity:0}}.y{animation:girar 2s}' }),
  ]);
  assert.ok(r.css.includes('@keyframes girar{'), 'a primeira origem fica com o nome');
  assert.ok(r.css.includes('@keyframes girar--ds_b'));
  assert.ok(r.css.includes('animation:girar--ds_b 2s'));
  assert.equal(r.renomeados.length, 1);
  assert.equal(r.renomeados[0]?.origem, 'ds_b');
});

test('scripts externos são deduplicados por URL', () => {
  const r = compor([
    peca({ origem: 'ds_a', scripts: ['https://cdn/x.js', 'https://cdn/y.js'] }),
    peca({ origem: 'ds_b', scripts: ['https://cdn/x.js', 'https://cdn/z.js'] }),
  ]);
  assert.deepEqual(r.scripts, ['https://cdn/x.js', 'https://cdn/y.js', 'https://cdn/z.js']);
});

test('a ordem do CSS é a ordem das peças — para dar para depurar', () => {
  const r = compor([peca({ origem: 'ds_b' }), peca({ origem: 'ds_a' })]);
  assert.ok(r.css.indexOf('/* origem: ds_b */') < r.css.indexOf('/* origem: ds_a */'));
});

test('peça sem CSS não gera bloco vazio', () => {
  const r = compor([peca({ origem: 'ds_a', css: '   ' })]);
  assert.equal(r.css.trim(), '');
  assert.equal(r.pecas.length, 1);
});

test('lista vazia devolve composição vazia, sem quebrar', () => {
  const r = compor([]);
  assert.deepEqual(r.pecas, []);
  assert.deepEqual(r.scripts, []);
  assert.equal(r.css, '');
});

test('regra em classe que o PRÓPRIO proxy carrega casa com ele', () => {
  // O <body> de origem tinha class="bg-x", e envolverEmProxies copia essa
  // classe para o div do proxy. Só com o prefixo descendente, `.bg-x` virava
  // regra morta no elemento que carrega a classe — defeito medido no site
  // real: o rodapé escuro perdeu o text-white e o conserto foi escrito à mão
  // no marca.css. O CSS composto tem de trazer a variante que casa com o
  // próprio proxy.
  const r = compor([
    peca({
      origem: 'ds_a',
      css: '.bg-x{background:#000}',
      documentoAttrs: { body: 'class="bg-x"' },
    }),
  ]);
  assert.ok(
    r.css.includes(':where([data-ds-raiz="ds_a"], [data-ds-corpo="ds_a"]):is(.bg-x)'),
    `saiu: ${r.css}`,
  );
  // E o HTML de fato carrega a classe no proxy — as duas metades do conserto.
  assert.ok(r.pecas[0]?.includes('data-ds-corpo="ds_a" class="bg-x"'));
});

test('aspas no id da origem não escapam do atributo', () => {
  const h = envolverEmProxies(peca({ origem: 'ds_"x' }));
  assert.ok(h.includes('data-ds-raiz="ds_&quot;x"'));
});

test('compor com recoloração: a origem mapeada consome a marca, a outra fica original', () => {
  const mapa = new Map([['#0d3c1f', { papel: 'primary' as const, ajuste: null }]]);
  const r = compor(
    [
      { origem: 'ds_a', html: '<p class="t">A</p>', css: '.t{color:#0d3c1f}' },
      { origem: 'ds_b', html: '<p class="t">B</p>', css: '.t{color:#0d3c1f}' },
    ],
    { recoloracaoPorOrigem: new Map([['ds_a', mapa]]) },
  );
  assert.ok(r.css.includes('var(--marca-primary, #0d3c1f)'), 'ds_a recolorida');
  // A parte da ds_b mantém o literal puro.
  const parteB = r.css.slice(r.css.indexOf('origem: ds_b'));
  assert.ok(!parteB.includes('--marca-'), 'ds_b intocada');
  assert.ok(r.avisos.some((a) => a.includes('recoloração: 1')));
});

test('o tamanho da PÁGINA não viaja para dentro da peça', () => {
  // Medido num site gerado: o `<body>` da origem tinha `min-h-screen`, os
  // proxies copiaram a classe para cada peça, e a BARRA DE MENU saiu com 1000px
  // de altura — a primeira dobra ficou vazia, com o menu boiando num gradiente.
  // "A página ocupa ao menos a tela" não quer dizer "esta nav ocupa a tela".
  const html = envolverEmProxies({
    origem: 'ds_a',
    html: '<nav>menu</nav>',
    css: '',
    documentoAttrs: {
      html: 'class="h-full dark"',
      body: 'class="antialiased min-h-screen text-slate-100 bg-slate-900"',
    },
  });
  assert.ok(!html.includes('min-h-screen'), 'o min-h-screen do corpo não viaja');
  assert.ok(!html.includes('h-full'), 'nem o h-full do html');
  // O resto continua viajando: é dele que vem o tema, a tinta e a fonte.
  assert.ok(html.includes('antialiased'), 'as outras classes do corpo ficam');
  assert.ok(html.includes('text-slate-100'), 'a tinta fica');
  assert.ok(html.includes('dark'), 'o tema fica');
});

test('a rolagem do DOCUMENTO nao vira rolagem de um div no proxy', () => {
  // O dono fotografou duas barras de rolagem na mesma tela. No <body> da origem
  // `overflow-y:auto` e a rolagem da pagina; copiada para um div no meio de uma
  // pagina composta, vira uma segunda barra que sequestra a roda do mouse.
  // Medido: em 5 dos 20 sites de prova, e 23 blocos com rolagem aninhada.
  const html = envolverEmProxies({
    origem: 'ds_1',
    html: '<p>x</p>',
    css: '',
    documentoAttrs: {
      body: 'class="dark antialiased" style="overflow-y: auto !important; height: auto !important; color: red"',
    },
  });
  assert.ok(!/overflow/i.test(html), 'sem overflow no proxy');
  assert.ok(!/height/i.test(html), 'sem altura de documento no proxy');
  assert.ok(/color: red/.test(html), 'o resto do estilo continua viajando');
  assert.ok(/class="dark antialiased"/.test(html), 'o tema continua viajando');
});

test('classe que descreve o DOCUMENTO nao viaja para o proxy', () => {
  // Medido nos 20 sites do banco de prova, lendo o estilo computado de cada
  // proxy: overflow-y:auto em 168, position:fixed em 20, display:none em 12,
  // overflow-y:hidden em 8, altura travada em 6, position:absolute em 1.
  // Todas vinham de CLASSE do <body> da origem — inofensiva no documento,
  // destrutiva num div no meio da pagina.
  const html = envolverEmProxies({
    origem: 'ds_1',
    html: '<p>x</p>',
    css: '',
    documentoAttrs: {
      html: 'class="dark h-full overflow-hidden"',
      body: 'class="antialiased overflow-y-auto fixed hidden h-0 md:h-screen relative bg-teal-700 font-sans"',
    },
  });
  for (const some of [
    'overflow-y-auto',
    'overflow-hidden',
    '"fixed',
    ' fixed',
    'hidden',
    'h-0',
    'h-full',
    'h-screen',
  ]) {
    assert.ok(!html.includes(some), `${some} nao pode viajar`);
  }
  // O que e TEMA continua indo: e dele que a peca tira a cara que tinha.
  for (const fica of ['dark', 'antialiased', 'relative', 'bg-teal-700', 'font-sans']) {
    assert.ok(html.includes(fica), `${fica} tem de continuar viajando`);
  }
});
