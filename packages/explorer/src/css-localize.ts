import { createHash } from 'node:crypto';
import type { CapturedAsset } from '@ds/shared';
import { urlAssetSegura } from './asset-safety.js';
import {
  type AssetFetcher,
  classifyByMime,
  extPara,
  hashedLocalPath,
  resolveRef,
} from './assets.js';

/**
 * Localização de CSS EXTERNO com as URLs internas resolvidas.
 *
 * Um `<link rel="stylesheet">` vira asset local, mas os `url(...)` e `@import`
 * DENTRO dele apontavam para a origem — resolvidos relativos ao ARQUIVO CSS, não
 * à página. Aqui cada CSS é baixado, os refs são resolvidos contra a URL do
 * próprio CSS, os assets/imports são capturados (recursivo, com limites e
 * detecção de ciclo) e o CSS é reescrito para caminhos RELATIVOS — servido em
 * `capture/assets/css/<hash>.css`, um asset em `image/<hash>.png` vira
 * `../image/<hash>.png`, um `@import` vizinho vira `<hash>.css`. Assim o dsId não
 * precisa existir na captura, e o preview serve o CSS já com tudo local.
 *
 * Guarda o CSS reescrito (servido) E o original (`.orig.css`, auditoria).
 */

export type CssLimits = {
  maxAssetBytes: number;
  maxCssDepth: number;
  maxCssFiles: number;
};

const sha = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

const separarFragmento = (u: string): [string, string] => {
  const i = u.indexOf('#');
  return i >= 0 ? [u.slice(0, i), u.slice(i)] : [u, ''];
};

