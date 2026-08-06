import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative } from 'node:path';
import { ehNomeDeVersao, ehProjectId, projectGeneratedDir } from '@ds/shared';
import { Hono } from 'hono';
import { mimeDoBundle } from '../lib/bundle-v2.js';

/**
 * Serve as versões geradas de um site, direto do disco.
 *
 * É o que permite VER um site antes de baixar o zip: a tela Meus sites monta a
 * prévia num iframe apontando para cá, e "abrir em nova aba" usa a mesma URL.
 *
 * Mesma disciplina de path do vault: id validado, travessia bloqueada, mime
 * explícito. Sites gerados são conteúdo nosso (o gerador escreveu), mas a
 * prévia roda no mesmo sandbox de iframe dos outros previews — regra única é
 * regra que ninguém esquece.
 */
export const siteRoute = new Hono();

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
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

siteRoute.get('/:prjId/:versao/*', (c) => {
  const prjId = c.req.param('prjId');
  const versao = c.req.param('versao');
  if (!ehProjectId(prjId)) return c.json({ error: 'invalid_id' }, 400);
  if (!ehNomeDeVersao(versao)) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const dir = join(projectGeneratedDir(prjId), versao);
  if (!existsSync(dir)) return c.json({ error: 'not_found' }, 404);

  const url = new URL(c.req.url);
  const prefixo = `/site/${prjId}/${versao}/`;
  let relPath = decodeURIComponent(
    url.pathname.slice(url.pathname.indexOf(prefixo) + prefixo.length),
  );
  if (!relPath) relPath = 'index.html';

  if (isAbsolute(relPath) || relPath.split(/[/\\]/).includes('..')) {
    return c.json({ error: 'forbidden' }, 403);
  }

  const abs = normalize(join(dir, relPath));
  const rel = relative(dir, abs);
  if (rel.startsWith('..') || isAbsolute(rel)) return c.json({ error: 'forbidden' }, 403);
  if (!existsSync(abs) || statSync(abs).isDirectory()) {
    // Fallback de SPA não se aplica: sites gerados são estáticos com index.html.
    return c.json({ error: 'not_found', path: relPath }, 404);
  }

  const buf = readFileSync(abs);
  // Extensão desconhecida com cara de JS (o `.17` de capturas antigas copiado
  // para o site gerado) é servida como script — mesmo faro da rota de bundle.
  const ext = extname(abs).toLowerCase();
  const mime = MIME[ext] ?? mimeDoBundle(ext, buf);
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': mime, 'Cache-Control': 'private, max-age=300' },
  });
});

/** `/site/:prjId/:versao` sem barra final → redireciona para o index. */
siteRoute.get('/:prjId/:versao', (c) => {
  const prjId = c.req.param('prjId');
  const versao = c.req.param('versao');
  return c.redirect(`/site/${prjId}/${encodeURIComponent(versao)}/index.html`);
});
