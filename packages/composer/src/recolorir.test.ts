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

test('texto NÃO sai com a cor do fundo, mesmo quando o cluster manda', () => {
  // O pior defeito que o dono viu: um hero inteiro com o texto em `#0b1530`
  // sobre o fundo `#0b1530` — contraste 1,0:1. O cluster daquela cor da origem
  // tinha papel de SUPERFÍCIE (lá ela era bloco escuro), e o caminho do cluster
  // vence o do retema sem conferir se o destino ainda dá para ler.
  const mapa = new Map([['#0d0c22', { papel: 'background' as const, ajuste: null }]]);
  const r = recolorirCss('.t{color:#0D0C22}', mapa, {
    retema: {
      alvo: 'escuro',
      fundoDaPagina: '#0b1530',
      tokens: { background: '#0b1530', heading: '#e6ecf7', body: '#bcd4ff', primary: '#1f7bff' },
    },
  });
  assert.doesNotMatch(r.css, /--marca-background/, 'texto não vira a cor de fundo');
  assert.match(r.css, /--marca-heading|--marca-body/, 'cede para uma tinta que se lê');
  assert.ok(
    r.avisos.some((a) => a.includes('não se lê')),
    'e a correção é declarada, não calada',
  );
});

test('o mesmo cluster continua valendo onde ele PINTA FUNDO', () => {
  // A regra é sobre texto. Fundo com papel de fundo está certo, e mexer nele
  // seria trocar um defeito por outro.
  const mapa = new Map([['#0d0c22', { papel: 'background' as const, ajuste: null }]]);
  const r = recolorirCss('.t{background-color:#0D0C22}', mapa, {
    retema: {
      alvo: 'escuro',
      fundoDaPagina: '#0b1530',
      tokens: { background: '#0b1530', heading: '#e6ecf7' },
    },
  });
  assert.match(r.css, /--marca-background/);
});

test('texto que já se lê não é mexido', () => {
  const mapa = new Map([['#ffffff', { papel: 'heading' as const, ajuste: null }]]);
  const r = recolorirCss('.t{color:#ffffff}', mapa, {
    retema: {
      alvo: 'escuro',
      fundoDaPagina: '#0b1530',
      tokens: { background: '#0b1530', heading: '#e6ecf7', body: '#bcd4ff' },
    },
  });
  assert.match(r.css, /--marca-heading/);
  assert.ok(!r.avisos.some((a) => a.includes('não se lê')));
});

/**
 * O espelho: NENHUM fundo sai pintado com a cor da LETRA.
 *
 * O papel do cluster diz o que a cor É na paleta da ORIGEM, não o que ela FAZ
 * nesta declaração. Num site de tema CLARO a cor mais escura da paleta é a
 * tinta de título — e quando essa mesma cor aparece pintando o cartão do plano
 * em destaque (`bg-stone-900`), herdar o papel de tinta pinta o cartão com a
 * cor da letra.
 *
 * Medido no site do clube: o cartão escuro da origem saiu BRANCO
 * (`--marca-heading`) com o texto branco por cima — 1,0:1, a mesma cor
 * exatamente. O cartão vizinho, que era branco, tinha virado marinho: os dois
 * trocaram de lado.
 */
test('fundo NÃO sai pintado com a cor da letra, mesmo quando o cluster manda', () => {
  // `#1c1917` é a tinta de título da origem clara — e aqui ela pinta um cartão.
  const mapa = new Map([['#1c1917', { papel: 'heading' as const, ajuste: null }]]);
  const r = recolorirCss('.plano{background-color:#1C1917}', mapa, {
    retema: {
      alvo: 'escuro',
      corDePagina: '#E6E3D6',
      fundoDaPagina: '#0b1530',
      tokens: { background: '#0b1530', surface: '#16244a', heading: '#ffffff', body: '#bcd4ff' },
    },
  });
  assert.doesNotMatch(r.css, /--marca-heading/, 'a tinta de título não pinta bloco');
  assert.match(r.css, /--marca-(surface|background)/, 'vira superfície, que é o que ela faz aqui');
  assert.ok(
    r.avisos.some((a) => a.includes('cor da LETRA')),
    'a correção é DITA, não silenciosa',
  );
});

