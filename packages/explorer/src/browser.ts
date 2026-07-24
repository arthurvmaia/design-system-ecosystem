import type { StateTrigger } from '@ds/shared';
import type { ExplorerLimits } from './config.js';
import type { ElementDescriptor } from './descriptor.js';
import { probesPara } from './interaction-map.js';
import {
  BLOCK_HTML_FN,
  COLLECT_DESCRIPTORS_FN,
  INIT_LISTENER_TRACKER,
  OUTER_HTML_FN,
  SNAPSHOT_FN,
  buildCall,
  stripInstrumentation,
} from './page-script.js';
import {
  type StateSnapshot,
  diffSnapshots,
  hashString,
  registrarEstado,
  stateSignature,
} from './state-diff.js';

/**
 * O que a instrumentação devolve: como o `StateSnapshot`, mas com o HTML cru do
 * portal em vez da assinatura. Convertido por `toSnapshot`.
 */
type RawSnapshot = Omit<StateSnapshot, 'portalSignature'> & { portalHtml: string };

const toSnapshot = (raw: RawSnapshot): StateSnapshot => ({
  classes: raw.classes,
  attrs: raw.attrs,
  computed: raw.computed,
  box: raw.box,
  childCount: raw.childCount,
  textLen: raw.textLen,
  visible: raw.visible,
  portalSignature: raw.portalHtml ? hashString(raw.portalHtml) : '',
  htmlSig: raw.htmlSig,
});

/**
 * Orquestração do navegador — a única parte que precisa do Playwright.
 *
 * Segue o padrão já existente em `@ds/extractor/fetch-url`: o Playwright é
 * carregado por import dinâmico e é OPCIONAL. Sem ele, `explorePage` lança
 * `PlaywrightUnavailableError` e o chamador cai no caminho estático de sempre —
 * a captura vira `estatico`, mais pobre, mas nada quebra.
 *
 * O julgamento de segurança e de novidade de estado vem dos módulos puros
 * (`safety`, `interaction-map`, `state-diff`); aqui está só a mecânica de mover
 * o mouse, clicar e ler o DOM, com todos os tetos de `ExplorerLimits`.
 */

export class PlaywrightUnavailableError extends Error {
  constructor() {
    super('playwright não está instalado — exploração por navegador indisponível');
    this.name = 'PlaywrightUnavailableError';
  }
}

export type ExplorerLog = (evento: string, dados?: Record<string, unknown>) => void;

/** Um estado capturado de um elemento, cru (antes de virar schema). */
export type RawState = {
  trigger: StateTrigger;
  label: string;
  signature: string;
  html: string;
  portalHtml?: string;
};

export type RawElementCapture = {
  descriptor: ElementDescriptor;
  /** HTML do elemento no estado inicial, para a avaliação de fidelidade. */
  initialHtml: string;
  states: RawState[];
};

export type RawCapture = {
  strategy: 'playwright';
  url: string;
  finalHtml: string;
  stylesheets: Array<{ href: string | null; inline: boolean; bytes: number; content?: string }>;
  viewport: { width: number; height: number };
  elements: RawElementCapture[];
  stats: {
    elementsAnalyzed: number;
    interactionsTried: number;
    statesFound: number;
  };
  warnings: string[];
};

// ── Tipos mínimos do Playwright que usamos (opcional em runtime) ─────────────
type PwLocator = {
  count: () => Promise<number>;
  first: () => PwLocator;
  hover: (opts?: { timeout?: number; force?: boolean }) => Promise<void>;
  focus: (opts?: { timeout?: number }) => Promise<void>;
  click: (opts?: { timeout?: number; force?: boolean; trial?: boolean }) => Promise<void>;
};
type PwPage = {
  goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  url: () => string;
  // biome-ignore lint/suspicious/noExplicitAny: evaluate é genérico por natureza
  evaluate: (expression: string) => Promise<any>;
  locator: (selector: string) => PwLocator;
  mouse: { move: (x: number, y: number) => Promise<void> };
  keyboard: { press: (key: string) => Promise<void> };
  waitForTimeout: (ms: number) => Promise<void>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
};
type PwContext = {
  addInitScript: (script: { content: string }) => Promise<void>;
  newPage: () => Promise<PwPage>;
};
type PwBrowser = {
  newContext: (opts: {
    userAgent: string;
    viewport: { width: number; height: number };
  }) => Promise<PwContext>;
  close: () => Promise<void>;
};
type PlaywrightApi = {
  chromium: { launch: (opts: { headless: boolean }) => Promise<PwBrowser> };
};

