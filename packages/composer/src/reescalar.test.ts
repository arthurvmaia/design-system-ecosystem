import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ReguaAlinhada } from '@ds/shared';
import { type ReguasDeEscala, reescalarCss } from './reescalar.js';

/**
 * A régua da marca alcançando as peças.
 *
 * O defeito: a família da fonte já valia dentro das peças, o TAMANHO não. Um kit
 * que junta o hero de um site com os preços de outro saía com título de 64px em
 * cima e de 40px embaixo — não porque alguém escolheu, mas porque dois
 * designers escolheram, em dois sites diferentes.
 *
 * Metade destes testes trava o que a reescrita FAZ; a outra metade trava o que
 * ela se recusa a fazer, que aqui vale igual: um comprimento convertido errado
 * não aparece como erro, aparece como layout torto.
 */

const regua = (pares: readonly (readonly [number, string])[]): ReguaAlinhada => ({
  porValor: new Map(pares.map(([v, t]) => [v, t])),
});

const REGUAS: ReguasDeEscala = {
  tipografia: regua([
    [16, '--marca-passo-2'],
    [48, '--marca-passo-5'],
  ]),
  espaco: regua([
    [12, '--marca-espaco-2'],
    [24, '--marca-espaco-4'],
  ]),
  raio: regua([
    [8, '--marca-raio-1'],
    [20, '--marca-raio-3'],
  ]),
};

const VAZIAS: ReguasDeEscala = { tipografia: regua([]), espaco: regua([]), raio: regua([]) };

// ── A reescrita ──────────────────────────────────────────────────────────────

test('a declaração passa a consumir o degrau, com o literal original de fallback', () => {
  const r = reescalarCss('h1{font-size:48px}.x{padding:24px}', REGUAS);
  assert.equal(
    r.css,
    'h1{font-size:var(--marca-passo-5, 48px)}.x{padding:var(--marca-espaco-4, 24px)}',
  );
  assert.equal(r.reescritas, 2);
});

test('o fallback é o literal ORIGINAL — sem marca, a peça fica com o tamanho de origem', () => {
  // O invariante que faz a degradação ser segura: régua ausente no navegador
  // devolve exatamente o que estava lá, e não um tamanho aleatório.
  const r = reescalarCss('h1{font-size:48px}', REGUAS);
  assert.ok(r.css.includes(', 48px)'), `perdeu o literal: ${r.css}`);
});

test('NUNCA declara --marca-*, só consome', () => {
  // O invariante que faz a herança funcionar: a origem não declara nada nesse
  // namespace, então não há proxy no caminho para interceptar o :root da marca.
  const r = reescalarCss('h1{font-size:48px;padding:12px;gap:24px;border-radius:8px}', REGUAS);
  assert.ok(!/--marca-(passo|espaco|raio)-\d+\s*:/.test(r.css), `declarou o token: ${r.css}`);
});

test('cada eixo só alcança as suas propriedades', () => {
  // 24 está nas TRÊS réguas, com tokens diferentes. Se um eixo vazasse, o
  // respiro passaria a seguir a escala tipográfica, ou o canto passaria a seguir
  // a do respiro — e ninguém veria o erro, só a peça torta.
  const cruzadas: ReguasDeEscala = {
    tipografia: regua([[24, '--marca-passo-4']]),
    espaco: regua([[24, '--marca-espaco-3']]),
    raio: regua([[24, '--marca-raio-2']]),
  };
  const r = reescalarCss(
    'h1{font-size:24px;padding:24px;padding-left:24px;margin-top:24px;gap:24px;row-gap:24px;column-gap:24px;border-radius:24px}',
    cruzadas,
  );
  assert.match(r.css, /font-size:var\(--marca-passo-4, 24px\)/);
  assert.match(r.css, /padding:var\(--marca-espaco-3, 24px\)/);
  assert.match(r.css, /padding-left:var\(--marca-espaco-3, 24px\)/);
  assert.match(r.css, /margin-top:var\(--marca-espaco-3, 24px\)/);
  assert.match(r.css, /gap:var\(--marca-espaco-3, 24px\)/);
  assert.match(r.css, /row-gap:var\(--marca-espaco-3, 24px\)/);
  assert.match(r.css, /column-gap:var\(--marca-espaco-3, 24px\)/);
  assert.match(r.css, /border-radius:var\(--marca-raio-2, 24px\)/);
  assert.equal(r.reescritas, 8);
});

