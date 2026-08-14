import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aplicarAjuste,
  comporSobre,
  contrasteEntre,
  corrigirParesDeCor,
  lerAjusteRelativo,
  lerAlfa,
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

test('cor DERIVADA: compara a cor que a tela pinta, nao o token cru', () => {
  // A recoloracao emite `oklch(from var(--marca-X) calc(l - 0.457) ...)` quando
  // o papel foi herdado de um vizinho de matiz. Ler o token era comparar uma cor
  // que NAO esta na tela: o par passava aqui e a pessoa via 1,49:1.
  const a = lerAjusteRelativo(
    'oklch(from var(--marca-secondary, #0d0c22) calc(l - 0.457) calc(c * 0.192) h)',
  );
  assert.ok(a !== null);
  assert.equal(a.deltaL.toFixed(3), '-0.457');
  assert.equal(a.ratioC.toFixed(3), '0.192');
  assert.equal(lerAjusteRelativo('var(--marca-primary, #fff)'), null, 'sem ajuste, nada a ler');

  // Escurecer de fato escurece, e clarear clareia — a ida e a volta do OKLCH.
  const escuro = aplicarAjuste('#808080', { deltaL: -0.4, ratioC: 1 });
  const claro = aplicarAjuste('#808080', { deltaL: 0.3, ratioC: 1 });
  assert.ok(escuro !== null && claro !== null);
  const n = (h: string) => Number.parseInt(h.slice(1, 3), 16);
  assert.ok(n(escuro) < 0x60, `escureceu pouco: ${escuro}`);
  assert.ok(n(claro) > 0xa0, `clareou pouco: ${claro}`);
  // Sem ajuste nenhum, a cor volta praticamente igual (a ida e volta e fiel).
  const igual = aplicarAjuste('#3b7dd8', { deltaL: 0, ratioC: 1 });
  assert.ok(igual !== null);
  for (let i = 1; i < 7; i += 2) {
    const d = Math.abs(
      Number.parseInt(igual.slice(i, i + 2), 16) - Number.parseInt('#3b7dd8'.slice(i, i + 2), 16),
    );
    assert.ok(d <= 2, `ida e volta perdeu o canal ${i}: ${igual}`);
  }
});

test('o par com fundo DERIVADO e corrigido pela cor pintada', () => {
  // O caso medido: `.text-[#0D0C22]` recolorida para secondary com l - 0.457
  // sobre um fundo tambem derivado. Antes, os dois tokens crus contrastavam e a
  // conferencia dizia que estava tudo bem.
  const css =
    ':where([data-ds-corpo="d"]):is(.caixa){background-color:var(--marca-surface, #eee)}' +
    ':where([data-ds-corpo="d"]):is(.tinta){color:oklch(from var(--marca-heading, #0d0c22) calc(l - 0.62) calc(c * 0.2) h)}';
  const tokens = { ...TOKENS, surface: '#1f1a15', heading: '#f3ede4' };
  const r = corrigirParesDeCor('<div class="caixa"><p class="tinta">oi</p></div>', css, tokens);
  assert.equal(r.corrigidos.length, 1, `o par derivado tem de ser visto: ${r.html}`);
});

