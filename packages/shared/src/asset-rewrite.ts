import type { CapturedAsset } from './schemas/capture.js';

/**
 * Reescrita de referências de asset para o LOCAL (vault) — puro e testável.
 *
 * O explorer baixa os assets e indexa (originalUrl → localPath) no manifesto.
 * Aqui, na hora de servir o preview (ou montar o bundle da Biblioteca), trocamos
 * cada URL de asset da origem pela rota local do vault. Só troca ASSET — link de
 * navegação (`<a href>`) fica intacto, porque o índice contém apenas URLs que o
 * explorer detectou como asset.
 *
 * As estatísticas (`locais`/`externos`) alimentam a fidelidade honesta: um
 * segmento só é portátil quando não sobrou nenhuma referência externa.
 */

/** Versão do reescritor — entra no hash do preview; muda → revalida. */
export const REWRITER_VERSION = 2;

/** Versão do processador de CSS externo — entra no hash; muda → revalida. */
export const CSS_PROCESSOR_VERSION = 1;

/** Prefixo da rota que serve os assets locais do vault de um design system. */
export const assetRoutePrefix = (dsId: string): string => `/api/asset/${dsId}/`;

/** Índice originalUrl(+resolvedUrl) → localPath, a partir dos assets locais. */
export const construirIndiceAssets = (assets: CapturedAsset[]): Map<string, string> => {
  const idx = new Map<string, string>();
  for (const a of assets) {
    if (a.status && a.status !== 'local') continue; // só os efetivamente locais
    idx.set(a.originalUrl, a.localPath);
    if (a.resolvedUrl && a.resolvedUrl !== a.originalUrl) idx.set(a.resolvedUrl, a.localPath);
    // Aliases: outras URLs de origem com o mesmo conteúdo (dedup por hash).
    for (const alias of a.aliases ?? []) idx.set(alias, a.localPath);
  }
  return idx;
};

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const IGNORAR = /^(data:|blob:|#|javascript:|mailto:|tel:|sms:)/i;

/** Separa a URL do seu fragmento (`#...`). Query fica na URL (foi baixada com ela). */
const separarFragmento = (u: string): [string, string] => {
  const i = u.indexOf('#');
  return i >= 0 ? [u.slice(0, i), u.slice(i)] : [u, ''];
};

/**
 * O alvo local de uma ref, preservando o fragmento. Um sprite `icons.svg#menu`
 * é baixado como `icons.svg` (o servidor nunca vê o `#`), então a busca no índice
 * é pelo caminho SEM fragmento, mas a URL local final mantém o `#menu`.
 */
export const alvoLocal = (
  raw: string,
  index: Map<string, string>,
  prefix: string,
): string | null => {
  const direto = index.get(raw);
  if (direto) return `${prefix}${direto}`;
  const [base, frag] = separarFragmento(raw);
  if (frag) {
    const local = index.get(base);
    if (local) return `${prefix}${local}${frag}`;
  }
  return null;
};

/**
 * Troca, DELIMITADO, cada ref de asset do texto pelo alvo local. O lookbehind/
 * lookahead garante que só troca dentro de atributo/`url()`/srcset — nunca uma
 * substring solta. Do mais longo para o mais curto, para não pegar prefixo de
 * outra URL.
 */
const substituir = (text: string, index: Map<string, string>, prefix: string): string => {
  const map = new Map<string, string>();
  for (const raw of coletarAssetRefs(text)) {
    const alvo = alvoLocal(raw, index, prefix);
    if (alvo) map.set(raw, alvo);
  }
  let out = text;
  for (const [orig, alvo] of [...map.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (!out.includes(orig)) continue;
    const re = new RegExp(`(?<=["'(,\\s])${escapeRe(orig)}(?=["')\\s,])`, 'g');
    out = out.replace(re, alvo);
  }
  return out;
};

/**
 * URLs de ASSET presentes no texto (para estatística). Cobre `src`/`poster`,
 * `<link href>` (stylesheet/icon), `srcset`, `<use>`/`<image href>`/`xlink:href`
 * (SVG), `url(...)` e `@import`. NÃO inclui `<a href>` — navegação não é asset.
 */
export const coletarAssetRefs = (text: string): string[] => {
  const set = new Set<string>();
  const add = (raw: string | undefined): void => {
    const c = (raw ?? '').trim().replace(/^['"]|['"]$/g, '');
    if (c !== '' && !IGNORAR.test(c)) set.add(c);
  };
  for (const m of text.matchAll(/\s(?:src|poster)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/<link\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/(?:srcset|imagesrcset)\s*=\s*["']([^"']+)["']/gi)) {
    for (const part of (m[1] ?? '').split(',')) add(part.trim().split(/\s+/)[0]);
  }
  for (const m of text.matchAll(/xlink:href\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/<(?:image|use)\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) add(m[2]);
  for (const m of text.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) add(m[2]);
  return [...set];
};

export type ReescritaResultado = {
  text: string;
  /** Quantas refs de asset viraram locais. */
  locais: number;
  /** Quantas refs externas (http/https) NÃO puderam virar locais. */
  externos: number;
  /** As URLs externas que sobraram (para a fidelidade e os avisos). */
  externosUrls: string[];
};

/**
 * Reescreve o texto (HTML ou CSS) trocando os assets do índice pela rota local.
 * Devolve o texto novo e a contagem local/externo. `prefix` é a base da rota
 * (ex.: `/api/asset/ds_x/`).
 */
export const reescreverParaLocal = (
  text: string,
  index: Map<string, string>,
  prefix: string,
): ReescritaResultado => {
  const out = substituir(text, index, prefix);
  let locais = 0;
  let externos = 0;
  const externosUrls = new Set<string>();
  for (const ref of coletarAssetRefs(text)) {
    if (alvoLocal(ref, index, prefix)) locais++;
    else if (/^https?:\/\//i.test(ref)) {
      externos++;
      externosUrls.add(ref);
    }
  }
  return { text: out, locais, externos, externosUrls: [...externosUrls] };
};
