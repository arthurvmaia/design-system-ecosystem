import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'node-html-parser';
import postcss from 'postcss';
import parser from 'postcss-selector-parser';

/**
 * Isolator pragmático.
 *
 * Estratégia:
 * 1. Coleta todos os `class` do HTML do componente (mais tag, id, atributos).
 * 2. Concatena todo o CSS do design system.
 * 3. Para cada regra CSS, verifica se ao menos um seletor casa com algum
 *    elemento do componente. Se sim, mantém.
 * 4. Retorna o bundle `{ html, css, referencedAssets }`.
 *
 * Limitações reconhecidas:
 * - Cascata de containers pai (`.hero .button`) mantém a regra mas o pai não
 *   existe no isolamento, então o botão vai renderizar sem o contexto do hero.
 *   Solução completa exige rescrita de seletores; ficou como TODO.
 * - Regras `@media`, `@supports`, `@keyframes`, `@font-face` são mantidas
 *   inteiras se qualquer regra dentro casar.
 * - Utility classes tipo Tailwind funcionam porque a checagem é por classname.
 */

export type IsolationResult = {
  html: string;
  css: string;
  referencedAssets: string[];
  stats: {
    inputClasses: number;
    cssRulesTotal: number;
    cssRulesKept: number;
    cssBytesTotal: number;
    cssBytesKept: number;
  };
};

export type IsolateOptions = {
  html: string;
  cssDir: string;
};

/** Coleta atributos usados no HTML: classes, tags, ids. */
const collectUsedTokens = (
  html: string,
): {
  classes: Set<string>;
  tags: Set<string>;
  ids: Set<string>;
} => {
  const classes = new Set<string>();
  const tags = new Set<string>();
  const ids = new Set<string>();

  const root = parse(html);
  const walk = (node: import('node-html-parser').HTMLElement): void => {
    tags.add(node.tagName.toLowerCase());
    const cls = node.getAttribute('class');
    if (cls) for (const c of cls.split(/\s+/).filter(Boolean)) classes.add(c);
    const id = node.getAttribute('id');
    if (id) ids.add(id);
    for (const child of node.childNodes) {
      // biome-ignore lint/suspicious/noExplicitAny: iteração precisa acessar shape do node
      const c = child as any;
      if (c.tagName) walk(c);
    }
  };
  const body = root.querySelector('body') ?? root;
  const rootEl = body.firstChild;
  // biome-ignore lint/suspicious/noExplicitAny: root pode ser diferente
  if (rootEl && (rootEl as any).tagName) walk(rootEl as import('node-html-parser').HTMLElement);
  else walk(root);

  return { classes, tags, ids };
};

/** Verifica se um seletor CSS casa com os tokens coletados. */
const selectorMatches = (
  selector: string,
  used: { classes: Set<string>; tags: Set<string>; ids: Set<string> },
): boolean => {
  let matched = false;
  try {
    parser((selectors) => {
      selectors.walk((node) => {
        if (node.type === 'class' && used.classes.has(node.value)) matched = true;
        if (node.type === 'id' && node.value && used.ids.has(node.value)) matched = true;
        if (node.type === 'tag' && node.value && used.tags.has(node.value)) matched = true;
      });
    }).processSync(selector);
  } catch {
    // Seletor inválido: por segurança, mantém.
    return true;
  }
  return matched;
};

/** Concatena todos os CSS files da pasta assets/css. */
const concatCss = (cssDir: string): string => {
  if (!existsSync(cssDir)) return '';
  const files = readdirSync(cssDir).filter((f) => f.endsWith('.css'));
  return files
    .map((f) => `/* --- ${f} --- */\n${readFileSync(join(cssDir, f), 'utf8')}`)
    .join('\n\n');
};

/** Roda o isolamento. */
export const isolateComponent = (opts: IsolateOptions): IsolationResult => {
  const used = collectUsedTokens(opts.html);
  const cssIn = concatCss(opts.cssDir);
  const cssBytesTotal = cssIn.length;

  const parsed = postcss.parse(cssIn);
  let rulesTotal = 0;
  let rulesKept = 0;

  parsed.walkRules((rule) => {
    rulesTotal++;
    // Divide seletor por vírgula
    const parts = rule.selector.split(',').map((s) => s.trim());
    const kept = parts.filter((sel) => selectorMatches(sel, used));
    if (kept.length === 0) {
      rule.remove();
    } else {
      rule.selector = kept.join(', ');
      rulesKept++;
    }
  });

  // Remove @media / @supports que ficaram vazios
  parsed.walkAtRules((atRule) => {
    if (['media', 'supports'].includes(atRule.name) && (atRule.nodes?.length ?? 0) === 0) {
      atRule.remove();
    }
  });

  const cssOut = parsed.toString();

  // Assets referenciados no HTML ou no CSS restante
  const referencedAssets = collectAssetPaths(opts.html, cssOut);

  return {
    html: opts.html,
    css: cssOut,
    referencedAssets,
    stats: {
      inputClasses: used.classes.size,
      cssRulesTotal: rulesTotal,
      cssRulesKept: rulesKept,
      cssBytesTotal,
      cssBytesKept: cssOut.length,
    },
  };
};

const collectAssetPaths = (html: string, css: string): string[] => {
  const set = new Set<string>();
  const urlRe = /url\(\s*["']?([^"'()]+)["']?\s*\)/g;
  const srcRe = /(?:src|href)=["']([^"']+)["']/g;
  const bgRe = /background(?:-image)?:\s*[^;]*url\(["']?([^"'()]+)["']?\)/g;
  for (const re of [urlRe, srcRe, bgRe]) {
    for (const input of [html, css]) {
      let m: RegExpExecArray | null;
      // biome-ignore lint/suspicious/noAssignInExpressions: exec loop idiomático
      while ((m = re.exec(input)) !== null) {
        const raw = m[1];
        if (raw && !raw.startsWith('data:') && !raw.startsWith('http')) set.add(raw);
      }
    }
  }
  return [...set];
};
