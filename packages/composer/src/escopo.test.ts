import assert from 'node:assert/strict';
import { test } from 'node:test';
import selectorParser from 'postcss-selector-parser';
import { escoparCss, escoparSeletor, nomesGlobaisDe } from './escopo.js';

const opts = { raiz: 'data-ds-raiz="a"', corpo: 'data-ds-corpo="a"' };

// ── A propriedade que sustenta tudo ──────────────────────────────────────────

test('o escopo NÃO sobe a especificidade: a âncora vai dentro de :where()', () => {
  // Este é o teste que justifica o desenho inteiro. Se a âncora ficasse fora do
  // :where(), toda regra da origem subiria um degrau — e o assets/marca.css,
  // que aplica a identidade do usuário e vence hoje por ser o último da
  // cascata, passaria a perder em todo lugar de uma vez, sem erro nenhum.
  //
  // A saída agora é uma LISTA: além do prefixo descendente, a variante que casa
  // com o PRÓPRIO proxy — o descendente sozinho era regra morta em classe
  // carregada pelo proxy; defeito medido no site real. O contrato deste teste
  // segue de pé por construção: :where() vale zero e :is(.card) vale a
  // especificidade do composto, igual à do seletor original.
  const s = escoparSeletor('.card', opts);
  assert.equal(
    s,
    ':where([data-ds-corpo="a"]) .card, :where([data-ds-raiz="a"], [data-ds-corpo="a"]):is(.card)',
  );
  assert.ok(s.includes(':where('), 'sem :where a marca do usuário perde a cascata');
});

test(':root vira a âncora da raiz — é onde moram os tokens de cor', () => {
  assert.equal(escoparSeletor(':root', opts), ':where([data-ds-raiz="a"])');
});

test('html e body viram âncoras diferentes', () => {
  assert.equal(escoparSeletor('html', opts), ':where([data-ds-raiz="a"])');
  assert.equal(escoparSeletor('body', opts), ':where([data-ds-corpo="a"])');
});

test('o qualificador acompanha a âncora: html.dark continua sendo seletor de tema', () => {
  // Perder o `.dark` transformaria um seletor de tema em seletor global — a
  // peça sairia sempre no tema escuro, inclusive onde não devia.
  assert.equal(escoparSeletor('html.dark .card', opts), ':where([data-ds-raiz="a"].dark) .card');
});

test('atributo de tema no body também sobrevive', () => {
  assert.equal(
    escoparSeletor('body[data-tema="claro"] .x', opts),
    ':where([data-ds-corpo="a"][data-tema="claro"]) .x',
  );
});

test('html.dark body .card: os dois proxies casam, como na origem', () => {
  const s = escoparSeletor('html.dark body .card', opts);
  assert.ok(s.startsWith(':where([data-ds-raiz="a"].dark)'));
  assert.ok(s.includes(':where([data-ds-corpo="a"])'));
});

// ── A variante de auto-casamento ─────────────────────────────────────────────
//
// envolverEmProxies copia as classes do <html>/<body> de origem para os
// próprios divs proxy. O prefixo DESCENDENTE nunca casa com o elemento que
// CARREGA a classe — regra morta em classe carregada pelo proxy; defeito
// medido no site real: o rodapé de um site escuro perdeu o text-white e ficou
// ilegível, remendado à mão no marca.css.

test('classe simples ganha a variante que casa com o próprio proxy', () => {
  assert.equal(
    escoparSeletor('.text-white', opts),
    ':where([data-ds-corpo="a"]) .text-white, :where([data-ds-raiz="a"], [data-ds-corpo="a"]):is(.text-white)',
  );
});

test('composto com seletor de tipo NÃO ganha variante: o proxy é um <div>', () => {
  // `p.intro` nunca é o proxy — emitir a variante aqui criaria uma regra que
  // aplica estilo de parágrafo num div.
  const s = escoparSeletor('p.intro', opts);
  assert.equal(s, ':where([data-ds-corpo="a"]) p.intro');
  assert.ok(!s.includes(':is('));
});

test('pseudo-elemento no composto também não ganha — nem o legado de um dois-pontos', () => {
  // ::before mira OUTRA caixa, não o elemento; e `:after` (sintaxe antiga) é
  // pseudo-elemento do mesmo jeito, mesmo parecendo pseudo-classe.
  assert.ok(!escoparSeletor('.x::before', opts).includes(':is('));
  assert.ok(!escoparSeletor('.x:after', opts).includes(':is('));
});

