/**
 * Ajudantes de CSS — funções puras, sem AST.
 *
 * O isolador filtra regras por seletor. Isso deixa passar três coisas que não
 * têm seletor casável mas são necessárias: os `@keyframes` que uma animação
 * usada referencia, os `@font-face` das fontes usadas e as variáveis `--x`
 * lidas via `var()`. Estas funções dizem QUAIS nomes o CSS mantido usa, para o
 * isolador reintroduzir só o necessário — nem tudo, nem nada.
 */

/** Nomes de `@keyframes` declarados no CSS. */
export const keyframeNames = (css: string): string[] => {
  const nomes = new Set<string>();
  for (const m of css.matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/gi)) {
    if (m[1]) nomes.add(m[1]);
  }
  return [...nomes];
};

/** Nomes de animação referenciados por `animation`/`animation-name`. */
export const animationNamesUsed = (css: string): Set<string> => {
  const usados = new Set<string>();
  const RESERVADAS = new Set([
    'none',
    'infinite',
    'normal',
    'reverse',
    'alternate',
    'forwards',
    'backwards',
    'both',
    'running',
    'paused',
    'linear',
    'ease',
    'ease-in',
    'ease-out',
    'ease-in-out',
    'step-start',
    'step-end',
  ]);
  for (const m of css.matchAll(/animation(?:-name)?\s*:\s*([^;}]+)[;}]/gi)) {
    const valor = m[1] ?? '';
    for (const tok of valor.split(/[\s,]+/)) {
      const t = tok.trim();
      if (t === '' || RESERVADAS.has(t.toLowerCase())) continue;
      if (/^[\d.]/.test(t) || /^(steps|cubic-bezier)\(/i.test(t)) continue;
      if (/^[\w-]+$/.test(t)) usados.add(t);
    }
  }
  return usados;
};

/** Variáveis CSS lidas via `var(--x)`. */
export const varNamesUsed = (css: string): Set<string> => {
  const usados = new Set<string>();
  for (const m of css.matchAll(/var\(\s*(--[\w-]+)/gi)) if (m[1]) usados.add(m[1]);
  return usados;
};

/** Normaliza um nome de família de fonte (sem aspas, minúsculo). */
const normFamily = (raw: string): string =>
  raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();

/** Famílias declaradas por `@font-face` (via `font-family: ...`). */
export const fontFaceFamilies = (css: string): Set<string> => {
  const fams = new Set<string>();
  for (const bloco of css.matchAll(/@font-face\s*\{([^}]*)\}/gi)) {
    const m = /font-family\s*:\s*([^;]+)/i.exec(bloco[1] ?? '');
    if (m?.[1]) fams.add(normFamily(m[1]));
  }
  return fams;
};

/** Famílias usadas em `font-family`/`font` fora de `@font-face`. */
export const fontFamiliesUsed = (css: string): Set<string> => {
  const usados = new Set<string>();
  // Remove blocos @font-face para não contar a própria declaração como uso.
  const semFontFace = css.replace(/@font-face\s*\{[^}]*\}/gi, '');
  for (const m of semFontFace.matchAll(/font-family\s*:\s*([^;}]+)[;}]/gi)) {
    for (const fam of (m[1] ?? '').split(',')) usados.add(normFamily(fam));
  }
  return usados;
};

/** Interseção conveniente: quais `declarados` aparecem em `usados`. */
export const intersecao = (declarados: string[], usados: Set<string>): Set<string> =>
  new Set(declarados.filter((n) => usados.has(n)));
