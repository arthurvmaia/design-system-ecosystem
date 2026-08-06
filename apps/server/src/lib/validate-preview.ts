import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { escreverValidacao as escreverValidacaoBundle, naturezaDaRegiao } from '@ds/engine-v2';
import {
  CSS_PROCESSOR_VERSION,
  CaptureManifest,
  PIPELINE_VERSION,
  PREVIEW_VERSION,
  REWRITER_VERSION,
  type ResultadoValidacaoSegmento,
  type ScrollBehavior,
  type SegmentInteraction,
  SegmentStatesFile,
  SegmentValidationFile,
  type SegmentValidationMeta,
  SegmentsManifest,
  VALIDATOR_VERSION,
  type ValidationReport,
  type ValidationStatus,
  type VisualComparison,
  assetRoutePrefix,
  construirIndiceAssets,
  geracaoDeSegmentos,
  reescreverParaLocal,
  vaultCaptureManifest,
  vaultCaptureV2Dir,
  vaultCaptureV2Manifest,
  vaultSegmentStates,
  vaultSegmentValidation,
  vaultSegmentsManifest,
} from '@ds/shared';
import {
  type BundleInfo,
  type NaturezaRegiao,
  compararCapturaComPreview,
  ehTelaPreta,
  frameDaSecao,
  lerBundleInfo,
} from './bundle-v2.js';
import { resolverEstadosV2 } from './estados-v2.js';

/**
 * Validação AUTOMÁTICA do replay, no fluxo de produção.
 *
 * Fecha a lacuna: extrações reais deixam de parar em `replayable`. Roda como
 * passo do processamento (fila:concluir / task de extração) — sem comando do
 * usuário final, sem watcher/daemon (o gatilho é o processamento que a pessoa já
 * dispara). Reusa a `previewRoute` de PRODUÇÃO servida num servidor efêmero e um
 * navegador headless (o mesmo mecanismo dos testes), não uma implementação
 * paralela.
 *
 * A orquestração é pura e testável sem navegador (driver injetável): decide o
 * que revalidar por hash, agrega o status, isola falha por segmento. Só promove
 * `replayable`→`validated` o que reproduziu E restaurou de verdade.
 */

// biome-ignore lint/suspicious/noExplicitAny: playwright é opcional e não tipado neste pacote
type Any = any;

// Globais do navegador, usados nos callbacks de evaluate (rodam na página).
declare const document: Any;
declare const getComputedStyle: (el: Any) => Any;

/**
 * Valida um efeito de SCROLL num frame: rola o alvo para dentro, confere que o
 * estilo computado mudou (o efeito aconteceu) e que "Reiniciar" restaurou. Para
 * sticky, confere que o runtime aplicou `position:sticky`. Retorna se passou.
 */
const validarScrollNoFrame = async (
  page: Any,
  abrir: () => Promise<Any>,
  behaviors: ScrollBehavior[],
  limits: ValidatorLimits,
): Promise<boolean> => {
  const frame = await abrir();
  await frame.waitForSelector('#ds-sc-scroll', { timeout: limits.perPreviewTimeoutMs });
  // Prefere um comportamento observável por mudança de estilo (não-sticky).
  const alvoB = behaviors.find((b) => b.kind !== 'sticky') ?? behaviors[0];
  if (!alvoB) return false;
  const t = alvoB.target;
  const sel = t.id ? `[id="${t.id}"]` : t.classes[0] ? `.${t.classes[0]}` : null;
  if (!sel) return false;
  try {
    if (alvoB.kind === 'sticky') {
      const pos = await frame.$eval(sel, (el: Any) => getComputedStyle(el).position);
      return pos === 'sticky';
    }
    const snap = (): Promise<string> =>
      frame.$eval(sel, (el: Any) => {
        const c = getComputedStyle(el);
        return `${c.opacity}|${c.transform}|${c.filter}|${el.className}`;
      });
    const inicial = await snap();
    await frame.evaluate((s: string) => {
      document.querySelector(s)?.scrollIntoView({ block: 'center' });
    }, sel);
    // Espera o efeito acontecer (IO/scrub são assíncronos): tenta por até ~1.6s.
    let mudou = false;
    for (let i = 0; i < 8 && !mudou; i++) {
      await page.waitForTimeout(200);
      mudou = (await snap()) !== inicial;
    }
    // Reset via evaluate (a barra é fixa num iframe alto — o click do Playwright
    // pode não alcançá-la; disparar o handler direto é robusto e suficiente).
    await frame.evaluate(() => {
      document.getElementById('ds-sc-reset')?.click();
    });
    let restaurou = false;
    for (let i = 0; i < 6 && !restaurou; i++) {
      await page.waitForTimeout(200);
      restaurou = (await snap()) === inicial;
    }
    return mudou && restaurou;
  } catch {
    return false;
  }
};

