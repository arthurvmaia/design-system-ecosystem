import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  contrasteEntre,
  corrigirParesDeCor,
  mapearClassesPorPapel,
  tintaQueSeLeSobre,
} from './par-de-cores.js';

/** A paleta MEDIDA no kit que reprovou: marca escura, acento âmbar. */
const TOKENS = {
  background: '#1a1210',
  surface: '#241a16',
  heading: '#faf3ec',
  body: '#c9b8ac',
  muted: '#a6a6a6',
  primary: '#d4552a',
  'primary-foreground': '#ffffff',
  accent: '#e8a33c',
};

const CSS = `
.text-stone-900{color:var(--marca-heading, #1c1917)}
.text-stone-700{color:var(--marca-body, #44403c)}
.bg-\\[\\#FBFCD4\\]{background-color:var(--marca-accent, #fbfcd4)}
.bg-marca{background:var(--marca-primary, #d4552a)}
`;

test('o caso medido: o par cai de 16,64:1 para 1,96:1 e cada lado passa sozinho', () => {
  assert.ok((contrasteEntre('#FBFCD4', '#1c1917') ?? 0) > 16, 'na origem o par era otimo');
  const depois = contrasteEntre(TOKENS.accent, TOKENS.heading) ?? 0;
  assert.ok(depois < 2, `o par migrado colapsa (${depois.toFixed(2)}:1)`);
  assert.ok((contrasteEntre(TOKENS.heading, TOKENS.background) ?? 0) > 3, 'a tinta passa sozinha');
  assert.ok((contrasteEntre(TOKENS.accent, TOKENS.background) ?? 0) > 3, 'o fundo passa sozinho');
});

test('o mapa le classe -> papel do CSS ja recolorido', () => {
  const m = mapearClassesPorPapel(CSS);
  assert.equal(m.tinta.get('text-stone-900'), 'heading');
  assert.equal(m.tinta.get('text-stone-700'), 'body');
  assert.equal(m.fundo.get('bg-[#FBFCD4]'), 'accent');
  assert.equal(m.fundo.get('bg-marca'), 'primary');
});

test('seletor composto NAO entra no mapa: ele depende de um ancestral', () => {
  const m = mapearClassesPorPapel('.pai .filho{color:var(--marca-heading)}');
  assert.equal(m.tinta.size, 0);
});

test('o par que colapsa e corrigido, e a correcao troca a TINTA', () => {
  const html = '<button class="bg-[#FBFCD4] text-stone-900">Tornar-se Membro</button>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 1);
  assert.equal(r.corrigidos[0]?.papelDoFundo, 'accent');
  assert.equal(r.corrigidos[0]?.papelAntes, 'heading');
  assert.ok(r.html.includes('style="color:var(--marca-'), 'sai como style no elemento');
  assert.ok(!r.html.includes('!important'), 'style ja vence a cascata');
  assert.ok(r.html.includes('bg-[#FBFCD4]'), 'o FUNDO fica: ele e a superficie da regiao');
});

test('a tinta escolhida realmente se le sobre aquele fundo', () => {
  const html = '<span class="bg-[#FBFCD4] text-stone-900">x</span>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  const papel = /var\(--marca-([a-z-]+)\)/.exec(r.html)?.[1] ?? '';
  const hex = (TOKENS as Record<string, string>)[papel];
  assert.ok(hex, `papel ${papel} existe na paleta`);
  assert.ok((contrasteEntre(hex, TOKENS.accent) ?? 0) >= 3, 'o par novo passa do piso');
});

test('par que ja passa NAO e tocado', () => {
  const html = '<button class="bg-marca text-stone-900">ok</button>';
  // primary #d4552a x heading #faf3ec passa folgado
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 0);
  assert.equal(r.html, html);
});

test('elemento com color no style fica intocado: alguem ja decidiu ali', () => {
  const html =
    '<button class="bg-[#FBFCD4] text-stone-900" style="color:var(--marca-background)">x</button>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 0);
});

test('style que existe sem color recebe a correcao SEM perder o que tinha', () => {
  const html = '<div class="bg-[#FBFCD4] text-stone-900" style="padding:1rem">x</div>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.ok(r.html.includes('padding:1rem'), 'o que estava ali continua');
  assert.ok(r.html.includes('color:var(--marca-'));
});

