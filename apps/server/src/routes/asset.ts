import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import {
  libraryComponentBundleDir,
  vaultCaptureAssetsDir,
  vaultCaptureV2AssetsDir,
} from '@ds/shared/paths';
import { Hono } from 'hono';

/**
 * Rotas seguras para os assets LOCAIS.
 *
 * `/api/asset/:dsId/*`         → `vault/<ds>/capture/assets/` (preview da Galeria).
 * `/api/library-asset/:cmpId/*` → `library/<cmp>/bundle/assets/` (preview/uso da Biblioteca).
 *
 * São o que faz o preview carregar imagem/fonte/CSS do local em vez da origem.
 * Content-addressed (nome = hash) → cache imutável. Bloqueiam path traversal,
 * não listam diretório, não vazam o caminho físico, e suportam range para vídeo.
 * Servem SÓ a subpasta de assets — nada de arquivo arbitrário.
 */
export const assetRoute = new Hono();
export const libraryAssetRoute = new Hono();

const MIME: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.m4v': 'video/x-m4v',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const HEADERS_SEGURANCA = {
  'X-Content-Type-Options': 'nosniff',
  // Content-addressed: o conteúdo nunca muda para o mesmo nome → cache longo.
  'Cache-Control': 'public, max-age=31536000, immutable',
  // FONTES exigem CORS; o preview roda com origem OPACA (sandbox), então precisa
  // do ACAO. Os assets são públicos e content-addressed (sem credenciais/segredo),
  // então liberar a leitura cross-origin é seguro.
  'Access-Control-Allow-Origin': '*',
} as const;

/**
 * Serve um arquivo de DENTRO de `dir`, com todas as guardas. `relPath` é o resto
 * da URL. Devolve a `Response` (200/206/403/404/416) — nunca sai de `dir`.
 */
const servirDe = (dir: string, relPath: string, range: string | undefined): Response => {
  if (!existsSync(dir)) return jsonResp(404, 'not_found');
  if (!relPath) return jsonResp(404, 'not_found');
  if (isAbsolute(relPath) || relPath.split(/[/\\]/).includes('..'))
    return jsonResp(403, 'forbidden');

  const abs = normalize(join(dir, relPath));
  const rel = relative(dir, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return jsonResp(403, 'forbidden');
  if (!existsSync(abs) || statSync(abs).isDirectory()) return jsonResp(404, 'not_found');

  const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
  const buf = readFileSync(abs);
  const total = buf.byteLength;

  const m = range?.match(/^bytes=(\d*)-(\d*)$/);
  if (m) {
    const start = m[1] ? Number(m[1]) : 0;
    const end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
    if (Number.isNaN(start) || start > end || start >= total) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${total}` } });
    }
    const slice = buf.subarray(start, end + 1);
    return new Response(new Uint8Array(slice), {
      status: 206,
      headers: {
        ...HEADERS_SEGURANCA,
        'Content-Type': mime,
        'Accept-Ranges': 'bytes',
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Content-Length': String(slice.byteLength),
      },
    });
  }

  return new Response(new Uint8Array(buf), {
    headers: {
      ...HEADERS_SEGURANCA,
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(total),
    },
  });
};

const jsonResp = (status: 400 | 403 | 404, error: string): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const restoDaUrl = (fullUrl: string, base: string, id: string): string => {
  const url = new URL(fullUrl);
  return decodeURIComponent(url.pathname.replace(new RegExp(`^${base}/${id}/?`), ''));
};

assetRoute.get('/:dsId/*', (c) => {
  const dsId = c.req.param('dsId');
  if (!/^ds_[a-z0-9]+$/i.test(dsId)) return jsonResp(400, 'invalid_id');
  const resto = restoDaUrl(c.req.url, '/api/asset', dsId);
  const range = c.req.header('range');
  const v1 = servirDe(vaultCaptureAssetsDir(dsId as `ds_${string}`), resto, range);
  if (v1.status !== 404) return v1;
  // Extração V2: os assets moram em `capture-v2/assets/`, no mesmo formato
  // content-addressed. Mesmas guardas, outra raiz.
  return servirDe(vaultCaptureV2AssetsDir(dsId as `ds_${string}`), resto, range);
});

libraryAssetRoute.get('/:cmpId/*', (c) => {
  const cmpId = c.req.param('cmpId');
  if (!/^cmp_[a-z0-9]+$/i.test(cmpId)) return jsonResp(400, 'invalid_id');
  return servirDe(
    join(libraryComponentBundleDir(cmpId as `cmp_${string}`), 'assets'),
    restoDaUrl(c.req.url, '/api/library-asset', cmpId),
    c.req.header('range'),
  );
});
