import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import { ehDesignSystemId, vaultExtractedDir } from '@ds/shared/paths';
import { Hono } from 'hono';

export const vaultRoute = new Hono();

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8',
};

/**
 * Serve assets do vault para preview em iframe.
 * Cross-platform: leitura direta com read + Response, sem depender de serveStatic
 * (que tem comportamento inconsistente entre Windows/POSIX quando path é absoluto).
 */
vaultRoute.get('/:dsId/*', (c) => {
  const dsId = c.req.param('dsId');
  if (!ehDesignSystemId(dsId)) {
    return c.json({ error: 'invalid_id' }, 400);
  }

  const dir = vaultExtractedDir(dsId);
  if (!existsSync(dir)) {
    return c.json({ error: 'not_found' }, 404);
  }

  const url = new URL(c.req.url);
  const relPath = decodeURIComponent(url.pathname.replace(new RegExp(`^/vault/${dsId}/?`), ''));
  if (!relPath) {
    return c.redirect(`/vault/${dsId}/design-system.html`);
  }

  // URLs sempre usam /, mas o filesystem no Windows usa \. join+normalize resolve.
  if (isAbsolute(relPath) || relPath.split(/[/\\]/).includes('..')) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const abs = normalize(join(dir, relPath));
  const rel = relative(dir, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    return c.json({ error: 'forbidden' }, 403);
  }
  if (!existsSync(abs) || statSync(abs).isDirectory()) {
    return c.json({ error: 'not_found' }, 404);
  }

  const buf = readFileSync(abs);
  const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
  return new Response(new Uint8Array(buf), {
    headers: {
      'Content-Type': mime,
      'Cache-Control': 'public, max-age=3600',
    },
  });
});