test('elemento so com tinta, sem fundo, nao e par e nao e mexido', () => {
  const html = '<p class="text-stone-900">so texto</p>';
  assert.equal(corrigirParesDeCor(html, CSS, TOKENS).corrigidos.length, 0);
});

test('paleta impossivel nao piora nada: sem tinta que se leia, nada muda', () => {
  const cinza = { accent: '#808080', heading: '#7f7f7f', body: '#818181' };
  const html = '<b class="bg-[#FBFCD4] text-stone-900">x</b>';
  const r = corrigirParesDeCor(html, CSS, cinza);
  assert.equal(r.corrigidos.length, 0);
  assert.equal(r.html, html);
});

test('tintaQueSeLeSobre prefere a tinta de contraste do proprio papel', () => {
  assert.equal(tintaQueSeLeSobre('primary', TOKENS), 'primary-foreground');
});

test('sem CSS mapeado o HTML volta inteiro, sem varredura a toa', () => {
  const html = '<div class="bg-[#FBFCD4] text-stone-900">x</div>';
  assert.equal(corrigirParesDeCor(html, '', TOKENS).html, html);
});

test('a forma ESCOPADA e reconhecida: e a unica que existe em site real', () => {
  // Exatamente como `escoparCss` escreve, e como saiu no site do banco de prova.
  // `String.raw` porque a classe carrega escapes de CSS (`\[`, `\#`): escritos
  // como string comum, o formatador os come e o teste passa a provar outra coisa.
  const css = String.raw`
:where([data-ds-raiz="ds_1"], [data-ds-corpo="ds_1"]):is(.text-stone-900){color:var(--marca-heading, #1c1917)}
:where([data-ds-raiz="ds_1"], [data-ds-corpo="ds_1"]):is(.bg-\[\#FBFCD4\]){background-color:var(--marca-accent, #fbfcd4)}`;
  const m = mapearClassesPorPapel(css);
  assert.equal(m.tinta.get('text-stone-900'), 'heading');
  assert.equal(m.fundo.get('bg-[#FBFCD4]'), 'accent');
});

test('seletor escopado com DESCENDENTE continua de fora', () => {
  const css = ':where([data-ds-corpo="ds_1"]) ::before{color:var(--marca-heading)}';
  assert.equal(mapearClassesPorPapel(css).tinta.size, 0);
});

test('a virgula DENTRO do :where nao parte o seletor', () => {
  const css =
    ':where([data-ds-raiz="ds_1"], [data-ds-corpo="ds_1"]):is(.a){color:var(--marca-heading)}';
  assert.equal(mapearClassesPorPapel(css).tinta.get('a'), 'heading');
});

test('as duas formas convivem: solta e escopada da mesma classe', () => {
  const css = '.x, :where([data-ds-raiz="ds_1"]):is(.x){color:var(--marca-body)}';
  assert.equal(mapearClassesPorPapel(css).tinta.get('x'), 'body');
});

