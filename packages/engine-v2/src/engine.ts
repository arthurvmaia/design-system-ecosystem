import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type ExplorerLimits,
  FASE,
  Telemetria,
  absolutizeRefs,
  amostrarScroll,
  capturarRede,
  createSecureHttpFetcher,
  extractAssetRefs,
  localizeAssets,
  localizeCss,
  resolveLimits,
  resolveOrcamento,
} from '@ds/explorer';
import {
  type BackgroundDetection,
  CAPTURE_V2_SCHEMA_VERSION,
  type CaptureManifestV2,
  type CaptureModeV2,
  type CapturedAsset,
  type MediaDetection,
  type PointerPath,
  type PointerResponse,
  type ScrollBehavior,
  type ScrollViewportPass,
  type StackEntry,
  type TemporalObservation,
  type VisualComparison,
} from '@ds/shared';
import { PlaywrightIndisponivel, type SessaoV2, abrirSessao } from './browser/page.js';
import { type FolhaExternaBundle, escreverBundle } from './compiler/bundle.js';
import { atributosDoDocumento, scriptsExternosDoDocumento } from './compiler/documento.js';
import { decidirScripts, runtimesQueViajam } from './compiler/runtime-local.js';
import { detectarFerramentas, montarStack } from './compiler/stack.js';
import { type Candidato, descobrirCandidatos } from './explore/candidates.js';
import { TRAJETORIAS_COMPLEMENTARES, TRAJETORIA_COBERTURA } from './explore/pointer-paths.js';
import {
  type ResultadoVarredura,
  valeComplementares,
  varrerPonteiro,
} from './explore/pointer-run.js';
import { percorrerComScroll } from './explore/scroll-walk.js';
import { construirGrafoDeEstados } from './explore/state-graph.js';
import {
  ASSINATURA_ESTADO_FN,
  CENTRO_DO_REF_FN,
  COLETAR_CSS_FN,
  COLETAR_INSTRUMENTACAO_FN,
  COLETAR_JS_INLINE_FN,
  COLETAR_MAPA_FN,
  DESTACAR_FUNDO_FN,
  ESPERAR_ICONES_FN,
  HTML_DO_REF_FN,
  INIT_SCRIPT,
  LIMPAR_DESTAQUE_FN,
  ROLAR_ATE_REF_FN,
  ROLAR_PARA_FN,
  chamar,
  hrefsDasFolhas,
  limparInstrumentacao,
  particionarCss,
  urlDaFolha,
} from './instrumentation/index.js';
import {
  construirBackgrounds,
  construirCamadas,
  construirMapaEstrutural,
  construirMidias,
  construirRuntimes,
} from './mapper/build-maps.js';
import { derivarRampas } from './mapper/rampas.js';
import type {
  BoxPx,
  RawAssinaturaEstado,
  RawColeta,
  RawCss,
  RawInstrumentacao,
  RawJsInline,
  RawNode,
} from './mapper/raw.js';
import { compararBundlesComOriginal, resumirComparacoes } from './observe/comparar-bundle.js';
import { hashBytes } from './observe/pixel.js';
import { atribuirMovimento, observarTemporal } from './observe/temporal.js';
import { escolherCamadasDePagina } from './segment/camadas-de-pagina.js';
import { escolherComportamentos } from './segment/comportamentos.js';
import { escolherPecas } from './segment/pecas.js';
import { type RejeitadoV2, type SegmentoV2, segmentarPorEvidencia } from './segment/segment-v2.js';

/**
 * O motor V2 — a orquestração do pipeline.
 *
 * A ordem aqui **é** a mudança de arquitetura, e vale ler como contrato:
 *
 *   instrumentar antes dos scripts do site
 *   → observar rede e runtime
 *   → percorrer com scroll sobreposto, e em CADA viewport:
 *       mapa estrutural → mapa visual → observação temporal → varredura de ponteiro
 *   → amostrar comportamentos de scroll
 *   → descobrir candidatos com evidência
 *   → executar ações seguras e montar o grafo de estados
 *   → localizar assets
 *   → SÓ ENTÃO segmentar
 *   → classificar representação → compilar bundle → validar
 *
 * No V1 a segmentação era a segunda coisa a acontecer, sobre uma string de HTML, e
 * a exploração vinha depois — num segundo carregamento da página, cujo DOM não era
 * o que havia sido segmentado.
 *
 * O que este arquivo NÃO reimplementa, e reusa de `@ds/explorer`: telemetria e
 * orçamento por fase, captura de bytes da rede com guardas de SSRF, downloader
 * seguro, localização de CSS externo, amostragem portátil de scroll. Tudo isso já
 * funciona e já é testado.
 */

/** Fases do V2. Nomes próprios, com teto explícito — sem tocar no `FASE` do V1. */
export const FASE_V2 = {
  abrir: 'v2-abrir',
  carregar: 'v2-carregar',
  estabilizar: 'v2-estabilizar',
  percurso: 'v2-percurso',
  scrollAmostra: FASE.scrollAmostra,
  candidatos: 'v2-candidatos',
  estados: 'v2-estados',
  assets: FASE.assetsRede,
  drenar: FASE.drenarRede,
  segmentar: FASE.segmentar,
  compilar: 'v2-compilar',
  comparar: 'v2-comparar',
  fechar: FASE.fechar,
} as const;

/**
 * Teto de cada fase do V2, como FRAÇÃO do orçamento total.
 *
 * Isto não é afinação: é a correção de um erro estrutural. `Telemetria.tetoFase`
 * cai em `orc.total` quando a fase não tem teto declarado — e as fases do V2 têm
 * nomes próprios, que não existem no orçamento montado por `resolveOrcamento`.
 * O resultado foi o percurso rodar com o teto do processo INTEIRO e consumir
 * tudo: segmentação, compilação e assets ficavam com zero.
 *
 * As frações somam menos que 1 de propósito — o que sobra é a margem do
 * carregamento, da drenagem e do fechamento.
 */
const FRACAO_DA_FASE: Record<string, number> = {
  [FASE_V2.percurso]: 0.34,
  [FASE_V2.estados]: 0.22,
  [FASE_V2.candidatos]: 0.04,
  [FASE_V2.segmentar]: 0.06,
  [FASE_V2.compilar]: 0.1,
  // A comparação é barata em CPU e cara em espera (carregar cada bundle e
  // esperar a fonte assentar). Teto pequeno: ela é verificação, e verificação
  // nunca pode comer o orçamento do que está sendo verificado.
  [FASE_V2.comparar]: 0.06,
};

/**
 * A ordem em que as fases com teto correm. Serve para saber, de uma fase, o que
 * ainda está PROMETIDO às que vêm depois dela.
 */
const ORDEM_DAS_FASES: string[] = [
  FASE_V2.percurso,
  FASE_V2.candidatos,
  FASE_V2.estados,
  FASE_V2.segmentar,
  FASE_V2.compilar,
  FASE_V2.comparar,
];

/**
 * Teto de uma fase: a fração dela, ou o que estiver de fato LIVRE — o que for
 * maior.
 *
 * A fração sozinha produzia fome com comida na mesa. Medido nesta página: com
 * 600s de orçamento, o percurso morreu no teto de 204s (34% de 600) enquanto a
 * captura inteira usou 320s — **280 segundos sobraram sem dono** enquanto a
 * única fase que precisava deles era cortada. Aumentar o total não resolvia,
 * porque a fração subia junto e o desperdício subia junto também.
 *
 * A fração continua sendo o piso: ela é o que impede uma fase de comer o
 * orçamento das outras. O que muda é que ela deixou de ser o TETO quando há
 * tempo livre — e "livre" tem definição exata: o que resta menos o que ainda
 * está prometido às fases seguintes. Nenhuma delas fica sem o quinhão dela.
 */
