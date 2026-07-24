import { createHash } from 'node:crypto';
import type { CapturedAsset, CapturedAssetKind } from '@ds/shared';
import { mimeCoerente, urlAssetSegura } from './asset-safety.js';
import type { ExplorerLimits } from './config.js';

/**
 * Localização de assets — o que faz um componente sobreviver fora da página.
 *
 * Um segmento que aponta para `/_next/static/img/hash.png` só funciona enquanto
 * a origem estiver de pé. Aqui achamos toda referência (HTML e CSS), baixamos o
 * que dá, deduplicamos por conteúdo (sha256) e reescrevemos as referências para
 * os arquivos locais.
 *
 * A lógica é pura e testável: o download recebe um `fetcher` injetável. O de
 * verdade usa `fetch`; o de teste usa um mock.
 */

const PROTO_IGNORAR = /^(data:|blob:|javascript:|mailto:|tel:|sms:|#)/i;

const EXT_KIND: Array<[RegExp, CapturedAssetKind]> = [
  [/\.css(\?|$)/i, 'css'],
  [/\.(m?js)(\?|$)/i, 'js'],
  [/\.(woff2?|ttf|otf|eot)(\?|$)/i, 'font'],
  [/\.svg(\?|$)/i, 'svg'],
  [/\.(png|jpe?g|gif|webp|avif|ico|bmp)(\?|$)/i, 'image'],
  [/\.(mp4|webm|mov|m4v|ogv)(\?|$)/i, 'video'],
  [/\.json(\?|$)/i, 'json'],
];

const MIME_EXT: Record<string, string> = {
  'text/css': 'css',
  'application/javascript': 'js',
  'text/javascript': 'js',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/x-icon': 'ico',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'application/json': 'json',
};

const MIME_KIND: Array<[RegExp, CapturedAssetKind]> = [
  [/^text\/css/i, 'css'],
  [/javascript/i, 'js'],
  [/^font\//i, 'font'],
  [/^image\/svg/i, 'svg'],
  [/^image\//i, 'image'],
  [/^video\//i, 'video'],
  [/^application\/json/i, 'json'],
];

/** Deduz a categoria a partir da URL. */
export const classifyByUrl = (url: string): CapturedAssetKind => {
  for (const [re, kind] of EXT_KIND) if (re.test(url)) return kind;
  return 'other';
};

/** Deduz a categoria a partir do MIME, com fallback na URL. */
export const classifyByMime = (mime: string, url: string): CapturedAssetKind => {
  for (const [re, kind] of MIME_KIND) if (re.test(mime)) return kind;
  return classifyByUrl(url);
};

/** Uma referência crua encontrada no documento. */
export type AssetRef = {
  /** O texto exato como apareceu (para reescrever depois). */
  raw: string;
  /** Absoluta quando resolvível; senão a própria raw. */
  absolute: string | null;
  kind: CapturedAssetKind;
};

/** Resolve uma referência contra a base; null para protocolos que ignoramos. */
export const resolveRef = (raw: string, baseUrl: string | null): string | null => {
  const ref = raw.trim();
  if (ref === '' || PROTO_IGNORAR.test(ref)) return null;
  if (baseUrl === null) return /^[a-z]+:\/\//i.test(ref) ? ref : null;
  try {
    return new URL(ref, baseUrl).href;
  } catch {
    return null;
  }
};

/** Cada URL de um atributo `srcset`, sem os descritores (`1x`, `640w`). */
export const parseSrcset = (srcset: string): string[] =>
  srcset
    .split(',')
    .map((part) => part.trim().split(/\s+/)[0] ?? '')
    .filter((u) => u !== '');

/**
 * Extrai todas as referências de assets de um HTML e de um CSS. Deduplica pela
 * string crua — a mesma imagem citada dez vezes vira uma referência.
 */
export const extractAssetRefs = (html: string, css: string, baseUrl: string | null): AssetRef[] => {
  const vistos = new Map<string, AssetRef>();
  const add = (raw: string): void => {
    const limpo = raw.trim().replace(/^['"]|['"]$/g, '');
    if (limpo === '' || PROTO_IGNORAR.test(limpo) || vistos.has(limpo)) return;
    const absolute = resolveRef(limpo, baseUrl);
    vistos.set(limpo, { raw: limpo, absolute, kind: classifyByUrl(limpo) });
  };

  // HTML: `src`/`poster` de qualquer tag (img, script, video, source, iframe).
  for (const m of html.matchAll(/\s(?:src|poster)\s*=\s*["']([^"']+)["']/gi)) add(m[1] ?? '');
  // HTML: `href` SÓ de <link> (stylesheet/icon/preload). O `href` de <a> é
  // navegação, não asset — pegá-lo baixava a home do x.com como se fosse um
  // arquivo. Bug real que apareceu no site de teste.
  for (const m of html.matchAll(/<link\b[^>]*?\shref\s*=\s*["']([^"']+)["']/gi)) add(m[1] ?? '');
  // HTML: srcset e imagesrcset.
  for (const m of html.matchAll(/(?:srcset|imagesrcset)\s*=\s*["']([^"']+)["']/gi)) {
    for (const u of parseSrcset(m[1] ?? '')) add(u);
  }
  // HTML/CSS: url(...).
  for (const input of [html, css]) {
    for (const m of input.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) add(m[2] ?? '');
  }
  // CSS: @import "..." e @import url(...) (o url já pego acima).
  for (const m of css.matchAll(/@import\s+(['"])([^'"]+)\1/gi)) add(m[2] ?? '');

  return [...vistos.values()];
};

/** Extensão preferida a partir do MIME ou da URL, sem o ponto. */
const extPara = (url: string, mime: string): string => {
  const porMime = MIME_EXT[mime.split(';')[0]?.trim().toLowerCase() ?? ''];
  if (porMime) return porMime;
  const m = url.split(/[?#]/)[0]?.match(/\.([a-z0-9]{2,5})$/i);
  return (m?.[1] ?? 'bin').toLowerCase();
};

/** Nome de arquivo por conteúdo: `<kind>/<sha8>.<ext>`. Deduplica sozinho. */
export const hashedLocalPath = (sha256: string, kind: CapturedAssetKind, ext: string): string =>
  `${kind}/${sha256.slice(0, 16)}.${ext}`;

export type FetchedAsset = {
  status: number;
  mimeType: string;
  bytes: Uint8Array;
};

/** Assinatura do downloader injetável. */
export type AssetFetcher = (url: string) => Promise<FetchedAsset | null>;

/** Downloader real sobre `fetch`. Respeita o teto de tamanho. Legado; prefira `createSecureHttpFetcher`. */
export const createHttpFetcher =
  (maxBytes: number): AssetFetcher =>
  async (url: string): Promise<FetchedAsset | null> => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const len = Number(res.headers.get('content-length') ?? '0');
      if (len > maxBytes) return null;
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.byteLength > maxBytes) return null;
      return {
        status: res.status,
        mimeType: res.headers.get('content-type') ?? 'application/octet-stream',
        bytes: buf,
      };
    } catch {
      return null;
    }
  };

/** Lê o corpo com teto rígido no tamanho DECODIFICADO (guarda de bomba de descompressão). */
const lerComTeto = async (res: Response, maxBytes: number): Promise<Uint8Array | null> => {
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = new Uint8Array(await res.arrayBuffer());
    return buf.byteLength > maxBytes ? null : buf;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
};

export type SecureFetchLimits = Pick<
  ExplorerLimits,
  'maxAssetBytes' | 'assetTimeoutMs' | 'maxRedirects'
>;

/**
 * Downloader SEGURO. Bloqueia SSRF (localhost/rede privada/metadata/protocolo)
 * na URL inicial E em cada redirect; teto de tamanho no corpo decodificado;
 * timeout; NÃO envia cookies/auth; recusa `text/html` (é página, não asset).
 * É o que o fluxo de produção deve usar.
 */
export const createSecureHttpFetcher =
  (limits: SecureFetchLimits): AssetFetcher =>
  async (url: string): Promise<FetchedAsset | null> => {
    if (!urlAssetSegura(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), limits.assetTimeoutMs);
    try {
      let atual = url;
      for (let hop = 0; hop <= limits.maxRedirects; hop++) {
        if (!urlAssetSegura(atual)) return null; // re-checa cada salto
        const res = await fetch(atual, {
          redirect: 'manual',
          signal: controller.signal,
          // Sem credenciais: nada de cookies, Authorization ou tokens vão à origem.
          headers: { Accept: '*/*', 'User-Agent': 'ds-asset-fetcher/1' },
        });
        if (res.status >= 300 && res.status < 400) {
          const loc = res.headers.get('location');
          if (!loc) return null;
          atual = new URL(loc, atual).href;
          continue;
        }
        if (!res.ok) return null;
        const len = Number(res.headers.get('content-length') ?? '0');
        if (len > limits.maxAssetBytes) return null;
        const mime = res.headers.get('content-type') ?? 'application/octet-stream';
        // Conteúdo disfarçado: a URL promete imagem/fonte mas volta HTML/outro.
        if (!mimeCoerente(mime, classifyByUrl(atual))) return null;
        const bytes = await lerComTeto(res, limits.maxAssetBytes);
        if (bytes === null) return null;
        return { status: res.status, mimeType: mime, bytes };
      }
      return null; // redirects demais
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

export type LocalizationResult = {
  assets: CapturedAsset[];
  /** Mapa referência-crua → caminho-local, para reescrita. */
  rewriteMap: Map<string, string>;
  stats: { found: number; saved: number; bytes: number; skipped: number };
};

/**
 * Baixa e deduplica os assets referenciados. Concorrência limitada; asset acima
 * do teto ou irrecuperável é pulado (e some do mapa de reescrita, então a
 * referência original é mantida — degradar é melhor que quebrar).
 *
 * `sink` grava o byte em disco (injetável para teste). Retorna o plano de
 * reescrita e a lista de assets salvos.
 */
export const localizeAssets = async (
  refs: AssetRef[],
  fetcher: AssetFetcher,
  sink: (localPath: string, bytes: Uint8Array) => void,
  limits: Pick<ExplorerLimits, 'assetConcurrency' | 'maxAssetBytes'>,
): Promise<LocalizationResult> => {
  const baixaveis = refs.filter((r) => r.absolute !== null);
  const rewriteMap = new Map<string, string>();
  const porHash = new Map<string, CapturedAsset>();
  let saved = 0;
  let skipped = 0;
  let bytes = 0;

  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < baixaveis.length) {
      const ref = baixaveis[cursor++];
      if (!ref || ref.absolute === null) continue;
      const fetched = await fetcher(ref.absolute);
      if (fetched === null || fetched.bytes.byteLength > limits.maxAssetBytes) {
        skipped++;
        continue;
      }
      // Defesa: se voltou uma PÁGINA (text/html), não é asset — é um link que
      // escapou. Não salva.
      if (/^\s*text\/html/i.test(fetched.mimeType)) {
        skipped++;
        continue;
      }
      const sha256 = createHash('sha256').update(fetched.bytes).digest('hex');
      const existente = porHash.get(sha256);
      if (existente) {
        // Já baixamos este conteúdo por outra URL: reaproveita o arquivo.
        rewriteMap.set(ref.raw, existente.localPath);
        continue;
      }
      const kind = classifyByMime(fetched.mimeType, ref.absolute);
      const ext = extPara(ref.absolute, fetched.mimeType);
      const localPath = hashedLocalPath(sha256, kind, ext);
      sink(localPath, fetched.bytes);
      const asset: CapturedAsset = {
        originalUrl: ref.absolute,
        localPath,
        sha256,
        mimeType: fetched.mimeType.split(';')[0]?.trim() ?? 'application/octet-stream',
        ext,
        bytes: fetched.bytes.byteLength,
        kind,
        status: 'local',
      };
      porHash.set(sha256, asset);
      rewriteMap.set(ref.raw, localPath);
      saved++;
      bytes += fetched.bytes.byteLength;
    }
  };

  const n = Math.max(1, Math.min(limits.assetConcurrency, baixaveis.length));
  await Promise.all(Array.from({ length: n }, () => worker()));

  return {
    assets: [...porHash.values()],
    rewriteMap,
    stats: { found: refs.length, saved, bytes, skipped },
  };
};

/**
 * Torna ABSOLUTAS todas as referências relativas de um HTML (href, src, poster,
 * srcset, url()). É o que faz um DOM renderizado sobreviver fora da origem no
 * preview: cada `assets/x.css`, `/about`, `img.png` vira a URL completa, então o
 * iframe carrega da origem e a checagem de "asset local faltando" não acusa nada
 * (tudo passa a ser externo). Diferente de `extractAssetRefs`: aqui inclui o
 * `href` de âncora também, senão um link relativo reprovaria a extração.
 */
export const absolutizeRefs = (html: string, baseUrl: string): string => {
  const map = new Map<string, string>();
  const consider = (raw: string): void => {
    const ref = raw.trim();
    // Já absoluto (scheme:, //host), âncora, ou não-navegável: deixa como está.
    if (ref === '' || map.has(ref) || /^([a-z]+:|\/\/|#|data:|mailto:|tel:)/i.test(ref)) return;
    const abs = resolveRef(ref, baseUrl);
    if (abs !== null && abs !== ref) map.set(ref, abs);
  };
  for (const m of html.matchAll(/\s(?:href|src|poster)\s*=\s*["']([^"']+)["']/gi)) {
    consider(m[1] ?? '');
  }
  for (const m of html.matchAll(/(?:srcset|imagesrcset)\s*=\s*["']([^"']+)["']/gi)) {
    for (const u of parseSrcset(m[1] ?? '')) consider(u);
  }
  for (const m of html.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi)) consider(m[2] ?? '');
  return rewriteReferences(html, map);
};

/** Escapa uma string para uso literal em regex. */
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reescreve as referências no texto (HTML ou CSS) trocando cada referência crua
 * pelo caminho local. Só troca dentro de delimitadores de atributo/`url()`/
 * srcset, para não acertar uma substring solta.
 */
export const rewriteReferences = (
  text: string,
  rewriteMap: Map<string, string>,
  prefix = '',
): string => {
  let out = text;
  // Do mais longo para o mais curto: evita reescrever o prefixo de outra ref.
  const entradas = [...rewriteMap.entries()].sort((a, b) => b[0].length - a[0].length);
  for (const [orig, local] of entradas) {
    const alvo = `${prefix}${local}`;
    const re = new RegExp(`(?<=["'(,\\s])${escapeRe(orig)}(?=["')\\s,])`, 'g');
    out = out.replace(re, alvo);
  }
  return out;
};
