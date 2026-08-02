import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, normalize, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hono } from 'hono';

/**
 * Serve o app web compilado, do próprio servidor.
 *
 * Em desenvolvimento nada disso roda: o Vite serve o app em 5173 e faz proxy
 * das rotas de API para cá. Isto existe para o caso de PUBLICAR — um túnel, uma
 * máquina na nuvem — em que ter duas portas seria um problema e não uma
 * conveniência.
 *
 * ## Por que uma origem só
 *
 * Com o app e a API no mesmo endereço não há CORS para acertar, e o cookie da
 * sessão é `SameSite=Lax`, que é o modo restrito. Servir o app de um domínio e
 * a API de outro obrigaria a `SameSite=None`, que é o modo em que o navegador
 * manda o cookie para requisições vindas de qualquer site. Uma porta a menos
 * também é uma configuração a menos para errar.
 *
 * ## O fallback de SPA
 *
 * O app usa rotas de verdade (`/gallery`, `/library`). Abrir uma delas direto
 * pede ao servidor um arquivo que não existe — quem sabe o que fazer com
 * `/gallery` é o React, depois de carregar. Então qualquer caminho que não seja
 * arquivo devolve o `index.html`, e o roteador resolve dali.
 *
 * O fallback vale só para o que NÃO é API: uma rota de API inexistente tem de
 * continuar devolvendo 404, e não uma página HTML que o front tentaria ler como
 * JSON.
 */
export const appWebRoute = new Hono();

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
  '.mp3': 'audio/mpeg',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Onde o `pnpm --filter @ds/web build` escreve. */
export const diretorioDoApp = (): string =>
  process.env.ORBIS_WEB_DIST ??
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'web', 'dist');

/** O app compilado existe? Sem ele o servidor segue só como API, como sempre foi. */
export const appCompiladoExiste = (): boolean => existsSync(join(diretorioDoApp(), 'index.html'));

/**
 * O bundle do app tem hash no nome (`index-a1b2c3.js`), então pode ser guardado
 * para sempre. O `index.html` não: ele é quem aponta para o bundle novo depois
 * de um build, e guardá-lo serviria a versão velha para sempre.
 */
const cacheDe = (arquivo: string): string =>
  arquivo.includes('/assets/') || arquivo.includes('\\assets\\')
    ? 'public, max-age=31536000, immutable'
    : 'no-cache';

const responder = (abs: string): Response => {
  const buf = readFileSync(abs);
  const mime = MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream';
  return new Response(new Uint8Array(buf), {
    headers: { 'Content-Type': mime, 'Cache-Control': cacheDe(abs) },
  });
};

appWebRoute.get('/*', (c) => {
  const raiz = diretorioDoApp();
  if (!existsSync(join(raiz, 'index.html'))) {
    return c.json(
      {
        error: 'app_nao_compilado',
        message: 'O app ainda não foi compilado. Rode `pnpm publicar` em vez de `pnpm dev`.',
      },
      503,
    );
  }

  const caminho = decodeURIComponent(new URL(c.req.url).pathname);
  const rel = caminho === '/' ? 'index.html' : caminho.replace(/^\/+/, '');

  // Mesma disciplina do vault e dos sites gerados: nada de sair do diretório.
  if (isAbsolute(rel) || rel.split(/[/\\]/).includes('..')) {
    return c.json({ error: 'forbidden' }, 403);
  }
  const abs = normalize(join(raiz, rel));
  const dentro = relative(raiz, abs);
  if (dentro.startsWith('..') || isAbsolute(dentro)) return c.json({ error: 'forbidden' }, 403);

  if (existsSync(abs) && !statSync(abs).isDirectory()) return responder(abs);

  // Não é arquivo: é rota do app. Quem sabe o que fazer com ela é o React.
  return responder(join(raiz, 'index.html'));
});
