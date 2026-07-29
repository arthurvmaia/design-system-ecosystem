import type { NormalizedPoint } from '@ds/shared';
import type { BoxPx } from '../mapper/raw.js';

/**
 * A camada de navegador do V2.
 *
 * Duas coisas acontecem aqui, e as duas são de propósito:
 *
 * 1. **O Playwright continua OPCIONAL.** Import dinâmico com especificador
 *    não-literal, exatamente como `@ds/explorer/browser` e
 *    `@ds/extractor/fetch-url` já fazem. Sem ele instalado, o motor degrada e
 *    avisa — não trava.
 * 2. **As fases não falam com o Playwright, falam com `PaginaV2`.** É uma
 *    interface pequena (evaluate, screenshot, mouse, keyboard, viewport). O
 *    ganho não é abstração por abstração: é que a lógica de orçamento,
 *    deduplicação, refinamento adaptativo e **conferência de restauração** passa
 *    a ser testável com uma página falsa, sem subir Chromium. No V1 essa lógica
 *    morava dentro do loop que dirigia o navegador e só podia ser testada com
 *    navegador — foi por isso que "restaurar o estado" nunca chegou a ser
 *    verificado.
 */

export class PlaywrightIndisponivel extends Error {
  constructor() {
    super(
      'playwright não está instalado — o motor V2 precisa do navegador. Rode: pnpm --filter @ds/engine-v2 exec playwright install chromium',
    );
    this.name = 'PlaywrightIndisponivel';
  }
}

/** O que as fases do V2 precisam de uma página. Nada além disto. */
export type PaginaV2 = {
  /** Avalia uma expressão string no contexto da página. */
  evaluate: <T>(expressao: string) => Promise<T>;
  /** Screenshot da viewport, ou de um recorte em px. PNG. */
  screenshot: (opts?: { clip?: BoxPx }) => Promise<Uint8Array>;
  mouse: {
    move: (x: number, y: number, opts?: { steps?: number }) => Promise<void>;
    click: (x: number, y: number) => Promise<void>;
    down: () => Promise<void>;
    up: () => Promise<void>;
  };
  keyboard: { press: (tecla: string) => Promise<void> };
  esperar: (ms: number) => Promise<void>;
  viewport: () => { width: number; height: number };
  url: () => string;
};

/** Move o ponteiro para um ponto normalizado, na viewport atual. */
export const moverPara = async (
  page: PaginaV2,
  ponto: NormalizedPoint,
  opts: { passos?: number } = {},
): Promise<{ x: number; y: number }> => {
  const vp = page.viewport();
  const x = Math.min(vp.width - 1, Math.max(0, Math.round(ponto.x * vp.width)));
  const y = Math.min(vp.height - 1, Math.max(0, Math.round(ponto.y * vp.height)));
  // `steps` importa: vários runtimes (cursor magnético, parallax de mouse,
  // câmera) interpolam sobre o DELTA do movimento e ignoram um salto único.
  await page.mouse.move(x, y, { steps: opts.passos ?? 2 });
  return { x, y };
};

// ── Tipos mínimos do Playwright (opcional em runtime) ───────────────────────

type PwResponse = {
  url: () => string;
  status: () => number;
  ok: () => boolean;
  headers: () => Record<string, string>;
  body: () => Promise<Uint8Array>;
  request: () => { url: () => string; resourceType: () => string };
};
type PwPage = {
  goto: (url: string, opts: { waitUntil: string; timeout: number }) => Promise<unknown>;
  content: () => Promise<string>;
  url: () => string;
  // biome-ignore lint/suspicious/noExplicitAny: evaluate é genérico por natureza
  evaluate: (expressao: string) => Promise<any>;
  screenshot: (opts?: {
    clip?: { x: number; y: number; width: number; height: number };
    type?: string;
    animations?: string;
    timeout?: number;
  }) => Promise<Uint8Array>;
  mouse: {
    move: (x: number, y: number, opts?: { steps?: number }) => Promise<void>;
    click: (x: number, y: number, opts?: { timeout?: number }) => Promise<void>;
    down: () => Promise<void>;
    up: () => Promise<void>;
  };
  keyboard: { press: (tecla: string) => Promise<void> };
  waitForTimeout: (ms: number) => Promise<void>;
  viewportSize: () => { width: number; height: number } | null;
  // A aba de comparação visual abre e fecha por conta própria, com a viewport
  // da captura — sem isso ela nasceria no tamanho padrão do Playwright e o
  // recorte não bateria com o print da dobra.
  setViewportSize: (t: { width: number; height: number }) => Promise<void>;
  close: () => Promise<void>;
  on: {
    (evento: 'response', h: (r: PwResponse) => void): void;
    (evento: 'console', h: (m: { type: () => string; text: () => string }) => void): void;
    (evento: 'pageerror', h: (e: Error) => void): void;
    (evento: 'dialog', h: (d: { dismiss: () => Promise<void> }) => void): void;
    (evento: 'download', h: (d: { cancel?: () => Promise<void> }) => void): void;
    (evento: 'popup', h: (p: { close: () => Promise<void> }) => void): void;
  };
  setDefaultTimeout: (ms: number) => void;
};
type PwRoute = {
  request: () => { url: () => string; resourceType: () => string; method: () => string };
  abort: (motivo?: string) => Promise<void>;
  continue: () => Promise<void>;
};
type PwCdp = { send: (metodo: string, params?: Record<string, unknown>) => Promise<unknown> };
type PwContext = {
  addInitScript: (script: { content: string }) => Promise<void>;
  newPage: () => Promise<PwPage>;
  grantPermissions: (p: string[]) => Promise<void>;
  route: (padrao: string, h: (r: PwRoute) => void) => Promise<void>;
  close: () => Promise<void>;
  on: (evento: 'page', h: (p: PwPage) => void) => void;
  /** Só existe no Chromium — por isso o uso é sempre com fallback. */
  newCDPSession: (p: PwPage) => Promise<PwCdp>;
};
type PwBrowser = {
  newContext: (opts: Record<string, unknown>) => Promise<PwContext>;
  close: () => Promise<void>;
};
type PlaywrightApi = {
  chromium: { launch: (opts: { headless: boolean; args?: string[] }) => Promise<PwBrowser> };
};

