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
  /** Orçamento total da exploração (ms) — corta a sessão inteira. */
  totalBudgetMs: number;
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
  totalBudgetMs: 120_000,
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
    totalBudgetMs: numFromEnv('DS_EXPLORER_TOTAL_BUDGET_MS', DEFAULT_LIMITS.totalBudgetMs),
  };
  return { ...fromEnv, ...overrides };
};
