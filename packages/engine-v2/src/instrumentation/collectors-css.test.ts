import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { RawCss } from '../mapper/raw.js';
import { COLETAR_CSS_FN } from './collectors.js';

/**
 * Teste do coletor de CSS SEM navegador: `COLETAR_CSS_FN` é JS de navegador
 * puro, sem imports e sem `window` — só toca em `document`. Então dá para
 * avaliá-lo em Node contra um `document` de mentira e verificar o contrato
 * (ordem de documento, origem por folha, teto de regras) sem Playwright.
 * O `engine.browser.test.ts` continua exercitando o coletor num navegador
 * real quando ele está instalado.
 */

const coletar = new Function('document', `return (${COLETAR_CSS_FN})();`) as (
  doc: unknown,
) => RawCss[];

/** Regras de CSSOM de mentira — só o `cssText` que o coletor lê. */
const regras = (...css: string[]): Array<{ cssText: string }> =>
  css.map((cssText) => ({ cssText }));

type DocFake = {
  styleSheets?: unknown[];
  adoptedStyleSheets?: unknown[];
  links?: Array<{ href: string }>;
  elementos?: unknown[];
};

/** `document` de mentira com o mínimo que o coletor consulta. */
const docFake = (cfg: DocFake): unknown => ({
  styleSheets: cfg.styleSheets ?? [],
  adoptedStyleSheets: cfg.adoptedStyleSheets ?? [],
  querySelectorAll: (seletor: string): unknown[] =>
    seletor === 'link[rel="stylesheet"]' ? (cfg.links ?? []) : (cfg.elementos ?? []),
});

const estiloComTexto = (texto: string): unknown => ({
  ownerNode: { tagName: 'STYLE', textContent: texto },
});

const linkCarregado = (href: string): unknown => ({
  ownerNode: { tagName: 'LINK' },
  href,
});

test('a ordem do documento é preservada — <link> entre <style> não vai para o fim', () => {
  const out = coletar(
    docFake({
      styleSheets: [
        estiloComTexto('.a{color:red}'),
        linkCarregado('https://cdn.exemplo.com/app.css'),
        estiloComTexto('.b{color:blue}'),
      ],
    }),
  );
  assert.deepEqual(
    out.map((f) => f.origem),
    ['style', 'link', 'style'],
  );
  assert.deepEqual(
    out.map((f) => f.ordem),
    [0, 1, 2],
  );
  assert.equal(out[0]?.content, '.a{color:red}');
  assert.equal(out[1]?.href, 'https://cdn.exemplo.com/app.css');
  assert.equal(out[1]?.inline, false);
  assert.equal(out[1]?.content, undefined, 'folha externa sai só com o href');
  assert.equal(out[2]?.content, '.b{color:blue}');
});

test('<style> vazio (CSS-in-JS) serializa as regras do CSSOM', () => {
  const out = coletar(
    docFake({
      styleSheets: [
        {
          ownerNode: { tagName: 'STYLE', textContent: '' },
          cssRules: regras('.sc-abc { color: red; }', '.sc-def { margin: 0; }'),
        },
      ],
    }),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.origem, 'cssom');
  assert.equal(out[0]?.viaCssom, true);
  assert.equal(out[0]?.inline, true);
  assert.ok(out[0]?.content?.includes('.sc-abc { color: red; }'));
  assert.ok(out[0]?.content?.includes('.sc-def { margin: 0; }'));
});

test('folha de <link> cross-origin sai com href sem que cssRules seja lido', () => {
  const out = coletar(
    docFake({
      styleSheets: [
        {
          ownerNode: { tagName: 'LINK' },
          href: 'https://fonts.googleapis.com/css2?family=Inter',
          get cssRules(): never {
            // O navegador lança SecurityError aqui; o coletor não pode tentar.
            throw new Error('SecurityError');
          },
        },
      ],
    }),
  );
  assert.equal(out.length, 1);
  assert.equal(out[0]?.origem, 'link');
  assert.equal(out[0]?.href, 'https://fonts.googleapis.com/css2?family=Inter');
});