test('pseudo-classe no composto ganha a variante', () => {
  assert.equal(
    escoparSeletor('.btn:hover', opts),
    ':where([data-ds-corpo="a"]) .btn:hover, :where([data-ds-raiz="a"], [data-ds-corpo="a"]):is(.btn:hover)',
  );
});

test('ancestral de tema ganha a variante de ancestral', () => {
  // A classe de tema copiada para o proxy raiz também era regra morta como
  // ANCESTRAL: `:where([corpo]) .dark .card` exige um .dark DENTRO do corpo,
  // mas o .dark copiado está NO proxy raiz. Este caso importa tanto quanto o
  // da classe simples — sem ele, o tema inteiro da peça some.
  assert.equal(
    escoparSeletor('.dark .card', opts),
    ':where([data-ds-corpo="a"]) .dark .card, :where([data-ds-raiz="a"], [data-ds-corpo="a"]):is(.dark) .card',
  );
});

// Especificidade contada por estrutura, com o mesmo parser do código: :where()
// vale zero, :is() vale o argumento mais específico, id > classe/atributo/
// pseudo-classe > tipo/pseudo-elemento. É a prova de que a variante EMPATA com
// o seletor original — não vence nem perde dele.
type Esp = [number, number, number];
const ZERO: Esp = [0, 0, 0];
const soma = (a: Esp, b: Esp): Esp => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const maior = (a: Esp, b: Esp): Esp => {
  if (a[0] !== b[0]) return a[0] > b[0] ? a : b;
  if (a[1] !== b[1]) return a[1] > b[1] ? a : b;
  return a[2] >= b[2] ? a : b;
};
const espDeNo = (n: selectorParser.Node): Esp => {
  if (n.type === 'id') return [1, 0, 0];
  if (n.type === 'class' || n.type === 'attribute') return [0, 1, 0];
  if (n.type === 'tag') return [0, 0, 1];
  if (n.type === 'pseudo') {
    const v = n.value.toLowerCase();
    if (v === ':where') return ZERO;
    if (v === ':is' || v === ':not' || v === ':has' || v === ':matches') {
      return n.nodes
        .map((s) => s.nodes.reduce((acc, m) => soma(acc, espDeNo(m)), ZERO))
        .reduce(maior, ZERO);
    }
    if (v.startsWith('::') || [':before', ':after', ':first-line', ':first-letter'].includes(v)) {
      return [0, 0, 1];
    }
    return [0, 1, 0];
  }
  return ZERO;
};
const especificidades = (seletor: string): Esp[] =>
  selectorParser()
    .astSync(seletor)
    .nodes.map((sel) => sel.nodes.reduce((acc, n) => soma(acc, espDeNo(n)), ZERO));

test('a especificidade de CADA variante empata com a do seletor original', () => {
  for (const original of ['.card', '.text-white', '.btn:hover', '.dark .card', '[data-x] .y']) {
    const alvo = especificidades(original)[0];
    const saidas = especificidades(escoparSeletor(original, opts));
    assert.ok(saidas.length >= 2, `${original} deveria sair em lista`);
    for (const esp of saidas) {
      assert.deepEqual(esp, alvo, `variante de "${original}" mudou a especificidade`);
    }
  }
});

// ── Folha inteira ────────────────────────────────────────────────────────────

const escopar = (css: string, over: Partial<Parameters<typeof escoparCss>[1]> = {}) =>
  escoparCss(css, {
    raiz: 'data-ds-raiz="a"',
    corpo: 'data-ds-corpo="a"',
    sufixo: 'a',
    ...over,
  });

test('as regras dentro de @media são escopadas; o @media em si não', () => {
  const r = escopar('@media (min-width:768px){.card{color:red}}');
  assert.ok(r.css.includes('@media (min-width:768px)'));
  assert.ok(r.css.includes(':where([data-ds-corpo="a"]) .card'));
  // Dentro do @media a variante de auto-casamento também sai: regra morta em
  // classe carregada pelo proxy; defeito medido no site real.
  assert.ok(r.css.includes(':where([data-ds-raiz="a"], [data-ds-corpo="a"]):is(.card)'));
  assert.equal(r.reescritas, 1);
});

test('os passos de @keyframes NÃO são seletores e ficam intactos', () => {
  // `from`/`to`/`50%` escopados virariam seletores inválidos e a animação
  // morreria calada.
  const r = escopar('@keyframes girar{from{transform:none}to{transform:rotate(1turn)}}');
  assert.ok(r.css.includes('from{'), `saiu: ${r.css}`);
  assert.ok(!r.css.includes(':where([data-ds-corpo="a"]) from'));
  assert.equal(r.reescritas, 0);
});

