import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type EscalaDaOrigem, type ProjectBranding, nomeDoEspaco, nomeDoPasso } from '@ds/shared';
import { buildBrandingCss } from './index.js';

const branding: ProjectBranding = {
  palette: {
    primary: '#c62828',
    background: '#0b0b0e',
    foreground: '#f5f5f4',
    accent: '#e03535',
  },
  typography: { display: 'Playfair Display', body: 'Inter' },
  // O regime tem `default` no schema, então o tipo de SAÍDA o exige. Quem
  // resolve a régua é a montagem da página; aqui ele só completa o branding.
  escalaDoSite: 'da-marca',
};

test('buildBrandingCss aplica a tipografia escolhida ao site gerado', () => {
  const css = buildBrandingCss(branding);
  // A fonte de títulos vai para os headings; a de corpo, para o body.
  assert.match(css, /h1,h2,h3,h4,h5,h6\{font-family:var\(--font-display\)\}/);
  assert.match(css, /body\{font-family:var\(--font-body\)\}/);
  // As variáveis carregam a pilha com fallback (não a string crua de antes).
  assert.match(css, /--font-display:"Playfair Display", Georgia/);
  assert.match(css, /--font-body:Inter, Arial/);
});

test('buildBrandingCss aplica a paleta escolhida (identidade do site)', () => {
  const css = buildBrandingCss(branding);
  assert.match(css, /--brand-primary: #c62828/);
  assert.match(css, /--brand-bg: #0b0b0e/);
  assert.match(css, /--primary: var\(--brand-primary\)/, 'sobrescreve o primary dos componentes');
});

// ── A escala da marca: quem DECLARA os degraus que as peças consomem ─────────

/** Uma régua medida: quatro degraus de letra e três de respiro. */
const escala: EscalaDaOrigem = {
  degraus: [12, 16, 24, 40],
  corpo: 16,
  display: 40,
  espacos: [4, 8, 16],
  raios: [8],
};

/** Quantas vezes um trecho literal aparece no CSS. */
const vezes = (css: string, trecho: string): number => css.split(trecho).length - 1;

test('buildBrandingCss sem régua medida produz o CSS de antes, byte a byte', () => {
  // As três formas de "ninguém mediu a escala deste kit": kit sem consolidação
  // de escala, origem sem régua eleita, e captura antiga (degraus vazios).
  const semEscala = buildBrandingCss(branding);
  const semRegua = buildBrandingCss(branding, null);
  const reguaVazia = buildBrandingCss(branding, {
    degraus: [],
    corpo: null,
    display: null,
    espacos: [],
    raios: [],
  });

  assert.equal(semRegua, semEscala, 'régua nula não muda o CSS');
  assert.equal(reguaVazia, semEscala, 'régua sem degrau medido não muda o CSS');
  assert.ok(!semEscala.includes('--marca-passo'), 'nenhum passo declarado');
  assert.ok(!semEscala.includes('--marca-espaco'), 'nenhum espaço declarado');

  // Respiro sem degrau de letra também não declara nada: quem elege a régua de
  // referência (`escalaDeReferencia`) só olha para os degraus, então uma régua
  // que chega sem eles não foi eleita por ninguém.
  const soEspacos = buildBrandingCss(branding, {
    degraus: [],
    corpo: null,
    display: null,
    espacos: [8, 16],
    raios: [],
  });
  assert.equal(soEspacos, semEscala, 'espaço sem degrau não é régua');

  // E a prova de que a ÚNICA diferença que a régua introduz são as declarações
  // novas: tirando essas linhas, o CSS com escala volta a ser o de antes. Um
  // site já gerado não pode mudar de aparência porque o motor aprendeu a medir.
  const comEscala = buildBrandingCss(branding, escala);
  const semAsLinhasNovas = comEscala
    .split('\n')
    .filter(
      (l) =>
        !l.trimStart().startsWith('--marca-passo') && !l.trimStart().startsWith('--marca-espaco'),
    )
    .join('\n');
  assert.equal(semAsLinhasNovas, semEscala);
});

test('buildBrandingCss declara um token por degrau, na ordem da régua', () => {
  const css = buildBrandingCss(branding, escala);

  for (const [i, px] of escala.degraus.entries()) {
    assert.equal(vezes(css, `${nomeDoPasso(i)}: ${px}px;`), 1, `passo ${i + 1} declarado uma vez`);
  }
  for (const [i, px] of escala.espacos.entries()) {
    assert.equal(
      vezes(css, `${nomeDoEspaco(i)}: ${px}px;`),
      1,
      `espaço ${i + 1} declarado uma vez`,
    );
  }

  // A ordem é a da régua: o índice do token é a identidade do degrau, e ler o
  // `:root` de cima para baixo tem de dar a mesma sequência que foi medida.
  const posicoes = escala.degraus.map((_, i) => css.indexOf(`${nomeDoPasso(i)}:`));
  assert.ok(!posicoes.includes(-1), 'todos os passos saíram no CSS');
  assert.deepEqual(
    [...posicoes].sort((a, b) => a - b),
    posicoes,
  );
});

test('buildBrandingCss usa o nome de token que a reescrita das peças consome', () => {
  const css = buildBrandingCss(branding, escala);
  // Sem redigitar o nome: ele vem de @ds/shared, a mesma fonte que a peça usa
  // para montar o `var(--marca-passo-N, <literal>)`. Nome à mão nas duas pontas
  // é como elas divergem sem ninguém perceber.
  assert.ok(css.includes(`${nomeDoPasso(0)}: 12px;`));
  assert.ok(css.includes(`${nomeDoEspaco(2)}: 16px;`));
  assert.equal(nomeDoPasso(0), '--marca-passo-1', 'o token é 1-based, como a peça espera');
});

test('buildBrandingCss não desloca os vizinhos por causa de um degrau impossível', () => {
  // `Infinity` passa pelo `positive()` do schema. Declarar `Infinitypx` seria
  // lixo, e REMOVER o degrau seria pior: o terceiro degrau viraria o segundo e
  // `--marca-passo-3` passaria a nomear outro tamanho do que a peça pediu.
  const css = buildBrandingCss(branding, {
    ...escala,
    degraus: [12, Number.POSITIVE_INFINITY, 24],
  });

  assert.ok(css.includes('--marca-passo-1: 12px;'));
  assert.ok(!css.includes('--marca-passo-2'), 'o degrau impossível não vira declaração');
  assert.ok(css.includes('--marca-passo-3: 24px;'), 'o vizinho de baixo mantém o índice');
  assert.ok(!css.includes('Infinity'));
});

test('buildBrandingCss mantém a escala por tag ao lado dos tokens da régua', () => {
  // Os dois não disputam: a escala por tag pinta h1..h6 (especificidade 0,0,1)
  // e os tokens existem para o ponto de uso dentro das peças, onde a classe
  // utilitária da origem ganharia da tag.
  const comTipografia: ProjectBranding = {
    ...branding,
    tipografia: {
      display: 'Playfair Display',
      body: 'Inter',
      presetTitulos: 'equilibrada',
      presetCorpo: 'confortavel',
    },
  };
  const css = buildBrandingCss(comTipografia, escala);

  assert.match(css, /h1 \{ font-size: [\d.]+rem; \}/, 'a escala por tag continua saindo');
  assert.match(css, /body \{ font-size: 16px;/);
  assert.ok(css.includes('--marca-passo-4: 40px;'), 'e os tokens da régua saem junto');
});
