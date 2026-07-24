import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { createSecureHttpFetcher } from './assets.js';
import { DEFAULT_LIMITS } from './config.js';
import { explorePage } from './explore.js';

/**
 * Regressão do bypass anti-bot (achado em alche.studio): um site protegido
 * responde 403 a um fetch HTTP separado, mas serve normalmente para a sessão
 * real do navegador. A fixture reproduz isso SEM depender de nenhum site externo:
 * a página, ao carregar, ganha um cookie de sessão; a imagem só é servida (200) a
 * quem manda esse cookie — senão, 403. O fetcher HTTP seguro não manda cookies
 * (de propósito), então tomaria 403; o Chromium manda (mesma origem) e recebe a
 * imagem. A captura observa o que o navegador baixou e localiza o asset assim
 * mesmo. Genérico: vale para qualquer página com proteção por cookie de sessão.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright opcional e não tipado
type Any = any;

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const PAGE = `<!doctype html><html><head><meta charset="utf-8"></head><body>
<section><h2>Bloco com imagem protegida</h2>
<img id="p" src="/protegida.png" width="40" height="40"></section>
</body></html>`;

test('regressão: asset com 403 anti-bot é localizado pela rede do navegador', async (t) => {
  const pw = await loadPlaywright();
  if (!pw) return t.skip('Playwright indisponível.');
  try {
    const b = await pw.chromium.launch({ headless: true });
    await b.close();
  } catch (err) {
    return t.skip(`Chromium não instalado (${err instanceof Error ? err.message : 'erro'}).`);
  }

  // === Fixture: cookie de sessão na página; imagem só com o cookie ===
  const pedidos: Array<{ url: string; cookie: string; status: number }> = [];
  const fixture = createServer((req: Any, res: Any) => {
    const url = (req.url ?? '').split('?')[0];
    const cookie = String(req.headers.cookie ?? '');
    if (url === '/' || url === '/index.html') {
      pedidos.push({ url, cookie, status: 200 });
      res.writeHead(200, { 'Content-Type': 'text/html', 'Set-Cookie': 'sessao=ok; Path=/' });
      res.end(PAGE);
      return;
    }
    if (url === '/protegida.png') {
      // Proteção anti-bot: sem o cookie de sessão, 403 (como Cloudflare devolve).
      if (!cookie.includes('sessao=ok')) {
        pedidos.push({ url, cookie, status: 403 });
        res.writeHead(403, { 'Content-Type': 'text/html' });
        res.end('<html><body>403 — bot bloqueado</body></html>');
        return;
      }
      pedidos.push({ url, cookie, status: 200 });
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(PNG_1x1);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => fixture.listen(0, r));
  const port = (fixture.address() as Any).port;
  const base = `http://localhost:${port}`;

  process.env.DS_ASSET_ALLOW_LOCAL = '1'; // fixture em localhost
  t.after(async () => {
    await new Promise<void>((r) => fixture.close(() => r()));
    process.env.DS_ASSET_ALLOW_LOCAL = undefined;
  });

  // === Prova do "antes": o fetcher HTTP seguro (sem cookies) toma 403 ===
  const seguro = createSecureHttpFetcher(DEFAULT_LIMITS);
  const direto = await seguro(`${base}/protegida.png`);
  assert.equal(direto, null, 'fetch HTTP direto é bloqueado (403) — sem sessão');

  // === Captura: o navegador carrega a imagem COM o cookie; a rede é observada ===
  const salvos = new Map<string, Uint8Array>();
  const manifest = await explorePage(`${base}/index.html`, {
    exploration: { mode: 'deep', reasons: ['fixture'] },
    assetSink: (localPath, bytes) => salvos.set(localPath, bytes),
  });

  const img = manifest.assets.find((a) => a.kind === 'image');
  assert.ok(img, 'a imagem protegida foi localizada (via rede do navegador)');
  assert.equal(img?.originalUrl, `${base}/protegida.png`);

  // Os bytes gravados são exatamente os da imagem (conteúdo, não só contagem).
  const bytes = salvos.get(img?.localPath ?? '');
  assert.ok(bytes, 'bytes gravados no sink');
  assert.deepEqual(
    Buffer.from(bytes as Uint8Array),
    PNG_1x1,
    'os bytes localizados são a imagem real',
  );

  // Prova de que foi o NAVEGADOR (com cookie) e não um fetch sem sessão:
  const comCookie = pedidos.find((p) => p.url === '/protegida.png' && p.status === 200);
  assert.ok(comCookie, 'a imagem foi servida (200) a uma requisição COM o cookie de sessão');
  assert.match(comCookie?.cookie ?? '', /sessao=ok/, 'a requisição de 200 levou o cookie');

  t.diagnostic(
    `pedidos à imagem: ${pedidos
      .filter((p) => p.url === '/protegida.png')
      .map((p) => p.status)
      .join(', ')} — localizada apesar do 403 ao fetch direto`,
  );
});
