import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MOVIMENTO_PADRAO, tokensDeMovimento } from '@ds/composer';
import {
  ESPERA_DA_REDE_MS,
  SCRIPT_DA_REDE_DE_SEGURANCA,
  SCRIPT_DA_REVELACAO,
  cssDaRevelacao,
  destravarRevelacaoSemGatilho,
  marcarAlvosDeRevelacao,
} from './movimento-da-pagina.js';

const PAGINA = [
  '<section data-secao="nav" data-fixa-no-topo><nav>menu</nav></section>',
  '<section data-secao="hero"><h1>Título</h1></section>',
  '<section data-secao="features"><div>peças</div></section>',
  '<section data-secao="cta"><a>Fale conosco</a></section>',
  '<section data-secao="footer"><small>rodapé</small></section>',
].join('\n');

test('marcarAlvosDeRevelacao pula a primeira seção, a nav, o rodapé e a fixa', () => {
  const r = marcarAlvosDeRevelacao(PAGINA);
  const marcada = (papel: string) =>
    new RegExp(`<section[^>]*data-secao="${papel}"[^>]*data-orbis-revelar`).test(r.html);

  assert.equal(marcada('nav'), false, 'a nav é moldura, e ainda é sticky');
  assert.equal(marcada('footer'), false, 'o rodapé é moldura');
  assert.equal(marcada('features'), true);
  assert.equal(marcada('cta'), true);
  assert.equal(r.marcados, 3, 'hero, features e cta');
});

test('a PRIMEIRA seção não é escondida, nem quando é conteúdo', () => {
  // Ela nasce na dobra visível: escondê-la entrega tela em branco no primeiro
  // instante do carregamento.
  const r = marcarAlvosDeRevelacao(
    '<section data-secao="hero"><h1>x</h1></section>\n<section data-secao="cta"><a>y</a></section>',
  );
  assert.equal(r.marcados, 1);
  assert.ok(!/data-secao="hero"[^>]*data-orbis-revelar/.test(r.html));
  assert.ok(/data-secao="cta"[^>]*data-orbis-revelar/.test(r.html));
});

test('marcar duas vezes não duplica o atributo', () => {
  const uma = marcarAlvosDeRevelacao(PAGINA);
  const duas = marcarAlvosDeRevelacao(uma.html);
  assert.equal(duas.marcados, 0);
  assert.equal((duas.html.match(/data-orbis-revelar/g) ?? []).length, 3);
});

/**
 * A trava que impede a página de nascer invisível num navegador sem o
 * observador. É a mesma disciplina condicional de `limparEstadoRevelado`.
 */
test('o estado escondido só existe sob o atributo que o script liga', () => {
  const css = cssDaRevelacao(MOVIMENTO_PADRAO, 'sutil');
  const escondido = css
    .split('\n')
    .findIndex((l) => l.includes('opacity:0') && !l.includes('!important'));
  assert.ok(escondido > 0, 'existe um estado escondido');
  assert.match(
    css.split('\n')[escondido - 1] ?? '',
    /html\[data-orbis-movimento="ligado"\]/,
    'o seletor do estado escondido exige o atributo que o script põe',
  );
  assert.ok(!/^\s*\[data-orbis-revelar\]\{[^}]*opacity:0/m.test(css), 'nada esconde sem a trava');
});

