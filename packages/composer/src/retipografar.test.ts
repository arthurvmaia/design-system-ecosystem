import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fontesDaOrigem, placarDasFontes } from './papel-da-fonte.js';
import { mapaDeFontes, retipografarCss } from './retipografar.js';

/**
 * A marca ganhando a cascata.
 *
 * O defeito, em dois números: `body{font-family:var(--font-body)}` vale (0,0,1)
 * e `.font-sans` da origem vale (0,1,0). A classe utilitária ganha sempre, e
 * num site Tailwind quase nada é tag nua — o usuário escolhia a fonte, o app
 * dizia que tinha aplicado, e o site saía com a fonte do site de origem.
 */

// ── Decidir o papel de cada família ──────────────────────────────────────────

test('h1 diz título, body diz texto', () => {
  const f = fontesDaOrigem('h1{font-family:"Space Grotesk"}body{font-family:"Inter"}');
  assert.equal(f.display, 'Space Grotesk');
  assert.equal(f.body, 'Inter');
});

test('seletor de elemento vale mais que nome de classe', () => {
  // Nome de classe é intenção declarada por quem escreveu, e às vezes mente:
  // `.font-display` aplicado ao corpo do texto acontece.
  const f = fontesDaOrigem(
    'h1,h2{font-family:"Real Titulo"}.font-display{font-family:"Diz Que E Titulo"}',
  );
  assert.equal(f.display, 'Real Titulo');
});

test('nome de classe conta quando não há seletor de elemento', () => {
  const f = fontesDaOrigem('.titulo{font-family:"Oswald"}.prose{font-family:"Merriweather"}');
  assert.equal(f.display, 'Oswald');
  assert.equal(f.body, 'Merriweather');
});

test('monospace na pilha marca a família como mono, e ela sai dos outros papéis', () => {
  const f = fontesDaOrigem(
    'body{font-family:"Inter"}code{font-family:"Geist Mono",monospace}h1{font-family:"Geist Mono",monospace}',
  );
  assert.equal(f.mono, 'Geist Mono');
  assert.equal(f.body, 'Inter');
  // Mesmo tendo aparecido num h1, a mono não vira display: ela já tem papel.
  assert.notEqual(f.display, 'Geist Mono');
});

test('fonte ÚNICA fica como corpo, não como os dois papéis', () => {
  // É o erro mais caro possível aqui. Devolvê-la nos dois faria a marca trocar
  // o site inteiro por uma família só, apagando a hierarquia que o site de
  // origem construiu por peso e tamanho.
  const f = fontesDaOrigem(
    'body{font-family:"Inter"}h1{font-family:"Inter"}p{font-family:"Inter"}',
  );
  assert.equal(f.body, 'Inter');
  assert.equal(f.display, null);
});

test('empate de evidência não elege ninguém', () => {
  const f = fontesDaOrigem('h1{font-family:"A"}h2{font-family:"B"}');
  assert.equal(f.display, null);
});

test('sem sinal nenhum, não decide', () => {
  // Uma família aplicada só em `.x`: não há evidência de papel, e inventar um
  // faria a marca trocar uma fonte que talvez fosse decorativa.
  const f = fontesDaOrigem('.x{font-family:"Alguma"}');
  assert.equal(f.display, null);
  assert.equal(f.body, null);
});

test('o @font-face não vota', () => {
  // Declarar a fonte não é aplicá-la. Contar a declaração daria peso a uma
  // família que talvez ninguém use.
  const p = placarDasFontes('@font-face{font-family:"Nunca Usada";src:url(a.woff2)}');
  assert.equal(p.size, 0);
});

test('genérica no MEIO da pilha é pulada; no começo, ela manda', () => {
  // A ordem carrega a intenção. `"Minha Fonte", sans-serif` diz "quero esta,
  // e se faltar use qualquer sem serifa" — a escolha é a primeira.
  assert.equal(fontesDaOrigem('body{font-family:"Minha Fonte",sans-serif}').body, 'Minha Fonte');

  // `system-ui, "Minha Fonte"` diz o contrário: prefiro a do aparelho. Isso é
  // pilha de sistema, e a família que vem depois é reserva — tratá-la como a
  // escolha do site inverteria o que a folha declarou.
  const sistema = fontesDaOrigem('body{font-family:system-ui,"Minha Fonte"}');
  assert.notEqual(sistema.body, 'Minha Fonte');
});

test('CSS ilegível não derruba nada', () => {
  const f = fontesDaOrigem('body{font-family:');
  assert.deepEqual(f, { display: null, body: null, mono: null });
});

// ── A reescrita ──────────────────────────────────────────────────────────────

const comFontes = (css: string) => retipografarCss(css, mapaDeFontes(fontesDaOrigem(css)));

test('a declaração passa a consumir o token, com a pilha inteira de fallback', () => {
  const r = comFontes('h1{font-family:"Space Grotesk",sans-serif}body{font-family:"Inter"}');
  assert.match(r.css, /var\(--marca-fonte-display, *"Space Grotesk",sans-serif\)/);
  assert.match(r.css, /var\(--marca-fonte-body, *"Inter"\)/);
  assert.equal(r.reescritas, 2);
});

test('o fallback preserva a pilha — sem marca, a peça fica com a fonte de origem', () => {
  // O invariante que faz a degradação ser segura: marca ausente devolve
  // exatamente o que estava lá, e não uma fonte de sistema aleatória.
  const r = comFontes('h1{font-family:"Oswald",Georgia,serif}body{font-family:"Inter"}');
  assert.ok(r.css.includes('Georgia,serif'), `perdeu a pilha: ${r.css}`);
});