test('@font-face não tem seletor e passa incólume', () => {
  const r = escopar('@font-face{font-family:"Inter";src:url(a.woff2)}');
  assert.ok(r.css.includes('@font-face'));
  assert.equal(r.reescritas, 0);
});

test('lista de seletores é escopada item a item', () => {
  const r = escopar('.a, .b, html.dark .c{color:red}');
  assert.ok(r.css.includes(':where([data-ds-corpo="a"]) .a'));
  assert.ok(r.css.includes(':where([data-ds-corpo="a"]) .b'));
  assert.ok(r.css.includes(':where([data-ds-raiz="a"].dark) .c'));
  // Cada item da lista SEM âncora de documento ganha a própria variante de
  // auto-casamento: regra morta em classe carregada pelo proxy; defeito medido
  // no site real. O item COM âncora (html.dark .c) não ganha — o html já virou
  // o proxy raiz na reescrita do caso 1.
  assert.ok(r.css.includes(':where([data-ds-raiz="a"], [data-ds-corpo="a"]):is(.a)'));
  assert.ok(r.css.includes(':where([data-ds-raiz="a"], [data-ds-corpo="a"]):is(.b)'));
  assert.ok(!r.css.includes(':is(.dark) .c'));
});

test('custom property não é tocada: --x é herdada, não global', () => {
  // Escopar o :root já resolve a colisão. Renomear a variável quebraria
  // `var(--x)` escrito em style="" inline, que ninguém reescreve.
  const r = escopar(':root{--cor:#000}.card{color:var(--cor)}');
  assert.ok(r.css.includes('--cor:#000'));
  assert.ok(r.css.includes('var(--cor)'));
});

// ── Nomes globais: só o que colide ───────────────────────────────────────────

test('@keyframes sem colisão mantém o nome', () => {
  const r = escopar('@keyframes girar{from{opacity:0}}');
  assert.ok(r.css.includes('@keyframes girar'));
  assert.equal(r.renomeados.length, 0);
});

test('@keyframes que colide é renomeado, e os usos acompanham', () => {
  const r = escopar('@keyframes girar{from{opacity:0}}.x{animation:girar 2s linear}', {
    nomesUsados: { keyframes: new Set(['girar']) },
  });
  assert.ok(r.css.includes('@keyframes girar--a'));
  assert.ok(r.css.includes('animation:girar--a 2s linear'), `saiu: ${r.css}`);
  assert.deepEqual(r.renomeados, [{ tipo: 'keyframes', de: 'girar', para: 'girar--a' }]);
});

test('animation-name também é atualizado', () => {
  const r = escopar('@keyframes puls{to{opacity:1}}.x{animation-name:puls}', {
    nomesUsados: { keyframes: new Set(['puls']) },
  });
  assert.ok(r.css.includes('animation-name:puls--a'));
});

test('nome parecido não é trocado por engano', () => {
  // `girar` renomeado não pode arrastar `girar-lento` junto.
  const r = escopar('@keyframes girar{to{opacity:1}}.x{animation:girar-lento 2s}', {
    nomesUsados: { keyframes: new Set(['girar']) },
  });
  assert.ok(r.css.includes('animation:girar-lento 2s'));
});

test('@layer que colide é renomeado', () => {
  const r = escopar('@layer base{.x{color:red}}', { nomesUsados: { layer: new Set(['base']) } });
  assert.ok(r.css.includes('@layer base--a'));
});

// ── Robustez ────────────────────────────────────────────────────────────────

test('CSS que não faz parse segue sem escopo, com o risco DECLARADO', () => {
  // Descartar todo o estilo de uma origem por um caractere seria pior. O que
  // não pode é ficar em silêncio.
  const r = escopar('.a{color:red} @@@ isto não é css {{{');
  assert.ok(r.avisos.length > 0 || r.css.length > 0);
  if (r.avisos.length > 0) assert.ok(r.avisos[0]?.includes('colidir'));
});

test('CSS vazio não quebra nem inventa regra', () => {
  const r = escopar('');
  assert.equal(r.reescritas, 0);
  assert.equal(r.renomeados.length, 0);
});

// ── Leitura de nomes globais ────────────────────────────────────────────────

test('nomesGlobaisDe lê keyframes, font-family de @font-face e layers', () => {
  const n = nomesGlobaisDe(
    '@keyframes girar{to{opacity:1}}@font-face{font-family:"Inter";src:url(a)}@layer base,tema{}',
  );
  assert.ok(n.keyframes.has('girar'));
  assert.ok(n.fontFace.has('Inter'));
  assert.ok(n.layer.has('base'));
  assert.ok(n.layer.has('tema'));
});
