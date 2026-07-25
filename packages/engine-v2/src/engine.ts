import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  type ExplorerLimits,
  FASE,
  Telemetria,
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
} from '@ds/shared';
import { PlaywrightIndisponivel, type SessaoV2, abrirSessao } from './browser/page.js';
import { escreverBundle } from './compiler/bundle.js';
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
  HTML_DO_REF_FN,
  INIT_SCRIPT,
  chamar,
  limparInstrumentacao,
} from './instrumentation/index.js';
import {
  construirBackgrounds,
  construirCamadas,
  construirMapaEstrutural,
  construirMidias,
  construirRuntimes,
} from './mapper/build-maps.js';
import type {
  BoxPx,
  RawAssinaturaEstado,
  RawColeta,
  RawCss,
  RawInstrumentacao,
  RawJsInline,
  RawNode,
} from './mapper/raw.js';
import { hashBytes } from './observe/pixel.js';
import { atribuirMovimento, observarTemporal } from './observe/temporal.js';
import { type SegmentoV2, segmentarPorEvidencia } from './segment/segment-v2.js';

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
};

const tetoDaFase = (nome: string, totalMs: number): number | undefined => {
  const fracao = FRACAO_DA_FASE[nome];
  return fracao === undefined ? undefined : Math.round(totalMs * fracao);
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
  signal?: AbortSignal;
};

