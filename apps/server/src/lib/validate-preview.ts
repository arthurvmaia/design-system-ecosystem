import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  PIPELINE_VERSION,
  PREVIEW_VERSION,
  type ResultadoValidacaoSegmento,
  type SegmentInteraction,
  SegmentStatesFile,
  SegmentValidationFile,
  type SegmentValidationMeta,
  SegmentsManifest,
  VALIDATOR_VERSION,
  type ValidationStatus,
  vaultSegmentStates,
  vaultSegmentValidation,
  vaultSegmentsManifest,
} from '@ds/shared';

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
      `p${PREVIEW_VERSION}|v${VALIDATOR_VERSION}|s${PIPELINE_VERSION}|${htmlSnippet}|${statesJson}|${depsJson}`,
    )
    .digest('hex')
    .slice(0, 32);

export type CandidatoValidacao = {
  segmentId: string;
  htmlSnippet: string;
  states: Array<{ id: string }>;
  pipeline: SegmentInteraction[];
  previewHash: string;
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

const lerEstadosJson = (dsId: `ds_${string}`, segId: string): string => {
  const path = vaultSegmentStates(dsId, segId);
  if (!existsSync(path)) return '[]';
  try {
    return JSON.stringify(SegmentStatesFile.parse(JSON.parse(readFileSync(path, 'utf8'))).states);
  } catch {
    return '[]';
  }
};

/** Monta os candidatos: segmentos com interação reproduzível E estado capturado. */
export const montarCandidatos = (dsId: `ds_${string}`): CandidatoValidacao[] => {
  const manifest = lerManifesto(dsId);
  if (!manifest) return [];
  const candidatos: CandidatoValidacao[] = [];
  for (const insight of manifest.insights ?? []) {
    const pipeline = insight.pipeline ?? [];
    const temReplay = pipeline.some((p) => p.status === 'replayable' && p.stateIds.length > 0);
    if (!temReplay) continue;
    const seg = manifest.segments.find((s) => s.id === insight.segmentId);
    if (!seg) continue;
    const statesJson = lerEstadosJson(dsId, insight.segmentId);
    const depsJson = JSON.stringify(insight.dependencies ?? []);
    candidatos.push({
      segmentId: insight.segmentId,
      htmlSnippet: seg.htmlSnippet,
      states: (insight.states ?? []).map((s) => ({ id: s.id })),
      pipeline,
      previewHash: previewHash(seg.htmlSnippet, statesJson, depsJson),
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
    status: agregarStatus(processadosOk, comErro),
    pipelineVersion: PIPELINE_VERSION,
    validatorVersion: VALIDATOR_VERSION,
    durationMs: Date.now() - inicio,
    results: [...resultadosCache, ...novosResultados],
    segments: [...metasCache, ...novasMetas],
  };
  escreverValidacao(dsId, finalFile);
  log(`validação: ${processadosOk} ok, ${comErro} com erro, ${plano.cache.length} em cache.`);
  return finalFile;
};

// ── Navegador real (reusa a previewRoute de produção) ────────────────────────

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
      const page = await browser.newPage();
      try {
        const url = `${base}/api/preview/segment/${cand.segmentId}?replay=1`;
        await page.setContent(
          `<!doctype html><meta charset="utf-8"><iframe id="pf" src="${url}" sandbox="allow-scripts" style="width:1200px;height:900px;border:0"></iframe>`,
        );
        const handle = await page.waitForSelector('#pf', { timeout: limits.perPreviewTimeoutMs });
        const frame = await handle.contentFrame();
        if (!frame) throw new Error('iframe sem frame');
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
      } finally {
        await page.close();
      }
      return { results, durationMs: Date.now() - t0 };
    };

  return {
    driver,
    fechar: async () => {
      await browser.close();
      await new Promise<void>((r) => srv.close(() => r()));
    },
  };
};
