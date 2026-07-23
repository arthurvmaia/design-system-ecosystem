import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { animationNamesUsed, assessFidelity, fontFamiliesUsed, varNamesUsed } from '@ds/explorer';
import type { FidelityAssessment } from '@ds/shared';
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
  /**
   * Avaliação de fidelidade do componente isolado — selo, avisos e interações.
   * Cumpre a regra de não esconder a falha: um componente que perdeu o JS ou
   * que depende de canvas diz isso aqui.
   */
  fidelity: FidelityAssessment;
  stats: {
    inputClasses: number;
    cssRulesTotal: number;
    cssRulesKept: number;
    cssBytesTotal: number;
    cssBytesKept: number;
    /** Definições reintroduzidas por serem referenciadas (keyframes/font-face/vars). */
    depsPreserved: number;
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
    const nome = atRule.name.toLowerCase();
    // keyframes e font-face saem SEMPRE do bloco isolado: o filtro por seletor
    // esvaziaria os passos `from/to` e deixaria um `@keyframes` oco que
    // sobrescreveria o bom. `coletarDependenciasCss` traz de volta só os usados.
    if (nome === 'keyframes' || nome === '-webkit-keyframes' || nome === 'font-face') {
      atRule.remove();
      return;
    }
    if (['media', 'supports'].includes(nome) && (atRule.nodes?.length ?? 0) === 0) {
      atRule.remove();
    }
  });

  return { css: parsed.toString(), total, kept };
};

const normFamily = (raw: string): string =>
  raw
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .toLowerCase();

/**
 * Reintroduz as definições sem seletor casável que o componente usa: os
 * `@keyframes` de uma animação referenciada, os `@font-face` de uma fonte usada
 * e as variáveis `:root` lidas via `var()`. É o que faz a animação de fato rodar
 * e a fonte de fato carregar no preview isolado — antes, filtradas por não terem
 * um seletor que casasse, elas sumiam e a animação ficava sem `@keyframes`.
 *
 * Só traz o que é referenciado pelo CSS mantido — nem tudo, nem nada.
 */
const coletarDependenciasCss = (
  originalCss: string,
  cssKept: string,
): { css: string; count: number } => {
  const anim = animationNamesUsed(cssKept);
  const fonts = fontFamiliesUsed(cssKept);
  const vars = varNamesUsed(cssKept);
  if (anim.size === 0 && fonts.size === 0 && vars.size === 0) return { css: '', count: 0 };

  const blocos: string[] = [];
  const rootDecls: string[] = [];
  let count = 0;
  try {
    const parsed = postcss.parse(originalCss);
    parsed.walkAtRules((at) => {
      if (/^(-webkit-)?keyframes$/i.test(at.name) && anim.has(at.params.trim())) {
        blocos.push(at.toString());
        count++;
      }
      if (at.name.toLowerCase() === 'font-face') {
        let fam = '';
        at.walkDecls('font-family', (d) => {
          fam = normFamily(d.value);
        });
        if (fam !== '' && fonts.has(fam)) {
          blocos.push(at.toString());
          count++;
        }
      }
    });
    if (vars.size > 0) {
      parsed.walkRules((rule) => {
        if (!/(^|,)\s*(:root|html)\b/.test(rule.selector)) return;
        rule.walkDecls((d) => {
          if (d.prop.startsWith('--') && vars.has(d.prop)) {
            rootDecls.push(`${d.prop}: ${d.value}`);
            count++;
          }
        });
      });
    }
  } catch {
    // CSS que o postcss não engole: sem preservação de deps, degrada.
    return { css: '', count: 0 };
  }

  const partes: string[] = [];
  if (rootDecls.length > 0) partes.push(`:root{${[...new Set(rootDecls)].join(';')}}`);
  partes.push(...blocos);
  return { css: partes.join('\n'), count };
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

  const cssKept = partes.join('\n\n');

  // Reintroduz keyframes/font-face/vars que o CSS mantido referencia mas que o
  // filtro por seletor descartou. Vem ANTES do resto para valer como base.
  const originalCss = files.map((f) => f.css).join('\n');
  const deps = coletarDependenciasCss(originalCss, cssKept);
  const cssOut = deps.css !== '' ? `${deps.css}\n\n${cssKept}` : cssKept;

  const referencedAssets = collectAssetPaths(opts.html, cssOut);
  const fidelity = assessFidelity(opts.html, cssOut, { bundledAssets: false });

  return {
    html: opts.html,
    css: cssOut,
    referencedAssets,
    fidelity,
    stats: {
      inputClasses: used.classes.size,
      cssRulesTotal: rulesTotal,
      cssRulesKept: rulesKept,
      cssBytesTotal,
      cssBytesKept: cssOut.length,
      depsPreserved: deps.count,
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
