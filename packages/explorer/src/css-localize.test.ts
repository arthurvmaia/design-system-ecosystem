import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssetFetcher } from './assets.js';
import { type CssLimits, localizeCss } from './css-localize.js';

const LIMITS: CssLimits = { maxAssetBytes: 1_000_000, maxCssDepth: 5, maxCssFiles: 40 };

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

/** Fetcher falso a partir de um mapa url → {mime, body}. */
const fakeFetcher = (
  mapa: Record<string, { mime: string; body: string | Uint8Array }>,
): AssetFetcher => {
  return async (url: string) => {
    const e = mapa[url];
    if (!e) return null;
    const bytes = typeof e.body === 'string' ? enc(e.body) : e.body;
    return { status: 200, mimeType: e.mime, bytes };
  };
};

/** Coletor do sink: localPath → texto. */
const coletor = () => {
  const arquivos = new Map<string, string>();
  const sink = (localPath: string, bytes: Uint8Array) => {
    arquivos.set(localPath, new TextDecoder().decode(bytes));
  };
  return { arquivos, sink };
};

const css = (
  url: string,
  r: Awaited<ReturnType<typeof localizeCss>>,
  arquivos: Map<string, string>,
): string => {
  const local = r.cssMap.get(url);
  return local ? (arquivos.get(local) ?? '') : '';
};

test('CSS externo: url() interno é baixado e reescrito para caminho relativo', async () => {
  const { arquivos, sink } = coletor();
  const fetcher = fakeFetcher({
    'https://cdn.test/main.css': { mime: 'text/css', body: '.a{background:url(img/bg.png)}' },
    'https://cdn.test/img/bg.png': { mime: 'image/png', body: 'PNGBYTES' },
  });
  const r = await localizeCss(['https://cdn.test/main.css'], fetcher, sink, LIMITS);
  const out = css('https://cdn.test/main.css', r, arquivos);
  assert.match(out, /url\(\.\.\/image\/[a-f0-9]+\.png\)/, 'reescrito para ../image/<hash>.png');
  assert.ok(
    r.assets.some((a) => a.originalUrl === 'https://cdn.test/img/bg.png'),
    'imagem interna capturada',
  );
});

test('@import aninhado: resolvido pela base do CSS e reescrito', async () => {
  const { arquivos, sink } = coletor();
  const fetcher = fakeFetcher({
    'https://cdn.test/main.css': { mime: 'text/css', body: '@import "sub/other.css";' },
    'https://cdn.test/sub/other.css': {
      mime: 'text/css',
      body: '.b{background:url(../img/x.png)}',
    },
    'https://cdn.test/img/x.png': { mime: 'image/png', body: 'X' },
  });
  const r = await localizeCss(['https://cdn.test/main.css'], fetcher, sink, LIMITS);
  const main = css('https://cdn.test/main.css', r, arquivos);
  assert.match(main, /@import "[a-f0-9]+\.css"/, 'import vira css/<hash> vizinho');
  const other = css('https://cdn.test/sub/other.css', r, arquivos);
  // ../img/x.png relativo a sub/other.css = https://cdn.test/img/x.png → ../image/<hash>
  assert.match(other, /url\(\.\.\/image\/[a-f0-9]+\.png\)/);
  assert.ok(r.assets.some((a) => a.originalUrl === 'https://cdn.test/img/x.png'));
});

test('@import circular não trava (detecta ciclo)', async () => {
  const { sink } = coletor();
  const fetcher = fakeFetcher({
    'https://cdn.test/a.css': { mime: 'text/css', body: '@import "b.css";' },
    'https://cdn.test/b.css': { mime: 'text/css', body: '@import "a.css";' },
  });
  const r = await localizeCss(['https://cdn.test/a.css'], fetcher, sink, LIMITS);
  assert.ok(r.cssMap.has('https://cdn.test/a.css'));
  assert.ok(r.cssMap.has('https://cdn.test/b.css'));
  assert.ok(
    r.warnings.some((w) => /circular/i.test(w)),
    'registrou o ciclo',
  );
});

