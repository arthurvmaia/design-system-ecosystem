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

/** Lê os arquivos CSS da pasta assets/css, cada um com seu nome. */
const readCssFiles = (cssDir: string): Array<{ name: string; css: string }> => {
  if (!existsSync(cssDir)) return [];
  return readdirSync(cssDir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => ({ name: f, css: readFileSync(join(cssDir, f), 'utf8') }));
};

/**
 * Isola um bloco de CSS: mantém só as regras cujos seletores casam com o
 * componente. Pode lançar `CssSyntaxError` se o CSS tiver sintaxe que o postcss
 * não engole — quem chama decide o que fazer com isso.
 */
const isolarBloco = (
  css: string,
  used: { classes: Set<string>; tags: Set<string>; ids: Set<string> },
): { css: string; total: number; kept: number } => {
  const parsed = postcss.parse(css);
  let total = 0;
  let kept = 0;

  parsed.walkRules((rule) => {
    total++;
    const parts = rule.selector.split(',').map((s) => s.trim());
    const mantidos = parts.filter((sel) => selectorMatches(sel, used));
    if (mantidos.length === 0) {
      rule.remove();
    } else {
      rule.selector = mantidos.join(', ');
      kept++;
    }
  });

  parsed.walkAtRules((atRule) => {
    if (['media', 'supports'].includes(atRule.name) && (atRule.nodes?.length ?? 0) === 0) {
      atRule.remove();
    }
  });

  return { css: parsed.toString(), total, kept };
};

/**
 * Roda o isolamento, arquivo por arquivo.
 *
 * Isolar cada arquivo em separado (em vez de concatenar tudo e parsear uma vez)
 * é o que torna o "curtir" à prova de CSS ruim: um único arquivo com sintaxe que
 * o postcss não engole — comum em CSS raspado, minificado ou com hacks — deixava
 * a operação inteira estourar com 500. Agora esse arquivo é mantido cru (o
 * componente fica menos isolado, mas curável e renderizável, já que a prévia usa
 * o head do design system de origem), e os demais são isolados normalmente.
 */
export const isolateComponent = (opts: IsolateOptions): IsolationResult => {
  const used = collectUsedTokens(opts.html);
  const files = readCssFiles(opts.cssDir);
  const cssBytesTotal = files.reduce((n, f) => n + f.css.length, 0);

  let rulesTotal = 0;
  let rulesKept = 0;
  const partes: string[] = [];

  for (const f of files) {
    partes.push(`/* --- ${f.name} --- */`);
    try {
      const r = isolarBloco(f.css, used);
      rulesTotal += r.total;
      rulesKept += r.kept;
      partes.push(r.css);
    } catch {
      // CSS que o postcss não engole: mantém cru em vez de derrubar tudo.
      partes.push(f.css);
    }
  }

  const cssOut = partes.join('\n\n');
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
