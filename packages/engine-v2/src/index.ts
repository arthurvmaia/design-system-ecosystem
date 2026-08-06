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

// ── Segmentação por evidência ────────────────────────────────────────────────
export {
  type EntradaSegmentacao,
  type RejeitadoV2,
  type ResultadoSegmentacaoV2,
  type SegmentoV2,
  type SinaisDeConteudo,
  contarSinais,
  escolherSecoes,
  inferirCategoria,
  segmentarPorEvidencia,
  seloDe,
  validarSegmentoV2,
} from './segment/segment-v2.js';

// ── Mapas (puro) ─────────────────────────────────────────────────────────────
export {
  LIMIAR_CONTENCAO,
  construirBackgrounds,
  construirCamadas,
  construirMapaEstrutural,
  construirMidias,
  construirRuntimes,
  contido,
  decidirPosse,
  intersecao,
  ordemDePintura,
  secoesCandidatas,
} from './mapper/build-maps.js';
export type * from './mapper/raw.js';

// ── Compilador ───────────────────────────────────────────────────────────────
export {
  type CategoriaSvg,
  type ClassificacaoSvg,
  type ContextoSvg,
  classificarSvg,
  isolarIdsSvg,
} from './compiler/svg-classify.js';
export {
  type BlocoCss,
  type ResponsabilidadeCss,
  type ResultadoCss,
  ARQUIVO_CSS,
  ORDEM_CSS,
  animacoesReferenciadas,
  classificarBlocoCss,
  fatiarCss,
  organizarCss,
  podemColidir,
} from './compiler/css-organize.js';
export {
  type ArquivoJs,
  type ResponsabilidadeJs,
  type ResultadoJs,
  ARQUIVO_JS,
  classificarJs,
  organizarJs,
  podeUnir,
  tagsDeScript,
} from './compiler/js-organize.js';
export {
  type SinalDeFerramenta,
  detectarFerramentas,
  montarStack,
  renderizarStackMd,
} from './compiler/stack.js';
export {
  type BundleEscrito,
  type EntradaBundle,
  type FolhaExternaBundle,
  COMPILER_VERSION,
  escreverBundle,
  escreverValidacao,
  processarSvgs,
} from './compiler/bundle.js';

// ── Navegador e orquestração ─────────────────────────────────────────────────
export {
  type OpcoesSessao,
  type PaginaV2,
  type SessaoV2,
  PlaywrightIndisponivel,
  UA,
  abrirSessao,
  carregarPlaywright,
  moverPara,
} from './browser/page.js';
export {
  type OpcoesTemporal,
  type SinkFrame,
  INSTANTES_PADRAO,
  atribuirMovimento,
  naturezaDaRegiao,
  observarTemporal,
} from './observe/temporal.js';
export {
  type OpcoesVarredura,
  type ResultadoVarredura,
  diferencaDeMedida,
  valeComplementares,
  varrerPonteiro,
} from './explore/pointer-run.js';
export {
  type OpcoesPercurso,
  type ParadaContexto,
  SOBREPOSICAO_PADRAO,
  percorrerComScroll,
  posicoesDeParada,
} from './explore/scroll-walk.js';
export {
  type OpcoesGrafo,
  type ResultadoGrafo,
  assinaturaDoEstado,
  construirGrafoDeEstados,
  houveMudanca,
} from './explore/state-graph.js';
export {
  ALVO_NO_PONTO_FN,
  ASSINATURA_ESTADO_FN,
  ATTR_REF,
  BLUR_FN,
  CENTRO_DO_REF_FN,
  COLETAR_CSS_FN,
  COLETAR_INSTRUMENTACAO_FN,
  COLETAR_JS_INLINE_FN,
  COLETAR_MAPA_FN,
  FOCAR_REF_FN,
  ESPERAR_ICONES_FN,
  HTML_DO_REF_FN,
  INIT_SCRIPT,
  MEDIR_ALVOS_FN,
  PORTAL_HTML_FN,
  REGISTRO_GLOBAL,
  ROLAR_ATE_REF_FN,
  ROLAR_PARA_FN,
  SONDAR_PONTO_FN,
  chamar,
  limparInstrumentacao,
} from './instrumentation/index.js';
export {
  type LogV2,
  type OpcoesCaptura,
  type ResultadoCaptura,
  FASE_V2,
  tetoDaFase,
  capturarComV2,
} from './engine.js';

// ── Persistência ─────────────────────────────────────────────────────────────
export { type ResultadoPersistencia, persistirCapturaV2 } from './persist.js';

// ── Testes (fixtures) ────────────────────────────────────────────────────────
// Exportado para os scripts de comparação e os testes de navegador servirem as
// fixtures por HTTP. `file://` não tem origem, e metade do que se mede aqui
// (mesma-origem de iframe, política de asset, resposta que nunca termina) depende
// de haver um servidor de verdade.
export {
  type ServidorFixture,
  gifAnimado,
  iniciarServidorFixture,
} from './testing/fixture-server.js';

export { escolherCamadasDePagina } from './segment/camadas-de-pagina.js';
// A Refinaria: o que o resegmentar offline precisa além do que já saía.
export { escolherPecas } from './segment/pecas.js';
export { escolherComportamentos } from './segment/comportamentos.js';
export { atributosDoDocumento } from './compiler/documento.js';
export type { EvidenciaDaCaptura } from './evidencia.js';
export { runtimesQueViajam } from './compiler/runtime-local.js';