export const tetoDaFase = (
  nome: string,
  totalMs: number,
  restanteMs?: number,
): number | undefined => {
  const fracao = FRACAO_DA_FASE[nome];
  if (fracao === undefined) return undefined;
  const daFracao = Math.round(totalMs * fracao);
  if (restanteMs === undefined) return daFracao;

  const i = ORDEM_DAS_FASES.indexOf(nome);
  const prometidoAdiante =
    i === -1 ? 0 : ORDEM_DAS_FASES.slice(i + 1).reduce((n, f) => n + (FRACAO_DA_FASE[f] ?? 0), 0);

  // A margem que as frações deixam de propósito (elas somam menos que 1) é de
  // carregar, estabilizar, drenar e fechar — e do GRÃO do corte: uma fase só é
  // interrompida ENTRE passos, e um passo do percurso custa dezenas de
  // segundos. Sem reservá-la, a captura passava do orçamento em vez de caber
  // nele, e o teste da resposta pendurada pegou isso: 151s num teto de 150s.
  //
  // A reserva tem teto absoluto porque essas fases custam tempo quase
  // constante: exigir 18% de um orçamento de dez minutos guardaria quase dois
  // minutos para algo que leva dez segundos, e a redistribuição não faria nada
  // justamente onde ela mais serve.
  const margem = Math.min(totalMs * 0.18, 45_000);
  const livre = Math.round(restanteMs - totalMs * prometidoAdiante - margem);
  return Math.max(daFracao, livre);
};

export type LogV2 = (evento: string, dados?: Record<string, unknown>) => void;

export type OpcoesCaptura = {
  limits?: Partial<ExplorerLimits>;
  log?: LogV2;
  /** Diretório onde gravar frames, estados e assets. */
  dirCaptura: string;
  /** Diretório onde gravar os bundles dos segmentos. */
  dirBundles?: string;
  /** Telemetria injetável (o pipeline da fila cria a sua). */
  telemetria?: Telemetria;
  /** Viewport da captura. */
  viewport?: { width: number; height: number };
  /** Teto de trajetórias de ponteiro por viewport. */
  maxTrajetoriasPorViewport?: number;
  /** Teto de paradas de scroll. */
  maxParadas?: number;
  /** Desliga a varredura de ponteiro (para comparações e depuração). */
  semPonteiro?: boolean;
  /** Desliga o grafo de estados. */
  semEstados?: boolean;
  /**
   * Conferir cada bundle contra o print da dobra, por comparação de pixel.
   *
   * Ligado por padrão: é a verificação que responde "o bundle PARECE com o
   * original?", e a resposta importa mais que qualquer contagem de regras.
   *
   * Desligável porque ela é uma fase separada com custo próprio — uma aba, uma
   * navegação e uma espera de fonte por bundle. Quem extrai vinte sites em
   * sequência, ou quem só quer os arquivos, não precisa pagar por isso a cada
   * vez. A escolha é de quem chama, não do motor.
   */
  verificarVisual?: boolean;
  signal?: AbortSignal;
};

export type ResultadoCaptura = {
  manifesto: CaptureManifestV2;
  /** HTML renderizado, sem a instrumentação — é o `design-system.html`. */
  html: string;
  finalUrl: string;
  segmentos: SegmentoV2[];
  /** Reprovados COM categoria e HTML — a Revisão mostra a prévia e os motivos. */
  rejeitados: RejeitadoV2[];
};

const noop: LogV2 = () => {};

/** Grava um arquivo dentro do diretório de captura, devolvendo o caminho relativo. */
const gravar = (base: string, relativo: string, conteudo: string | Uint8Array): string => {
  const destino = join(base, relativo);
  mkdirSync(dirname(destino), { recursive: true });
  if (typeof conteudo === 'string') writeFileSync(destino, conteudo, 'utf8');
  else writeFileSync(destino, conteudo);
  return relativo;
};

/** A página navegou no meio da captura e levou o contexto de execução junto? */
const navegacaoDestruiuContexto = (err: unknown): boolean =>
  err instanceof Error &&
  /Execution context was destroyed|because of a navigation|Cannot find context with specified id/i.test(
    err.message,
  );

/**
 * Captura uma URL com o motor V2.
 *
 * Nunca deixa de devolver algo útil: corte por orçamento produz manifesto PARCIAL
 * com o que já foi medido, e ausência de Playwright lança
 * `PlaywrightIndisponivel` para o chamador decidir (a fila cai no V1 estático).
 *
 * Navegação no meio da captura (redirect de locale, meta refresh, link
 * same-origin que a política deixou passar) destrói o contexto e invalida os
 * refs — os dados da tentativa não servem. UMA nova tentativa, do zero, no
 * MESMO orçamento (a telemetria acumula: o que a primeira gastou faz falta na
 * segunda, de propósito). Persistindo, o erro sobe com a causa clara.
 */
export const capturarComV2 = async (
  url: string,
  opts: OpcoesCaptura,
): Promise<ResultadoCaptura> => {
  const tel =
    opts.telemetria ?? new Telemetria(resolveOrcamento(resolveLimits(opts.limits)).orcamento);
  const comTelemetria = { ...opts, telemetria: tel };
  try {
    return await capturarTentativa(url, comTelemetria);
  } catch (err) {
    if (!navegacaoDestruiuContexto(err)) throw err;
    (opts.log ?? noop)('navegacao-no-meio', {
      detalhe: err instanceof Error ? err.message.slice(0, 160) : String(err),
      acao: 'a página navegou durante a captura — uma nova tentativa, do zero',
    });
    return await capturarTentativa(url, comTelemetria);
  }
};

