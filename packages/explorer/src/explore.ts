import { randomUUID } from 'node:crypto';
import type { CaptureManifest, CapturedElement, CapturedState } from '@ds/shared';
import { assessFidelity } from './assess.js';
import {
  type AssetFetcher,
  absolutizeRefs,
  createHttpFetcher,
  extractAssetRefs,
  localizeAssets,
  rewriteReferences,
} from './assets.js';
import {
  type ExplorerLog,
  PlaywrightUnavailableError,
  type RawCapture,
  exploreWithBrowser,
  renderWithBrowser,
} from './browser.js';
import { type ExplorerLimits, resolveLimits } from './config.js';
import { inferirInteracoes } from './interaction-map.js';

/**
 * Orquestrador de alto nível: transforma a captura crua do navegador num
 * `CaptureManifest` — assets localizados, cada elemento com sua avaliação de
 * fidelidade e seus estados. É o que o segmenter consome.
 *
 * Degrada com honestidade: sem Playwright, cai para uma captura `estatico` a
 * partir do HTML servido (sem estados descobertos, mas com assets e avaliação).
 */

export type ExploreOptions = {
  limits?: Partial<ExplorerLimits>;
  log?: ExplorerLog;
  /**
   * Grava os assets baixados. Quando ausente, os assets não são localizados
   * (as referências continuam apontando para a origem).
   */
  assetSink?: (localPath: string, bytes: Uint8Array) => void;
  /** Fetcher injetável (teste). Default: HTTP real com o teto de tamanho. */
  fetcher?: AssetFetcher;
  /** HTML já obtido, para o caminho estático (evita novo fetch). */
  staticHtml?: string;
  /**
   * Recebe o HTML RENDERIZADO (pós-JS, pós-scroll) da captura. É a melhor fonte
   * para a segmentação — o DOM real, não o HTML servido. O chamador grava como
   * `design-system.html` e roda o segmenter em cima.
   */
  onRenderedHtml?: (html: string) => void;
};

const noop: ExplorerLog = () => {};

/** Constrói os `CapturedElement` a partir da captura crua + CSS coletado. */
const buildElements = (raw: RawCapture, css: string, bundled: boolean): CapturedElement[] =>
  raw.elements.map((el) => {
    const states: CapturedState[] = el.states.map((s) => ({
      id: `st_${randomUUID().slice(0, 12)}`,
      trigger: s.trigger,
      label: s.label || s.trigger,
      signature: s.signature,
      html: s.html,
      portalHtml: s.portalHtml,
    }));
    const assessment = assessFidelity(el.initialHtml, css, {
      hasCapturedStates: states.length > 0,
      bundledAssets: bundled,
    });
    // Junta as interações inferidas do descritor às detectadas pelo assess.
    const conhecidas = new Set(assessment.interactions.map((i) => i.kind));
    for (const k of inferirInteracoes(el.descriptor)) {
      if (!conhecidas.has(k)) {
        assessment.interactions.push({
          kind: k,
          support: states.length > 0 ? 'completo' : 'parcial',
        });
      }
    }
    return {
      ref: el.descriptor.ref,
      tag: el.descriptor.tag,
      role: el.descriptor.role,
      box: el.descriptor.box,
      label: el.descriptor.ariaLabel ?? el.descriptor.text.slice(0, 60) ?? el.descriptor.tag,
      interactions: [...new Set(assessment.interactions.map((i) => i.kind))],
      states,
      assessment,
    };
  });

/** Localiza os assets referenciados no HTML+CSS e devolve o CSS reescrito. */
const localize = async (
  html: string,
  css: string,
  baseUrl: string | null,
  opts: ExploreOptions,
  limits: ExplorerLimits,
): Promise<{
  assets: CaptureManifest['assets'];
  stats: { found: number; saved: number; bytes: number };
}> => {
  if (!opts.assetSink) return { assets: [], stats: { found: 0, saved: 0, bytes: 0 } };
  const refs = extractAssetRefs(html, css, baseUrl);
  const fetcher = opts.fetcher ?? createHttpFetcher(limits.maxAssetBytes);
  const res = await localizeAssets(refs, fetcher, opts.assetSink, limits);
  return {
    assets: res.assets,
    stats: { found: res.stats.found, saved: res.stats.saved, bytes: res.stats.bytes },
  };
};

/** Junta o texto de todas as folhas de estilo inline coletadas. */
const cssFromSheets = (raw: RawCapture): string =>
  raw.stylesheets
    .filter((s) => s.inline && s.content)
    .map((s) => s.content ?? '')
    .join('\n');

/**
 * Explora uma URL e devolve o manifesto rico. Nunca lança por falta de
 * Playwright: cai para `estatico`.
 */