const tryLoadPlaywright = async (): Promise<PlaywrightApi | null> => {
  try {
    // Especificador não-literal (`as string`) de propósito: o Playwright é
    // OPCIONAL, então o TS não deve resolvê-lo em tempo de tipo — funciona
    // instalado ou não. Em runtime o import resolve normalmente quando presente.
    const mod = await import('playwright' as string);
    return mod as unknown as PlaywrightApi;
  } catch {
    return null;
  }
};

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** Coleta as folhas de estilo (inline e externas) via evaluate. */
const COLLECT_STYLESHEETS_FN = `
() => {
  const out = [];
  for (const s of document.querySelectorAll('style')) {
    out.push({ href: null, inline: true, content: s.textContent || '' });
  }
  for (const l of document.querySelectorAll('link[rel="stylesheet"]')) {
    out.push({ href: l.href, inline: false });
  }
  return out;
}`;

/** Scroll controlado até o fim, para disparar lazy-load e reveals por viewport. */
const AUTO_SCROLL_FN = `
async (maxSteps) => {
  await new Promise((resolve) => {
    let total = 0; let steps = 0;
    const step = 400;
    const timer = setInterval(() => {
      window.scrollBy(0, step);
      total += step; steps++;
      if (total >= document.body.scrollHeight || steps >= maxSteps) {
        clearInterval(timer); window.scrollTo(0, 0); resolve(null);
      }
    }, 80);
  });
}`;

/**
 * Renderização rápida por navegador (sem descoberta de estados). É o que a
 * EXTRAÇÃO usa: carrega, rola para disparar lazy-load, e devolve o DOM
 * renderizado — o suficiente para um `design-system.html` fiel de qualquer site,
 * inclusive os que bloqueiam fetch estático (403) ou montam tudo por JS.
 *
 * Barata de propósito: sem o loop por elemento, roda em segundos. A descoberta
 * de estados fica em `exploreWithBrowser`, para quem quer a captura profunda.
 */
export const renderWithBrowser = async (
  url: string,
  limits: ExplorerLimits,
  log: ExplorerLog,
): Promise<{ html: string; finalUrl: string; strategy: 'playwright' }> => {
  const pw = await tryLoadPlaywright();
  if (pw === null) throw new PlaywrightUnavailableError();

  const browser = await pw.chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    log('carregando', { url });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: limits.pageLoadTimeoutMs });
    await page.waitForTimeout(limits.settleAfterLoadMs);
    log('scroll', {});
    await page.evaluate(buildCall(AUTO_SCROLL_FN, 40));
    await page.waitForTimeout(limits.settleAfterInteractionMs);
    const html = await page.content();
    return { html, finalUrl: page.url(), strategy: 'playwright' };
  } finally {
    await browser.close();
  }
};

/** Pontua um candidato pela chance de ter estado discreto — para ordenar a busca. */
const prioridade = (d: ElementDescriptor): number => {
  let s = 0;
  if (d.ariaExpanded !== null) s += 6;
  if (d.ariaHaspopup !== null) s += 5;
  if (d.role === 'tab' || d.role === 'menuitem' || d.role === 'menu') s += 5;
  if (
    Object.keys(d.dataAttrs).some((k) =>
      /toggle|tab|accordion|modal|dropdown|menu|carousel|open|state/i.test(k),
    )
  ) {
    s += 4;
  }
  if (d.tag === 'summary' || d.tag === 'details' || d.tag === 'button') s += 2;
  if (d.hasListeners) s += 1;
  if (d.inViewport) s += 1;
  return s;
};

/**
 * Explora a página com o navegador. Lança `PlaywrightUnavailableError` se o
 * Playwright não estiver instalado.
 */