test('layout não é escala, e fica de fora', () => {
  // `width`, `height` e `top` são medida de CAIXA: escalar largura pelo respiro
  // apertaria ou estouraria a peça na página. `line-height` é proporção do
  // texto, e trocá-la por um degrau de letra colaria as linhas.
  const cruzadas: ReguasDeEscala = {
    tipografia: regua([[24, '--marca-passo-4']]),
    espaco: regua([[24, '--marca-espaco-3']]),
    raio: regua([[24, '--marca-raio-2']]),
  };
  const css = '.x{width:24px;height:24px;top:24px;line-height:24px}';
  const r = reescalarCss(css, cruzadas);
  assert.equal(r.css, css);
  assert.equal(r.reescritas, 0);
  assert.equal(r.mantidas, 0);
});

test('rem converte pela raiz de 16, e o fallback continua em rem', () => {
  // Guardar `48px` no fallback trocaria a unidade que a origem escolheu: um site
  // que respeita o tamanho de letra do sistema perderia isso na degradação.
  const r = reescalarCss('h1{font-size:3rem}.x{padding:0.75rem}', REGUAS);
  assert.match(r.css, /font-size:var\(--marca-passo-5, 3rem\)/);
  assert.match(r.css, /padding:var\(--marca-espaco-2, 0\.75rem\)/);
  assert.equal(r.reescritas, 2);
});

test('é idempotente: rodar duas vezes não aninha fallback', () => {
  const uma = reescalarCss('h1{font-size:48px;padding:12px 24px;border-radius:8px}', REGUAS);
  const duas = reescalarCss(uma.css, REGUAS);
  assert.equal(duas.reescritas, 0);
  assert.equal(uma.css, duas.css);
});

test('shorthand reescreve cada comprimento por conta própria', () => {
  // 40px não está na régua. O que casou vira degrau, o que não casou fica
  // literal ao lado — reescrever o shorthand inteiro ou nada seria pior nos dois
  // sentidos.
  const r = reescalarCss('.x{padding:12px 40px}', REGUAS);
  assert.equal(r.css, '.x{padding:var(--marca-espaco-2, 12px) 40px}');
  assert.equal(r.reescritas, 1);
  assert.equal(r.mantidas, 1);
});

test('o !important sobrevive', () => {
  const r = reescalarCss('.x{padding:12px!important}', REGUAS);
  assert.match(r.css, /var\(--marca-espaco-2, 12px\)\s*!important/);
});

// ── O raio de canto ──────────────────────────────────────────────────────────

test('o atalho e os quatro cantos consomem o degrau do raio', () => {
  // Card com o atalho e barra com um canto só são a MESMA decisão de desenho.
  // Tokenizar só uma delas deixaria a peça com dois cantos da marca e dois da
  // origem, que é pior do que não ter mexido em nenhum.
  const r = reescalarCss(
    '.a{border-radius:8px}.b{border-top-left-radius:8px;border-top-right-radius:20px;border-bottom-right-radius:8px;border-bottom-left-radius:20px}',
    REGUAS,
  );
  assert.match(r.css, /\.a\{border-radius:var\(--marca-raio-1, 8px\)\}/);
  assert.match(r.css, /border-top-left-radius:var\(--marca-raio-1, 8px\)/);
  assert.match(r.css, /border-top-right-radius:var\(--marca-raio-3, 20px\)/);
  assert.match(r.css, /border-bottom-right-radius:var\(--marca-raio-1, 8px\)/);
  assert.match(r.css, /border-bottom-left-radius:var\(--marca-raio-3, 20px\)/);
  assert.equal(r.reescritas, 5);
});

test('O TESTE QUE IMPORTA: 50% é círculo, não degrau, e fica intocado', () => {
  // `border-radius:50%` é a FORMA da peça — o avatar redondo, o ponto do
  // carrossel. Trocar isso por um raio fixo viraria um quadrado de cantos
  // mansos, e o defeito apareceria como desenho errado, nunca como erro.
  const css = '.avatar{border-radius:50%}.ponto{border-radius:100%}';
  const r = reescalarCss(css, REGUAS);
  assert.equal(r.css, css);
  assert.equal(r.reescritas, 0);
  assert.equal(r.mantidas, 2, 'foram candidatos e foram recusados, e o placar diz isso');
});