const capturarTentativa = async (url: string, opts: OpcoesCaptura): Promise<ResultadoCaptura> => {
  const limits = resolveLimits(opts.limits);
  const log = opts.log ?? noop;
  const { orcamento, avisos } = resolveOrcamento(limits);
  for (const a of avisos) log('orcamento', { aviso: a });
  const tel = opts.telemetria ?? new Telemetria(orcamento);
  const viewport = opts.viewport ?? { width: 1440, height: 900 };
  const limitacoes: string[] = [];
  const parciais: string[] = [];

  let sessao: SessaoV2 | null = null;
  try {
    sessao = await tel.medir(FASE_V2.abrir, () =>
      abrirSessao({ initScript: INIT_SCRIPT, viewport, timeoutMs: 5_000 }),
    );
  } catch (err) {
    if (err instanceof PlaywrightIndisponivel) throw err;
    throw err;
  }
  const s = sessao;
  const page = s.page;

  try {
    // Rede observada ANTES do goto — reuso direto do V1: já tem guarda de SSRF,
    // teto de memória e timeout individual por corpo.
    const rede = capturarRede(s.pw as never, limits, tel);

    log('carregando', { url });
    const gotoTimeout = Math.max(1_000, Math.min(limits.pageLoadTimeoutMs, tel.restanteTotal()));
    await tel.medir(FASE_V2.carregar, () =>
      s.pw.goto(url, { waitUntil: 'domcontentloaded', timeout: gotoTimeout }),
    );
    await tel.medir(FASE_V2.estabilizar, () => page.esperar(limits.settleAfterLoadMs));

    // Quiescência de navegação: bouncer de locale e meta refresh navegam DEPOIS
    // do load. Instrumentar uma página que ainda vai trocar de documento perde
    // tudo — espera a URL parar de mudar (custo fixo de 1 checagem quando não
    // há navegação nenhuma).
    let urlEstavel = s.pw.url();
    for (let i = 0; i < 6; i++) {
      await page.esperar(400);
      const agora = s.pw.url();
      if (agora === urlEstavel) break;
      log('navegacao-tardia', { de: urlEstavel, para: agora });
      urlEstavel = agora;
      await page.esperar(limits.settleAfterLoadMs);
    }

    const lerAssinatura = (): Promise<RawAssinaturaEstado> =>
      page.evaluate<RawAssinaturaEstado>(chamar(ASSINATURA_ESTADO_FN));

    // ── Percurso com scroll ───────────────────────────────────────────────
    const temporais: TemporalObservation[] = [];
    const caminhos: PointerPath[] = [];
    const respostasPonteiro: PointerResponse[] = [];
    const refsReativos = new Map<number, number>();
    const coletas: RawColeta[] = [];
    let viewportReativa = false;

    /**
     * Acumula o resultado de uma varredura. Declarado ANTES do percurso de
     * propósito: o `trabalho` de cada parada o chama, e uma `const` definida
     * depois cairia na zona morta temporal na primeira parada.
     */
    const registrarVarredura = (r: ResultadoVarredura): void => {
      caminhos.push(r.path);
      for (const resp of r.respostas) respostasPonteiro.push(resp);
      for (const [ref, delta] of r.refsReativos) {
        refsReativos.set(ref, Math.max(refsReativos.get(ref) ?? 0, delta));
      }
      if (r.viewportReativa) viewportReativa = true;
    };

    /**
     * O percurso tem um teto, e ele precisa ser DIVIDIDO entre as paradas.
     *
     * Sem isso, a varredura de ponteiro da primeira viewport consome a fase toda e
     * o resto da página nunca é observado — foi o que aconteceu na primeira
     * medição: 2 paradas de 8, e o campo de partículas (que mora no meio da
     * página) nunca chegou a ser provocado. Cada parada recebe a sua cota; quem
     * estoura a cota perde a varredura de ponteiro, não a observação temporal —
     * porque a temporal é barata e é o que responde "isto se move".
     */
    const paradasPrevistas = opts.maxParadas ?? 10;
    const tetoPercurso =
      tetoDaFase(FASE_V2.percurso, limits.orcamentoTotalMs, tel.restanteTotal()) ?? 60_000;
    const cotaPorParada = Math.max(3_000, Math.floor(tetoPercurso / (paradasPrevistas + 1)));

    const passes: ScrollViewportPass[] = await tel.faseCooperativa(
      FASE_V2.percurso,
      (signal) =>
        percorrerComScroll(page, {
          signal,
          maxParadas: paradasPrevistas,
          assentarMs: 220,
          trabalho: async (ctx) => {
            const inicioDaParada = Date.now();
            const dentroDaCota = (): boolean => Date.now() - inicioDaParada < cotaPorParada;
            const temporalIds: string[] = [];
            const pathIds: string[] = [];

            // 1. Mapa desta viewport (estrutura + camadas + fundos + mídias).
            const coleta = await page.evaluate<RawColeta>(
              chamar(COLETAR_MAPA_FN, { maxNos: 1_200 }),
            );
            coletas.push(coleta);

            // 2. Observação temporal da viewport. Uma por parada: é o que diz se
            // ALGO se move aqui, e é barata comparada a observar cada elemento.
            const obs = await observarTemporal(page, {
              alvo: `viewport:${ctx.indice}`,
              instantes: [0, 250, 600, 1200],
              medirDom: async () => (await lerAssinatura()).htmlHash,
              signal,
              sink: (nome, bytes) => gravar(opts.dirCaptura, join('frames', nome), bytes),
              prefixo: `vp${ctx.indice}`,
              maxFrames: 2,
            });
            temporais.push(obs);
            temporalIds.push(obs.id);

            // 3. Varredura de ponteiro. A de cobertura sempre; as complementares
            // só com evidência de reação — e só nas primeiras paradas, onde o
            // custo se paga (o resto da página costuma repetir o padrão).
            if (opts.semPonteiro !== true && signal.aborted === false && dentroDaCota()) {
              const cobertura = await varrerPonteiro(page, {
                kind: TRAJETORIA_COBERTURA,
                densidade: 3,
                scrollProgress: ctx.progresso,
                idPrefixo: `vp${ctx.indice}`,
                signal,
                maxConfirmacoes: 6,
              });
              registrarVarredura(cobertura);
              pathIds.push(cobertura.path.id);

              const teto = opts.maxTrajetoriasPorViewport ?? 3;
              if (valeComplementares(cobertura) && dentroDaCota()) {
                viewportReativa = viewportReativa || cobertura.viewportReativa;
                let feitas = 1;
                for (const kind of TRAJETORIAS_COMPLEMENTARES) {
                  if (feitas >= teto || signal.aborted || !dentroDaCota()) break;
                  const extra = await varrerPonteiro(page, {
                    kind,
                    scrollProgress: ctx.progresso,
                    idPrefixo: `vp${ctx.indice}-${kind}`,
                    signal,
                    maxConfirmacoes: 6,
                    sondaVisualCada: 12,
                  });
                  registrarVarredura(extra);
                  pathIds.push(extra.path.id);
                  feitas++;
                }
                // Refina as regiões sem DOM que reagiram: é onde vive a cena.
                for (const regiao of cobertura.regioesSemDom.slice(0, 2)) {
                  if (signal.aborted || !dentroDaCota()) break;
                  const refino = await varrerPonteiro(page, {
                    kind: 'refinamento',
                    regiao,
                    densidade: 4,
                    scrollProgress: ctx.progresso,
                    idPrefixo: `vp${ctx.indice}-refino`,
                    signal,
                    maxConfirmacoes: 4,
                  });
                  registrarVarredura(refino);
                  pathIds.push(refino.path.id);
                }
              }
            }

            const visiveis = coleta.nos
              .filter((n) => n.visivel && n.box.y + n.box.h > 0 && n.box.y < viewport.height)
              .map((n) => `ref:${n.ref}`);

            return {
              visible: visiveis,
              appeared: [],
              temporalIds,
              pointerPathIds: pathIds,
              assetsLoaded: [],
            };
          },
        }),
      tetoDaFase(FASE_V2.percurso, limits.orcamentoTotalMs, tel.restanteTotal()),
    );

    log('percurso', {
      paradas: passes.length,
      temporais: temporais.length,
      trajetorias: caminhos.length,
    });

    // ── Volta ao topo e coleta o mapa AUTORITATIVO ────────────────────────
    // O percurso mediu comportamento; o mapa final é o que a segmentação usa, e
    // precisa vir com a página inteira já carregada (lazy-load resolvido).
    await page.evaluate(chamar(ASSINATURA_ESTADO_FN));
    await s.pw.evaluate('window.scrollTo({top:0,behavior:"instant"})');
    await page.esperar(300);

    const coletaFinal = await page.evaluate<RawColeta>(chamar(COLETAR_MAPA_FN, { maxNos: 3_000 }));
    if (coletaFinal.truncado) {
      limitacoes.push(
        'O mapa estrutural foi truncado no teto de nós: páginas muito grandes podem ter seções não analisadas.',
      );
    }

    const instrumentacao = await page.evaluate<RawInstrumentacao>(
      chamar(COLETAR_INSTRUMENTACAO_FN),
    );
    const folhas = await page.evaluate<RawCss[]>(chamar(COLETAR_CSS_FN));
    const scriptsInline = await page.evaluate<RawJsInline[]>(chamar(COLETAR_JS_INLINE_FN));
    const htmlBruto = await s.pw.content();
    const finalUrl = s.pw.url();
    // Refs absolutas são a garantia do V1 que o resto do fluxo assume: o preview
    // carrega assets da origem e o `fila:concluir` valida refs relativas contra
    // o disco. `page.content()` devolve os atributos como estão no DOM.
    const html = absolutizeRefs(limparInstrumentacao(htmlBruto), finalUrl);
    // O documento em que os segmentos viviam: atributos de `<html>`/`<body>` e o
    // runtime que a página carregava. Sem isso o bundle sai sem tema, sem fundo
    // e sem os scripts que desenham os ícones.
    const scriptsExternosDaPagina = scriptsExternosDoDocumento(html);

    if (instrumentacao.shadowRoots.closed > 0) {
      limitacoes.push(
        `${instrumentacao.shadowRoots.closed} shadow root(s) fechado(s): a subárvore não é percorrível por contrato do navegador; só o comportamento visual externo foi observado.`,
      );
    }
    for (const f of instrumentacao.falhas) {
      limitacoes.push(`Instrumentação parcial: ${f}`);
    }

    // ── Mapas ─────────────────────────────────────────────────────────────
    const { nos: structuralMap, porRef } = construirMapaEstrutural(coletaFinal);
    const visualLayers = construirCamadas(coletaFinal, porRef);
    let backgroundDetections = construirBackgrounds(coletaFinal, porRef, visualLayers);
    let mediaDetections = construirMidias(coletaFinal, porRef, visualLayers);
    const runtimeDetections = construirRuntimes(instrumentacao);

    // As rampas do site: escala de letra, respiro e raio. Derivadas da PÁGINA
    // inteira, e não por dobra — a escala é o que vale no site todo, e medi-la
    // por segmento daria uma rampa diferente para cada pedaço.
    const rampas = derivarRampas(coletaFinal.nos);
    // Do `ref` do nó cru para o hash do mapa: é por hash que o segmento conhece
    // os membros dele.
    const tokensPorHash = new Map<string, readonly string[]>();
    for (const [ref, ids] of rampas.porRef) {
      const no = porRef.get(ref);
      if (no !== undefined) tokensPorHash.set(no.fingerprint.hash, ids);
    }
    log('rampas', {
      tipografia: rampas.tokens.filter((t) => t.eixo === 'tipografia').length,
      espaco: rampas.tokens.filter((t) => t.eixo === 'espaco').length,
      raio: rampas.tokens.filter((t) => t.eixo === 'raio').length,
    });

    log('mapas', {
      nos: structuralMap.length,
      camadas: visualLayers.length,
      fundos: backgroundDetections.length,
      midias: mediaDetections.length,
      runtimes: runtimeDetections.length,
    });

    // ── Atribuição do movimento ───────────────────────────────────────────
    // Aqui o `animated` deixa de ser `false` por padrão e passa a valer o que foi
    // MEDIDO — cruzando a observação temporal com os detectores.
    const houveMovimento = temporais.some((t) => t.moving);
    const animacoesCss = Object.keys(instrumentacao.animacoesCss);
    const atribuicao = atribuirMovimento({
      temWebgl:
        (instrumentacao.graphicsContexts.webgl ?? 0) +
          (instrumentacao.graphicsContexts.webgl2 ?? 0) >
        0,
      temCanvas2d: (instrumentacao.graphicsContexts['2d'] ?? 0) > 0,
      temVideo: mediaDetections.some((m) => m.kind === 'video'),
      temImagemAnimavel: mediaDetections.some(
        (m) =>
          m.kind === 'gif' ||
          m.kind === 'webp-animado' ||
          m.kind === 'avif-animado' ||
          m.kind === 'apng',
      ),
      temSvgSmil: mediaDetections.some((m) => m.kind === 'svg-animado'),
      animacoesCssQueRodaram: animacoesCss,
      runtimesDetectados: runtimeDetections.map((r) => r.label),
      domMudou: temporais.some((t) => !t.domStable),
    });

    if (houveMovimento) {
      backgroundDetections = backgroundDetections.map((b): BackgroundDetection => {
        // Um fundo é considerado animado quando cobre uma região onde houve
        // movimento medido. Sem a medição, `animated` fica `false` — declarar
        // `animation` no CSS nunca basta.
        const cobreRegiaoMovel = temporais.some(
          (t) => t.moving && (b.coversSection || t.target.startsWith('viewport:')),
        );
        if (!cobreRegiaoMovel) return b;
        return {
          ...b,
          animated: true,
          animationEvidence: [...b.animationEvidence, `movimento medido: ${atribuicao.causa}`],
          runtime: atribuicao.porCss ? undefined : atribuicao.causa,
        };
      });
      mediaDetections = mediaDetections.map((m): MediaDetection => {
        const reagiu = respostasPonteiro.some(
          (p) => p.fingerprint?.hash === m.fingerprint.hash || (p.domless && m.asBackground),
        );
        const ehCena = m.kind === 'canvas-2d' || m.kind === 'webgl' || m.kind === 'webgl2';
        return {
          ...m,
          animated: ehCena || m.kind === 'video' ? houveMovimento : m.animated,
          pointerReactive: reagiu,
        };
      });
    }

    // ── Comportamentos de scroll (reuso do V1) ────────────────────────────
    const scrollObservations: ScrollBehavior[] = await tel.faseCooperativa(
      FASE_V2.scrollAmostra,
      (signal) =>
        amostrarScroll(
          { evaluate: (e) => s.pw.evaluate(e), waitForTimeout: (ms) => page.esperar(ms) },
          limits,
          signal,
          (evento, dados) => log(`scroll:${evento}`, dados),
        ),
    );
    log('scroll', { comportamentos: scrollObservations.length });

    // ── HTML por seção ────────────────────────────────────────────────────
    // Lido AQUI, antes do grafo de estados, e não depois: o grafo pode recarregar
    // a página para reestabelecer o estado inicial, e a recarga zera os
    // `data-dsx2`. Ler o HTML por ref depois disso devolveria o elemento errado —
    // ou nenhum. O DOM que a segmentação usa é este, o mesmo que foi mapeado.
    const htmlPorHash = new Map<string, string>();
    const framePorHash = new Map<string, string>();
    const PAPEIS_COM_HTML = new Set([
      'hero',
      'header',
      'nav',
      'main',
      'section',
      'article',
      'aside',
      'footer',
      'form',
    ]);
    // As PEÇAS de dentro das dobras (card, botão, mockup, mídia) escolhidas por
    // evidência medida. Sem o HTML delas a subdivisão só podia adivinhar por
    // nome de classe no HTML da seção — e perdia o que não tem irmão igual.
    // Continua sendo uma lista curta e escolhida, não os 3000 nós do documento.
    const pecas = escolherPecas({
      nos: structuralMap,
      pageHeight: coletaFinal.pageHeight,
      viewportWidth: viewport.width,
    });

    // O fundo que atravessa TODAS as dobras (canvas animado, blobs, grão). A
    // posse dele cai no `<body>`, que não é dobra escolhida — sem isto ele não
    // pertencia a segmento nenhum e sumia da Galeria.
    const camadasDePagina = escolherCamadasDePagina({
      camadas: visualLayers,
      nos: structuralMap,
      viewport,
      // Mídia é o que liga uma camada a runtime: canvas/WebGL/vídeo têm
      // detecção com elemento. `RuntimeDetection` é por script, sem elemento.
      hashesComRuntime: new Set(mediaDetections.map((m) => m.fingerprint.hash)),
    });
    log('camadas-de-pagina', {
      comRuntime: camadasDePagina.comRuntime.length,
      soCss: camadasDePagina.soCss.length,
    });

    // Comportamentos (revelar ao rolar, parallax, fixar) como componente. O
    // alvo de cada um precisa do HTML, igual às peças.
    const comportamentos = escolherComportamentos({
      scroll: scrollObservations,
      nos: structuralMap,
    });
    log('comportamentos', {
      total: comportamentos.length,
      familias: comportamentos.map((c) => c.familia).join(','),
    });

    const hashesDePeca = new Set([
      ...pecas.map((p) => p.hash),
      ...camadasDePagina.comRuntime,
      ...camadasDePagina.soCss,
      ...comportamentos.flatMap((c) => c.hashes),
    ]);

    // A comparação visual de cada bundle com o print da dobra. Vazia quando
    // não há bundles ou quando o orçamento cortou a fase.
    let comparacoes: VisualComparison[] = [];

    // Contadores de ícone da captura inteira: viram log e limitação no fim.
    let iconesEsperados = 0;
    let iconesPendentes = 0;

    for (const n of coletaFinal.nos) {
      const node = porRef.get(n.ref);
      if (node === undefined) continue;
      // Seções + as peças escolhidas: capturar o outerHTML de 3000 nós custaria
      // mais que todo o resto do pipeline.
      if (!PAPEIS_COM_HTML.has(node.role) && !hashesDePeca.has(node.fingerprint.hash)) continue;
      try {
        // Ler o elemento ENQUANTO ele está visível.
        //
        // Conteúdo preguiçoso não existe no DOM fora da viewport, e não é só
        // imagem: o `iconify-icon` REMOVE o SVG do shadow root quando o ícone
        // sai da tela (medido: 20 dos 22 ícones desta página têm SVG no topo,
        // 3 depois de rolar de volta). Lendo com a página parada no topo, todo
        // componente abaixo da primeira dobra vinha sem ícone.
        const rolou = await page.evaluate<boolean>(chamar(ROLAR_ATE_REF_FN, n.ref));
        if (rolou) await page.esperar(120);
        // Esperar o ícone estar DESENHADO antes de ler.
        //
        // Os 120ms acima eram um chute, e a medição mostrou o preço: 128 dos
        // 356 ícones do acervo chegaram como casca vazia. Entre a tag existir e
        // o SVG existir há o script carregar, o elemento ser promovido a custom
        // element e o traçado voltar de uma API. Aqui a espera é pelo FATO — e
        // com teto, porque um ícone que a API não devolve não pode segurar a
        // captura inteira. O que não vier é declarado, não escondido.
        const icones = await page.evaluate<{ total: number; pendentes: number }>(
          chamar(ESPERAR_ICONES_FN, n.ref, 1500),
        );
        if (icones.pendentes > 0) iconesPendentes += icones.pendentes;
        iconesEsperados += icones.total;
        const bruto = await page.evaluate<string>(chamar(HTML_DO_REF_FN, n.ref));
        if (bruto.length > 0)
          htmlPorHash.set(
            node.fingerprint.hash,
            absolutizeRefs(limparInstrumentacao(bruto), finalUrl),
          );
      } catch {
        // nó saiu do DOM: a seção fica sem HTML e é reprovada na validação
      }
    }
    for (const t of temporais) {
      const primeiro = t.frames[0];
      if (primeiro !== undefined) framePorHash.set(t.target, join('frames', primeiro));
    }
    log('html-secoes', { total: htmlPorHash.size, pecas: pecas.length });
    if (iconesEsperados > 0) {
      log('icones', { total: iconesEsperados, pendentes: iconesPendentes });
      if (iconesPendentes > 0) {
        limitacoes.push(
          `${iconesPendentes} de ${iconesEsperados} ícone(s) não puderam ser lidos dentro do tempo: eles continuam dependendo do runtime da biblioteca para aparecer.`,
        );
      }
    }

    // ── Print de cada dobra ───────────────────────────────────────────────
    // Duas necessidades, um mesmo screenshot.
    //
    // A antiga: toda seção que pode acabar como REFERÊNCIA VISUAL precisa de um
    // frame, ou é reprovada — perder o item por falta de imagem seria perder por
    // um detalhe que o motor resolve.
    //
    // A nova: o print é como a pessoa VÊ a dobra. O HTML conta a estrutura, o
    // print conta o resultado — o que está ali, como se compõe, que efeito está
    // em jogo. Por isso deixou de sair só das seções com cena e passa a sair de
    // TODAS: uma dobra de texto sem print é uma dobra que ninguém consegue
    // conferir sem abrir o site de origem.
    // A lista de quem ganha print é a MESMA de quem ganha HTML.
    //
    // Eram duas listas diferentes, e a de print era mais curda: só os papéis de
    // seção. Mas peças, camadas de fundo e comportamentos também viram segmento
    // — e chegavam à Galeria sem imagem e à comparação de pixel sem nada contra
    // o que conferir. Medido: 6 de 13 segmentos ficavam de fora por isso, e era
    // a maior fonte de cobertura perdida de todo o pipeline.
    //
    // `hashesDePeca` já reúne peças, camadas e comportamentos, e já é o critério
    // do laço de HTML logo acima. Usar o mesmo aqui elimina a divergência pela
    // raiz, em vez de tentar mantê-las sincronizadas.
    const secoesParaPrint = coletaFinal.nos.filter((n) => {
      const node = porRef.get(n.ref);
      if (node === undefined) return false;
      return PAPEIS_COM_HTML.has(node.role) || hashesDePeca.has(node.fingerprint.hash);
    });
    // Por que uma dobra ficou sem print. A comparação de pixel expôs o buraco:
    // ela conseguiu conferir 3 de 12 segmentos, e a causa não era dela — era a
    // falta de print, aqui em cima. Sem estes contadores, o motivo continuaria
    // invisível, porque cada caminho de saída era um `continue` calado.
    const semPrint = { semCentro: 0, erro: 0, foraDoTeto: 0 };
    const TETO_DE_PRINTS = 40;
    semPrint.foraDoTeto = Math.max(0, secoesParaPrint.length - TETO_DE_PRINTS);

    for (const n of secoesParaPrint.slice(0, TETO_DE_PRINTS)) {
      const node = porRef.get(n.ref);
      if (node === undefined) continue;
      try {
        const vp = page.viewport();
        // A seção precisa estar NA VIEWPORT e com as animações de entrada
        // assentadas antes do screenshot: uma seção com reveal por scroll
        // fotografada fora de vista sai vazia — e o card na Galeria parece
        // defeito, não referência. Rola até o ELEMENTO (não a uma coordenada:
        // o pageBox nem sempre existe) e espera o reveal disparar.
        const rolou = await page.evaluate<boolean>(chamar(ROLAR_ATE_REF_FN, n.ref));
        if (rolou) await page.esperar(400);
        const centro = await page.evaluate<{ box: BoxPx } | null>(chamar(CENTRO_DO_REF_FN, n.ref));
        if (centro === null) {
          semPrint.semCentro++;
          continue;
        }
        const clip: BoxPx = {
          x: Math.max(0, Math.min(vp.width - 2, centro.box.x)),
          y: Math.max(0, Math.min(vp.height - 2, centro.box.y)),
          w: Math.max(2, Math.min(vp.width - Math.max(0, centro.box.x), centro.box.w)),
          h: Math.max(2, Math.min(vp.height - Math.max(0, centro.box.y), centro.box.h)),
        };
        const bytes = await page.screenshot({ clip });
        const nome = `secao-${node.fingerprint.hash.slice(0, 10)}-${hashBytes(bytes).slice(0, 8)}.png`;
        framePorHash.set(
          node.fingerprint.hash,
          gravar(opts.dirCaptura, join('frames', nome), bytes),
        );
      } catch {
        // seção removida do DOM: fica sem frame e será reprovada com o motivo —
        // que é melhor que entregar um card vazio.
        semPrint.erro++;
      }
    }
    log('prints-de-secao', {
      candidatas: secoesParaPrint.length,
      gravados: framePorHash.size,
      ...semPrint,
    });
    // Devolve o scroll ao topo: as fases seguintes (candidatos, estados) medem
    // a página a partir do estado inicial.
    try {
      await page.evaluate(chamar(ROLAR_PARA_FN, 0));
      await page.esperar(200);
    } catch {
      // rolagem de volta é cortesia, não pré-condição
    }

    // ── Retrato das camadas de fundo ──────────────────────────────────────
    // Uma camada que atravessa a página não tem retrato próprio: sozinha é um
    // retângulo transparente, junto ela some no meio do conteúdo. O retrato é a
    // tela com o CONTEÚDO ESMAECIDO — o fundo fica evidente e o contexto
    // continua legível. Sem isto o componente de fundo abria vazio na Galeria.
    const refPorHash = new Map<string, (typeof coletaFinal.nos)[number]['ref']>();
    for (const n of coletaFinal.nos) {
      const h = porRef.get(n.ref)?.fingerprint.hash;
      if (h !== undefined && !refPorHash.has(h)) refPorHash.set(h, n.ref);
    }
    for (const grupo of [camadasDePagina.comRuntime, camadasDePagina.soCss]) {
      if (grupo.length === 0) continue;
      const refs = grupo.flatMap((h) => {
        const r = refPorHash.get(h);
        return r === undefined ? [] : [r];
      });
      if (refs.length === 0) continue;
      try {
        const preparou = await page.evaluate<boolean>(chamar(DESTACAR_FUNDO_FN, refs));
        if (preparou) {
          await page.esperar(220);
          const bytes = await page.screenshot({});
          const nome = `fundo-${(grupo[0] ?? '').slice(0, 10)}-${hashBytes(bytes).slice(0, 8)}.png`;
          const caminho = gravar(opts.dirCaptura, join('frames', nome), bytes);
          for (const h of grupo) framePorHash.set(h, caminho);
        }
      } catch {
        // sem retrato, a camada declara a limitação em vez de abrir vazia
      } finally {
        try {
          await page.evaluate(LIMPAR_DESTAQUE_FN);
        } catch {
          // a página já pode ter navegado; o destaque morre com ela
        }
      }
    }
    log('frames-secao', { total: framePorHash.size });

    // ── Candidatos ────────────────────────────────────────────────────────
    const candidatos: Candidato[] = await tel.faseCooperativa(
      FASE_V2.candidatos,
      async () => {
        const sinais = coletaFinal.nos.map((n) => ({
          hash: porRef.get(n.ref)?.fingerprint.hash ?? `ref:${n.ref}`,
          descriptor: paraDescritor(n),
          reagiuAoPonteiro: refsReativos.has(n.ref),
          deltaPonteiro: refsReativos.get(n.ref) ?? 0,
          emShadow: n.realm === 'shadow-open',
          visivel: n.visivel,
          areaShare: n.areaShare,
          controlePor: n.role,
          controlaAlvoExistente:
            n.aria['aria-controls'] !== undefined &&
            coletaFinal.nos.some((o) => o.id === n.aria['aria-controls']),
        }));
        return descobrirCandidatos(sinais, finalUrl, 120);
      },
      tetoDaFase(FASE_V2.candidatos, limits.orcamentoTotalMs, tel.restanteTotal()),
    );
    tel.inc('candidatos', candidatos.length);
    log('candidatos', { total: candidatos.length });

    // ── Grafo de estados ──────────────────────────────────────────────────
    const grafo =
      opts.semEstados === true
        ? null
        : await tel.faseCooperativa(
            FASE_V2.estados,
            (signal) =>
              construirGrafoDeEstados(page, lerAssinatura, {
                candidatos,
                signal,
                maxDepth: 2,
                maxStates: 30,
                maxActions: 80,
                sinkHtml: (nome, conteudo) =>
                  gravar(opts.dirCaptura, join('states', nome), absolutizeRefs(conteudo, finalUrl)),
                sinkFrame: (nome, bytes) => gravar(opts.dirCaptura, join('frames', nome), bytes),
                reestabelecer: async () => {
                  try {
                    await s.pw.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });
                    await page.esperar(limits.settleAfterLoadMs);
                    // Reencontra os refs: o `data-dsx2` morre com a recarga.
                    await page.evaluate(chamar(COLETAR_MAPA_FN, { maxNos: 3_000 }));
                    return true;
                  } catch {
                    return false;
                  }
                },
              }),
            tetoDaFase(FASE_V2.estados, limits.orcamentoTotalMs, tel.restanteTotal()),
          );
    if (grafo !== null) {
      tel.inc('estados', grafo.grafo.nodes.length - 1);
      tel.inc('acoes', grafo.acoes.length);
      limitacoes.push(...grafo.limitacoes);
      log('estados', {
        nos: grafo.grafo.nodes.length,
        acoes: grafo.acoes.length,
        bloqueadas: grafo.bloqueadas.length,
        contaminado: grafo.contaminado,
      });
    }

    // ── Assets ────────────────────────────────────────────────────────────
    // Concatena na ordem do documento — a ordem é a cascata. O coletor já
    // emite ordenado; o sort estável só protege coletas sem `ordem` (ficam
    // onde estavam) e futuras fontes fora de sequência. As folhas individuais
    // seguem para o bundle: é o que permite o fallback de intercalação.
    const cssInlineOrdenado = folhas
      .filter((f) => f.inline && f.content !== undefined && f.truncado !== true)
      .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
      .map((f) => ({ ordem: f.ordem ?? 0, conteudo: f.content ?? '' }));
    const cssInline = cssInlineOrdenado.map((f) => f.conteudo).join('\n');

    // Corte de CSS por teto: a folha marcada não tem conteúdo, ela é o aviso.
    // Sem isto, um site cujo estilo passa do teto sai com metade das regras e
    // nada denuncia — o bundle carrega, valida e fica errado só na tela.
    const corteDeCss = folhas.find((f) => f.truncado === true);
    if (corteDeCss !== undefined) {
      limitacoes.push(
        `A coleta de CSS parou no teto de regras (${corteDeCss.regrasLidas ?? '?'} lidas): parte do estilo da página não entrou nos bundles.`,
      );
    }

    const absDaFolha = (href: string): string => urlDaFolha(href, finalUrl);
    const hrefsDeFolhas = hrefsDasFolhas(folhas, finalUrl);

    const assets: CapturedAsset[] = [];
    const assetsLocais = new Set<string>();
    // Içados para fora do closure: o bundle precisa das folhas localizadas
    // (`cssMap`) e dos assets internos delas (fontes, imagens, @imports).
    let cssMapExterno = new Map<string, string>();
    let assetsDeCss: CapturedAsset[] = [];
    await tel.faseCooperativa(FASE_V2.assets, async (signal) => {
      const refs = extractAssetRefs(html, cssInline, finalUrl);
      const seguro = createSecureHttpFetcher(limits, { signal, contador: tel });
      const fetcher = async (u: string): ReturnType<typeof seguro> =>
        rede.mapa.get(u) ?? (await seguro(u));
      const sink = (localPath: string, bytes: Uint8Array): void => {
        gravar(opts.dirCaptura, join('assets', localPath), bytes);
      };
      const { cssUrls, outros } = particionarCss(refs, hrefsDeFolhas);
      const resCss = await localizeCss(cssUrls, fetcher, sink, limits, signal);
      cssMapExterno = resCss.cssMap;
      assetsDeCss = resCss.assets;
      const res = await localizeAssets(outros, fetcher, sink, limits, signal);
      for (const a of [...res.assets, ...resCss.assets]) {
        assets.push(a);
        if (a.status === undefined || a.status === 'local') {
          assetsLocais.add(a.originalUrl);
          if (a.resolvedUrl !== undefined) assetsLocais.add(a.resolvedUrl);
          for (const alias of a.aliases ?? []) assetsLocais.add(alias);
        }
      }
    });
    tel.inc('assetsLocais', assets.length);

    const drenoTimeout = Math.min(limits.faseDrenarMs, Math.max(0, tel.restanteTotal()));
    await tel.medir(FASE_V2.drenar, () => rede.aguardar(drenoTimeout));

    // ── Folhas externas do documento ──────────────────────────────────────
    // Cada `<link>` da coleta resolve para a cópia local que o `localizeCss`
    // gravou. A lista sai na ordem do documento — é a frente da cascata dos
    // bundles. Folha sem cópia local vira limitação, do manifesto e dos
    // segmentos: o bundle sai sem parte dos estilos e precisa dizer isso.
    const cssExternos: FolhaExternaBundle[] = [];
    const externasSemCopia: string[] = [];
    for (const f of folhas) {
      if (f.inline || f.href === null) continue;
      const abs = absDaFolha(f.href);
      const localPath = cssMapExterno.get(abs) ?? cssMapExterno.get(f.href);
      if (localPath === undefined) {
        externasSemCopia.push(abs);
        continue;
      }
      cssExternos.push({ ordem: f.ordem ?? 0, href: abs, localPath });
    }
    if (externasSemCopia.length > 0) {
      limitacoes.push(
        `${externasSemCopia.length} folha(s) de estilo externa(s) sem cópia local (ex.: ${externasSemCopia[0]}): os bundles podem perder estilos dessas folhas.`,
      );
    }
    log('css-externo', { localizadas: cssExternos.length, semCopia: externasSemCopia.length });

    // ── As bibliotecas que o site usa VIAJAM com o bundle ─────────────────
    //
    // Os arquivos `.js` já eram baixados para `capture-v2/assets/js/` — e o
    // bundle continuava emitindo `<script src="https://cdn…">`. A biblioteca
    // ficava no disco e o arquivo entregue a ignorava: o site só funcionava com
    // internet, e só enquanto aquele endereço existisse.
    //
    // A decisão não é "baixe tudo": o Tailwind por CDN é dispensado quando o
    // CSS compilado já foi capturado, e a biblioteca de ícones é dispensada
    // quando os SVGs já vieram para o HTML. Ver `runtime-local.ts`.
    const localPorUrl = new Map<string, string>();
    for (const a of assets) {
      if (a.status !== undefined && a.status !== 'local') continue;
      localPorUrl.set(a.originalUrl, a.localPath);
      if (a.resolvedUrl !== undefined) localPorUrl.set(a.resolvedUrl, a.localPath);
      for (const alias of a.aliases ?? []) localPorUrl.set(alias, a.localPath);
    }
    const scriptsDecididos = decidirScripts(
      scriptsExternosDaPagina.map((url) => {
        const local = localPorUrl.get(url);
        return local === undefined ? { url } : { url, localPath: local };
      }),
      {
        cssCompiladoCapturado: externasSemCopia.length === 0,
        iconesPendentes: iconesPendentes,
      },
    );
    log('scripts-de-runtime', {
      total: scriptsDecididos.length,
      levar: scriptsDecididos.filter((d) => d.decisao === 'levar').length,
      dispensar: scriptsDecididos.filter((d) => d.decisao === 'dispensar').length,
      remoto: scriptsDecididos.filter((d) => d.decisao === 'remoto').length,
    });
    const remotos = scriptsDecididos.filter((d) => d.decisao === 'remoto');
    if (remotos.length > 0) {
      limitacoes.push(
        `${remotos.length} script(s) de runtime não puderam ser baixados e continuam apontando para a origem: o site gerado precisa de internet para reproduzir o que eles fazem.`,
      );
    }

    // ── Segmentação ───────────────────────────────────────────────────────
    const scriptsNaoLocalizados = instrumentacao.scripts.filter((u) => !assetsLocais.has(u)).length;

    const { segmentos, rejeitados } = await tel.faseCooperativa(
      FASE_V2.segmentar,
      async () =>
        segmentarPorEvidencia({
          structuralMap,
          tokensPorHash,
          visualLayers,
          backgroundDetections,
          mediaDetections,
          runtimeDetections,
          temporalObservations: temporais,
          scrollPasses: passes,
          pointerResponses: respostasPonteiro,
          scrollObservations,
          stateGraph: grafo?.grafo,
          safeActions: grafo?.acoes ?? [],
          htmlPorHash,
          framePorHash,
          pecas,
          camadasDePagina,
          comportamentos,
          assetsLocais,
          scriptsNaoLocalizados,
          cssExternoFaltando: externasSemCopia.length > 0,
          // Os runtimes cujo script passou a viajar no bundle. A classificação
          // usa isto para deixar de chamar de dependência de rede o que já não
          // é: um fundo em canvas cujo script está no .zip desenha offline.
          runtimesQueViajam: runtimesQueViajam(scriptsDecididos),
          animacoesCssQueRodaram: animacoesCss,
          shadowFechados: instrumentacao.shadowRoots.closed,
          viewport,
          pageHeight: coletaFinal.pageHeight,
        }),
      tetoDaFase(FASE_V2.segmentar, limits.orcamentoTotalMs, tel.restanteTotal()),
    );
    tel.inc('segmentos', segmentos.length);
    log('segmentos', { total: segmentos.length, rejeitados: rejeitados.length });

    // Folha externa perdida afeta todo segmento que renderiza por CSS — a
    // referência visual não, ela é frame. A limitação vai no segmento para a
    // Galeria mostrar o aviso onde ele importa.
    if (externasSemCopia.length > 0) {
      const avisoCss = `Folha de estilo externa sem cópia local: ${externasSemCopia[0]}${
        externasSemCopia.length > 1 ? ` (+${externasSemCopia.length - 1})` : ''
      } — o bundle pode sair sem parte dos estilos.`;
      for (const seg of segmentos) {
        if (seg.representation.type !== 'referencia-visual') seg.limitations.push(avisoCss);
      }
    }

    // ── STACK ─────────────────────────────────────────────────────────────
    const stack: StackEntry[] = montarStack(
      runtimeDetections,
      detectarFerramentas({ html, css: cssInline, scripts: instrumentacao.scripts }),
    );

    // ── Compilação dos bundles ────────────────────────────────────────────
    const dirBundles = opts.dirBundles;
    if (dirBundles !== undefined) {
      await tel.faseCooperativa(
        FASE_V2.compilar,
        async (signal) => {
          for (const seg of segmentos) {
            if (signal.aborted) {
              parciais.push('A compilação de bundles foi cortada por orçamento.');
              break;
            }
            const dosMeus = new Set(seg.evidence.assetKeys);
            // Só os frames DESTE segmento (a própria seção primeiro — é o
            // fallback visual do bundle). Entregar todos os frames da captura
            // fazia a referência visual de um formulário mostrar o hero.
            const hashesDoSegmento = new Set([seg.hash, ...seg.evidence.members]);
            const frameProprio = framePorHash.get(seg.hash);
            const framesDoSegmento = [
              ...new Set([
                ...(frameProprio === undefined ? [] : [frameProprio]),
                ...[...framePorHash.entries()]
                  .filter(([hash]) => hashesDoSegmento.has(hash))
                  .map(([, frame]) => frame),
              ]),
            ];
            escreverBundle(join(dirBundles, `seg_${seg.position}`), {
              segmento: seg,
              css: cssInline,
              cssExternos,
              cssInlineOrdenado,
              assetsDeCss,
              dirAssetsCaptura: join(opts.dirCaptura, 'assets'),
              scripts: seg.representation.type === 'referencia-visual' ? [] : scriptsInline,
              // O documento de origem viaja com o segmento: sem os atributos de
              // `<html>`/`<body>`, todo seletor que dependia deles vira regra
              // morta dentro do bundle.
              documentoAttrs: atributosDoDocumento(html),
              scriptsExternos:
                seg.representation.type === 'referencia-visual' ? [] : scriptsDecididos,
              assets: assets.filter((a) => dosMeus.has(a.originalUrl)),
              // O mapa INTEIRO, e não o filtrado acima: `assetKeys` cobre os
              // assets de fundo e de mídia DETECTADOS, mas uma `<img>` comum no
              // meio do HTML não está lá — e era justamente ela que continuava
              // apontando para a origem.
              assetsLocais: localPorUrl,
              // O fundo da página volta para trás da região. Ele mora no
              // `<body>` como irmão do conteúdo, e a segmentação o emitia como
              // item solto: a seção que na origem tinha feixes de luz saía com
              // fundo morto, com o CSS e o HTML dela íntegros.
              camadasDeFundo: (seg.camadasDeFundo ?? [])
                .map((h) => htmlPorHash.get(h) ?? '')
                .filter((h) => h.length > 0),
              stack,
              frames: framesDoSegmento,
              // De onde copiar o frame para dentro do bundle.
              dirFramesCaptura: opts.dirCaptura,
              runtimeScripts: runtimeDetections
                .filter((r) => seg.evidence.runtimeIds.includes(r.id))
                .flatMap((r) => r.scripts)
                .filter((u) => assetsLocais.has(u)),
              sourceUrl: finalUrl,
              capturadoEm: Date.now(),
            });
          }
        },
        tetoDaFase(FASE_V2.compilar, limits.orcamentoTotalMs, tel.restanteTotal()),
      );

      // ── O bundle PARECE com o original? ─────────────────────────────────
      //
      // Contar regras de CSS diz que o estilo viajou; não diz que a peça se
      // parece com o que estava na página. Um bundle pode levar 100% do CSS e
      // sair errado por um ancestral ausente, uma fonte que não carregou, um
      // fundo que ficou noutro item — falhas invisíveis para quem conta regras.
      //
      // Aqui cada bundle é aberto NUMA ABA NOVA e o que ele desenha é comparado
      // com o print daquela mesma dobra. É a verificação que fecha o laço, e é
      // por isso que `visualComparisons` existe no manifesto desde o começo —
      // só era gravado vazio.
      //
      // Aba nova, e não a página instrumentada: navegar a página da captura
      // destruiria o contexto que as fases anteriores construíram. O custo é
      // uma aba; o risco de reusar seria perder tudo se algo desse errado.
      // Verificação não come o orçamento do que ela verifica.
      //
      // Com um teto apertado, a comparação abre uma aba, navega, espera fonte e
      // não termina nem o primeiro item — gasta tempo da captura para produzir
      // uma cobertura de zero. Pior: a aba extra e as navegações competem com
      // as fases de medição, e foi assim que a suíte começou a oscilar (811
      // verdes viraram 814 com uma falha diferente a cada rodada).
      //
      // Abaixo do piso, ela nem começa — e diz isso, como qualquer outra
      // limitação.
      //
      // E não se verifica captura que JÁ SAIU PELA METADE. Medido numa captura
      // real: 160s no total, cortada em `v2-percurso` (62s), com a comparação
      // levando 14s. Foram 14 segundos gastos conferindo um resultado que o
      // próprio motor sabia estar incompleto — tempo que faltou justamente à
      // fase que foi interrompida. Conferir o que se sabe incompleto produz um
      // número que não significa nada, e cobra caro por ele.
      const PISO_PARA_COMPARAR_MS = 3_000;
      const querVerificar = opts.verificarVisual !== false;
      // A comparação é a ÚNICA fase que não recebe o tempo restante: ela fica
      // na fração e ponto. As outras podem crescer com o que sobrou porque
      // produzem o resultado; esta confere o resultado, e uma conferência que
      // se expande para ocupar a sobra é conferência que virou fim em si.
      const tetoComparar = tetoDaFase(FASE_V2.comparar, limits.orcamentoTotalMs) ?? 0;
      if (!querVerificar) {
        // Silêncio aqui é correto: quem desligou sabe que desligou.
      } else if (tel.parcial) {
        limitacoes.push(
          'A comparação de pixel não rodou: a captura já tinha sido cortada por tempo, e verificar um resultado incompleto gastaria o orçamento que faltou para completá-lo.',
        );
      } else if (tetoComparar < PISO_PARA_COMPARAR_MS) {
        limitacoes.push(
          `A comparação de pixel não rodou: o orçamento reservado para ela (${tetoComparar} ms) não daria nem para conferir um bundle.`,
        );
      } else
        await tel.faseCooperativa(
          FASE_V2.comparar,
          async (signal) => {
            const entradas = segmentos.flatMap((seg) => {
              const framePath = framePorHash.get(seg.hash);
              if (framePath === undefined) return [];
              return [
                { segmento: seg, dirBundle: join(dirBundles, `seg_${seg.position}`), framePath },
              ];
            });
            // Sem print da dobra não há contra o que comparar, e isso é a maior
            // fonte de cobertura perdida — bem antes da comparação em si. Dizer
            // "3 de 3 passaram" quando só 3 de 12 foram olhados seria verdade
            // literal e conclusão falsa.
            const semPrint = segmentos.length - entradas.length;
            if (semPrint > 0) {
              limitacoes.push(
                `${semPrint} de ${segmentos.length} segmento(s) ficaram sem print da dobra, então não puderam ser conferidos por comparação de pixel.`,
              );
            }
            if (entradas.length === 0) return;

            const iniciouComparacao = Date.now();
            const aba = await s.contexto.newPage();
            try {
              await aba.setViewportSize(viewport);
              const resultado = await compararBundlesComOriginal({
                pagina: {
                  goto: async (u) => {
                    await aba.goto(u, { waitUntil: 'load', timeout: 8_000 });
                  },
                  esperar: (ms) => aba.waitForTimeout(ms),
                  esperarFontes: async (teto) => {
                    // Corrida entre 'as fontes assentaram' e o teto. A pausa fixa
                    // que havia aqui era o custo dominante por item, e o
                    // orcamento da fase acabava antes da lista — 3 de 7 itens
                    // ficavam de fora por tempo, caladamente.
                    await aba.evaluate(
                      `(() => new Promise(function (r) {
                        var t = setTimeout(r, ${teto});
                        try {
                          if (document.fonts && document.fonts.ready) {
                            document.fonts.ready.then(function () { clearTimeout(t); setTimeout(r, 60); });
                          }
                        } catch (e) {}
                      }))()`,
                    );
                  },
                  evaluate: <T>(expr: string) => aba.evaluate(expr) as Promise<T>,
                  screenshot: (o) =>
                    aba.screenshot({
                      type: 'png',
                      timeout: 6_000,
                      ...(o?.clip !== undefined
                        ? {
                            clip: { x: o.clip.x, y: o.clip.y, width: o.clip.w, height: o.clip.h },
                          }
                        : {}),
                    }),
                  fechar: async () => {
                    await aba.close();
                  },
                },
                entradas,
                dirCaptura: opts.dirCaptura,
                cancelado: () => signal.aborted,
                // O relógio da FASE, não o do processo: era o teto DELA que
                // estourava — 14s gastos num teto de 9,6s, porque o cancelamento
                // só acusa depois que o último item já começou.
                restanteMs: () => Math.max(0, tetoComparar - (Date.now() - iniciouComparacao)),
              });
              comparacoes = resultado.comparacoes;

              const r = resumirComparacoes(resultado);
              log('comparacao-visual', r);
              if (r.total > 0 && r.ok < r.total) {
                limitacoes.push(
                  `${r.total - r.ok} de ${r.total} bundle(s) não bateram com o print da dobra na comparação de pixel (maior diferença: ${Math.round(r.piorDelta * 100)}%).`,
                );
              }
              // Cobertura parcial, e DITA. Uma verificação que roda em 3 de 13
              // itens sem avisar é pior que nenhuma: dá a impressão de que o
              // resto foi conferido.
              if (r.pulados > 0) {
                limitacoes.push(
                  `A comparação de pixel cobriu ${r.total} de ${r.total + r.pulados} bundle(s); o resto ficou de fora (${r.porMotivo}).`,
                );
              }
            } finally {
              await aba.close().catch(() => {});
            }
          },
          tetoDaFase(FASE_V2.comparar, limits.orcamentoTotalMs),
        );
    }

    // ── Manifesto ─────────────────────────────────────────────────────────
    if (tel.parcial) {
      const r = tel.relatorio();
      parciais.push(
        `Captura PARCIAL por orçamento na fase "${r.faseInterrompida ?? '?'}": o medido até o corte foi preservado.`,
      );
    }
    const modo: CaptureModeV2 =
      opts.signal?.aborted === true
        ? 'parcial-cancelado'
        : tel.parcial
          ? 'parcial-orcamento'
          : 'completo';

    const manifesto: CaptureManifestV2 = {
      engineVersion: 2,
      schemaVersion: CAPTURE_V2_SCHEMA_VERSION,
      source: { url, finalUrl, kind: 'url', capturedAt: Date.now() },
      captureMode: modo,
      viewport: { ...viewport, deviceScaleFactor: coletaFinal.viewport.deviceScaleFactor },
      pageHeight: coletaFinal.pageHeight,
      instrumentation: {
        beforePageScripts: true,
        listenersByType: instrumentacao.listenersPorTipo,
        observers: instrumentacao.observers,
        animationApis: instrumentacao.animationApis,
        graphicsContexts: instrumentacao.graphicsContexts,
        shadowRoots: instrumentacao.shadowRoots,
        dynamicInserts: instrumentacao.dynamicInserts,
        historyChanges: instrumentacao.historyChanges,
        limitations: instrumentacao.falhas,
      },
      structuralMap,
      visualLayers,
      backgroundDetections,
      mediaDetections,
      runtimeDetections,
      designTokens: rampas.tokens,
      temporalObservations: temporais,
      pointerPaths: caminhos,
      pointerResponses: respostasPonteiro,
      scrollPasses: passes,
      scrollObservations,
      safeActions: grafo?.acoes ?? [],
      blockedActions: [
        ...(grafo?.bloqueadas ?? []),
        ...s.bloqueados.map((b) => ({
          reason: (b.motivo as 'popup') ?? 'popup',
          target: b.alvo,
        })),
        ...instrumentacao.bloqueados.map((b) => ({
          reason: (b.motivo as 'popup') ?? 'popup',
          target: b.alvo,
        })),
      ],
      stateGraph: grafo?.grafo,
      segmentEvidence: segmentos.map((seg) => seg.evidence),
      representations: Object.fromEntries(segmentos.map((seg) => [seg.hash, seg.representation])),
      assets,
      dependencies: Object.fromEntries(
        segmentos.map((seg) => [
          seg.hash,
          {
            assets: seg.evidence.assetKeys,
            runtimes: seg.evidence.runtimeIds,
            scripts: [],
            fonts: [],
          },
        ]),
      ),
      stack,
      fidelity: Object.fromEntries(segmentos.map((seg) => [seg.hash, seg.fidelity])),
      support: Object.fromEntries(segmentos.map((seg) => [seg.hash, seg.support])),
      interactions: Object.fromEntries(segmentos.map((seg) => [seg.hash, seg.interactions])),
      validation: {},
      visualComparisons: comparacoes,
      telemetry: tel.relatorio(),
      confidence: viewportReativa || houveMovimento ? 'alta' : 'media',
      limitations: [
        ...new Set([...limitacoes, ...s.consoleErros.slice(0, 5).map((e) => `Console: ${e}`)]),
      ],
      partialReasons: parciais,
      compilerVersion: 1,
    };

    return {
      manifesto,
      html,
      finalUrl,
      segmentos,
      rejeitados,
    };
  } finally {
    await tel.medir(FASE_V2.fechar, () => s.fechar());
  }
};

