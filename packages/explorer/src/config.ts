/**
 * Limites da exploração.
 *
 * A exploração completa de uma página é cara: cada interação exige esperar o DOM
 * assentar, ler estilos computados e diferenciar snapshots. Sem teto, uma página
 * hostil (loop de animação, mil botões, timers) trava o processo. Com teto de
 * menos, a extração volta a ser superficial.
 *
 * Todos os números têm um default sensato e um override por variável de
 * ambiente, para calibrar sem recompilar. O prefixo é `DS_EXPLORER_`.
 */

export type ExplorerLimits = {
  /** Tempo máximo até considerar a página carregada (ms). */
  pageLoadTimeoutMs: number;
  /** Espera após o load para conteúdo assíncrono/lazy assentar (ms). */
  settleAfterLoadMs: number;
  /** Espera após cada interação antes de ler o novo estado (ms). */
  settleAfterInteractionMs: number;
  /** Teto de elementos interativos analisados. */
  maxElements: number;
  /** Teto de estados registrados por elemento (além do inicial). */
  maxStatesPerElement: number;
  /** Profundidade máxima de exploração de sub-regiões. */
  maxDepth: number;
  /** Teto de cliques na sessão inteira (proteção contra loop). */
  maxClicks: number;
  /** Asset acima disso não é baixado (bytes). */
  maxAssetBytes: number;
  /** Teto de animações observadas antes de parar de esperar. */
  maxAnimationsObserved: number;
  /** Tentativas por interação antes de desistir dela. */
  maxRetries: number;
  /** Downloads de asset em paralelo. */
  assetConcurrency: number;
  /** Timeout de cada download de asset (ms). */
  assetTimeoutMs: number;
  /** Redirects máximos por download (proteção contra loop/SSRF por redirect). */
  maxRedirects: number;
  /** Profundidade máxima de `@import` aninhado ao processar CSS externo. */
  maxCssDepth: number;
  /** Teto de arquivos CSS processados numa captura (proteção contra explosão). */
  maxCssFiles: number;
  /**
   * Teto TOTAL de bytes guardados da rede do navegador (proteção de memória).
   * A captura observa o que o Chromium baixou e retém em memória para localizar
   * sem novo fetch — este é o freio para não estourar a RAM num site pesado.
   */
  maxCaptureBytes: number;
  /**
   * Orçamento do LOOP DE INTERAÇÕES (ms). Historicamente chamado de "total", mas
   * cobre só o loop — o total REAL do processo é `orcamentoTotalMs`.
   */
  totalBudgetMs: number;

  // ── Orçamento por fase (ms) — o controle que impede uma fase de consumir o
  // processo inteiro. Cada fase roda sob o MENOR entre o seu teto e o que resta
  // do total, então a soma nunca fura o total (ver Telemetria.tetoFase). ──
  /** Teto REAL do processo inteiro — render, scroll, interações, assets, drenagem. */
  orcamentoTotalMs: number;
  /** Carregamento inicial da página (goto). */
  faseCarregarMs: number;
  /** Estabilização pós-load (conteúdo assíncrono assentar). */
  faseEstabilizarMs: number;
  /** Scroll usado para disparar lazy-load. */
  faseScrollLazyMs: number;
  /** Amostragem de scroll (captura de comportamentos por progresso). */
  faseScrollAmostraMs: number;
  /** Exploração de hover/focus/click + captura de estados. */
  faseInteracoesMs: number;
  /** Localização de assets (rede do navegador + fallback HTTP). */
  faseAssetsMs: number;
  /** Drenagem das respostas de rede pendentes. */
  faseDrenarMs: number;
  /** Timeout INDIVIDUAL de leitura do corpo de uma resposta (evita corpo infinito). */
  drainBodyTimeoutMs: number;
  /** Segmentação do design-system.html. */
  faseSegmentarMs: number;
  /** Validação de previews em navegador. */
  faseValidarMs: number;

  // ── Amostragem de scroll ──
  /** Teto de elementos candidatos marcados para amostragem de scroll. */
  maxScrollCandidates: number;
  /** Espera após rolar até um ponto, antes de amostrar (assentar o efeito). */
  scrollSettleMs: number;
  /** Teto de pontos de scroll amostrados (fixos + adaptativos). */
  maxScrollSamples: number;
};

export const DEFAULT_LIMITS: ExplorerLimits = {
  pageLoadTimeoutMs: 30_000,
  settleAfterLoadMs: 1_500,
  settleAfterInteractionMs: 400,
  maxElements: 400,
  maxStatesPerElement: 6,
  maxDepth: 4,
  maxClicks: 120,
  maxAssetBytes: 8 * 1024 * 1024,
  maxAnimationsObserved: 40,
  maxRetries: 2,
  assetConcurrency: 6,
  assetTimeoutMs: 15_000,
  maxRedirects: 3,
  maxCssDepth: 5,
  maxCssFiles: 40,
  maxCaptureBytes: 200 * 1024 * 1024,
  totalBudgetMs: 120_000,
  orcamentoTotalMs: 180_000,
  faseCarregarMs: 30_000,
  faseEstabilizarMs: 3_000,
  faseScrollLazyMs: 8_000,
  faseScrollAmostraMs: 45_000,
  faseInteracoesMs: 90_000,
  faseAssetsMs: 45_000,
  faseDrenarMs: 10_000,
  drainBodyTimeoutMs: 8_000,
  faseSegmentarMs: 20_000,
  faseValidarMs: 120_000,
  maxScrollCandidates: 120,
  scrollSettleMs: 150,
  maxScrollSamples: 14,
};

const numFromEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

