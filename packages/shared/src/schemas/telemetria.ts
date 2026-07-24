import { z } from 'zod';

/**
 * Telemetria de extração — medição que CONTROLA o processamento, não só loga.
 *
 * Cada fase da captura/pipeline é cronometrada e tem orçamento próprio; o total
 * é um teto real do processo inteiro (não só do loop de interações, que era o
 * bug do "7 minutos"). Quando um orçamento estoura, o processo encerra de forma
 * controlada e produz um RESULTADO PARCIAL válido — nada do que já foi feito é
 * descartado, e a Galeria mostra "parcial por tempo" em vez de um erro genérico.
 *
 * Regra de segurança: este relatório carrega só nomes de fase, durações e
 * contagens. NUNCA cookies, tokens, headers de Authorization, conteúdo sensível
 * ou valores de `.env`.
 */

/** Sobe quando a forma do relatório muda. */
export const TELEMETRIA_VERSION = 1;

/** Uma fase medida: quanto durou e se foi cortada pelo orçamento. */
export const FaseTiming = z.object({
  nome: z.string(),
  ms: z.number().int().nonnegative(),
  /** Cortada pelo orçamento (da fase ou do total). */
  abortada: z.boolean().default(false),
  /** Motivo curto quando abortada (sem dados sensíveis). */
  motivo: z.string().optional(),
});
export type FaseTiming = z.infer<typeof FaseTiming>;

/** Contadores agregados do processo — para o relatório da extração. */
export const TelemetriaContadores = z
  .object({
    requests: z.number().int().nonnegative(),
    downloadsOk: z.number().int().nonnegative(),
    downloadsAbortados: z.number().int().nonnegative(),
    fallbacksHttp: z.number().int().nonnegative(),
    timeouts: z.number().int().nonnegative(),
    candidatos: z.number().int().nonnegative(),
    acoes: z.number().int().nonnegative(),
    estados: z.number().int().nonnegative(),
    segmentos: z.number().int().nonnegative(),
    previewsValidados: z.number().int().nonnegative(),
    assetsLocais: z.number().int().nonnegative(),
    assetsExternos: z.number().int().nonnegative(),
  })
  .partial();
export type TelemetriaContadores = z.infer<typeof TelemetriaContadores>;

/** As chaves de contador, para incremento tipado. */
export type ContadorChave = keyof TelemetriaContadores;

/**
 * O relatório de telemetria de uma extração. Vai no manifesto de captura e é o
 * que a Galeria lê para mostrar "parcial por tempo" e a duração por fase.
 */
export const TelemetriaRelatorio = z.object({
  version: z.number().int().positive().default(TELEMETRIA_VERSION),
  /** Duração real do processo inteiro (ms). */
  totalMs: z.number().int().nonnegative(),
  /** Orçamento total configurado (ms). */
  budgetMs: z.number().int().nonnegative(),
  /** O processo encerrou por orçamento antes de terminar tudo? */
  parcial: z.boolean().default(false),
  /** Fase em que o corte aconteceu, quando parcial. */
  faseInterrompida: z.string().optional(),
  /** Motivo do corte, quando parcial (curto, sem dados sensíveis). */
  motivo: z.string().optional(),
  fases: z.array(FaseTiming).default([]),
  contadores: TelemetriaContadores.default({}),
});
export type TelemetriaRelatorio = z.infer<typeof TelemetriaRelatorio>;