test('fundo LITERAL: bg-white/95 nao tem papel, e a tinta ia parar sobre ele', () => {
  // O outro lado do mesmo buraco do par meio recolorido. `bg-white/95` e
  // `bg-slate-50` nao pertencem a papel nenhum, entao a recoloracao nao os toca.
  // A conferencia caia para o papel do ANCESTRAL — quase sempre o fundo escuro
  // da pagina — e escolhia tinta CLARA, que ia parar sobre a superficie branca.
  // Medido: 14 elementos com o conserto aplicado e ainda a 1,16:1.
  const css =
    ':where([data-ds-corpo="d"]):is(.painel){background-color:#ffffff}' +
    ':where([data-ds-corpo="d"]):is(.titulo){color:var(--marca-heading, #fff)}';
  const mapa = mapearClassesPorPapel(css);
  assert.equal(mapa.fundo.get('painel'), undefined, 'branco nao tem papel');
  assert.equal(mapa.fundoLiteral.get('painel'), '#ffffff', 'mas tem hex');

  const r = corrigirParesDeCor(
    '<div data-ds-corpo="d"><div class="painel"><h2 class="titulo">Oi</h2></div></div>',
    css,
    TOKENS,
  );
  assert.equal(r.corrigidos.length, 1, `o fundo literal tem de ser visto: ${r.html}`);
  // A tinta escolhida precisa se ler sobre BRANCO, nao sobre a pagina escura.
  const escolhido = /color:var\(--marca-([a-z-]+)\)/.exec(r.html)?.[1];
  assert.ok(escolhido !== undefined, r.html);
  const razao = contrasteEntre((TOKENS as Record<string, string>)[escolhido] ?? '', '#ffffff');
  assert.ok(razao !== null && razao >= 3, `${escolhido} da ${razao?.toFixed(2)}:1 sobre branco`);
});