export const carregarPlaywright = async (): Promise<PlaywrightApi | null> => {
  try {
    // Especificador não-literal de propósito: o Playwright é OPCIONAL e o TS não
    // deve tentar resolvê-lo em tempo de tipo. Mesmo padrão do V1.
    const mod = await import('playwright' as string);
    return mod as unknown as PlaywrightApi;
  } catch {
    return null;
  }
};

/** UA de desktop real. Alinhado ao do V1 para a captura ser comparável. */
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export type SessaoV2 = {
  page: PaginaV2;
  /** A página Playwright crua, para o que a interface não cobre (rede, eventos). */
  pw: PwPage;
  contexto: PwContext;
  fechar: () => Promise<void>;
  /** Erros de console e de página, para a validação e para o relatório. */
  consoleErros: string[];
  /** Ações que a camada de navegador barrou (download, popup, diálogo). */
  bloqueados: Array<{ motivo: string; alvo: string }>;
};

export type OpcoesSessao = {
  viewport?: { width: number; height: number };
  deviceScaleFactor?: number;
  /** Script a injetar antes dos scripts do site. */
  initScript: string;
  /** Respeitar `prefers-reduced-motion`? A captura precisa do movimento: `no-preference`. */
  reduceMotion?: boolean;
  /** Timeout padrão das ações do Playwright. */
  timeoutMs?: number;
};

/**
 * Abre uma sessão instrumentada.
 *
 * As barreiras de segurança são montadas ANTES de qualquer navegação:
 *
 * - permissões concedidas: **nenhuma** (`grantPermissions([])`);
 * - `download` cancelado;
 * - `popup` fechado na hora;
 * - `dialog` sempre dispensado (um `alert()` de site travaria a exploração até o
 *   timeout, e um `confirm()` respondido "ok" poderia confirmar algo);
 * - rotas com protocolo perigoso abortadas.
 *
 * O que este arquivo NÃO refaz: a captura de bytes da rede e os guardas de SSRF.
 * Isso é `capturarRede` do V1, reusado como está — já testado, já com teto de
 * memória, já com timeout individual por corpo.
 */