/**
 * Resolve os limites: defaults, sobrepostos pelo ambiente, sobrepostos pelo que
 * o chamador passar explicitamente. A precedência do mais fraco ao mais forte.
 */
export const resolveLimits = (overrides: Partial<ExplorerLimits> = {}): ExplorerLimits => {
  const fromEnv: ExplorerLimits = {
    pageLoadTimeoutMs: numFromEnv(
      'DS_EXPLORER_PAGE_LOAD_TIMEOUT_MS',
      DEFAULT_LIMITS.pageLoadTimeoutMs,
    ),
    settleAfterLoadMs: numFromEnv(
      'DS_EXPLORER_SETTLE_AFTER_LOAD_MS',
      DEFAULT_LIMITS.settleAfterLoadMs,
    ),
    settleAfterInteractionMs: numFromEnv(
      'DS_EXPLORER_SETTLE_AFTER_INTERACTION_MS',
      DEFAULT_LIMITS.settleAfterInteractionMs,
    ),
    maxElements: numFromEnv('DS_EXPLORER_MAX_ELEMENTS', DEFAULT_LIMITS.maxElements),
    maxStatesPerElement: numFromEnv(
      'DS_EXPLORER_MAX_STATES_PER_ELEMENT',
      DEFAULT_LIMITS.maxStatesPerElement,
    ),
    maxDepth: numFromEnv('DS_EXPLORER_MAX_DEPTH', DEFAULT_LIMITS.maxDepth),
    maxClicks: numFromEnv('DS_EXPLORER_MAX_CLICKS', DEFAULT_LIMITS.maxClicks),
    maxAssetBytes: numFromEnv('DS_EXPLORER_MAX_ASSET_BYTES', DEFAULT_LIMITS.maxAssetBytes),
    maxAnimationsObserved: numFromEnv(
      'DS_EXPLORER_MAX_ANIMATIONS_OBSERVED',
      DEFAULT_LIMITS.maxAnimationsObserved,
    ),
    maxRetries: numFromEnv('DS_EXPLORER_MAX_RETRIES', DEFAULT_LIMITS.maxRetries),
    assetConcurrency: numFromEnv('DS_EXPLORER_ASSET_CONCURRENCY', DEFAULT_LIMITS.assetConcurrency),
    assetTimeoutMs: numFromEnv('DS_EXPLORER_ASSET_TIMEOUT_MS', DEFAULT_LIMITS.assetTimeoutMs),
    maxRedirects: numFromEnv('DS_EXPLORER_MAX_REDIRECTS', DEFAULT_LIMITS.maxRedirects),
    maxCssDepth: numFromEnv('DS_EXPLORER_MAX_CSS_DEPTH', DEFAULT_LIMITS.maxCssDepth),
    maxCssFiles: numFromEnv('DS_EXPLORER_MAX_CSS_FILES', DEFAULT_LIMITS.maxCssFiles),
    maxCaptureBytes: numFromEnv('DS_EXPLORER_MAX_CAPTURE_BYTES', DEFAULT_LIMITS.maxCaptureBytes),
    totalBudgetMs: numFromEnv('DS_EXPLORER_TOTAL_BUDGET_MS', DEFAULT_LIMITS.totalBudgetMs),
    orcamentoTotalMs: numFromEnv('DS_EXPLORER_ORCAMENTO_TOTAL_MS', DEFAULT_LIMITS.orcamentoTotalMs),
    faseCarregarMs: numFromEnv('DS_EXPLORER_FASE_CARREGAR_MS', DEFAULT_LIMITS.faseCarregarMs),
    faseEstabilizarMs: numFromEnv(
      'DS_EXPLORER_FASE_ESTABILIZAR_MS',
      DEFAULT_LIMITS.faseEstabilizarMs,
    ),
    faseScrollLazyMs: numFromEnv(
      'DS_EXPLORER_FASE_SCROLL_LAZY_MS',
      DEFAULT_LIMITS.faseScrollLazyMs,
    ),
    faseScrollAmostraMs: numFromEnv(
      'DS_EXPLORER_FASE_SCROLL_AMOSTRA_MS',
      DEFAULT_LIMITS.faseScrollAmostraMs,
    ),
    faseInteracoesMs: numFromEnv('DS_EXPLORER_FASE_INTERACOES_MS', DEFAULT_LIMITS.faseInteracoesMs),
    faseAssetsMs: numFromEnv('DS_EXPLORER_FASE_ASSETS_MS', DEFAULT_LIMITS.faseAssetsMs),
    faseDrenarMs: numFromEnv('DS_EXPLORER_FASE_DRENAR_MS', DEFAULT_LIMITS.faseDrenarMs),
    drainBodyTimeoutMs: numFromEnv(
      'DS_EXPLORER_DRAIN_BODY_TIMEOUT_MS',
      DEFAULT_LIMITS.drainBodyTimeoutMs,
    ),
    faseSegmentarMs: numFromEnv('DS_EXPLORER_FASE_SEGMENTAR_MS', DEFAULT_LIMITS.faseSegmentarMs),
    faseValidarMs: numFromEnv('DS_EXPLORER_FASE_VALIDAR_MS', DEFAULT_LIMITS.faseValidarMs),
    maxScrollCandidates: numFromEnv(
      'DS_EXPLORER_MAX_SCROLL_CANDIDATES',
      DEFAULT_LIMITS.maxScrollCandidates,
    ),
    scrollSettleMs: numFromEnv('DS_EXPLORER_SCROLL_SETTLE_MS', DEFAULT_LIMITS.scrollSettleMs),
    maxScrollSamples: numFromEnv('DS_EXPLORER_MAX_SCROLL_SAMPLES', DEFAULT_LIMITS.maxScrollSamples),
  };
  return { ...fromEnv, ...overrides };
};