test('a pílula (9999px) não casa com degrau nenhum e continua pílula', () => {
  // O truque de raio gigante para "arredonda tudo" está longe de qualquer
  // degrau medido, e a tolerância de meio pixel não o alcança. Fica literal.
  const r = reescalarCss('.pilula{border-radius:9999px}', REGUAS);
  assert.equal(r.css, '.pilula{border-radius:9999px}');
  assert.equal(r.reescritas, 0);
  assert.equal(r.mantidas, 1);
});

test('shorthand de raio reescreve cada canto por conta própria', () => {
  // `8px 8px 0 0` é a aba de cima arredondada e a de baixo reta. Os zeros são
  // canto vivo de propósito: tokenizá-los arredondaria o que o desenho queria
  // reto.
  const r = reescalarCss('.aba{border-radius:8px 8px 0 0}', REGUAS);
  assert.equal(r.css, '.aba{border-radius:var(--marca-raio-1, 8px) var(--marca-raio-1, 8px) 0 0}');
  assert.equal(r.reescritas, 2);
  assert.equal(r.mantidas, 2);
});

test('o raio elíptico com barra separada reescreve os dois lados', () => {
  // `8px / 20px` são os raios horizontal e vertical, e cada um é um comprimento.
  // A barra não é candidata a nada e passa inteira.
  const r = reescalarCss('.x{border-radius:8px / 20px}', REGUAS);
  assert.equal(r.css, '.x{border-radius:var(--marca-raio-1, 8px) / var(--marca-raio-3, 20px)}');
  assert.equal(r.reescritas, 2);
});

test('a barra grudada não é comprimento e o valor fica inteiro', () => {
  // `8px/20px` chega como um pedaço só, que não casa com a forma de comprimento.
  // Fica como está — degradar para "não reescreveu" é o certo aqui.
  const css = '.x{border-radius:8px/20px}';
  const r = reescalarCss(css, REGUAS);
  assert.equal(r.css, css);
  assert.equal(r.reescritas, 0);
});

test('sem régua de raio, o canto da origem continua valendo', () => {
  // A degradação por eixo: kit antigo, sem raio medido, mantém o canto de origem
  // enquanto tamanho e respiro seguem a marca. Perder um eixo não custa os
  // outros.
  const semRaio: ReguasDeEscala = {
    tipografia: REGUAS.tipografia,
    espaco: REGUAS.espaco,
    raio: regua([]),
  };
  const r = reescalarCss('.x{border-radius:8px;padding:12px}', semRaio);
  assert.equal(r.css, '.x{border-radius:8px;padding:var(--marca-espaco-2, 12px)}');
  assert.equal(r.reescritas, 1);
});

test('só o raio medido já basta para a reescrita acontecer', () => {
  // O atalho de saída antecipada olha os TRÊS eixos. Se olhasse só dois, uma
  // origem que só tem raio medido sairia sem reescrita nenhuma, em silêncio.
  const soRaio: ReguasDeEscala = {
    tipografia: regua([]),
    espaco: regua([]),
    raio: regua([[8, '--marca-raio-1']]),
  };
  const r = reescalarCss('.x{border-radius:8px}', soRaio);
  assert.equal(r.css, '.x{border-radius:var(--marca-raio-1, 8px)}');
  assert.equal(r.reescritas, 1);
});

// ── O que ela se recusa a fazer ──────────────────────────────────────────────

test('em, %, calc, clamp, min, max e var são pulados e contam em mantidas', () => {
  // Todos dependem de contexto que o CSS estático não dá. Chutar aqui produz
  // layout errado, que é pior que não escalar.
  const css = [
    '.a{font-size:3em}',
    '.b{font-size:100%}',
    '.c{font-size:calc(3rem + 2px)}',
    '.d{font-size:clamp(1rem,2vw,3rem)}',
    '.e{padding:min(24px,5%)}',
    '.f{padding:max(12px,1vw)}',
    '.g{font-size:var(--tamanho-do-site)}',
  ].join('');
  const r = reescalarCss(css, REGUAS);
  assert.equal(r.css, css);
  assert.equal(r.reescritas, 0);
  assert.equal(r.mantidas, 7);
});

