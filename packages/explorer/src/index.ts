/**
 * @ds/explorer — motor de exploração e captura por navegador.
 *
 * Duas metades:
 * - Lógica pura (config, safety, interaction-map, state-diff, assets, css,
 *   assess): decide o que é interativo, o que é seguro, o que é um estado novo,
 *   como localizar assets e quão fiel um componente é. Testável sem navegador.
 * - Orquestração (browser, explore): dirige o Playwright quando ele existe e
 *   degrada para captura estática quando não. Import dinâmico, opcional.
 *
 * A avaliação de fidelidade (`assessFidelity`) é o ponto de entrada mais usado
 * pelo resto do sistema: segmenter e Biblioteca a chamam para o selo e os avisos.
 */

export { type ExplorerLimits, DEFAULT_LIMITS, resolveLimits } from './config.js';
export type { ElementDescriptor, Box } from './descriptor.js';
export {
  sameOrigin,
  navegaParaFora,
  enviaFormulario,
  ehCampoSensivel,
  ehSeguroClicar,
} from './safety.js';
export {
  ehCandidatoInterativo,
  probesPara,
  inferirInteracoes,
  type Probe,
} from './interaction-map.js';
export {
  type StateSnapshot,
  type SnapshotDiff,
  COMPUTED_KEYS,
  diffSnapshots,
  hashString,
  stateSignature,
  registrarEstado,
} from './state-diff.js';
export {
  type AssetRef,
  type AssetFetcher,
  type FetchedAsset,
  type LocalizationResult,
  classifyByUrl,
  classifyByMime,
  resolveRef,
  parseSrcset,
  extractAssetRefs,
  type SecureFetchLimits,
  hashedLocalPath,
  createHttpFetcher,
  createSecureHttpFetcher,
  localizeAssets,
  rewriteReferences,
  absolutizeRefs,
} from './assets.js';
export {
  type MotivoBloqueio,
  avaliarUrlAsset,
  urlAssetSegura,
  mimeCoerente,
  permiteLocal,
} from './asset-safety.js';
export { type CssLimits, type CssLocalizeResult, localizeCss } from './css-localize.js';
export {
  keyframeNames,
  animationNamesUsed,
  varNamesUsed,
  fontFaceFamilies,
  fontFamiliesUsed,
  intersecao,
} from './css.js';
export {
  type AssessOptions,
  AVISO_ASSETS_NA_ORIGEM,
  detectCapabilities,
  pickRenderMode,
  inferInteractions,
  assessFidelity,
} from './assess.js';
export {
  type ExplorerLog,
  type RawCapture,
  type RawElementCapture,
  type RawState,
  PlaywrightUnavailableError,
  exploreWithBrowser,
  renderWithBrowser,
} from './browser.js';
export { type ExploreOptions, type RenderResult, explorePage, renderPage } from './explore.js';
export {
  type DepthMode,
  type DepthDecision,
  decidirProfundidade,
  resolveDepthMode,
} from './depth.js';