test('o fundo vem do ANCESTRAL: e o caso normal, nao a excecao', () => {
  // Foi este o shape que reprovava em S4 e que a primeira versao nao via:
  // o cartao carrega a superficie, o texto mora dentro dele.
  const html =
    '<div class="bg-[#FBFCD4]"><h3 class="text-3xl text-stone-900">Tours personalizados</h3></div>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 1);
  assert.equal(r.corrigidos[0]?.papelDoFundo, 'accent');
  assert.ok(/<h3[^>]*style="color:var\(--marca-/.test(r.html), 'a correcao vai no h3');
  assert.ok(!/<div[^>]*style="color/.test(r.html), 'o cartao nao e tocado');
});

test('o ancestral MAIS PROXIMO manda: fundo de dentro vence o de fora', () => {
  const html =
    '<div class="bg-marca"><div class="bg-[#FBFCD4]"><p class="text-stone-900">x</p></div></div>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 1);
  assert.equal(r.corrigidos[0]?.papelDoFundo, 'accent', 'o de dentro, nao o primary de fora');
});

test('o fundo NAO vaza para fora do elemento que o declarou', () => {
  const html = '<div class="bg-[#FBFCD4]"><span>a</span></div><p class="text-stone-900">fora</p>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 0, 'o <p> esta depois do </div> e nao herda nada');
});

test('tag sem filho nao empilha: <img> nao vira ancestral de ninguem', () => {
  const html = '<img class="bg-[#FBFCD4]"><p class="text-stone-900">depois</p>';
  assert.equal(corrigirParesDeCor(html, CSS, TOKENS).corrigidos.length, 0);
});

test('tag auto-fechada mantem a barra no lugar certo', () => {
  const html = '<div class="bg-[#FBFCD4]"><br class="text-stone-900" /></div>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.ok(!/\/ style=/.test(r.html), 'nada de atributo depois da barra');
  assert.ok(/style="color:var\(--marca-[a-z-]+\)" \/>/.test(r.html));
});

test('fechamento fora de ordem nao desmonta a pilha', () => {
  // HTML de captura vem torto; a pilha nao pode entrar em pane por causa disso.
  const html = '<div class="bg-[#FBFCD4]"><span></div><p class="text-stone-900">x</p>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.ok(Array.isArray(r.corrigidos), 'nao quebra');
});

test('proxy da origem NAO conta como fundo: ele e transparente por construcao', () => {
  // A regressao medida: 52 textos pintados com --marca-background sobre a
  // propria pagina, porque `bg-teal-700` num [data-ds-corpo] foi lido como
  // superficie real. O proxy nao pinta.
  const html =
    '<div data-ds-corpo="ds_1" class="bg-[#FBFCD4]"><h2 class="text-stone-900">FAQ</h2></div>';
  const r = corrigirParesDeCor(html, CSS, TOKENS);
  assert.equal(r.corrigidos.length, 0, 'o fundo ali e o da PAGINA, e heading se le nela');
  assert.ok(!r.html.includes('style="color'), 'nada foi pintado');
});

test('papel de TEXTO vence papel de superficie quando os dois servem', () => {
  // Fundo escuro: heading (texto) e background (superficie) ambos contrastam.
  // O de texto tem de ganhar — superficie como tinta e ultimo recurso.
  assert.equal(tintaQueSeLeSobre('primary', TOKENS), 'primary-foreground');
});

test('sobre fundo claro de VERDADE, a tinta escura da pagina e a escolha certa', () => {
  // O botao ambar que abriu esta frente: nenhum papel de texto do tema escuro
  // se le sobre ele, e --marca-background (escuro) da 8:1.
  const escolhido = tintaQueSeLeSobre('accent', TOKENS);
  assert.equal(escolhido, 'background');
  const hex = (TOKENS as Record<string, string>)[escolhido ?? ''] ?? '';
  assert.ok((contrasteEntre(hex, TOKENS.accent) ?? 0) >= 3);
});

test('o par MEIO recolorido: fundo virou papel, a tinta continuou literal', () => {
  // Metade das colisoes medidas tinha esta forma. `text-white` nao pertence a
  // papel nenhum, entao ele nao entra no mapa de papeis — e a correcao, que so
  // falava em papeis, via um lado so e desistia. O par colapsava para 1,49:1.
  const css =
    ':where([data-ds-corpo="d"]):is(.bg-claro){background-color:var(--marca-background, #0d0c22)}' +
    ':where([data-ds-corpo="d"]):is(.text-white){color:#fff}';
  const mapa = mapearClassesPorPapel(css);
  assert.equal(mapa.fundo.get('bg-claro'), 'background');
  assert.equal(mapa.tinta.get('text-white'), undefined, 'branco nao tem papel');
  assert.equal(mapa.tintaLiteral.get('text-white'), '#fff', 'mas tem hex');

  const claro = { ...TOKENS, background: '#f7f7f7', heading: '#141414', body: '#333333' };
  const r = corrigirParesDeCor(
    '<div class="bg-claro"><span class="text-white">DEV+</span></div>',
    css,
    claro,
  );
  assert.equal(r.corrigidos.length, 1, `nao corrigiu: ${r.html}`);
  assert.match(r.html, /color:var\(--marca-/, 'a tinta passa a se ler sobre o fundo claro');
});

test('tinta literal que JA se le sobre o fundo nao e tocada', () => {
  const css =
    ':where([data-ds-corpo="d"]):is(.bg-escuro){background-color:var(--marca-background, #000)}' +
    ':where([data-ds-corpo="d"]):is(.text-white){color:#ffffff}';
  const r = corrigirParesDeCor(
    '<div class="bg-escuro"><span class="text-white">DEV+</span></div>',
    css,
    TOKENS,
  );
  assert.equal(r.corrigidos.length, 0, 'branco sobre #1a1210 se le, e nada muda');
});