export const abrirSessao = async (opts: OpcoesSessao): Promise<SessaoV2> => {
  const pw = await carregarPlaywright();
  if (pw === null) throw new PlaywrightIndisponivel();

  const viewport = opts.viewport ?? { width: 1440, height: 900 };
  const browser = await pw.chromium.launch({
    headless: true,
    // `--disable-dev-shm-usage` evita queda em ambiente com /dev/shm pequeno;
    // `--font-render-hinting=none` deixa o texto estável entre screenshots, o que
    // importa porque a comparação temporal mede pixels.
    args: ['--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  const contexto = await browser.newContext({
    userAgent: UA,
    viewport,
    deviceScaleFactor: opts.deviceScaleFactor ?? 1,
    // A captura PRECISA do movimento para medi-lo. Reduced-motion entra depois,
    // no preview, onde é o usuário quem escolhe.
    reducedMotion: opts.reduceMotion === true ? 'reduce' : 'no-preference',
    // Sem gravação de vídeo/HAR: nada de artefato pesado acidental.
    acceptDownloads: false,
    javaScriptEnabled: true,
  });

  await contexto.grantPermissions([]);
  await contexto.addInitScript({ content: opts.initScript });

  const bloqueados: Array<{ motivo: string; alvo: string }> = [];
  const consoleErros: string[] = [];

  // Protocolos e destinos que nunca devem ser buscados.
  await contexto.route('**/*', (route) => {
    const req = route.request();
    const url = req.url();
    if (/^(mailto:|tel:|sms:|whatsapp:|intent:|market:|itms-apps:|ftp:)/i.test(url)) {
      bloqueados.push({ motivo: 'protocolo-externo', alvo: url.slice(0, 80) });
      void route.abort('blockedbyclient');
      return;
    }
    void route.continue();
  });

  const page = await contexto.newPage();
  page.setDefaultTimeout(opts.timeoutMs ?? 5_000);

  page.on('console', (m) => {
    if (m.type() === 'error' && consoleErros.length < 100)
      consoleErros.push(m.text().slice(0, 300));
  });
  page.on('pageerror', (e) => {
    if (consoleErros.length < 100) consoleErros.push(`pageerror: ${e.message.slice(0, 300)}`);
  });
  // Diálogo sempre dispensado: `alert()` travaria a exploração até o timeout, e
  // aceitar um `confirm()` poderia confirmar uma ação que a política barra.
  page.on('dialog', (d) => {
    bloqueados.push({ motivo: 'confirmacao-irreversivel', alvo: 'dialog' });
    void d.dismiss();
  });
  page.on('download', (d) => {
    bloqueados.push({ motivo: 'download', alvo: 'download' });
    void d.cancel?.();
  });
  page.on('popup', (p) => {
    bloqueados.push({ motivo: 'popup', alvo: 'popup' });
    void p.close();
  });
  contexto.on('page', (nova) => {
    if (nova !== page) {
      bloqueados.push({ motivo: 'popup', alvo: 'aba nova' });
    }
  });

  /**
   * Screenshot por CDP, não por `page.screenshot()`.
   *
   * O motivo é concreto e foi descoberto pela fixture de "resposta que nunca
   * termina": `page.screenshot()` espera `document.fonts.ready` antes de capturar,
   * e numa página com uma requisição pendurada esse promise **nunca resolve** —
   * então toda captura estourava o timeout e a observação temporal ficava vazia,
   * silenciosamente. Um motor cuja medição depende de a página terminar de
   * carregar não serve para medir páginas que não terminam de carregar.
   *
   * `Page.captureScreenshot` do CDP não espera fonte nem load. Também não congela
   * animação — o que aqui é requisito, não efeito colateral: o default do
   * Playwright (`animations: 'disabled'`) mataria justamente o movimento que a
   * observação temporal existe para medir.
   *
   * O clip do CDP é em coordenadas do DOCUMENTO; o resto do motor pensa em
   * coordenadas da VIEWPORT (é o que `getBoundingClientRect` devolve), então o
   * scroll atual é somado na conversão.
   */
  const cdp = await contexto.newCDPSession(page).catch(() => null);

  const capturar = async (o?: { clip?: BoxPx }): Promise<Uint8Array> => {
    if (cdp !== null) {
      try {
        const params: Record<string, unknown> = { format: 'png', captureBeyondViewport: false };
        if (o?.clip !== undefined) {
          const scroll = (await page.evaluate(
            '({x: window.scrollX || 0, y: window.scrollY || 0})',
          )) as { x: number; y: number };
          params.clip = {
            x: o.clip.x + scroll.x,
            y: o.clip.y + scroll.y,
            width: Math.max(1, o.clip.w),
            height: Math.max(1, o.clip.h),
            scale: 1,
          };
        }
        const res = (await cdp.send('Page.captureScreenshot', params)) as { data: string };
        return new Uint8Array(Buffer.from(res.data, 'base64'));
      } catch {
        // CDP indisponível ou clip inválido: cai no caminho do Playwright.
      }
    }
    return page.screenshot({
      type: 'png',
      animations: 'allow',
      timeout: 4_000,
      ...(o?.clip ? { clip: { x: o.clip.x, y: o.clip.y, width: o.clip.w, height: o.clip.h } } : {}),
    });
  };

  const adaptada: PaginaV2 = {
    evaluate: <T>(expressao: string) => page.evaluate(expressao) as Promise<T>,
    screenshot: capturar,
    mouse: {
      move: (x, y, o) => page.mouse.move(x, y, o),
      click: (x, y) => page.mouse.click(x, y, { timeout: 3_000 }),
      down: () => page.mouse.down(),
      up: () => page.mouse.up(),
    },
    keyboard: { press: (t) => page.keyboard.press(t) },
    esperar: (ms) => page.waitForTimeout(ms),
    viewport: () => page.viewportSize() ?? viewport,
    url: () => page.url(),
  };

  return {
    page: adaptada,
    pw: page,
    contexto,
    consoleErros,
    bloqueados,
    fechar: async () => {
      try {
        await contexto.close();
      } finally {
        await browser.close();
      }
    },
  };
};
