/**
 * Fetch de URL. Duas estratégias:
 * 1. Playwright, se instalado, para sites JS-heavy (SPA).
 * 2. Fetch nativo, para sites server-rendered.
 *
 * Playwright é opcional: se não estiver instalado, cai no fetch.
 * Fica registrado no metadata qual estratégia foi usada.
 */

export type FetchStrategy = 'playwright' | 'fetch';

export type FetchResult = {
  html: string;
  finalUrl: string;
  strategy: FetchStrategy;
};

export const fetchUrl = async (url: string): Promise<FetchResult> => {
  const playwright = await tryLoadPlaywright();
  if (playwright !== null) {
    return fetchWithPlaywright(url, playwright);
  }
  return fetchWithFetch(url);
};

const tryLoadPlaywright = async (): Promise<PlaywrightApi | null> => {
  try {
    // @ts-expect-error playwright é opcional; se não estiver instalado, cai no fetch
    const mod = await import('playwright');
    return mod as unknown as PlaywrightApi;
  } catch {
    return null;
  }
};

type PlaywrightApi = {
  chromium: {
    launch: (opts: { headless: boolean }) => Promise<{
      newContext: (opts: { userAgent: string }) => Promise<{
        newPage: () => Promise<{
          goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<void>;
          content: () => Promise<string>;
          url: () => string;
        }>;
      }>;
      close: () => Promise<void>;
    }>;
  };
};

const fetchWithPlaywright = async (url: string, pw: PlaywrightApi): Promise<FetchResult> => {
  const browser = await pw.chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    const html = await page.content();
    return { html, finalUrl: page.url(), strategy: 'playwright' };
  } finally {
    await browser.close();
  }
};

const fetchWithFetch = async (url: string): Promise<FetchResult> => {
  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) {
    throw new Error(`fetch ${url} retornou ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  return { html, finalUrl: res.url, strategy: 'fetch' };
};