export type ValidatorLimits = {
  perPreviewTimeoutMs: number;
  totalBudgetMs: number;
  maxAttempts: number;
  concurrency: number;
  maxSegments: number;
  maxInteractionsPerSegment: number;
};

export const DEFAULT_VALIDATOR_LIMITS: ValidatorLimits = {
  perPreviewTimeoutMs: 15000,
  totalBudgetMs: 120000,
  maxAttempts: 1,
  concurrency: 2,
  maxSegments: 40,
  maxInteractionsPerSegment: 8,
};

const numEnv = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};

/** Limites configuráveis por ambiente (`DS_VALIDATOR_*`). */
export const resolveValidatorLimits = (o: Partial<ValidatorLimits> = {}): ValidatorLimits => ({
  perPreviewTimeoutMs: o.perPreviewTimeoutMs ?? numEnv('DS_VALIDATOR_PREVIEW_MS', 15000),
  totalBudgetMs: o.totalBudgetMs ?? numEnv('DS_VALIDATOR_TOTAL_MS', 120000),
  maxAttempts: o.maxAttempts ?? numEnv('DS_VALIDATOR_ATTEMPTS', 1),
  concurrency: o.concurrency ?? numEnv('DS_VALIDATOR_CONCURRENCY', 2),
  maxSegments: o.maxSegments ?? numEnv('DS_VALIDATOR_MAX_SEGMENTS', 40),
  maxInteractionsPerSegment:
    o.maxInteractionsPerSegment ?? numEnv('DS_VALIDATOR_MAX_INTERACTIONS', 8),
});

// ── Puro (testável sem navegador) ────────────────────────────────────────────

/**
 * Assinatura do que afeta a reprodução: HTML do segmento, estados, dependências,
 * e as versões do preview/validador/pipeline. Muda qualquer um → invalida a
 * validação daquele segmento (regra 16).
 */
export const previewHash = (htmlSnippet: string, statesJson: string, depsJson: string): string =>
  createHash('sha256')
    .update(
      `p${PREVIEW_VERSION}|v${VALIDATOR_VERSION}|r${REWRITER_VERSION}|c${CSS_PROCESSOR_VERSION}|s${PIPELINE_VERSION}|${htmlSnippet}|${statesJson}|${depsJson}`,
    )
    .digest('hex')
    .slice(0, 32);

/** Contexto de bundle do motor V2, quando a extração o produziu. */
export type ContextoV2 = {
  dsId: `ds_${string}`;
  representation: BundleInfo['representation'];
  /** Pasta do bundle (`seg_<position>`) — monta a URL da rota de bundle. */
  pasta: string;
  /** Caminho absoluto do bundle (para gravar o `validation.json` dele). */
  dir: string;
  /** Frame da seção (relativo a `capture-v2/`) para a comparação visual. */
  frame: string | null;
  /** Natureza da região — decide o limiar da comparação. */
  nature: NaturezaRegiao;
};

export type CandidatoValidacao = {
  segmentId: string;
  htmlSnippet: string;
  states: Array<{ id: string }>;
  pipeline: SegmentInteraction[];
  /** Comportamentos de scroll a validar (reveal/parallax/sticky/progress-*). */
  scroll: ScrollBehavior[];
  previewHash: string;
  /** Presente quando o segmento tem bundle V2 — habilita validação por representação. */
  v2?: ContextoV2;
};

/**
 * Decide o que revalidar. Reaproveita quem tem o mesmo `previewHash` E foi
 * validado pela mesma versão de validador/pipeline (regra 15). Cap por
 * `maxSegments` no que é NOVO — o cache é de graça.
 */
export const planejarValidacao = (
  candidatos: Array<{ segmentId: string; previewHash: string }>,
  existente: SegmentValidationFile | null,
  limits: ValidatorLimits,
): { aValidar: string[]; cache: string[] } => {
  const mesmaVersao =
    existente?.validatorVersion === VALIDATOR_VERSION &&
    existente?.pipelineVersion === PIPELINE_VERSION;
  // Só entra no cache quem foi validado SEM erro; quem deu erro é re-tentado.
  const hashAnterior = new Map(
    (existente?.segments ?? []).filter((s) => !s.error).map((s) => [s.segmentId, s.previewHash]),
  );

  const aValidar: string[] = [];
  const cache: string[] = [];
  for (const c of candidatos) {
    if (mesmaVersao && hashAnterior.get(c.segmentId) === c.previewHash) cache.push(c.segmentId);
    else aValidar.push(c.segmentId);
  }
  return { aValidar: aValidar.slice(0, limits.maxSegments), cache };
};