test('zero e negativo não são degrau', () => {
  // Zero é ausência de respiro: tokenizá-lo injetaria espaço onde o desenho não
  // tinha nenhum. Negativo é técnica de puxar, não respiro — escalar moveria a
  // peça de lugar.
  const r = reescalarCss('.x{margin:-24px 0 12px 0px}', REGUAS);
  assert.equal(r.css, '.x{margin:-24px 0 var(--marca-espaco-2, 12px) 0px}');
  assert.equal(r.reescritas, 1);
  assert.equal(r.mantidas, 3);
});

test('palavra-chave não é comprimento e nem entra no placar', () => {
  const r = reescalarCss('.x{margin:0 auto}.y{font-size:inherit}', REGUAS);
  assert.equal(r.css, '.x{margin:0 auto}.y{font-size:inherit}');
  assert.equal(r.reescritas, 0);
  // Só o `0`. `auto` e `inherit` não são candidatos a comprimento.
  assert.equal(r.mantidas, 1);
});

test('o @font-face não é reescrito', () => {
  // Ali dentro nada descreve o tamanho de um texto na página: é a definição da
  // fonte, e mexer no descritor mexeria na seleção do arquivo.
  const css = '@font-face{font-family:"Inter";src:url(a.woff2);font-size:48px}h1{font-size:48px}';
  const r = reescalarCss(css, REGUAS);
  assert.ok(
    r.css.includes('@font-face{font-family:"Inter";src:url(a.woff2);font-size:48px}'),
    `mexeu no @font-face: ${r.css}`,
  );
  assert.equal(r.reescritas, 1);
});

test('régua vazia devolve o CSS igual', () => {
  const css = 'h1{font-size:48px;padding:24px}';
  const r = reescalarCss(css, VAZIAS);
  assert.equal(r.css, css);
  assert.equal(r.reescritas, 0);
  assert.equal(r.mantidas, 0);
});

test('CSS ilegível não derruba nada', () => {
  const css = 'h1{font-size:';
  const r = reescalarCss(css, REGUAS);
  assert.equal(r.css, css);
  assert.equal(r.reescritas, 0);
});

test('o que não casa não é reformatado de passagem', () => {
  const css = '.x{padding:  40px   40px  }';
  assert.equal(reescalarCss(css, REGUAS).css, css);
});

// ── A tolerância ─────────────────────────────────────────────────────────────

test('ruído de medição ainda casa: 15.98 é o degrau de 16', () => {
  // Os degraus saem de medição de navegador, e o que o designer escreveu como um
  // tamanho só chega como 15.98 e 16. Comparação exata perderia metade dos
  // casamentos.
  const r = reescalarCss('p{font-size:15.98px}', REGUAS);
  assert.match(r.css, /var\(--marca-passo-2, 15\.98px\)/);
});

test('um pixel inteiro de diferença já é outro tamanho', () => {
  const r = reescalarCss('p{font-size:17px}', REGUAS);
  assert.equal(r.reescritas, 0);
  assert.equal(r.mantidas, 1);
});

test('entre dois degraus próximos ganha o mais perto, sempre o mesmo', () => {
  // A saída tem de ser determinística: duas gerações do mesmo kit produzem o
  // mesmo site.
  const proximas: ReguasDeEscala = {
    tipografia: regua([
      [15.98, '--marca-passo-2'],
      [16.4, '--marca-passo-3'],
    ]),
    espaco: regua([]),
    raio: regua([]),
  };
  const r = reescalarCss('p{font-size:16px}', proximas);
  assert.match(r.css, /var\(--marca-passo-2, 16px\)/);
});

test('dentro de @keyframes nada é reescalado: passo é amplitude, não tamanho', () => {
  // O risco não é estético, é a animação PARAR. A régua da marca é grossa de
  // propósito; dois passos vizinhos de um movimento podem cair no mesmo degrau,
  // e aí o começo e o fim ficam iguais — o elemento não sai do lugar. E o CSS
  // continua perfeitamente válido, então nada denuncia.
  const r = reescalarCss(
    '@keyframes desliza{from{padding-left:12px}to{padding-left:24px}}.t{padding-left:12px}',
    REGUAS,
  );
  // Os dois passos continuam DIFERENTES entre si — que é o movimento.
  assert.match(r.css, /from\{padding-left:12px\}/, 'o passo inicial fica no valor de origem');
  assert.match(r.css, /to\{padding-left:24px\}/, 'e o final também');
  // Fora da at-rule a reescala segue valendo: o guarda é cirúrgico.
  assert.match(r.css, /\.t\{padding-left:var\(--marca-espaco-2/, 'o ponto de uso é reescalado');
});