test('papel de fundo pintando TEXTO e papel de tinta pintando FUNDO na mesma folha', () => {
  // As duas guardas juntas, que é como o site real chega: uma peça tem as duas
  // trocas ao mesmo tempo, e consertar só um lado deixa o par incoerente.
  const mapa = new Map([
    ['#1c1917', { papel: 'heading' as const, ajuste: null }],
    ['#e6e3d6', { papel: 'background' as const, ajuste: null }],
  ]);
  const r = recolorirCss('.p{background-color:#1C1917}.t{color:#E6E3D6}', mapa, {
    retema: {
      alvo: 'escuro',
      corDePagina: '#E6E3D6',
      fundoDaPagina: '#0b1530',
      tokens: { background: '#0b1530', surface: '#16244a', heading: '#ffffff', body: '#bcd4ff' },
    },
  });
  // O fundo virou superfície e o texto virou tinta: o par anda junto.
  assert.match(r.css, /\.p\{background-color:[^}]*--marca-(surface|background)/);
  assert.match(r.css, /\.t\{color:[^}]*--marca-(heading|body|accent|primary)/);
  assert.doesNotMatch(
    r.css,
    /\.t\{color:[^}]*--marca-background/,
    'texto não recebe cor de página',
  );
});

/**
 * Quando os TEMAS COMBINAM, fundo com papel de tinta não é recolorido — fica
 * com a cor da origem.
 *
 * O regime `apenasAcentos` existe porque ali a superfície da origem está certa.
 * O retema, coerente com isso, não devolve superfície nenhuma para fundo. Sem
 * uma saída explícita, a guarda ficava sem alternativa e o papel de tinta
 * passava: o cartão `bg-gray-900` saía pintado de `--marca-body` — um bloco
 * azul-claro no meio de uma página marinho, com o texto branco sumindo dentro.
 * Foi o que sobrou do "Desde 1926" e do "Na cidade", a 1,5:1.
 */
test('temas compatíveis: fundo com papel de tinta fica com a cor da ORIGEM', () => {
  const mapa = new Map([['#111827', { papel: 'body' as const, ajuste: null }]]);
  const r = recolorirCss('.cartao{background-color:#111827}', mapa, {
    retema: {
      alvo: 'escuro',
      apenasAcentos: true,
      fundoDaPagina: '#0b1530',
      tokens: { background: '#0b1530', surface: '#16244a', heading: '#ffffff', body: '#bcd4ff' },
    },
  });
  assert.doesNotMatch(r.css, /--marca-/, 'nada de tinta pintando bloco');
  assert.match(r.css, /#111827/i, 'o bloco fica com a cor que tinha na origem');
});

test('o contraste usa a luminancia da WCAG, com gama — sem ela o motor superestimava', () => {
  // Medido nos 425 trechos que a S4 reprovou nos 20 sites: sem decodificar a
  // gama do sRGB o motor superestimava o contraste em +0,91 de media (ate
  // +3,43), dava sinal verde e NAO recoloria texto que o navegador reprova.
  //
  // Caso concreto do acervo: texto #475569 sobre pagina #0b0b0d. O navegador le
  // 2,60:1; sem gama o motor lia 4,03:1 e concluia que passava.
  const cinza = '#475569';
  const pagina = '#0b0b0d';
  const r = recolorirCss(`.t{color:${cinza}}`, new Map(), {
    retema: {
      alvo: 'escuro',
      fundoDaPagina: pagina,
      tokens: { background: pagina, heading: '#f5f5fa', body: '#b8b8c8', primary: '#6d5cff' },
    },
  });
  // Com a gama, 2,60:1 fica abaixo do piso de 3 e o texto E migrado para uma
  // tinta que se le. Sem ela, ficava como estava.
  assert.ok(
    /var\(--marca-(heading|body|primary)/.test(r.css),
    `texto a 2,60:1 tem de ser migrado, saiu: ${r.css}`,
  );
});