test('<link> que não carregou entra pelo fallback, sem duplicar os carregados', () => {
  const out = coletar(
    docFake({
      styleSheets: [linkCarregado('https://cdn.exemplo.com/app.css')],
      links: [
        { href: 'https://cdn.exemplo.com/app.css' },
        { href: 'https://cdn.exemplo.com/quebrado.css' },
      ],
    }),
  );
  const hrefs = out.map((f) => f.href);
  assert.deepEqual(hrefs, [
    'https://cdn.exemplo.com/app.css',
    'https://cdn.exemplo.com/quebrado.css',
  ]);
  assert.deepEqual(
    out.map((f) => f.ordem),
    [0, 1],
  );
});

test('adoptedStyleSheets do documento saem como adopted, depois das folhas', () => {
  const out = coletar(
    docFake({
      styleSheets: [estiloComTexto('.a{color:red}')],
      adoptedStyleSheets: [{ cssRules: regras(':root { --cor: red; }') }],
    }),
  );
  assert.equal(out.length, 2);
  assert.equal(out[1]?.origem, 'adopted');
  assert.equal(out[1]?.viaCssom, true);
  assert.ok(out[1]?.content?.includes(':root { --cor: red; }'));
  assert.equal(out[1]?.ordem, 1);
});

test('shadow root aberto: <style> e adoptedStyleSheets saem demarcados, inclusive aninhados', () => {
  const raizInterna = {
    querySelectorAll: (seletor: string): unknown[] =>
      seletor === 'style' ? [{ textContent: '.interno{color:green}' }] : [],
    adoptedStyleSheets: [],
  };
  const raizExterna = {
    querySelectorAll: (seletor: string): unknown[] =>
      seletor === 'style'
        ? [{ textContent: '.no-shadow{color:blue}' }]
        : [{ tagName: 'MEU-ITEM', shadowRoot: raizInterna }],
    adoptedStyleSheets: [{ cssRules: regras(':host { display: block; }') }],
  };
  const out = coletar(
    docFake({
      elementos: [
        { tagName: 'DIV', shadowRoot: null },
        { tagName: 'MEU-CARD', shadowRoot: raizExterna },
      ],
    }),
  );
  const sombras = out.filter((f) => f.origem === 'shadow');
  assert.equal(sombras.length, 3);
  assert.ok(sombras[0]?.content?.startsWith('/* shadow-root de <meu-card> */\n'));
  assert.ok(sombras[0]?.content?.includes('.no-shadow{color:blue}'));
  assert.ok(sombras[1]?.content?.includes(':host { display: block; }'));
  assert.equal(sombras[1]?.viaCssom, true);
  assert.ok(
    sombras[2]?.content?.startsWith('/* shadow-root de <meu-item> */\n'),
    'o root aninhado dentro do shadow também precisa ser visitado',
  );
  assert.ok(sombras[2]?.content?.includes('.interno{color:green}'));
});

const linhas = (f: RawCss | undefined): number =>
  (f?.content ?? '').split('\n').filter((l) => l.length > 0).length;

test('uma página feita com utilitários cabe: 7000 regras não são mais cortadas', () => {
  // O teto antigo era 4000 e cortava calado. Uma folha de Tailwind de build
  // passa disso sozinha — o site carregava com metade do estilo e nada avisava.
  const muitas = regras(...Array.from({ length: 3_500 }, (_, i) => `.r${i}{top:${i}px}`));
  const out = coletar(
    docFake({
      adoptedStyleSheets: [{ cssRules: muitas }, { cssRules: muitas }],
    }),
  );
  assert.equal(out.length, 2, 'as duas folhas inteiras, e nenhuma marca de corte');
  assert.equal(linhas(out[0]), 3_500);
  assert.equal(linhas(out[1]), 3_500);
});

test('quando o teto é atingido, o corte é DECLARADO em vez de silencioso', () => {
  // 41 mil regras passam do teto de 40 mil. O que importa aqui não é o número:
  // é que a coleta avisa. Um bundle com metade do CSS precisa dizer que tem
  // metade do CSS — senão ele valida, carrega e fica errado só na tela.
  const muitas = regras(...Array.from({ length: 20_500 }, (_, i) => `.r${i}{top:${i}px}`));
  const out = coletar(
    docFake({
      adoptedStyleSheets: [{ cssRules: muitas }, { cssRules: muitas }],
    }),
  );
  const marca = out.find((f) => f.truncado === true);
  assert.ok(marca !== undefined, 'a folha-aviso precisa existir');
  assert.equal(marca?.content, '', 'ela não tem conteúdo: ela É o aviso');
  assert.equal(marca?.regrasLidas, 40_000, 'e diz quantas regras entraram antes do corte');
});