const IGNORAR = /^(data:|blob:|#|javascript:|mailto:|tel:|sms:)/i;

/** Refs de um CSS resolvidas contra a URL do próprio arquivo. */
type CssRefs = {
  imports: Array<{ raw: string; absolute: string | null }>;
  urls: Array<{ raw: string; absolute: string | null }>;
};

const extrairRefsCss = (css: string, base: string): CssRefs => {
  const imports: CssRefs['imports'] = [];
  const importRaws = new Set<string>();
  for (const m of css.matchAll(
    /@import\s+(?:url\(\s*(['"]?)([^'")]+)\1\s*\)|(['"])([^'"]+)\3)/gi,
  )) {
    const raw = (m[2] ?? m[4] ?? '').trim();
    if (raw === '' || IGNORAR.test(raw)) continue;
    imports.push({ raw, absolute: resolveRef(raw, base) });
    importRaws.add(raw);
  }
  const urls: CssRefs['urls'] = [];
  for (const m of css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) {
    const raw = (m[2] ?? '').trim();
    if (raw === '' || IGNORAR.test(raw) || importRaws.has(raw)) continue;
    urls.push({ raw, absolute: resolveRef(raw, base) });
  }
  return { imports, urls };
};

/** Caminho RELATIVO a `css/` para uma referência interna do CSS. */
const relDeCss = (localPath: string): string =>
  localPath.startsWith('css/') ? localPath.slice(4) : `../${localPath}`;

/** Escapa uma string para regex literal. */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Reescreve refs no CSS (delimitado por url()/aspas/espaço), do mais longo ao mais curto. */
const reescreverCss = (css: string, map: Map<string, string>): string => {
  let out = css;
  for (const [orig, alvo] of [...map.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (!out.includes(orig)) continue;
    const re = new RegExp(`(?<=["'(,\\s])${escapeRe(orig)}(?=["')\\s,])`, 'g');
    out = out.replace(re, alvo);
  }
  return out;
};

export type CssLocalizeResult = {
  /** Todos os assets encontrados (o CSS reescrito + imagens/fontes internas). */
  assets: CapturedAsset[];
  /** cssUrl (absoluta) → localPath do CSS REESCRITO (servido). */
  cssMap: Map<string, string>;
  warnings: string[];
};

/**
 * Processa CSS externo recursivamente. `sink` grava cada arquivo (CSS reescrito,
 * `.orig.css`, e os assets internos).
 */
export const localizeCss = async (
  cssUrls: string[],
  fetcher: AssetFetcher,
  sink: (localPath: string, bytes: Uint8Array) => void,
  limits: CssLimits,
): Promise<CssLocalizeResult> => {
  const emProgresso = new Set<string>(); // detecção de ciclo A→B→A
  const cssMap = new Map<string, string>();
  const assetsByHash = new Map<string, CapturedAsset>();
  const assets: CapturedAsset[] = [];
  const warnings: string[] = [];
  const enc = new TextEncoder();

  const baixarAsset = async (absUrl: string): Promise<string | null> => {
    if (!urlAssetSegura(absUrl)) return null;
    const fetched = await fetcher(absUrl);
    if (fetched === null || fetched.bytes.byteLength > limits.maxAssetBytes) return null;
    const h = sha(fetched.bytes);
    const existente = assetsByHash.get(h);
    if (existente) {
      if (absUrl !== existente.originalUrl) {
        existente.aliases = [...(existente.aliases ?? []), absUrl];
      }
      return existente.localPath;
    }
    const kind = classifyByMime(fetched.mimeType, absUrl);
    const ext = extPara(absUrl, fetched.mimeType);
    const localPath = hashedLocalPath(h, kind, ext);
    sink(localPath, fetched.bytes);
    const asset: CapturedAsset = {
      originalUrl: absUrl,
      localPath,
      sha256: h,
      mimeType: fetched.mimeType.split(';')[0]?.trim() ?? 'application/octet-stream',
      ext,
      bytes: fetched.bytes.byteLength,
      kind,
      status: 'local',
    };
    assetsByHash.set(h, asset);
    assets.push(asset);
    return localPath;
  };

  const processarCss = async (cssUrl: string, depth: number): Promise<string | null> => {
    const jaFeito = cssMap.get(cssUrl);
    if (jaFeito) return jaFeito;
    if (emProgresso.has(cssUrl)) {
      warnings.push(`@import circular ignorado: ${cssUrl}`);
      return null;
    }
    if (depth > limits.maxCssDepth) {
      warnings.push(`profundidade de @import excedida em ${cssUrl}`);
      return null;
    }
    if (cssMap.size >= limits.maxCssFiles) {
      warnings.push('teto de arquivos CSS atingido');
      return null;
    }
    if (!urlAssetSegura(cssUrl)) return null;
    emProgresso.add(cssUrl);
    try {
      const fetched = await fetcher(cssUrl);
      if (fetched === null || !/css/i.test(fetched.mimeType)) return null;
      if (fetched.bytes.byteLength > limits.maxAssetBytes) {
        warnings.push(`CSS grande demais: ${cssUrl}`);
        return null;
      }
      const cssText = new TextDecoder('utf-8', { fatal: false }).decode(fetched.bytes);

      const { imports, urls } = extrairRefsCss(cssText, cssUrl);
      const rewriteMap = new Map<string, string>();

      for (const imp of imports) {
        if (!imp.absolute) continue;
        const impLocal = await processarCss(imp.absolute, depth + 1);
        if (impLocal) rewriteMap.set(imp.raw, relDeCss(impLocal));
      }
      for (const u of urls) {
        if (!u.absolute) continue;
        const [semFrag, frag] = separarFragmento(u.absolute);
        const localPath = await baixarAsset(semFrag);
        if (localPath) rewriteMap.set(u.raw, relDeCss(localPath) + frag);
      }

      const cssRw = reescreverCss(cssText, rewriteMap);
      const bytesRw = enc.encode(cssRw);
      const hRw = sha(bytesRw);
      const localPath = `css/${hRw.slice(0, 16)}.css`;
      sink(localPath, bytesRw);
      // Auditoria: o original ao lado, sem sobrescrever o servido.
      sink(`css/${hRw.slice(0, 16)}.orig.css`, fetched.bytes);
      const asset: CapturedAsset = {
        originalUrl: cssUrl,
        localPath,
        sha256: hRw,
        mimeType: 'text/css',
        ext: 'css',
        bytes: bytesRw.byteLength,
        kind: 'css',
        status: 'local',
      };
      assets.push(asset);
      cssMap.set(cssUrl, localPath);
      return localPath;
    } finally {
      emProgresso.delete(cssUrl);
    }
  };

  for (const u of cssUrls) await processarCss(u, 0);
  return { assets, cssMap, warnings };
};