test('a tinta HERDADA conta: o elemento que traz a superficie nova e corrigido', () => {
  // `color` desce por heranca; `background` nao. Um conteiner externo declara a
  // tinta clara, um conteiner INTERNO declara a superficie clara, e o texto la
  // no fundo nasce claro sobre claro — sem classe nenhuma no atributo.
  //
  // Conferir so quem tem classe de TINTA deixava esse caso passar inteiro:
  // medido no banco de prova, 52 ocorrencias de rgb(250,250,249) sobre
  // rgb(250,250,250), 1,00:1, e era o maior aglomerado de S4 que restava.
  const css =
    ':where([data-ds-corpo="d"]):is(.tinta-clara){color:var(--marca-heading, #fafaf9)}' +
    ':where([data-ds-corpo="d"]):is(.cartao-claro){background-color:#fafafa}';
  const r = corrigirParesDeCor(
    '<div class="tinta-clara"><div class="cartao-claro"><p>texto sem classe nenhuma</p></div></div>',
    css,
    TOKENS,
  );
  assert.equal(r.corrigidos.length, 1, `nao viu o par herdado: ${r.html}`);
  // O conserto pousa em QUEM TRAZ A SUPERFICIE — tudo dentro herda a tinta boa.
  assert.match(r.html, /class="cartao-claro" style="color:var\(--marca-/, r.html);
});

test('tinta herdada que JA se le sobre a superficie nova nao e tocada', () => {
  const css =
    ':where([data-ds-corpo="d"]):is(.tinta-clara){color:var(--marca-heading, #fff)}' +
    ':where([data-ds-corpo="d"]):is(.cartao-escuro){background-color:#000000}';
  const r = corrigirParesDeCor(
    '<div class="tinta-clara"><div class="cartao-escuro"><p>oi</p></div></div>',
    css,
    TOKENS,
  );
  assert.equal(r.corrigidos.length, 0);
});

test('superficie TRANSLUCIDA e composta: 5% do dourado sobre a pagina e quase preto', () => {
  // Foi a MINHA correcao que criou este caso: um selo com `bg-primary/5` sobre
  // pagina escura recebeu `--marca-primary-foreground` (#111110, escura),
  // porque eu comparei com o dourado OPACO. Na tela, escuro sobre escuro:
  // 1,00:1. A correcao piorava o que ia consertar.
  assert.equal(lerAlfa('rgb(from var(--marca-primary) r g b / 0.05)'), 0.05);
  assert.equal(lerAlfa('rgba(0, 0, 0, 0.4)'), null, 'rgba com virgula nao e a forma emitida');
  assert.equal(lerAlfa('var(--marca-primary)'), null, 'sem alfa, nada a ler');
  assert.equal(comporSobre('#ffffff', '#000000', 0.5), '#808080');

  const css =
    ':where([data-ds-corpo="d"]):is(.selo){background-color:rgb(from var(--marca-primary, #b8863b) r g b / 0.05)}' +
    ':where([data-ds-corpo="d"]):is(.rotulo){color:var(--marca-primary-foreground, #111)}';
  const r = corrigirParesDeCor(
    '<div data-ds-corpo="d"><span class="selo rotulo">SOC 2</span></div>',
    css,
    { ...TOKENS, 'primary-foreground': '#111110' },
  );
  // 5% de #b8863b sobre a pagina #1a1210 e quase preto: a tinta escura NAO
  // pode ficar, e a escolhida tem de se ler sobre o composto.
  assert.equal(r.corrigidos.length, 1, `nao viu o alfa: ${r.html}`);
  const escolhido = /color:var\(--marca-([a-z-]+)\)/.exec(r.html)?.[1];
  assert.ok(escolhido !== undefined && escolhido !== 'primary-foreground', r.html);
});

test('o AJUSTE viaja com a tinta herdada — a terceira vez do mesmo erro', () => {
  // Quem declarou a tinta pode te-la escrito como cor DERIVADA. Sem carregar o
  // ajuste na heranca, a comparacao volta a ser contra o token cru — o mesmo
  // defeito que ja fazia o par passar aqui e a pessoa ver 1,49:1 na tela.
  const css =
    ':where([data-ds-corpo="d"]):is(.tinta-derivada){color:oklch(from var(--marca-heading, #fff) calc(l - 0.75) calc(c * 0.3) h)}' +
    ':where([data-ds-corpo="d"]):is(.cartao){background-color:var(--marca-surface, #241a16)}';
  const r = corrigirParesDeCor(
    '<div class="tinta-derivada"><div class="cartao"><p>texto sem classe</p></div></div>',
    css,
    TOKENS,
  );
  // heading e clarissimo e passaria sobre a surface escura; a DERIVADA dele
  // (0,75 de luminancia a menos) e escura e colapsa. So se ve isso carregando
  // o ajuste na heranca.
  assert.equal(r.corrigidos.length, 1, `o ajuste nao viajou: ${r.html}`);
});

test('folha SEM classe e conferida, e o conteiner corrigido avisa os descendentes', () => {
  // Os 63 achados que sobravam no banco eram folhas sem classe nenhuma,
  // herdando tinta de um ancestral — e a guarda antiga desistia em
  // classes === ''. E quando o conteiner ganha o conserto, a tinta que desce
  // e a NOVA: sem o aviso, a folha ganhava um segundo style redundante.
  const css =
    ':where([data-ds-corpo="d"]):is(.texto-claro){color:var(--marca-heading, #eee)}' +
    ':where([data-ds-corpo="d"]):is(.cartao-claro){background-color:#f0f0f0}';
  const r = corrigirParesDeCor(
    '<div class="texto-claro cartao-claro"><p>folha sem classe nenhuma</p><span>outra folha</span></div>',
    css,
    TOKENS,
  );
  assert.equal(r.corrigidos.length, 1, `um conserto so, no conteiner: ${r.html}`);
  const styles = (r.html.match(/style="color:var\(--marca-/g) ?? []).length;
  assert.equal(styles, 1, `a folha herda a tinta corrigida, sem style proprio: ${r.html}`);
});

test('fundo rgba TRANSLUCIDO nao vira superficie na tabela', () => {
  // rgba(20,20,30,0.5) entrava como fundo opaco escuro; na tela, composto
  // sobre a pagina creme, aquilo e quase-creme. O corretor escolheu branco
  // para o fundo da tabela e o branco pousou no creme real: 1,10:1 medido.
  const css =
    ':where([data-ds-corpo="d"]):is(.veu){background-color:rgba(20, 20, 30, 0.5)}' +
    ':where([data-ds-corpo="d"]):is(.tinta){color:var(--marca-heading, #fff)}';
  const mapa = mapearClassesPorPapel(css);
  assert.equal(mapa.fundoLiteral.get('veu'), undefined, 'veu translucido nao e superficie');
});