/**
 * Converte um nó do mapa no `ElementDescriptor` do V1.
 *
 * Existe para a política de segurança do V1 (`ehSeguroClicar`, já testada, já
 * cobrindo compra/logout/submit/download/navegação externa) ser reusada em vez de
 * reescrita. Reescrever uma política de segurança para trocar o formato de entrada
 * é como se perde uma regra sem perceber.
 */
const paraDescritor = (n: RawNode): import('@ds/explorer').ElementDescriptor => ({
  ref: String(n.ref),
  tag: n.tag,
  role: n.role,
  type: n.tipo,
  href: n.href,
  text: n.text,
  ariaLabel: n.aria['aria-label'] ?? null,
  classes: n.classes,
  id: n.id,
  tabindex: n.tabindex,
  cursor: n.cursor,
  hasListeners: n.listeners.length > 0,
  listenerTypes: n.listeners,
  disabled: n.desabilitado,
  ariaExpanded: n.aria['aria-expanded'] ?? null,
  ariaHaspopup: n.aria['aria-haspopup'] ?? null,
  ariaControls: n.aria['aria-controls'] ?? null,
  download: n.download,
  targetBlank: n.targetBlank,
  box: n.box,
  inViewport: n.visivel,
  dataAttrs: n.dataAttrs,
});