test('NUNCA declara --marca-*, só consome', () => {
  // O invariante que faz a herança funcionar: a origem não declara nada nesse
  // namespace, então não há proxy no caminho para interceptar o :root da marca.
  const r = comFontes('h1{font-family:"A"}body{font-family:"B"}');
  assert.ok(!/--marca-fonte-\w+\s*:/.test(r.css), `declarou o token: ${r.css}`);
});

test('o @font-face não é reescrito', () => {
  // Envolver o nome em var() criaria uma fonte chamada "var(...)" e a peça
  // perderia o arquivo que acabou de baixar.
  const css =
    '@font-face{font-family:"Inter";src:url(a.woff2)}body{font-family:"Inter"}h1{font-family:"Oswald"}';
  const r = retipografarCss(css, mapaDeFontes(fontesDaOrigem(css)));
  assert.match(r.css, /@font-face\{font-family:"Inter";/);
});

test('é idempotente: rodar duas vezes não aninha fallback', () => {
  const uma = comFontes('h1{font-family:"A"}body{font-family:"B"}');
  const duas = retipografarCss(uma.css, mapaDeFontes({ display: 'A', body: 'B', mono: null }));
  assert.equal(duas.reescritas, 0);
  assert.equal(uma.css, duas.css);
});

test('família sem papel decidido fica intacta', () => {
  const r = retipografarCss(
    '.x{font-family:"Decorativa"}',
    mapaDeFontes({ display: 'Outra', body: null, mono: null }),
  );
  assert.equal(r.reescritas, 0);
  assert.ok(r.css.includes('"Decorativa"'));
});

test('mapa vazio devolve o CSS intocado', () => {
  const css = 'h1{font-family:"A"}';
  const r = retipografarCss(css, new Map());
  assert.equal(r.css, css);
  assert.equal(r.reescritas, 0);
});

test('o atalho `font` fica INTACTO, e isso é decisão medida', () => {
  // O atalho carrega peso, tamanho e entrelinha antes da família
  // (`font:400 16px/1.5 "Inter",sans-serif`). Trocar só a família ali exigiria
  // reescrever a gramática inteira do `font`, e envolver o valor todo em var()
  // faria o fallback carregar o tamanho junto — a marca passaria a mandar no
  // tamanho sem ninguém pedir.
  //
  // Medido no acervo antes de decidir: das 17 ocorrências do atalho nas duas
  // capturas, TODAS as 17 são `font:inherit`, do reset do Tailwind. Nenhuma
  // declara família. Tratá-lo seria complexidade para um caso que não existe.
  const r = retipografarCss(
    'body{font:400 16px/1.5 "Inter",sans-serif}*{font:inherit}',
    mapaDeFontes({ display: null, body: 'Inter', mono: null }),
  );
  assert.equal(r.reescritas, 0);
  assert.ok(r.css.includes('400 16px/1.5 "Inter",sans-serif'));
  assert.ok(r.css.includes('font:inherit'));
});

// ── A pilha de sistema ───────────────────────────────────────────────────────
//
// Defeito medido no primeiro site gerado de verdade, e que nenhum teste de CSS
// fictício pegaria: o preflight do Tailwind declara no `:root`
//
//   font-family: ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji",
//                "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"
//
// A regra "primeira família não genérica" pulava as três primeiras e elegia
// "Noto Color Emoji" como a fonte de corpo do site. Um fallback de emoji
// virava a identidade tipográfica da origem.

test('pilha que abre com system-ui não elege emoji como fonte do site', () => {
  const f = fontesDaOrigem(
    ':root{font-family:ui-sans-serif,system-ui,sans-serif,"Apple Color Emoji","Noto Color Emoji"}',
  );
  assert.notEqual(f.body, 'Noto Color Emoji');
  assert.notEqual(f.body, 'Apple Color Emoji');
});

test('e a marca ENTRA nessa pilha, que é onde ela mais tem razão', () => {
  // O site não escolheu fonte — pediu a do aparelho. O usuário escolheu. Não
  // tokenizar aqui deixaria de fora justamente a regra de maior alcance, que o
  // preflight põe na raiz e todas as peças herdam.
  const css = ':root{font-family:ui-sans-serif,system-ui,sans-serif,"Noto Color Emoji"}';
  const r = retipografarCss(css, mapaDeFontes(fontesDaOrigem(css)));
  assert.equal(r.reescritas, 1);
  assert.match(r.css, /var\(--marca-fonte-body, *ui-sans-serif/);
});

test('pilha de sistema monoespaçada vira mono, não corpo', () => {
  const css =
    ':root{font-family:ui-sans-serif,system-ui,sans-serif}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}';
  const r = retipografarCss(css, mapaDeFontes(fontesDaOrigem(css)));
  assert.ok(r.css.includes('--marca-fonte-mono'), `mono não foi reconhecida: ${r.css}`);
});

test('família de verdade continua ganhando da pilha de sistema', () => {
  // O site que escolheu fonte não pode ser confundido com o que não escolheu.
  const f = fontesDaOrigem(
    'body{font-family:"Space Grotesk",ui-sans-serif,system-ui}h1{font-family:"Playfair Display",serif}',
  );
  assert.equal(f.body, 'Space Grotesk');
  assert.equal(f.display, 'Playfair Display');
});