/** Status geral do run a partir dos segmentos processados e dos que deram erro. */
export const agregarStatus = (processadosOk: number, comErro: number): ValidationStatus => {
  if (processadosOk + comErro === 0) return 'concluida';
  if (processadosOk === 0) return 'falha';
  if (comErro > 0) return 'parcial';
  return 'concluida';
};

// ── Driver injetável ─────────────────────────────────────────────────────────

export type ResultadoSegmento = {
  results: ResultadoValidacaoSegmento[];
  durationMs: number;
  error?: string;
  /** Comparações visuais medidas (cápsula) — o orquestrador grava no manifesto V2. */
  visual?: VisualComparison[];
};
export type DriverValidacao = (cand: CandidatoValidacao) => Promise<ResultadoSegmento>;

// ── Leitura do vault ─────────────────────────────────────────────────────────

const lerManifesto = (dsId: `ds_${string}`): SegmentsManifest | null => {
  const path = vaultSegmentsManifest(dsId);
  if (!existsSync(path)) return null;
  try {
    return SegmentsManifest.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
};

const lerExistente = (dsId: `ds_${string}`): SegmentValidationFile | null => {
  const path = vaultSegmentValidation(dsId);
  if (!existsSync(path)) return null;
  try {
    return SegmentValidationFile.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
};

/**
 * A geracao da captura vigente: o carimbo que liga `validation.json` aos
 * segmentos que existiam quando a validacao rodou. Leitor e escritor calculam
 * dos MESMOS ids (os do segments/manifest.json), entao geracao igual significa
 * mesma captura, sem depender de relogio nem de contagem.
 */
const geracaoDaCapturaAtual = (dsId: `ds_${string}`): string | undefined => {
  const path = vaultSegmentsManifest(dsId);
  if (!existsSync(path)) return undefined;
  try {
    const m = SegmentsManifest.parse(JSON.parse(readFileSync(path, 'utf8')));
    return geracaoDeSegmentos(m.segments.map((s) => s.id));
  } catch {
    return undefined;
  }
};

const lerEstadosJson = (dsId: `ds_${string}`, segId: string): string => {
  const path = vaultSegmentStates(dsId, segId);
  if (!existsSync(path)) return '[]';
  try {
    // A MESMA resolução de blob que o preview faz (estados do V2 referenciam
    // `capture-v2/`): o hash tem de refletir o conteúdo servido — muda o blob,
    // muda o hash, revalida.
    const states = SegmentStatesFile.parse(JSON.parse(readFileSync(path, 'utf8'))).states;
    return JSON.stringify(resolverEstadosV2(dsId, states));
  } catch {
    return '[]';
  }
};

/** Índice de assets locais do manifesto de captura (vazio se não houver). */
const lerIndiceAssets = (dsId: `ds_${string}`): Map<string, string> => {
  const path = vaultCaptureManifest(dsId);
  if (!existsSync(path)) return new Map();
  try {
    const m = CaptureManifest.parse(JSON.parse(readFileSync(path, 'utf8')));
    return construirIndiceAssets(m.assets ?? []);
  } catch {
    return new Map();
  }
};

/** Índice mínimo do manifesto V2: o que a natureza da comparação precisa. */
type InfoManifestoV2 = {
  kindPorMidia: Map<string, string>;
  movendoPorHash: Set<string>;
};

const lerInfoV2 = (dsId: `ds_${string}`): InfoManifestoV2 | null => {
  const path = vaultCaptureV2Manifest(dsId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      mediaDetections?: Array<{ id?: unknown; kind?: unknown }>;
      temporalObservations?: Array<{ target?: unknown; moving?: unknown }>;
    };
    const kindPorMidia = new Map<string, string>();
    for (const m of raw.mediaDetections ?? []) {
      if (typeof m.id === 'string' && typeof m.kind === 'string') kindPorMidia.set(m.id, m.kind);
    }
    const movendoPorHash = new Set<string>();
    for (const t of raw.temporalObservations ?? []) {
      if (t.moving === true && typeof t.target === 'string') movendoPorHash.add(t.target);
    }
    return { kindPorMidia, movendoPorHash };
  } catch {
    return null;
  }
};

/** A natureza da região decide o limiar: canvas animado tolera 60%, estática 2%. */
const naturezaDe = (bundle: BundleInfo, info: InfoManifestoV2 | null): NaturezaRegiao => {
  const kinds = new Set(
    bundle.mediaIds
      .map((id) => info?.kindPorMidia.get(id))
      .filter((k): k is string => k !== undefined),
  );
  // Mídia intrinsecamente animada (GIF, Lottie, SVG animado) conta como
  // movimento mesmo sem observação temporal do hash — um GIF não para de rodar
  // porque a amostragem olhou para outra viewport.
  const midiaAnimada = kinds.has('gif') || kinds.has('lottie') || kinds.has('svg-animado');
  return naturezaDaRegiao({
    temRuntimeExterno: bundle.runtimeIds.length > 0,
    temCanvas: kinds.has('canvas-2d') || kinds.has('webgl') || kinds.has('webgl2'),
    temVideo: kinds.has('video'),
    animado:
      midiaAnimada || (bundle.hash !== null && (info?.movendoPorHash.has(bundle.hash) ?? false)),
  });
};

/**
 * Monta os candidatos: segmentos com interação reproduzível E estado capturado,
 * mais os segmentos V2 cuja REPRESENTAÇÃO pede validação própria (cápsula de
 * runtime e referência visual — mesmo sem replay/scroll, é preciso conferir que
 * a cápsula executa e que a referência mostra o frame com o aviso).
 */
export const montarCandidatos = (dsId: `ds_${string}`): CandidatoValidacao[] => {
  const manifest = lerManifesto(dsId);
  if (!manifest) return [];
  // O que é validado é o preview REESCRITO (assets locais). O hash tem de refletir
  // a reescrita — muda a localização de um asset, o hash muda e revalida.
  const index = lerIndiceAssets(dsId);
  const prefix = assetRoutePrefix(dsId);
  const infoV2 = lerInfoV2(dsId);
  const candidatos: CandidatoValidacao[] = [];
  for (const insight of manifest.insights ?? []) {
    const seg = manifest.segments.find((s) => s.id === insight.segmentId);
    if (!seg) continue;
    const pipeline = insight.pipeline ?? [];
    const temReplay = pipeline.some((p) => p.status === 'replayable' && p.stateIds.length > 0);
    const scroll = insight.scroll ?? [];
    const scrollReproduzivel = scroll.filter((b) => b.kind !== 'external-scroll-runtime');
    // Chave COMPOSTA: validar o bundle do vizinho é pior que não validar, porque
    // o resultado vai gravado com o id DESTE segmento. O print da dobra carrega
    // o prefixo do hash da seção; sem print, cai na posição como sempre.
    const bundle = lerBundleInfo(dsId, {
      position: seg.position,
      framePath: insight.framePath ?? null,
    });
    const v2: ContextoV2 | undefined =
      bundle === null
        ? undefined
        : {
            dsId,
            representation: bundle.representation,
            pasta: bundle.pasta,
            dir: bundle.dir,
            frame: frameDaSecao(dsId, bundle.hash),
            nature: naturezaDe(bundle, infoV2),
          };
    const valeRepresentacao = v2 !== undefined && v2.representation !== 'componente-portatil';
    if (!temReplay && scrollReproduzivel.length === 0 && !valeRepresentacao) continue;
    const snippetRw = reescreverParaLocal(seg.htmlSnippet, index, prefix).text;
    const statesRw = reescreverParaLocal(
      lerEstadosJson(dsId, insight.segmentId),
      index,
      prefix,
    ).text;
    // Scroll e representação entram no hash: muda qualquer um, revalida.
    const depsJson = JSON.stringify({
      deps: insight.dependencies ?? [],
      scroll: scrollReproduzivel,
      representation: v2?.representation ?? null,
    });
    candidatos.push({
      segmentId: insight.segmentId,
      htmlSnippet: seg.htmlSnippet,
      states: (insight.states ?? []).map((s) => ({ id: s.id })),
      pipeline,
      scroll: scrollReproduzivel,
      previewHash: previewHash(snippetRw, statesRw, depsJson),
      v2,
    });
  }
  return candidatos;
};

// ── Orquestrador ─────────────────────────────────────────────────────────────

export type ValidarOpts = {
  limits?: Partial<ValidatorLimits>;
  /** Driver injetável (testes). Ausente → navegador real via previewRoute. */
  driver?: DriverValidacao;
  /** Log opcional. */
  log?: (msg: string) => void;
};

const escreverValidacao = (dsId: `ds_${string}`, file: SegmentValidationFile): void => {
  writeFileSync(vaultSegmentValidation(dsId), JSON.stringify(file, null, 2), 'utf8');
};

/**
 * Regrava `visualComparisons` no manifesto V2 — mutação do JSON cru, de
 * propósito: um round-trip de schema descartaria campos que este código não
 * conhece. As comparações refletem a ÚLTIMA validação executada (o schema não
 * tem chave por segmento para permitir merge).
 */
const atualizarComparacoesV2 = (dsId: `ds_${string}`, comparacoes: VisualComparison[]): void => {
  const path = vaultCaptureV2Manifest(dsId);
  if (!existsSync(path)) return;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    raw.visualComparisons = comparacoes;
    writeFileSync(path, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
  } catch {
    // Manifesto ilegível: não afirma nada.
  }
};

/**
 * Valida os previews de uma extração e grava `validation.json`. Idempotente:
 * reaproveita por hash o que não mudou; revalida o resto. Falha por segmento não
 * derruba os outros nem a extração.
 */
export const validarPreviews = async (
  dsId: `ds_${string}`,
  opts: ValidarOpts = {},
): Promise<SegmentValidationFile> => {
  const limits = resolveValidatorLimits(opts.limits);
  const log = opts.log ?? (() => {});
  const inicio = Date.now();

  const candidatos = montarCandidatos(dsId);
  const existente = lerExistente(dsId);
  // A qual captura estes resultados pertencem. Sem o carimbo, o arquivo
  // sobrevivia a uma reextracao fingindo cobrir a captura nova: medido no
  // acervo, 0 de 49 resultados casavam com os segmentos vigentes.
  const geracao = geracaoDaCapturaAtual(dsId);
  const plano = planejarValidacao(candidatos, existente, limits);
  const porId = new Map(candidatos.map((c) => [c.segmentId, c]));

  // Resultados/metas reaproveitados do cache.
  const resultadosCache = (existente?.results ?? []).filter((r) =>
    plano.cache.includes(r.segmentId),
  );
  const metasCache = (existente?.segments ?? []).filter((s) => plano.cache.includes(s.segmentId));

  const base: SegmentValidationFile = {
    designSystemId: dsId,
    generatedAt: Date.now(),
    ...(geracao !== undefined ? { geracao } : {}),
    status: 'em-andamento',
    pipelineVersion: PIPELINE_VERSION,
    validatorVersion: VALIDATOR_VERSION,
    durationMs: 0,
    results: resultadosCache,
    segments: metasCache,
  };

  if (plano.aValidar.length === 0) {
    // Nada novo a validar: tudo em cache (ou nada a validar).
    const finalFile: SegmentValidationFile = {
      ...base,
      status: 'concluida',
      durationMs: Date.now() - inicio,
    };
    escreverValidacao(dsId, finalFile);
    log(`validação: ${plano.cache.length} em cache, 0 revalidados.`);
    return finalFile;
  }

  // Marca "em-andamento" antes de rodar (auditoria se cair no meio).
  escreverValidacao(dsId, base);

  // Driver: injetado (teste) ou navegador real reusando a previewRoute.
  let contexto: ContextoNavegador | null = null;
  let driver: DriverValidacao;
  if (opts.driver) {
    driver = opts.driver;
  } else {
    contexto = await abrirNavegador(log);
    if (!contexto) {
      // Navegador indisponível: NÃO é "não suportado" — é "não executada" (regra 18).
      const naoExec: SegmentValidationFile = {
        ...base,
        status: 'nao-executada',
        durationMs: Date.now() - inicio,
      };
      escreverValidacao(dsId, naoExec);
      log('validação não executada: navegador indisponível (segmentos seguem replayable).');
      return naoExec;
    }
    driver = contexto.driver(limits);
  }

  const novosResultados: ResultadoValidacaoSegmento[] = [];
  const novasMetas: SegmentValidationMeta[] = [];
  const novasComparacoes: VisualComparison[] = [];
  let processadosOk = 0;
  let comErro = 0;
  const deadline = inicio + limits.totalBudgetMs;

  const fila = [...plano.aValidar];
  const worker = async (): Promise<void> => {
    while (fila.length > 0) {
      if (Date.now() > deadline) break;
      const segId = fila.shift();
      if (!segId) break;
      const cand = porId.get(segId);
      if (!cand) continue;
      const t0 = Date.now();
      try {
        const r = await driver(cand);
        if (r.error) {
          comErro++;
          novasMetas.push({
            segmentId: segId,
            previewHash: cand.previewHash,
            validatedAt: Date.now(),
            durationMs: r.durationMs,
            error: r.error,
          });
        } else {
          processadosOk++;
          novosResultados.push(...r.results);
          novasComparacoes.push(...(r.visual ?? []));
          novasMetas.push({
            segmentId: segId,
            previewHash: cand.previewHash,
            validatedAt: Date.now(),
            durationMs: r.durationMs,
          });
        }
      } catch (err) {
        // Falha de um segmento NÃO derruba os outros.
        comErro++;
        novasMetas.push({
          segmentId: segId,
          previewHash: cand.previewHash,
          validatedAt: Date.now(),
          durationMs: Date.now() - t0,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  };

  try {
    await Promise.all(Array.from({ length: Math.max(1, limits.concurrency) }, () => worker()));
  } finally {
    if (contexto) await contexto.fechar();
  }

  const finalFile: SegmentValidationFile = {
    designSystemId: dsId,
    generatedAt: Date.now(),
    ...(geracao !== undefined ? { geracao } : {}),
    status: agregarStatus(processadosOk, comErro),
    pipelineVersion: PIPELINE_VERSION,
    validatorVersion: VALIDATOR_VERSION,
    durationMs: Date.now() - inicio,
    results: [...resultadosCache, ...novosResultados],
    segments: [...metasCache, ...novasMetas],
  };
  escreverValidacao(dsId, finalFile);
  // Rodada completa (sem cache) é a fotografia inteira: grava o que mediu,
  // INCLUSIVE o vazio — comparação velha de código velho não pode sobreviver.
  // Rodada parcial só acrescenta; apagar aqui descartaria medição ainda válida.
  if (plano.cache.length === 0) atualizarComparacoesV2(dsId, novasComparacoes);
  else if (novasComparacoes.length > 0) atualizarComparacoesV2(dsId, novasComparacoes);
  log(`validação: ${processadosOk} ok, ${comErro} com erro, ${plano.cache.length} em cache.`);
  return finalFile;
};

// ── Navegador real (reusa a previewRoute de produção) ────────────────────────

/**
 * Validação por REPRESENTAÇÃO (motor V2): navega o documento do BUNDLE — o
 * mesmo que a Galeria serve — e mede o que cada representação promete.
 *
 * - Cápsula de runtime: executou e PINTOU (tela preta é a reprovação clássica);
 *   erros de console e requests externos ficam registrados como ressalva.
 * - Referência visual: o aviso está visível e o frame de fallback carregou.
 * - Ambas: quando a captura guardou o frame da seção, compara captura×preview
 *   com o limiar da natureza da região.
 *
 * O relatório (`ValidationReport`, com `telaPreta` MEDIDO) é gravado no
 * `validation.json` do bundle. Uma exceção aqui sobe para o worker — tentativa
 * de validação que falhou é erro do segmento, não sucesso silencioso.
 */
const validarRepresentacao = async (
  page: Any,
  base: string,
  cand: CandidatoValidacao,
  limits: ValidatorLimits,
): Promise<{ results: ResultadoValidacaoSegmento[]; visual: VisualComparison[] }> => {
  const v2 = cand.v2;
  if (v2 === undefined) return { results: [], visual: [] };
  const arquivo = v2.representation === 'capsula-runtime' ? 'runtime.html' : 'index.html';
  const url = `${base}/api/preview/bundle/${v2.dsId}/${v2.pasta}/${arquivo}`;

  const consoleErrors: string[] = [];
  const externalRequests: string[] = [];
  const onConsole = (m: Any): void => {
    if (m?.type?.() === 'error') consoleErrors.push(String(m.text?.() ?? '').slice(0, 300));
  };
  const onPageError = (e: Any): void => {
    consoleErrors.push(String(e?.message ?? e).slice(0, 300));
  };
  const onRequest = (req: Any): void => {
    try {
      const u = String(req.url());
      if (/^https?:/i.test(u) && !u.startsWith(`${base}/`)) {
        externalRequests.push(new URL(u).host);
      }
    } catch {
      // URL inválida: irrelevante para o relatório.
    }
  };
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('request', onRequest);

  try {
    await page.goto(url, { waitUntil: 'load', timeout: limits.perPreviewTimeoutMs });
    // Tempo para o runtime montar e pintar o primeiro frame.
    await page.waitForTimeout(800);
    const shot: Uint8Array = await page.screenshot({ type: 'png' });
    const preta = ehTelaPreta(shot);

    const checks: ValidationReport['checks'] = [
      {
        name: 'tela-preta',
        // `null` = screenshot não decodificável: dúvida não reprova, mas fica dita.
        ok: preta !== true,
        detail: preta === null ? 'screenshot não decodificável — não medido' : undefined,
        appliesTo: v2.representation,
      },
    ];

    if (v2.representation === 'referencia-visual') {
      const aviso = (await page.$('[data-ds-aviso="referencia-visual"]')) !== null;
      const frameOk = await page.$eval('img', (el: Any) => el.naturalWidth > 0).catch(() => false);
      checks.push({ name: 'aviso-visivel', ok: aviso, appliesTo: v2.representation });
      checks.push({
        name: 'frame-carregou',
        ok: frameOk === true,
        detail: frameOk === true ? undefined : 'o <img> do frame de fallback não carregou',
        appliesTo: v2.representation,
      });
    }

    checks.push({
      name: 'console-limpo',
      ok: consoleErrors.length === 0,
      detail: consoleErrors.length > 0 ? `${consoleErrors.length} erro(s) de console` : undefined,
      appliesTo: v2.representation,
    });

    // A comparação captura×preview responde "o RUNTIME pintou o que a captura
    // viu?" — só faz sentido na cápsula. Na referência visual o preview mostra
    // o próprio frame da captura COM a faixa de aviso por cima: comparar seria
    // tautológico no melhor caso e falso-negativo no pior (a faixa polui o
    // diff). Lá, o que se confere é o aviso e o carregamento do frame.
    const visual: VisualComparison[] = [];
    if (v2.representation === 'capsula-runtime' && v2.frame !== null) {
      try {
        const pngCaptura = readFileSync(join(vaultCaptureV2Dir(v2.dsId), v2.frame));
        const comp = compararCapturaComPreview(pngCaptura, shot, v2.nature);
        if (comp !== null) {
          visual.push(comp);
          checks.push({
            name: 'comparacao-visual',
            ok: comp.ok,
            detail: `delta ${comp.delta} (limiar ${comp.threshold}, natureza ${comp.nature})`,
            appliesTo: v2.representation,
          });
        }
      } catch {
        // Frame sumiu do disco: sem comparação, sem afirmação.
      }
    }

    // `console-limpo` é ressalva, não veredicto: um runtime que pintou com um
    // erro de console no meio ainda é uma cápsula que funciona.
    const decisivos = checks.filter((c) => c.name !== 'console-limpo');
    const ok = decisivos.every((c) => c.ok);
    const relatorio: ValidationReport = {
      ranAt: Date.now(),
      representation: v2.representation,
      checks,
      consoleErrors: consoleErrors.slice(0, 10),
      externalRequests: [...new Set(externalRequests)].slice(0, 10),
      cspViolations: [],
      ok,
      telaPreta: preta === true,
    };
    try {
      escreverValidacaoBundle(v2.dir, relatorio);
    } catch {
      // Gravar o relatório não pode derrubar a validação em si.
    }

    return {
      results: [
        {
          segmentId: cand.segmentId,
          kind: v2.representation === 'capsula-runtime' ? 'capsula' : 'referencia-visual',
          ok,
          detail: ok
            ? undefined
            : `reprovado em: ${decisivos
                .filter((c) => !c.ok)
                .map((c) => c.name)
                .join(', ')}`,
        },
      ],
      visual,
    };
  } finally {
    page.off?.('console', onConsole);
    page.off?.('pageerror', onPageError);
    page.off?.('request', onRequest);
  }
};

const loadPlaywright = async (): Promise<Any | null> => {
  try {
    return (await import('playwright' as string)) as Any;
  } catch {
    return null;
  }
};

type ContextoNavegador = {
  driver: (limits: ValidatorLimits) => DriverValidacao;
  fechar: () => Promise<void>;
};

/** Sobe a previewRoute num servidor efêmero + navegador. Null se indisponível. */
const abrirNavegador = async (log: (m: string) => void): Promise<ContextoNavegador | null> => {
  const pw = await loadPlaywright();
  if (!pw) return null;

  const { Hono } = await import('hono');
  const { serve } = await import('@hono/node-server');
  const { previewRoute } = await import('../routes/preview.js');

  const app = new Hono();
  app.route('/api/preview', previewRoute);
  const { srv, port } = await new Promise<{ srv: Any; port: number }>((resolve) => {
    const s = serve({ fetch: app.fetch, port: 0 }, (info: Any) =>
      resolve({ srv: s, port: info.port }),
    );
  });
  const base = `http://localhost:${port}`;

  let browser: Any;
  try {
    browser = await pw.chromium.launch({ headless: true });
  } catch (err) {
    await new Promise<void>((r) => srv.close(() => r()));
    log(`navegador não abriu: ${err instanceof Error ? err.message : 'erro'}`);
    return null;
  }

  const driver =
    (limits: ValidatorLimits): DriverValidacao =>
    async (cand) => {
      const t0 = Date.now();
      const results: ResultadoValidacaoSegmento[] = [];
      const visual: VisualComparison[] = [];
      const page = await browser.newPage();
      const abrir = async (sufixo: string): Promise<Any> => {
        const url = `${base}/api/preview/segment/${cand.segmentId}${sufixo}`;
        await page.setContent(
          `<!doctype html><meta charset="utf-8"><iframe id="pf" src="${url}" sandbox="allow-scripts" style="width:1200px;height:900px;border:0"></iframe>`,
        );
        const handle = await page.waitForSelector('#pf', { timeout: limits.perPreviewTimeoutMs });
        const frame = await handle.contentFrame();
        if (!frame) throw new Error('iframe sem frame');
        return frame;
      };
      // Cápsula e referência visual são servidas do BUNDLE — a rota de segmento
      // redireciona para lá, então o replay/scroll de snippet não existe mais
      // para elas; a validação delas é a da própria representação, abaixo.
      const ehPortatil = cand.v2 === undefined || cand.v2.representation === 'componente-portatil';
      try {
        // ── Validação de ESTADOS (botões), quando há ──
        if (ehPortatil && cand.states.length > 0) {
          const frame = await abrir('?replay=1');
          await frame.waitForSelector('#ds-rp-alvo', { timeout: limits.perPreviewTimeoutMs });
          const alvoHtml = (): Promise<string> =>
            frame.$eval('#ds-rp-alvo', (el: Any) => el.innerHTML);
          const portalCheio = (): Promise<boolean> =>
            frame.$$eval('#ds-rp-portal > *', (e: Any[]) => e.length > 0);
          const baseline = await alvoHtml();

          const okPorState = new Map<string, boolean>();
          for (const st of cand.states.slice(0, limits.maxInteractionsPerSegment)) {
            let ok = false;
            try {
              await frame.click(`[data-estado="${st.id}"]`, { timeout: 3000 });
              await page.waitForTimeout(120);
              const mudou = (await alvoHtml()) !== baseline || (await portalCheio());
              await frame.click('[data-estado="__reset__"]', { timeout: 3000 });
              await page.waitForTimeout(120);
              const restaurou = (await alvoHtml()) === baseline && !(await portalCheio());
              ok = mudou && restaurou;
            } catch {
              ok = false;
            }
            okPorState.set(st.id, ok);
          }

          for (const it of cand.pipeline) {
            if (it.status !== 'replayable') continue;
            const seus = it.stateIds.filter((id) => okPorState.has(id));
            if (seus.length === 0) continue;
            const ok = seus.some((id) => okPorState.get(id) === true);
            results.push({
              segmentId: cand.segmentId,
              kind: it.kind,
              ok,
              detail: ok ? undefined : 'reprodução não observável ou reset não restaurou',
            });
          }
        }

        // ── Validação de SCROLL REAL, quando há comportamentos ──
        if (ehPortatil && cand.scroll.length > 0) {
          const ok = await validarScrollNoFrame(
            page,
            () => abrir('?scroll=1'),
            cand.scroll,
            limits,
          );
          results.push({
            segmentId: cand.segmentId,
            kind: 'scroll',
            ok,
            detail: ok ? undefined : 'efeito de scroll não observável ou reset não restaurou',
          });
        }

        // ── Validação por REPRESENTAÇÃO (segmentos com bundle V2) ──
        if (cand.v2 !== undefined) {
          if (cand.v2.representation === 'componente-portatil') {
            // O replay/scroll acima já validou a reprodução; aqui entra só a
            // medição de tela preta sobre a superfície do preview, e o resumo
            // vai para o validation.json do bundle.
            const checksReplay = results.map((r) => ({
              name: `replay:${r.kind}`,
              ok: r.ok,
              detail: r.detail,
            }));
            let preta: boolean | null = null;
            try {
              const el = await page.$('#pf');
              const shot: Uint8Array | null = el ? await el.screenshot({ type: 'png' }) : null;
              preta = shot === null ? null : ehTelaPreta(shot);
            } catch {
              preta = null;
            }
            if (preta === true) {
              results.push({
                segmentId: cand.segmentId,
                kind: 'tela-preta',
                ok: false,
                detail: 'o preview renderizou praticamente todo preto',
              });
            }
            try {
              const relatorio: ValidationReport = {
                ranAt: Date.now(),
                representation: 'componente-portatil',
                checks: [
                  ...checksReplay,
                  {
                    name: 'tela-preta',
                    ok: preta !== true,
                    detail: preta === null ? 'não medido (screenshot indisponível)' : undefined,
                  },
                ],
                consoleErrors: [],
                externalRequests: [],
                cspViolations: [],
                ok: checksReplay.every((c) => c.ok) && preta !== true,
                telaPreta: preta === true,
              };
              escreverValidacaoBundle(cand.v2.dir, relatorio);
            } catch {
              // Gravar o relatório não pode derrubar a validação.
            }
          } else {
            const r = await validarRepresentacao(page, base, cand, limits);
            results.push(...r.results);
            visual.push(...r.visual);
          }
        }
      } finally {
        await page.close();
      }
      return { results, durationMs: Date.now() - t0, visual };
    };

  return {
    driver,
    fechar: async () => {
      await browser.close();
      await new Promise<void>((r) => srv.close(() => r()));
    },
  };
};
