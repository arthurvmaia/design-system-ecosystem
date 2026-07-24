import type { ScrollBehavior, StateTrigger } from '@ds/shared';
import { mimeCoerente, urlAssetSegura } from './asset-safety.js';
import { type FetchedAsset, classifyByMime, classifyByUrl } from './assets.js';
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
import { amostrarScroll } from './scroll-capture.js';
import {
  type StateSnapshot,
  diffSnapshots,
  hashString,
  registrarEstado,
  stateSignature,
} from './state-diff.js';
import {
  type Contador,
  FASE,
  type Telemetria,
  corridaComTimeout,
  urlParaLog,
} from './telemetria.js';

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
  /**
   * Bytes que o PRÓPRIO navegador baixou durante o render, por URL. É a via que
   * faz assets de sites com proteção anti-bot (Cloudflare etc.) serem
   * localizados: o Chromium passou a proteção na sessão real; um fetch HTTP
   * separado tomaria 403. O localize consulta este mapa antes de ir à rede.
   */
  network: Map<string, FetchedAsset>;
  /** Comportamentos de scroll descobertos pela amostragem (reveal, parallax…). */
  scroll: ScrollBehavior[];
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
type PwRequest = { url: () => string; resourceType: () => string };
type PwResponse = {
  url: () => string;
  status: () => number;
  ok: () => boolean;
  headers: () => Record<string, string>;
  body: () => Promise<Uint8Array>;
  request: () => PwRequest;
};
type PwPage = {
  goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  url: () => string;
  // biome-ignore lint/suspicious/noExplicitAny: evaluate é genérico por natureza
  evaluate: (expression: string) => Promise<any>;
  locator: (selector: string) => PwLocator;
  on: (event: 'response', handler: (response: PwResponse) => void) => void;
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

/** Tipos de recurso do navegador que valem como asset mesmo sem MIME conclusivo. */
const RECURSO_ASSET = new Set(['image', 'font', 'media', 'stylesheet']);

/**
 * Captura os bytes que o PRÓPRIO navegador baixou — a via genérica para assets
 * de sites com proteção anti-bot (Cloudflare etc.), que respondem 403 a um fetch
 * HTTP separado mas servem normalmente para a sessão real do Chromium. Observa
 * cada `response` e guarda o corpo dos que são asset (imagem/fonte/css/svg/vídeo/
 * js/json), com os MESMOS guardas do fetcher seguro: só host público, nada de
 * `text/html`, teto por asset e teto total de memória. O localize consulta este
 * mapa primeiro e só cai no HTTP para o que o navegador não tiver carregado.
 *
 * Não inicia requisição nenhuma: é observação passiva do que o Chromium já ia
 * baixar de qualquer forma — não amplia a superfície de SSRF do render.
 */
export const capturarRede = (
  page: PwPage,
  limits: ExplorerLimits,
  contador?: Contador,
): { mapa: Map<string, FetchedAsset>; aguardar: (timeoutMs: number) => Promise<void> } => {
  const mapa = new Map<string, FetchedAsset>();
  const emVoo: Array<Promise<void>> = [];
  let total = 0;
  // Sinal de drenagem: quando `aguardar` encerra, aborta as leituras de corpo
  // ainda pendentes — cada uma resolve na hora e limpa seu timer (sem vazar).
  const drenar = new AbortController();
  page.on('response', (res) => {
    emVoo.push(
      (async () => {
        try {
          if (!res.ok()) return; // 3xx/4xx/5xx: não é corpo de asset
          const reqUrl = res.request().url();
          // Mesmo guarda de SSRF do fetcher seguro: não retém resposta de rede
          // interna, ainda que a página a tenha referenciado.
          if (!urlAssetSegura(reqUrl)) return;
          const mime = res.headers()['content-type'] ?? '';
          if (/^\s*text\/html/i.test(mime)) return; // é página, não asset
          // Só o que parece asset — por MIME, ou pelo tipo de recurso do navegador
          // (cobre CDN sem extensão nem content-type conclusivo).
          if (
            classifyByMime(mime, reqUrl) === 'other' &&
            !RECURSO_ASSET.has(res.request().resourceType())
          ) {
            return;
          }
          contador?.inc('requests');
          if (total >= limits.maxCaptureBytes) return; // teto de memória atingido
          if (Number(res.headers()['content-length'] ?? '0') > limits.maxAssetBytes) return;
          // Timeout INDIVIDUAL na leitura do corpo: uma resposta que nunca termina
          // (stream infinito) devolve null e é abandonada — não segura a drenagem
          // (regras 6/18). Cada corpo é independente: um travado não bloqueia os
          // outros (regra 7). O sinal de drenagem também a corta, se a espera geral
          // encerrar antes.
          const bytes = await corridaComTimeout(
            res.body(),
            limits.drainBodyTimeoutMs,
            drenar.signal,
          );
          if (bytes === null) {
            contador?.inc('timeouts');
            return;
          }
          if (bytes.byteLength > limits.maxAssetBytes) return;
          if (!mimeCoerente(mime || 'application/octet-stream', classifyByUrl(reqUrl))) return;
          total += bytes.byteLength;
          const asset: FetchedAsset = {
            status: res.status(),
            mimeType: mime || 'application/octet-stream',
            bytes,
          };
          // Indexa pela URL pedida (a que está no DOM) E pela final (pós-redirect),
          // para o localize acertar seja qual for a que o segmento referencia.
          mapa.set(reqUrl, asset);
          const finalUrl = res.url();
          if (finalUrl !== reqUrl) mapa.set(finalUrl, asset);
          contador?.inc('downloadsOk');
        } catch {
          // body() indisponível (redirect, corpo já liberado, alvo fechado): ignora.
        }
      })(),
    );
  });
  return {
    mapa,
    // Drenagem com TIMEOUT PRÓPRIO (regra 6): mesmo que algum corpo escape ao
    // teto individual, a espera inteira não passa de `timeoutMs`. Ao encerrar,
    // aborta as leituras pendentes — nada de timer vivo. O que já foi capturado
    // permanece no mapa; o pendente é abandonado.
    aguardar: async (timeoutMs: number) => {
      try {
        await corridaComTimeout(Promise.allSettled(emVoo), timeoutMs);
      } finally {
        drenar.abort();
      }
    },
  };
};

/**
 * Explora a página com o navegador. Lança `PlaywrightUnavailableError` se o
 * Playwright não estiver instalado.
 */
export const exploreWithBrowser = async (
  url: string,
  limits: ExplorerLimits,
  log: ExplorerLog,
  tel: Telemetria,
): Promise<RawCapture> => {
  const pw = await tryLoadPlaywright();
  if (pw === null) throw new PlaywrightUnavailableError();

  const viewport = { width: 1440, height: 900 };
  const warnings: string[] = [];
  const browser = await tel.medir(FASE.abrirNavegador, () =>
    pw.chromium.launch({ headless: true }),
  );

  try {
    const ctx = await browser.newContext({ userAgent: UA, viewport });
    await ctx.addInitScript({ content: INIT_LISTENER_TRACKER });
    const page = await ctx.newPage();
    // Observa a rede ANTES do goto: retém os bytes que o navegador baixar (assets
    // que um fetch separado não pegaria por 403 anti-bot). Passivo — não pede nada.
    // `tel` é o contador (requests/downloads).
    const rede = capturarRede(page, limits, tel);

    log('carregando', { url: urlParaLog(url) });
    // `domcontentloaded` em vez de `networkidle`: num site pesado (analytics,
    // websockets, mídia) o networkidle nunca assenta e consome todo o orçamento
    // no load. O scroll + settle abaixo dá conta do conteúdo lazy. O timeout do
    // goto é clampado ao que RESTA do total — nunca fura o orçamento.
    const gotoTimeout = Math.max(1000, Math.min(limits.pageLoadTimeoutMs, tel.restanteTotal()));
    await tel.medir(FASE.carregar, () =>
      page.goto(url, { waitUntil: 'domcontentloaded', timeout: gotoTimeout }),
    );
    await tel.medir(FASE.estabilizar, () => page.waitForTimeout(limits.settleAfterLoadMs));
    log('scroll', {});
    await tel.medir(FASE.scrollLazy, async () => {
      await page.evaluate(buildCall(AUTO_SCROLL_FN, Math.min(40, limits.maxDepth * 12)));
      await page.waitForTimeout(limits.settleAfterInteractionMs);
    });

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
    tel.inc('candidatos', descriptors.length);
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

    // Loop de interações sob ORÇAMENTO COOPERATIVO: o sinal aborta no teto (da
    // fase ou do total) e o loop encerra sozinho no próximo elemento — o que já
    // foi capturado permanece (nada é descartado). Substitui o antigo `deadline`
    // que só cobria este loop; agora o teto respeita o total real do processo.
    await tel.faseCooperativa(FASE.interacoes, async (signal) => {
      for (const d of ordenados) {
        if (signal.aborted) {
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
          if (signal.aborted) break;
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
    });

    tel.inc('acoes', interactionsTried);
    tel.inc('estados', statesFound);
    log('estados', { statesFound, interactionsTried, clicks });

    // Amostragem de scroll: rola a página em pontos controlados e classifica os
    // efeitos (reveal, parallax, sticky, progress-*). Fase orçada e cooperativa —
    // o sinal corta e o que já foi medido permanece. A página volta ao topo.
    const scroll = await tel.faseCooperativa(FASE.scrollAmostra, (signal) =>
      amostrarScroll(page, limits, signal, log),
    );
    log('scroll', { comportamentos: scroll.length });

    // Garante que os corpos observados terminaram de ser lidos ANTES de fechar o
    // navegador — depois disso os bytes vivem em memória, sem depender da origem.
    // Drenagem com timeout próprio, clampado ao que resta do total.
    const drenoTimeout = Math.min(limits.faseDrenarMs, Math.max(0, tel.restanteTotal()));
    await tel.medir(FASE.drenarRede, () => rede.aguardar(drenoTimeout));
    log('rede', { capturados: rede.mapa.size });

    return {
      strategy: 'playwright',
      url: page.url(),
      finalHtml,
      stylesheets,
      viewport,
      elements,
      network: rede.mapa,
      scroll,
      stats: { elementsAnalyzed: descriptors.length, interactionsTried, statesFound },
      warnings,
    };
  } finally {
    await tel.medir(FASE.fechar, () => browser.close());
  }
};
