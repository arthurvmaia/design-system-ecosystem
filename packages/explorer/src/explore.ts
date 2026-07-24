import { randomUUID } from 'node:crypto';
import type { CaptureManifest, CapturedElement, CapturedState } from '@ds/shared';
import { assessFidelity } from './assess.js';
import {
  type AssetFetcher,
  type FetchedAsset,
  absolutizeRefs,
  createSecureHttpFetcher,
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
import { localizeCss } from './css-localize.js';
import { inferirInteracoes } from './interaction-map.js';
import { type Contador, FASE, Telemetria, resolveOrcamento } from './telemetria.js';

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
  /**
   * Metadados da decisão de profundidade, para registrar no manifesto por que a
   * captura profunda rodou (canvas, sticky, lottie…). O chamador (`extrair`)
   * decide via `decidirProfundidade` e repassa aqui.
   */
  exploration?: { mode: 'quick' | 'deep'; reasons: string[] };
  /**
   * HTML a partir do qual LOCALIZAR os assets. Por padrão é o render interno da
   * exploração, mas esse pode divergir do `design-system.html` que de fato é
   * segmentado (site com lazy-load monta imagens diferentes entre renders). O
   * chamador passa aqui o design-system.html para o manifesto cobrir exatamente
   * os assets que os segmentos referenciam.
   */
  htmlParaAssets?: string;
  /**
   * Telemetria injetável (o pipeline cria uma e mede também segmentar/validar; os
   * testes injetam com orçamento curto). Ausente → uma nova é criada por aqui.
   */
  telemetria?: Telemetria;
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
      // Absolutiza as refs do estado (como o design-system.html): o `outerHTML`
      // capturado traz as URLs como escritas (`/b.png`), e sem isto elas não
      // casam com o índice absoluto de assets — e quebrariam no preview.
      html: absolutizeRefs(s.html, raw.url),
      portalHtml: s.portalHtml ? absolutizeRefs(s.portalHtml, raw.url) : undefined,
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
      // Assinatura de religação: id e classes sobrevivem entre renders; o `ref`
      // (data-dsx-ref) não. É por aqui que o segmenter associa ao segmento certo.
      match: { id: el.descriptor.id, classes: el.descriptor.classes },
      interactions: [...new Set(assessment.interactions.map((i) => i.kind))],
      states,
      assessment,
    };
  });

/**
 * Fetcher que consulta primeiro os bytes que o NAVEGADOR já baixou (mapa de
 * rede da captura) e só cai no HTTP para o que ele não tiver carregado. É o que
 * faz sites com proteção anti-bot terem os assets localizados: o Chromium passou
 * a proteção na sessão real; um fetch HTTP separado tomaria 403. Os bytes do
 * mapa já passaram pelos mesmos guardas de segurança na captura.
 */
const fetcherComRede =
  (rede: Map<string, FetchedAsset>, fallback: AssetFetcher): AssetFetcher =>
  async (url) =>
    rede.get(url) ?? (await fallback(url));

/** Localiza os assets referenciados no HTML+CSS e devolve o CSS reescrito. */
const localize = async (
  html: string,
  css: string,
  baseUrl: string | null,
  opts: ExploreOptions,
  limits: ExplorerLimits,
  rede?: Map<string, FetchedAsset>,
  signal?: AbortSignal,
  contador?: Contador,
): Promise<{
  assets: CaptureManifest['assets'];
  stats: { found: number; saved: number; bytes: number };
}> => {
  if (!opts.assetSink) return { assets: [], stats: { found: 0, saved: 0, bytes: 0 } };
  const refs = extractAssetRefs(html, css, baseUrl);
  // Fetcher injetado (teste) vence sempre. Senão: rede-do-navegador → HTTP seguro.
  // O fetcher HTTP recebe o SINAL da fase (corte por orçamento) e o contador.
  const seguro = createSecureHttpFetcher(limits, { signal, contador });
  const fetcher = opts.fetcher ?? (rede ? fetcherComRede(rede, seguro) : seguro);
  // CSS externo (`<link rel=stylesheet>`) é processado à parte: resolve os
  // `url()`/`@import` INTERNOS relativos ao próprio arquivo e reescreve para
  // local. Os demais assets (imagens/fontes/inline-css) vão pelo caminho normal.
  const cssRefs = refs.filter((r) => r.kind === 'css' && r.absolute !== null);
  const outros = refs.filter((r) => r.kind !== 'css');
  const cssRes = await localizeCss(
    cssRefs.map((r) => r.absolute as string),
    fetcher,
    opts.assetSink,
    limits,
    signal,
  );
  const res = await localizeAssets(outros, fetcher, opts.assetSink, limits, signal);
  return {
    assets: [...res.assets, ...cssRes.assets],
    stats: {
      found: res.stats.found + cssRefs.length,
      saved: res.stats.saved + cssRes.assets.length,
      bytes: res.stats.bytes,
    },
  };
};