export const exploreWithBrowser = async (
  url: string,
  limits: ExplorerLimits,
  log: ExplorerLog,
): Promise<RawCapture> => {
  const pw = await tryLoadPlaywright();
  if (pw === null) throw new PlaywrightUnavailableError();

  const deadline = Date.now() + limits.totalBudgetMs;
  const viewport = { width: 1440, height: 900 };
  const warnings: string[] = [];
  const browser = await pw.chromium.launch({ headless: true });

  try {
    const ctx = await browser.newContext({ userAgent: UA, viewport });
    await ctx.addInitScript({ content: INIT_LISTENER_TRACKER });
    const page = await ctx.newPage();

    log('carregando', { url });
    // `domcontentloaded` em vez de `networkidle`: num site pesado (analytics,
    // websockets, mídia) o networkidle nunca assenta e consome todo o orçamento
    // no load. O scroll + settle abaixo dá conta do conteúdo lazy.
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: limits.pageLoadTimeoutMs });
    await page.waitForTimeout(limits.settleAfterLoadMs);
    log('scroll', {});
    await page.evaluate(buildCall(AUTO_SCROLL_FN, Math.min(40, limits.maxDepth * 12)));
    await page.waitForTimeout(limits.settleAfterInteractionMs);

    const finalHtml = stripInstrumentation(await page.content());
    const rawSheets = (await page.evaluate(buildCall(COLLECT_STYLESHEETS_FN))) as Array<{
      href: string | null;
      inline: boolean;
      content?: string;
    }>;
    const stylesheets = rawSheets.map((s) => ({
      href: s.href,
      inline: s.inline,
      bytes: (s.content ?? '').length,
      content: s.content,
    }));

    const descriptors = (await page.evaluate(
      buildCall(COLLECT_DESCRIPTORS_FN, limits.maxElements),
    )) as ElementDescriptor[];
    log('elementos', { total: descriptors.length });

    // Prioriza os que mais provavelmente têm ESTADO discreto (accordion, tab,
    // menu, dropdown) e os visíveis, para o orçamento de tempo encontrar os
    // estados de verdade primeiro em vez de gastar tudo no cabeçalho. Genérico —
    // é sinal de ARIA/semântica, não de site.
    const ordenados = [...descriptors].sort((a, b) => prioridade(b) - prioridade(a));

    const elements: RawElementCapture[] = [];
    let clicks = 0;
    let interactionsTried = 0;
    let statesFound = 0;

    for (const d of ordenados) {
      if (Date.now() > deadline) {
        warnings.push('Orçamento de tempo esgotado; a exploração parou antes do fim.');
        break;
      }
      const sel = `[data-dsx-ref="${d.ref}"]`;
      const loc = page.locator(sel);
      if ((await loc.count()) === 0) continue;

      const vistos = new Set<string>();
      const states: RawState[] = [];
      const baseRaw = (await page.evaluate(buildCall(SNAPSHOT_FN, d.ref))) as RawSnapshot | null;
      if (baseRaw === null) continue;
      const base = toSnapshot(baseRaw);
      const baseSig = stateSignature(base);
      vistos.add(baseSig);
      const initialHtml = stripInstrumentation(
        (await page.evaluate(buildCall(OUTER_HTML_FN, d.ref))) as string,
      );

      for (const probe of probesPara(d, url)) {
        if (probe.kind === 'click' && clicks >= limits.maxClicks) continue;
        interactionsTried++;
        try {
          if (probe.kind === 'hover') await loc.first().hover({ timeout: 2000, force: true });
          else if (probe.kind === 'focus') await loc.first().focus({ timeout: 2000 });
          else if (probe.kind === 'click') {
            await loc.first().click({ timeout: 2000, trial: false });
            clicks++;
          }
          await page.waitForTimeout(limits.settleAfterInteractionMs);

          const afterRaw = (await page.evaluate(
            buildCall(SNAPSHOT_FN, d.ref),
          )) as RawSnapshot | null;
          if (afterRaw !== null) {
            const after = toSnapshot(afterRaw);
            const diff = diffSnapshots(base, after);
            const sig = stateSignature(after);
            if (diff.changed && registrarEstado(vistos, sig, limits.maxStatesPerElement)) {
              // Estado = HTML do BLOCO (section/…) que contém o elemento, não só
              // do elemento: é onde a mudança visual mora (painel do accordion,
              // aba trocada) e é o que o preview troca para reproduzir de verdade.
              const html = stripInstrumentation(
                (await page.evaluate(buildCall(BLOCK_HTML_FN, d.ref))) as string,
              );
              const portalHtml = afterRaw.portalHtml
                ? stripInstrumentation(afterRaw.portalHtml)
                : undefined;
              states.push({
                trigger: probe.kind === 'click' ? 'click' : (probe.kind as StateTrigger),
                label: diff.abriuPortal ? 'com overlay' : diff.changes.slice(0, 2).join(' + '),
                signature: sig,
                html,
                portalHtml,
              });
              statesFound++;
            }
          }
        } catch {
          // Interação falhou (elemento saiu do DOM, timeout): segue para a próxima.
        } finally {
          // Volta ao estado anterior: solta o hover/foco e fecha overlays.
          await page.mouse.move(0, 0);
          if (probe.kind === 'click') {
            try {
              await page.keyboard.press('Escape');
            } catch {
              // sem overlay para fechar
            }
          }
        }
      }

      elements.push({ descriptor: d, initialHtml, states });
    }

    log('estados', { statesFound, interactionsTried, clicks });

    return {
      strategy: 'playwright',
      url: page.url(),
      finalHtml,
      stylesheets,
      viewport,
      elements,
      stats: { elementsAnalyzed: descriptors.length, interactionsTried, statesFound },
      warnings,
    };
  } finally {
    await browser.close();
  }
};