test('o revelado volta a transform:none — nunca translateY(0)', () => {
  // `transform` permanente, ainda que identidade, cria containing block e
  // quebra qualquer `position:fixed` descendente (menu, modal, camada de fundo).
  const css = cssDaRevelacao(MOVIMENTO_PADRAO, 'sutil');
  assert.match(css, /\[data-orbis-revelar\]\{\n\s*opacity:1;transform:none;/);
  assert.ok(!css.includes('translateY(0)'));
});

test('a duração e a curva saem MEDIDAS do CSS do kit, não de constante', () => {
  const cssDoKit = '.a{transition:opacity 120ms ease-out}.b{transition:transform 640ms ease-out}';
  const t = tokensDeMovimento(cssDoKit);
  const css = cssDaRevelacao(t, 'sutil');
  assert.ok(t.amostras > 0, 'a medição aconteceu');
  assert.ok(css.includes(`--orbis-duracao-media: ${t.mediaMs}ms`), 'a mediana medida entra no CSS');
  assert.ok(css.includes(`--orbis-easing: ${t.easing}`), 'a curva mais frequente do kit');
  assert.match(css, /transition:opacity var\(--orbis-duracao-media\) var\(--orbis-easing\)/);
});

test('expressiva desloca mais que sutil, e as duas respeitam reduced-motion', () => {
  const sutil = cssDaRevelacao(MOVIMENTO_PADRAO, 'sutil');
  const forte = cssDaRevelacao(MOVIMENTO_PADRAO, 'expressiva');
  assert.match(sutil, /translateY\(16px\)/);
  assert.match(forte, /translateY\(28px\)/);
  for (const css of [sutil, forte]) {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
    assert.match(css, /opacity:1!important;transform:none!important;transition:none!important/);
  }
});

test('o script confere o suporte ANTES de ligar o estado escondido', () => {
  const corpo = SCRIPT_DA_REVELACAO;
  const guarda = corpo.indexOf("IntersectionObserver' in window");
  const liga = corpo.indexOf("setAttribute('data-orbis-movimento'");
  assert.ok(guarda > -1 && liga > -1);
  assert.ok(guarda < liga, 'a checagem de suporte vem primeiro; invertido, a página nasce cega');
  assert.match(corpo, /rootMargin:'0px 0px -10% 0px'/);
  assert.match(corpo, /unobserve/, 'revelar é de mão única');
});

/**
 * O conteúdo preso a um ancestral que nunca chega é destravado.
 *
 * Medido no banco de prova: 8 de 12 kits entregavam uma seção inteira em
 * `opacity: 0`. Não era a limpeza do estado revelado (não havia classe no HTML
 * para limpar) — era o CSS da origem escondendo o elemento até que um ANCESTRAL
 * ganhasse `.in-view`, coisa que o script da origem faz e que não alcança a
 * página composta.
 */
test('classe presa a ancestral ausente é destravada', () => {
  const css = [
    ':where([data-ds-corpo="ds_a"]):is(.animate-fade-up){opacity:0;transform:translateY(20px)}',
    ':where([data-ds-corpo="ds_a"]):is(.in-view .animate-fade-up){opacity:1;transform:none}',
  ].join('\n');
  const html = '<section><h2 class="animate-fade-up">Título</h2></section>';
  const r = destravarRevelacaoSemGatilho(css, html);
  assert.deepEqual(r.classes, ['animate-fade-up']);
  assert.match(r.css, /\.animate-fade-up\{[^}]*opacity:1!important/);
});

test('com o ancestral PRESENTE na página, nada é destravado', () => {
  const css = ['.animate-fade-up{opacity:0}', '.in-view .animate-fade-up{opacity:1}'].join('\n');
  const html = '<section class="in-view"><h2 class="animate-fade-up">Título</h2></section>';
  const r = destravarRevelacaoSemGatilho(css, html);
  assert.deepEqual(r.classes, [], 'a revelação funciona: não mexer');
  assert.equal(r.css, '');
});

test('opacity 0 SEM par de revelação não é tocado', () => {
  // Sobreposição decorativa que deve mesmo ficar invisível até o hover.
  const css = '.overlay{opacity:0}.card:hover .overlay{opacity:1}';
  const html = '<div class="card"><div class="overlay">x</div></div>';
  const r = destravarRevelacaoSemGatilho(css, html);
  assert.deepEqual(r.classes, [], 'hover não é revelação por rolagem');
});

test('o primeiro quadro de um @keyframes não conta como escondido', () => {
  const css = '@keyframes entra{from{opacity:0}to{opacity:1}}.x{animation:entra 1s}';
  const html = '<div class="x">y</div>';
  const r = destravarRevelacaoSemGatilho(css, html);
  assert.deepEqual(r.classes, []);
});

/**
 * A forma REAL do acervo: animação pausada, e o ancestral dá play.
 *
 * A primeira versão do destrave só conhecia `opacity:0` ⟷ `opacity:1` e não
 * casou com nada. O CSS composto mostrou o mecanismo de verdade: a origem
 * esconde com opacidade zero E uma animação pausada, e
 * `:is(.in-view) .animate-scale{animation-play-state:running}` é quem aperta o
 * play. Sem o ancestral, a animação nunca roda e o conteúdo não volta.
 */
test('animação PAUSADA esperando ancestral ausente é destravada', () => {
  const css = [
    ':where([data-ds-corpo="ds_a"]):is(.animate-scale){opacity:0;animation:entra 1s both;animation-play-state:paused}',
    ':where([data-ds-corpo="ds_a"]):is(.in-view) .animate-scale{animation-play-state:running}',
  ].join('\n');
  const html = '<section><div class="animate-scale">Conteúdo</div></section>';
  const r = destravarRevelacaoSemGatilho(css, html);
  assert.deepEqual(r.classes, ['animate-scale']);
  assert.match(r.css, /animation-play-state:running!important/);
});

test('decisão é POR CLASSE: a que tem seu revelador na página não é tocada', () => {
  const css = [
    '.presa{opacity:0}',
    '.aos-animate .presa{opacity:1}',
    '.viva{opacity:0}',
    '.in-view .viva{opacity:1}',
  ].join('\n');
  // A página tem `.in-view`, mas não tem `.aos-animate`.
  const html = '<div class="in-view"><span class="viva">a</span></div><span class="presa">b</span>';
  const r = destravarRevelacaoSemGatilho(css, html);
  assert.deepEqual(r.classes, ['presa'], 'só a que ficou sem revelador');
});

test('a rede de seguranca acende o que ENTROU na tela e nao acendeu', () => {
  // CSS nao alcanca este caso: `gsap.from(alvo,{opacity:0})` escreve no style em
  // tempo de execucao, e nao ha regra para a analise estatica achar. Medido: dos
  // 54 trechos apagados que restavam, 52 eram a mesma classe de uma origem so.
  const s = SCRIPT_DA_REDE_DE_SEGURANCA;
  assert.match(s, /addEventListener\('scroll',agendar/, 'o gatilho e PARAR de rolar');
  assert.match(s, /function naTela/, 'so o que esta na tela agora');
  assert.match(s, new RegExp(String(ESPERA_DA_REDE_MS)), 'espera a animacao de entrada');
  assert.match(s, /clearTimeout\(tarefa\)/, 'rolagem em curso adia a varredura');
  // As tres guardas que ja custaram regressao nesta frente.
  assert.match(s, /pointerEvents==='none'/, 'hover-revelado nao e defeito');
  assert.match(s, /nodeType===3/, 'observa quem tem TEXTO proprio — e o que a regua mede');
  // Mas ACENDE o ancestral que zerou: quem carrega a opacidade e o container, e
  // o texto esta nos filhos. Observar e acender o mesmo elemento nao acendeu
  // nada — medido: zero marcas em seis sites com 111 trechos apagados.
  assert.match(s, /function culpado/, 'sobe ate quem zerou');
  assert.match(s, /var alvo=culpado\(el\)/, 'o conserto pousa no culpado, nao na folha');
  assert.match(s, /PISO=0\.35/, 'o mesmo piso da regua');
  // E o conserto tem de VENCER o inline que a biblioteca escreveu.
  assert.match(s, /setProperty\('opacity','1','important'\)/);
});