test('SVG com fragmento em url() do CSS: baixa sem #, preserva o #', async () => {
  const { arquivos, sink } = coletor();
  const fetcher = fakeFetcher({
    'https://cdn.test/f.css': { mime: 'text/css', body: '.a{mask:url(icons.svg#m)}' },
    'https://cdn.test/icons.svg': { mime: 'image/svg+xml', body: '<svg></svg>' },
  });
  const r = await localizeCss(['https://cdn.test/f.css'], fetcher, sink, LIMITS);
  const out = css('https://cdn.test/f.css', r, arquivos);
  assert.match(out, /url\(\.\.\/svg\/[a-f0-9]+\.svg#m\)/, 'fragmento preservado');
});

test('SEGURANÇA: @import para IP privado é bloqueado', async () => {
  const { sink } = coletor();
  const fetcher = fakeFetcher({
    'https://cdn.test/main.css': {
      mime: 'text/css',
      body: '@import "http://127.0.0.1/secret.css";',
    },
    'http://127.0.0.1/secret.css': { mime: 'text/css', body: '.hack{}' },
  });
  const r = await localizeCss(['https://cdn.test/main.css'], fetcher, sink, LIMITS);
  assert.ok(!r.cssMap.has('http://127.0.0.1/secret.css'), 'não baixou o CSS privado');
  assert.ok(!r.assets.some((a) => a.originalUrl.includes('127.0.0.1')));
});

test('SEGURANÇA: javascript:/data: em url() são ignorados', async () => {
  const { arquivos, sink } = coletor();
  const fetcher = fakeFetcher({
    'https://cdn.test/x.css': {
      mime: 'text/css',
      body: '.a{background:url(javascript:alert(1))}.b{background:url(data:image/png;base64,AA)}',
    },
  });
  const r = await localizeCss(['https://cdn.test/x.css'], fetcher, sink, LIMITS);
  const out = css('https://cdn.test/x.css', r, arquivos);
  assert.match(out, /url\(javascript:alert\(1\)\)/, 'javascript: intocado (não baixado)');
  assert.match(out, /url\(data:image\/png/, 'data: intocado');
});

test('SEGURANÇA: profundidade de @import é limitada', async () => {
  const { sink } = coletor();
  const mapa: Record<string, { mime: string; body: string }> = {};
  for (let i = 0; i < 10; i++) {
    mapa[`https://cdn.test/c${i}.css`] = { mime: 'text/css', body: `@import "c${i + 1}.css";` };
  }
  mapa['https://cdn.test/c10.css'] = { mime: 'text/css', body: '.fim{}' };
  const r = await localizeCss(['https://cdn.test/c0.css'], fakeFetcher(mapa), sink, {
    ...LIMITS,
    maxCssDepth: 3,
  });
  assert.ok(
    r.warnings.some((w) => /profundidade/i.test(w)),
    'parou pela profundidade',
  );
  assert.ok(r.cssMap.size <= 5, `não processou todos (${r.cssMap.size})`);
});

test('protocol-relative (//host) resolve pelo protocolo da base', async () => {
  const { arquivos, sink } = coletor();
  const fetcher = fakeFetcher({
    'https://cdn.test/m.css': { mime: 'text/css', body: '.a{background:url(//cdn.test/p.png)}' },
    'https://cdn.test/p.png': { mime: 'image/png', body: 'P' },
  });
  const r = await localizeCss(['https://cdn.test/m.css'], fetcher, sink, LIMITS);
  assert.ok(
    r.assets.some((a) => a.originalUrl === 'https://cdn.test/p.png'),
    'resolveu //cdn.test → https',
  );
  assert.match(css('https://cdn.test/m.css', r, arquivos), /url\(\.\.\/image\//);
});