export type ResultadoCaptura = {
  manifesto: CaptureManifestV2;
  /** HTML renderizado, sem a instrumentação — é o `design-system.html`. */
  html: string;
  finalUrl: string;
  segmentos: SegmentoV2[];
  rejeitados: Array<{ hash: string; name: string; motivos: string[] }>;
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

/**
 * Captura uma URL com o motor V2.
 *
 * Nunca deixa de devolver algo útil: corte por orçamento produz manifesto PARCIAL
 * com o que já foi medido, e ausência de Playwright lança
 * `PlaywrightIndisponivel` para o chamador decidir (a fila cai no V1 estático).
 */
export const capturarComV2 = async (
  url: string,
  opts: OpcoesCaptura,
): Promise<ResultadoCaptura> => {
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
    const tetoPercurso = tetoDaFase(FASE_V2.percurso, limits.orcamentoTotalMs) ?? 60_000;
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
      tetoDaFase(FASE_V2.percurso, limits.orcamentoTotalMs),
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
    const html = limparInstrumentacao(htmlBruto);
    const finalUrl = s.pw.url();

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
    for (const n of coletaFinal.nos) {
      const node = porRef.get(n.ref);
      if (node === undefined) continue;
      // Só as seções: capturar o outerHTML de 3000 nós custaria mais que todo o
      // resto do pipeline, e o que a segmentação precisa é o HTML da seção.
      if (!PAPEIS_COM_HTML.has(node.role)) continue;
      try {
        const bruto = await page.evaluate<string>(chamar(HTML_DO_REF_FN, n.ref));
        if (bruto.length > 0) htmlPorHash.set(node.fingerprint.hash, limparInstrumentacao(bruto));
      } catch {
        // nó saiu do DOM: a seção fica sem HTML e é reprovada na validação
      }
    }
    for (const t of temporais) {
      const primeiro = t.frames[0];
      if (primeiro !== undefined) framePorHash.set(t.target, join('frames', primeiro));
    }
    log('html-secoes', { total: htmlPorHash.size });

    // ── Frame de fallback por seção ───────────────────────────────────────
    // Toda seção que pode acabar como REFERÊNCIA VISUAL precisa de um frame, ou
    // ela é reprovada — e reprovar por falta de imagem seria perder o item por um
    // detalhe que o motor tinha como resolver. Só as seções com cena/mídia
    // recebem o frame: são as únicas que podem cair nessa representação, e um
    // screenshot por seção de texto seria custo sem retorno.
    const REFS_DE_CENA = new Set(['canvas', 'video', 'iframe', 'svg']);
    const secoesComCena = coletaFinal.nos.filter((n) => {
      const node = porRef.get(n.ref);
      if (node === undefined || !PAPEIS_COM_HTML.has(node.role)) return false;
      return n.midiaTags.some((t) => REFS_DE_CENA.has(t));
    });
    for (const n of secoesComCena.slice(0, 10)) {
      const node = porRef.get(n.ref);
      if (node === undefined) continue;
      try {
        const centro = await page.evaluate<{ box: BoxPx } | null>(chamar(CENTRO_DO_REF_FN, n.ref));
        if (centro === null) continue;
        const vp = page.viewport();
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
        // seção fora da viewport ou removida: fica sem frame e será reprovada
        // com o motivo — que é melhor que entregar um card vazio.
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
      tetoDaFase(FASE_V2.candidatos, limits.orcamentoTotalMs),
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
                  gravar(opts.dirCaptura, join('states', nome), conteudo),
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
            tetoDaFase(FASE_V2.estados, limits.orcamentoTotalMs),
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
    const cssInline = folhas
      .filter((f) => f.inline && f.content !== undefined)
      .map((f) => f.content ?? '')
      .join('\n');

    const assets: CapturedAsset[] = [];
    const assetsLocais = new Set<string>();
    await tel.faseCooperativa(FASE_V2.assets, async (signal) => {
      const refs = extractAssetRefs(html, cssInline, finalUrl);
      const seguro = createSecureHttpFetcher(limits, { signal, contador: tel });
      const fetcher = async (u: string): ReturnType<typeof seguro> =>
        rede.mapa.get(u) ?? (await seguro(u));
      const sink = (localPath: string, bytes: Uint8Array): void => {
        gravar(opts.dirCaptura, join('assets', localPath), bytes);
      };
      const cssRefs = refs.filter((r) => r.kind === 'css' && r.absolute !== null);
      const outros = refs.filter((r) => r.kind !== 'css');
      const resCss = await localizeCss(
        cssRefs.map((r) => r.absolute as string),
        fetcher,
        sink,
        limits,
        signal,
      );
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

    // ── Segmentação ───────────────────────────────────────────────────────
    const scriptsNaoLocalizados = instrumentacao.scripts.filter((u) => !assetsLocais.has(u)).length;

    const { segmentos, rejeitados } = await tel.faseCooperativa(
      FASE_V2.segmentar,
      async () =>
        segmentarPorEvidencia({
          structuralMap,
          visualLayers,
          backgroundDetections,
          mediaDetections,
          runtimeDetections,
          temporalObservations: temporais,
          pointerResponses: respostasPonteiro,
          scrollObservations,
          stateGraph: grafo?.grafo,
          safeActions: grafo?.acoes ?? [],
          htmlPorHash,
          framePorHash,
          assetsLocais,
          scriptsNaoLocalizados,
          animacoesCssQueRodaram: animacoesCss,
          shadowFechados: instrumentacao.shadowRoots.closed,
          viewport,
          pageHeight: coletaFinal.pageHeight,
        }),
      tetoDaFase(FASE_V2.segmentar, limits.orcamentoTotalMs),
    );
    tel.inc('segmentos', segmentos.length);
    log('segmentos', { total: segmentos.length, rejeitados: rejeitados.length });

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
            escreverBundle(join(dirBundles, `seg_${seg.position}`), {
              segmento: seg,
              css: cssInline,
              scripts: seg.representation.type === 'referencia-visual' ? [] : scriptsInline,
              assets: assets.filter((a) => dosMeus.has(a.originalUrl)),
              stack,
              frames: [...framePorHash.values()],
              runtimeScripts: runtimeDetections
                .filter((r) => seg.evidence.runtimeIds.includes(r.id))
                .flatMap((r) => r.scripts)
                .filter((u) => assetsLocais.has(u)),
              sourceUrl: finalUrl,
              capturadoEm: Date.now(),
            });
          }
        },
        tetoDaFase(FASE_V2.compilar, limits.orcamentoTotalMs),
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
      visualComparisons: [],
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
      rejeitados: rejeitados.map((r) => ({ hash: r.hash, name: r.name, motivos: r.motivos })),
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
