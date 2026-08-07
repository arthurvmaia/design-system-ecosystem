import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ClusterDeCor } from '@ds/shared';
import { mapaDeRecoloracao, recolorirCss } from './recolorir.js';

/**
 * A recoloração é o que faz a paleta da marca vencer de verdade — medido no
 * site real: 712 literais de cor e ZERO consumo de `--marca-*`. Cada teste
 * aqui protege uma das propriedades que sustentam o mecanismo.
 */

const cluster = (over: Partial<ClusterDeCor>): ClusterDeCor => ({
  papel: 'primary',
  corCanonica: '#0d3c1f',
  confianca: 0.8,
  membros: [{ literal: '#0d3c1f', hexOpaco: '#0d3c1f', ocorrencias: 1, contexto: 'bg' }],
  ajuste: null,
  ...over,
});

const MAPA = new Map([
  ['#0d3c1f', { papel: 'primary' as const, ajuste: null }],
  ['#f69066', { papel: 'accent' as const, ajuste: null }],
]);

test('opaco vira var() com o literal de fallback', () => {
  const r = recolorirCss('.a{color:#0d3c1f}', MAPA);
  assert.equal(r.css, '.a{color:var(--marca-primary, #0d3c1f)}');
  assert.equal(r.reescritas, 1);
});

test('alfa em var() do Tailwind vira sintaxe relativa — o caso medido', () => {
  const r = recolorirCss('.b{background-color:rgb(13 60 31 / var(--tw-bg-opacity, 1))}', MAPA);
  assert.equal(
    r.css,
    '.b{background-color:rgb(from var(--marca-primary, #0d3c1f) r g b / var(--tw-bg-opacity, 1))}',
  );
});

test('cor sem papel no mapa fica intocada', () => {
  const r = recolorirCss('.c{color:#123456}', MAPA);
  assert.equal(r.css, '.c{color:#123456}');
  assert.equal(r.mantidas, 1);
});

test('hex dentro de url() NUNCA é tocado', () => {
  const css = `.d{background-image:url("data:image/svg+xml,%3Cpath fill='%230d3c1f'/%3E");color:#0d3c1f}`;
  const r = recolorirCss(css, MAPA);
  assert.ok(r.css.includes(`%230d3c1f'`), 'o data-uri segue intacto');
  assert.ok(r.css.includes('var(--marca-primary, #0d3c1f)'), 'a cor de verdade foi reescrita');
});

test('gradiente reescreve cada cor separadamente', () => {
  const r = recolorirCss('.e{background:linear-gradient(90deg, #0d3c1f, #f69066)}', MAPA);
  assert.equal(
    r.css,
    '.e{background:linear-gradient(90deg, var(--marca-primary, #0d3c1f), var(--marca-accent, #f69066))}',
  );
  assert.equal(r.reescritas, 2);
});

test('IDEMPOTÊNCIA: recolorir duas vezes = uma', () => {
  const uma = recolorirCss('.f{color:#0d3c1f}', MAPA);
  const duas = recolorirCss(uma.css, MAPA);
  assert.equal(duas.css, uma.css);
  assert.equal(duas.reescritas, 0);
});

