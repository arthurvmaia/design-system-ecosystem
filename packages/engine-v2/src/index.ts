/**
 * `@ds/engine-v2` — motor de captura V2.
 *
 * Substitui o núcleo de descoberta/exploração/segmentação do V1. A ordem do
 * pipeline é o contrato do pacote, e a razão de ele existir:
 *
 *   instrumentar antes do carregamento
 *   → observar rede e runtime
 *   → mapa estrutural
 *   → mapa visual em camadas
 *   → observar no tempo
 *   → percorrer com scroll (viewports sobrepostas)
 *   → varrer o ponteiro pela viewport
 *   → descobrir candidatos com evidência
 *   → executar ações seguras
 *   → grafo de estados (com restauração conferida)
 *   → relacionar backgrounds, mídias, interações e assets
 *   → SÓ ENTÃO segmentar
 *   → classificar a forma de preservação
 *   → compilar o bundle
 *   → validar visual e funcionalmente
 *
 * Duas metades, como no V1 (e por isso a integração é possível):
 *
 * - **Pura** — fingerprint, trajetórias, pixel diff, candidatos, política de
 *   ações, representação, nomeação, classificação de SVG, organização de CSS/JS,
 *   segmentação por evidência. Testável sem navegador.
 * - **Orquestração** — instrumentação, coletores, observador temporal, executor
 *   de ponteiro/scroll/ações, grafo de estados. Precisa do Playwright, que
 *   continua OPCIONAL (import dinâmico) e degrada com honestidade.
 *
 * O que o V2 NÃO refaz: assets, SSRF, downloader seguro, CSS externo, fontes,
 * telemetria, orçamentos, `AbortSignal`, scroll portátil, fidelidade por
 * dimensão, Galeria, Biblioteca, Kits, fila, preview. Tudo isso vem de
 * `@ds/explorer` e `@ds/shared`, reusado — não reimplementado.
 */

// ── Identidade ───────────────────────────────────────────────────────────────
export {
  type SinaisFingerprint,
  LIMIAR_MESMO_ELEMENTO,
  chaveCanonica,
  classesEstaveis,
  dataAttrsDeIntencao,
  hashFingerprint,
  melhorPar,
  montarFingerprint,
  pareceGerada,
  resumirTexto,
  similaridade,
} from './identity/fingerprint.js';

// ── Observação ───────────────────────────────────────────────────────────────
export { type ImagemRaw, PngNaoSuportado, decodePng } from './observe/png.js';
export {
  type OpcoesDiff,
  type ResultadoDiff,
  LIMIAR_POR_NATUREZA,
  classificarMovimento,
  diffImagens,
  diffPng,
  hashBytes,
} from './observe/pixel.js';

// ── Exploração (puro) ────────────────────────────────────────────────────────
export {
  type OpcoesTrajetoria,
  TRAJETORIAS_COMPLEMENTARES,
  TRAJETORIA_COBERTURA,
  boxNormalizado,
  construirTrajetoria,
  paraPixels,
  trajetoriaAfastarCentro,
  trajetoriaAproximarCentro,
  trajetoriaCirculoExpandindo,
  trajetoriaCirculoFechando,
  trajetoriaDiagonal,
  trajetoriaGrade,
  trajetoriaHilbert,
  trajetoriaHorizontal,
  trajetoriaRefinamento,
  trajetoriaSerpentina,
  trajetoriaVertical,
  unirRegioes,
} from './explore/pointer-paths.js';
export {
  type Candidato,
  type RegiaoReativa,
  type SinaisCandidato,
  acaoEhReversivel,
  acoesProvaveis,
  candidatosSemDom,
  descobrirCandidatos,
  filtrarAcoes,
  pontuarCandidato,
} from './explore/candidates.js';

// ── Segmentação (puro) ───────────────────────────────────────────────────────
export {
  type EvidenciaRepresentacao,
  classificarRepresentacao,
} from './segment/representation.js';
export { type EvidenciaNome, nomeEhGenerico, nomearPorEvidencia } from './segment/naming.js';

// ── Compilador (puro) ────────────────────────────────────────────────────────
export {
  type CategoriaSvg,
  type ClassificacaoSvg,
  type ContextoSvg,
  classificarSvg,
  isolarIdsSvg,
} from './compiler/svg-classify.js';
