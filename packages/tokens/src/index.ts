import postcss from 'postcss';

/**
 * Extrator pragmático de design tokens.
 *
 * Estratégia:
 * - Escaneia o CSS por valores repetidos.
 * - Agrupa em buckets (color, spacing, radius, font-family, font-size, shadow).
 * - Sugere nomes de token (--primary, --spacing-md, etc).
 * - Substitui valores no CSS por var(--name).
 * - Retorna o mapa "defaultTheme" com os valores originais.
 *
 * Não faz clustering perceptivo (ex: cores próximas viram um só token).
 * Isso é um passo Fase 6.5 que precisa de decisão do usuário sobre agressividade.
 */

export type ExtractedTokens = {
  colors: Record<string, string>;
  spacing: Record<string, string>;
  radii: Record<string, string>;
  typography: {
    families: Record<string, string>;
    sizes: Record<string, string>;
  };
  shadows: Record<string, string>;
};

export type TokenizeResult = {
  tokens: ExtractedTokens;
  css: string;
  stats: { colorTokens: number; spacingTokens: number; radiusTokens: number };
};

const HEX_RE = /#(?:[0-9a-fA-F]{3,4}){1,2}\b/g;
const RGBA_RE = /rgba?\([^)]+\)/g;
const HSL_RE = /hsla?\([^)]+\)/g;

const countOccurrences = (css: string, regexes: RegExp[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const re of regexes) {
    const globalRe = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    const matches = css.match(globalRe) ?? [];
    for (const m of matches) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return counts;
};

const nameToken = (prefix: string, index: number): string => `--${prefix}-${index}`;

export const extractTokens = (css: string): TokenizeResult => {
  const colorCounts = countOccurrences(css, [HEX_RE, RGBA_RE, HSL_RE]);
  // Só vira token o que aparece 2+ vezes.
  const colorEntries = [...colorCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort(([, a], [, b]) => b - a);

  const colors: Record<string, string> = {};
  let out = css;
  colorEntries.forEach(([value, _n], i) => {
    const name = i === 0 ? '--primary' : nameToken('color', i);
    colors[name] = value;
    // Substitui valor por var()
    const safeValue = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out.replace(new RegExp(safeValue, 'g'), `var(${name})`);
  });

  // Spacings: valores em px que aparecem em propriedades de spacing.
  const spacingRe = /\b(padding|margin|gap|top|left|right|bottom)[^:;]*:\s*([^;{}]+);/g;
  const pxCounts = new Map<string, number>();
  let m: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: exec loop idiomático
  while ((m = spacingRe.exec(css)) !== null) {
    const val = m[2];
    if (!val) continue;
    const pxs = val.match(/\d+(?:\.\d+)?px/g) ?? [];
    for (const p of pxs) pxCounts.set(p, (pxCounts.get(p) ?? 0) + 1);
  }
  const spacingEntries = [...pxCounts.entries()]
    .filter(([, n]) => n >= 3)
    .sort(([, a], [, b]) => b - a);
  const spacing: Record<string, string> = {};
  spacingEntries.slice(0, 8).forEach(([value, _n], i) => {
    spacing[`--space-${i}`] = value;
  });

  // Radius: border-radius:
  const radiusRe = /border-radius[^:;]*:\s*([^;{}]+);/g;
  const radCounts = new Map<string, number>();
  // biome-ignore lint/suspicious/noAssignInExpressions: exec loop idiomático
  while ((m = radiusRe.exec(css)) !== null) {
    const val = m[1]?.trim();
    if (val) radCounts.set(val, (radCounts.get(val) ?? 0) + 1);
  }
  const radii: Record<string, string> = {};
  [...radCounts.entries()]
    .filter(([, n]) => n >= 2)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .forEach(([value, _n], i) => {
      radii[`--radius-${i}`] = value;
    });

  // Font families
  const familyRe = /font-family[^:;]*:\s*([^;{}]+);/g;
  const familyCounts = new Map<string, number>();
  // biome-ignore lint/suspicious/noAssignInExpressions: exec loop idiomático
  while ((m = familyRe.exec(css)) !== null) {
    const val = m[1]?.trim();
    if (val) familyCounts.set(val, (familyCounts.get(val) ?? 0) + 1);
  }
  const families: Record<string, string> = {};
  [...familyCounts.entries()].slice(0, 3).forEach(([value, _n], i) => {
    families[i === 0 ? '--font-body' : `--font-${i}`] = value;
  });

  // Font sizes
  const sizeRe = /font-size[^:;]*:\s*([^;{}]+);/g;
  const sizeCounts = new Map<string, number>();
  // biome-ignore lint/suspicious/noAssignInExpressions: exec loop idiomático
  while ((m = sizeRe.exec(css)) !== null) {
    const val = m[1]?.trim();
    if (val) sizeCounts.set(val, (sizeCounts.get(val) ?? 0) + 1);
  }
  const sizes: Record<string, string> = {};
  [...sizeCounts.entries()]
    .filter(([, n]) => n >= 2)
    .slice(0, 8)
    .forEach(([value, _n], i) => {
      sizes[`--font-size-${i}`] = value;
    });

  // Insere :root com tokens no início do CSS.
  const rootDecl = [
    ':root {',
    ...Object.entries({ ...colors, ...spacing, ...radii, ...families, ...sizes }).map(
      ([k, v]) => `  ${k}: ${v};`,
    ),
    '}',
  ].join('\n');

  const finalCss = `${rootDecl}\n\n${out}`;

  return {
    tokens: {
      colors,
      spacing,
      radii,
      typography: { families, sizes },
      shadows: {},
    },
    css: finalCss,
    stats: {
      colorTokens: Object.keys(colors).length,
      spacingTokens: Object.keys(spacing).length,
      radiusTokens: Object.keys(radii).length,
    },
  };
};

// silence unused if postcss não for chamado
void postcss;