/** Junta o texto de todas as folhas de estilo inline coletadas. */
const cssFromSheets = (raw: RawCapture): string =>
  raw.stylesheets
    .filter((s) => s.inline && s.content)
    .map((s) => s.content ?? '')
    .join('\n');

/** Mensagem honesta de corte por tempo, para a Galeria mostrar em vez de erro. */
const avisoParcial = (tel: Telemetria): string => {
  const r = tel.relatorio();
  return `Extração PARCIAL por orçamento de tempo (fase "${r.faseInterrompida ?? '?'}"). O que foi capturado até o corte foi preservado — nada foi descartado.`;
};

/**
 * Explora uma URL e devolve o manifesto rico. Nunca lança por falta de
 * Playwright: cai para `estatico`. Todo o processo roda sob a `Telemetria`: cada
 * fase é medida e orçada, e o corte por tempo produz um resultado PARCIAL válido
 * (nada do que já foi capturado é descartado).
 */
export const explorePage = async (
  url: string,
  opts: ExploreOptions = {},
): Promise<CaptureManifest> => {
  const limits = resolveLimits(opts.limits);
  const log = opts.log ?? noop;
  const { orcamento, avisos } = resolveOrcamento(limits);
  for (const a of avisos) log('orcamento', { aviso: a });
  const tel = opts.telemetria ?? new Telemetria(orcamento);
  const started = Date.now();

  let raw: RawCapture | null = null;
  const warnings: string[] = [];
  try {
    raw = await exploreWithBrowser(url, limits, log, tel);
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
    const cap = raw; // const: o TS mantém o narrowing dentro da closure abaixo
    opts.onRenderedHtml?.(cap.finalHtml);
    const css = cssFromSheets(cap);
    // Localiza a partir do design-system.html quando o chamador o fornece — é o
    // HTML autoritativo (o que é segmentado); o render interno pode ter menos. A
    // fase é orçada: se estourar, o que já baixou fica e o resto vira externo.
    const { assets, stats } = await tel.faseCooperativa(FASE.assetsRede, (signal) =>
      localize(
        opts.htmlParaAssets ?? cap.finalHtml,
        css,
        cap.url,
        opts,
        limits,
        cap.network,
        signal,
        tel,
      ),
    );
    tel.inc('assetsLocais', assets.length);
    const bundled = assets.length > 0;
    const elements = buildElements(cap, css, bundled);
    const parcial = tel.parcial ? [avisoParcial(tel)] : [];
    return {
      version: 1,
      url: cap.url,
      capturedAt: Date.now(),
      strategy: 'playwright',
      exploration: {
        mode: opts.exploration?.mode ?? 'deep',
        reasons: opts.exploration?.reasons ?? [],
        durationMs: Date.now() - started,
        limitsHit: [...cap.warnings.filter((w) => /orçamento|limite/i.test(w)), ...parcial],
        errors: [],
      },
      viewport: cap.viewport,
      stylesheets: cap.stylesheets.map((s) => ({ href: s.href, inline: s.inline, bytes: s.bytes })),
      assets,
      elements,
      stats: {
        durationMs: Date.now() - started,
        elementsAnalyzed: cap.stats.elementsAnalyzed,
        interactionsTried: cap.stats.interactionsTried,
        statesFound: cap.stats.statesFound,
        assetsFound: stats.found,
        assetsSaved: stats.saved,
        assetsBytes: stats.bytes,
      },
      warnings: [...warnings, ...cap.warnings, ...parcial],
      telemetry: tel.relatorio(),
      scroll: [],
    };
  }

  // Caminho estático: só o HTML servido, sem estados.
  const html = opts.staticHtml ?? (await fetchStatic(url));
  opts.onRenderedHtml?.(html);
  const { assets, stats } = await tel.faseCooperativa(FASE.assetsRede, (signal) =>
    localize(opts.htmlParaAssets ?? html, '', url, opts, limits, undefined, signal, tel),
  );
  tel.inc('assetsLocais', assets.length);
  const parcial = tel.parcial ? [avisoParcial(tel)] : [];
  return {
    version: 1,
    url,
    capturedAt: Date.now(),
    strategy: 'estatico',
    exploration: {
      mode: 'quick',
      reasons: opts.exploration?.reasons ?? [],
      durationMs: Date.now() - started,
      limitsHit: parcial,
      errors: warnings,
    },
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
    warnings: [...warnings, ...parcial],
    telemetry: tel.relatorio(),
    scroll: [],
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