export const explorePage = async (
  url: string,
  opts: ExploreOptions = {},
): Promise<CaptureManifest> => {
  const limits = resolveLimits(opts.limits);
  const log = opts.log ?? noop;
  const started = Date.now();

  let raw: RawCapture | null = null;
  const warnings: string[] = [];
  try {
    raw = await exploreWithBrowser(url, limits, log);
  } catch (err) {
    if (err instanceof PlaywrightUnavailableError) {
      warnings.push(
        'Playwright não instalado: captura estática (sem descoberta de estados). Rode `pnpm --filter @ds/explorer exec playwright install chromium` para a captura completa.',
      );
      log('degradado', { motivo: 'sem-playwright' });
    } else {
      throw err;
    }
  }

  if (raw !== null) {
    opts.onRenderedHtml?.(raw.finalHtml);
    const css = cssFromSheets(raw);
    const { assets, stats } = await localize(raw.finalHtml, css, raw.url, opts, limits);
    const bundled = assets.length > 0;
    const elements = buildElements(raw, css, bundled);
    return {
      version: 1,
      url: raw.url,
      capturedAt: Date.now(),
      strategy: 'playwright',
      viewport: raw.viewport,
      stylesheets: raw.stylesheets.map((s) => ({ href: s.href, inline: s.inline, bytes: s.bytes })),
      assets,
      elements,
      stats: {
        durationMs: Date.now() - started,
        elementsAnalyzed: raw.stats.elementsAnalyzed,
        interactionsTried: raw.stats.interactionsTried,
        statesFound: raw.stats.statesFound,
        assetsFound: stats.found,
        assetsSaved: stats.saved,
        assetsBytes: stats.bytes,
      },
      warnings: [...warnings, ...raw.warnings],
    };
  }

  // Caminho estático: só o HTML servido, sem estados.
  const html = opts.staticHtml ?? (await fetchStatic(url));
  opts.onRenderedHtml?.(html);
  const { assets, stats } = await localize(html, '', url, opts, limits);
  return {
    version: 1,
    url,
    capturedAt: Date.now(),
    strategy: 'estatico',
    viewport: { width: 1440, height: 900 },
    stylesheets: [],
    assets,
    elements: [],
    stats: {
      durationMs: Date.now() - started,
      elementsAnalyzed: 0,
      interactionsTried: 0,
      statesFound: 0,
      assetsFound: stats.found,
      assetsSaved: stats.saved,
      assetsBytes: stats.bytes,
    },
    warnings,
  };
};

const UA_BROWSER =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const fetchStatic = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { 'User-Agent': UA_BROWSER } });
  if (!res.ok) throw new Error(`fetch ${url} retornou ${res.status}`);
  return res.text();
};

const fetchStaticFull = async (url: string): Promise<{ html: string; finalUrl: string }> => {
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA_BROWSER,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
    },
  });
  if (!res.ok) throw new Error(`fetch ${url} retornou ${res.status} ${res.statusText}`);
  return { html: await res.text(), finalUrl: res.url };
};

export type RenderResult = {
  html: string;
  finalUrl: string;
  strategy: 'playwright' | 'estatico';
  warnings: string[];
};

/**
 * Renderiza uma URL para um `design-system.html` fiel — o ponto de entrada da
 * EXTRAÇÃO. Usa o navegador quando disponível (resolve 403/SPA), cai para fetch
 * estático quando não, e em ambos torna as referências absolutas para o preview
 * carregar da origem sem quebrar. Rápido: sem descoberta de estados.
 *
 * Nunca lança por falta de Playwright — degrada e avisa. Lança só se nem o
 * navegador nem o fetch conseguirem a página (aí o job deve registrar o erro).
 */
export const renderPage = async (url: string, opts: ExploreOptions = {}): Promise<RenderResult> => {
  const limits = resolveLimits(opts.limits);
  const log = opts.log ?? noop;
  const warnings: string[] = [];

  try {
    const r = await renderWithBrowser(url, limits, log);
    return {
      html: absolutizeRefs(r.html, r.finalUrl),
      finalUrl: r.finalUrl,
      strategy: 'playwright',
      warnings,
    };
  } catch (err) {
    if (!(err instanceof PlaywrightUnavailableError)) throw err;
    warnings.push(
      'Playwright não instalado: extração por fetch estático — sites protegidos (403) ou que montam o conteúdo por JS podem vir incompletos. Rode `pnpm --filter @ds/explorer exec playwright install chromium`.',
    );
    log('degradado', { motivo: 'sem-playwright' });
    const { html, finalUrl } = await fetchStaticFull(url);
    return { html: absolutizeRefs(html, finalUrl), finalUrl, strategy: 'estatico', warnings };
  }
};

export { rewriteReferences };