test('INVARIANTE: a recoloração nunca DECLARA --marca-*, só consome', () => {
  // É este invariante que garante que o :root do marca.css alcança as peças
  // por herança: a origem não declara nada no namespace, então o proxy não
  // tem o que interceptar. Se um dia alguém fizer a recoloração declarar,
  // o defeito de herança do escopo (documentado em escopo.ts) volta por aqui.
  const r = recolorirCss('.g{color:#0d3c1f;background:#f69066}', MAPA);
  assert.ok(!/--marca-[a-z-]+\s*:/.test(r.css), 'nenhuma DECLARAÇÃO de --marca-*');
  assert.ok(/var\(--marca-/.test(r.css), 'só consumo');
});

test('mapa vazio devolve o CSS intacto sem custo', () => {
  const r = recolorirCss('.h{color:#0d3c1f}', new Map());
  assert.equal(r.css, '.h{color:#0d3c1f}');
});

test('CSS quebrado degrada com aviso, não com exceção', () => {
  const r = recolorirCss('isto { não é css', MAPA);
  assert.equal(r.css, 'isto { não é css');
  assert.equal(r.avisos.length, 1);
});

test('mapaDeRecoloracao respeita papel null e o limiar de confiança', () => {
  const mapa = mapaDeRecoloracao([
    cluster({}),
    cluster({
      papel: null,
      corCanonica: '#111111',
      membros: [{ literal: '#111111', hexOpaco: '#111111', ocorrencias: 1, contexto: 'text' }],
    }),
    cluster({
      papel: 'accent',
      confianca: 0.3,
      corCanonica: '#222222',
      membros: [{ literal: '#222222', hexOpaco: '#222222', ocorrencias: 1, contexto: 'text' }],
    }),
  ]);
  assert.equal(mapa.get('#0d3c1f')?.papel, 'primary');
  assert.equal(mapa.get('#111111'), undefined, 'papel null fica de fora');
  assert.equal(mapa.get('#222222'), undefined, 'confiança abaixo do limiar fica de fora');
});

test('cor DERIVADA preserva a relação com o parente, em OKLCH', () => {
  // #8abf9e é o verde primary clareado. Sem herança ele ficaria verde enquanto
  // o primary virava amarelo, e o site sairia METADE convertido. Com herança,
  // ele vira "o amarelo da marca, 24% mais claro e com 55% do croma".
  const mapa = new Map([
    ['#8abf9e', { papel: 'primary' as const, ajuste: { deltaL: 0.24, ratioC: 0.55 } }],
  ]);
  const r = recolorirCss('.a{background:#8abf9e}', mapa);
  assert.equal(
    r.css,
    '.a{background:oklch(from var(--marca-primary, #8abf9e) calc(l + 0.240) calc(c * 0.550) h)}',
  );
});

test('derivada mais ESCURA usa subtração: calc(l + -0.1) não é CSS válido', () => {
  const mapa = new Map([
    ['#4a6b5a', { papel: 'primary' as const, ajuste: { deltaL: -0.12, ratioC: 0.4 } }],
  ]);
  const r = recolorirCss('.a{color:#4a6b5a}', mapa);
  assert.ok(r.css.includes('calc(l - 0.120)'), r.css);
  assert.ok(!r.css.includes('+ -'), 'nunca soma um negativo');
});

test('derivada com alfa mantém o alfa como expressão', () => {
  const mapa = new Map([
    ['#4a6b5a', { papel: 'primary' as const, ajuste: { deltaL: -0.12, ratioC: 0.4 } }],
  ]);
  const r = recolorirCss('.a{background:rgb(74 107 90 / var(--tw-bg-opacity, 1))}', mapa);
  assert.ok(r.css.includes('/ var(--tw-bg-opacity, 1))'), r.css);
  assert.ok(r.css.startsWith('.a{background:oklch(from var(--marca-primary'), r.css);
});

test('retema: origem de tema invertido migra superfície, acento e tinta para a marca', () => {
  const css = [
    '.card{background-color:#0A0A1A}', // superfície escura do tema oposto
    '.t{color:#fff}', // texto branco, ilegível no claro
    '.i{stroke:#10B981}', // acento esmeralda da origem
    '.j{stroke:#D946EF}', // um SEGUNDO acento, outra matiz
    '.p{color:#94a3b8}', // cinza intermediário: corpo de texto
  ].join('');
  const r = recolorirCss(css, new Map(), { retema: { alvo: 'claro' } });
  assert.ok(r.css.includes('.card{background-color:var(--marca-surface, #0a0a1a)}'), r.css);
  assert.ok(r.css.includes('.t{color:var(--marca-heading, #ffffff)}'), r.css);
  // Dois acentos distintos na origem continuam distintos aqui.
  assert.ok(r.css.includes('.i{stroke:var(--marca-primary, #10b981)}'), r.css);
  assert.ok(r.css.includes('.j{stroke:var(--marca-accent, #d946ef)}'), r.css);
  assert.ok(r.css.includes('.p{color:var(--marca-body, #94a3b8)}'), r.css);
  assert.ok(
    r.avisos.some((a) => a.includes('tema invertido')),
    'o retema é declarado',
  );
});

test('retema alcança o stop de gradiente do Tailwind (custom property)', () => {
  // `.from-white` compila para `--tw-gradient-from:#fff` — o literal mora na
  // custom property, e foi por ali que o branco do título escapou no caso real.
  const r = recolorirCss(
    '.h{--tw-gradient-from:#fff var(--tw-gradient-from-position)}',
    new Map(),
    {
      retema: { alvo: 'claro' },
    },
  );
  assert.ok(r.css.includes('--tw-gradient-from:var(--marca-surface, #ffffff)'), r.css);
});

test('sem retema, mapa vazio continua sendo passagem direta', () => {
  const r = recolorirCss('.t{color:#fff}', new Map());
  assert.equal(r.css, '.t{color:#fff}');
  assert.equal(r.reescritas, 0);
});

test('temas que combinam: só o acento migra, superfície e tinta ficam da origem', () => {
  // Streetwear vermelho vestindo peça de um site escuro: o preto do cartão
  // está certo, o verde-esmeralda do ícone não — ele é de outra marca.
  const css = '.card{background-color:#0A0A1A}.t{color:#fff}.i{stroke:#10B981}';
  const r = recolorirCss(css, new Map(), { retema: { alvo: 'escuro', apenasAcentos: true } });
  assert.ok(r.css.includes('.card{background-color:#0A0A1A}'), 'a superfície fica');
  assert.ok(r.css.includes('.t{color:#fff}'), 'a tinta fica');
  assert.ok(r.css.includes('.i{stroke:var(--marca-primary, #10b981)}'), 'o acento migra');
});

test('piso de contraste: cor de marca que não se lê no fundo cede para a que se lê', () => {
  // Marca escura de barbearia: fundo quase preto, primária marrom escura.
  // Um título da origem que vira "primary" some — foi o "Nascido do sussurro
  // ancestral" marrom sobre preto. O piso troca pela tinta de título.
  const retema = {
    alvo: 'escuro' as const,
    apenasAcentos: true,
    fundoDaPagina: '#14110e',
    tokens: { primary: '#2a1c10', heading: '#f3ede4', body: '#c0b5a6', accent: '#e3c68a' },
  };
  const r = recolorirCss('.h{color:#c96a2b}', new Map(), { retema });
  assert.ok(r.css.includes('var(--marca-heading'), `cedeu para quem se lê: ${r.css}`);

  // E quando a própria primária se lê, ela fica: o piso não achata a paleta.
  const legivel = recolorirCss('.h{color:#c96a2b}', new Map(), {
    retema: { ...retema, tokens: { ...retema.tokens, primary: '#e0a45a' } },
  });
  assert.ok(legivel.css.includes('var(--marca-primary'), legivel.css);
});

test('piso de contraste não alcança FUNDO: só texto passa pela régua', () => {
  const retema = {
    alvo: 'escuro' as const,
    fundoDaPagina: '#14110e',
    tokens: { primary: '#2a1c10', heading: '#f3ede4' },
  };
  const r = recolorirCss('.c{background-color:#c96a2b}', new Map(), { retema });
  assert.ok(r.css.includes('var(--marca-primary'), 'fundo escuro é escolha, não defeito');
});

test('temas iguais: texto que perdeu o chão claro é resgatado mesmo em apenasAcentos', () => {
  // O caso real: título `#2c1810` que na origem sentava num bloco claro e, com
  // a seção transparente, passou a sentar no fundo `#14110e` da marca — 1,2:1.
  const retema = {
    alvo: 'escuro' as const,
    apenasAcentos: true,
    fundoDaPagina: '#14110e',
    tokens: { primary: '#b8863b', heading: '#f3ede4', body: '#c0b5a6', accent: '#e3c68a' },
  };
  const r = recolorirCss(
    '.t{color:#2c1810}.ok{color:#f3ede4}.card{background-color:#1f1a15}',
    new Map(),
    {
      retema,
    },
  );
  assert.ok(r.css.includes('.t{color:var(--marca-'), `resgatou o ilegível: ${r.css}`);
  assert.ok(r.css.includes('.ok{color:#f3ede4}'), 'texto que JÁ se lê não é tocado');
  assert.ok(r.css.includes('.card{background-color:#1f1a15}'), 'superfície da origem fica');
});

test('variável usada como tinta é tratada como texto, mesmo com nome neutro', () => {
  // `--brown` não diz o papel; `color: var(--brown)` diz. Sem ler o USO, a
  // declaração escapa do retema e o título fica ilegível — foi o caso real.
  const css =
    ':root{--brown:#2c1810;--areia:#2c1810}.t{color:var(--brown)}.c{background:var(--areia)}';
  const r = recolorirCss(css, new Map(), {
    retema: {
      alvo: 'escuro',
      apenasAcentos: true,
      fundoDaPagina: '#14110e',
      tokens: { heading: '#f3ede4', body: '#c0b5a6', primary: '#b8863b', accent: '#e3c68a' },
    },
  });
  assert.ok(r.css.includes('--brown:var(--marca-'), `tinta migrou: ${r.css}`);
  // A que só serve de fundo NÃO é tocada: mesma cor, papel diferente.
  assert.ok(r.css.includes('--areia:#2c1810'), `fundo intacto: ${r.css}`);
});
