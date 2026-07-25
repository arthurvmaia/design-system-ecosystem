import type { Confidence, NormalizedBox, TemporalChange, TemporalObservation } from '@ds/shared';
import type { PaginaV2 } from '../browser/page.js';
import type { BoxPx } from '../mapper/raw.js';
import { type LIMIAR_POR_NATUREZA, classificarMovimento, diffPng, hashBytes } from './pixel.js';

/**
 * Observador temporal.
 *
 * A pergunta que o V1 não fazia: **isto se move?** Lá, "tem animação" era o
 * regex `animate-` no nome da classe, e um screenshot único representava uma
 * experiência animada. Aqui a mesma região é amostrada em instantes controlados e
 * a resposta é medida.
 *
 * A conclusão mais útil vem do cruzamento: **pixels mudaram e o DOM não**. Isso
 * só acontece quando algo pinta por fora do DOM — vídeo, canvas, WebGL, SVG
 * animado, animação CSS contínua, runtime externo. É o sinal que promove um
 * `<canvas>` de "retângulo vazio" a "cena em execução", e que rebaixa um `<div
 * class="animate-pulse">` que na verdade está parado.
 *
 * Economia é requisito, não detalhe: frames equivalentes são descartados por
 * hash, a amostragem só se adensa onde houve mudança, e há teto por observação.
 * Guardar todos os frames de todas as viewports encheria o disco sem informar
 * nada além do primeiro par.
 */

/** Onde os frames guardados vão parar. O manifesto só guarda o caminho. */
export type SinkFrame = (nomeRelativo: string, bytes: Uint8Array) => void;

/** Instantes padrão. Cobrem transição de entrada, loop curto e loop longo. */
export const INSTANTES_PADRAO: readonly number[] = [0, 250, 500, 1000, 2000];

export type OpcoesTemporal = {
  /** Identificador do alvo: hash de elemento, ou `viewport:<n>`. */
  alvo: string;
  /** Recorte em px. Ausente = viewport inteira. */
  clip?: BoxPx;
  /** Instantes (ms) a amostrar, relativos ao início da observação. */
  instantes?: readonly number[];
  /** Grava os frames que valem a pena. Ausente = não grava, só mede. */
  sink?: SinkFrame;
  /** Prefixo do nome dos frames. */
  prefixo?: string;
  /** Teto de frames GRAVADOS por observação. */
  maxFrames?: number;
  /** Assinatura do DOM, para saber se ele ficou estável. */
  medirDom?: () => Promise<string>;
  /** Corte por orçamento. */
  signal?: AbortSignal;
  /** Regiões a ignorar na comparação. */
  mascaras?: readonly NormalizedBox[];
  /**
   * Adensa a amostragem quando o último par mudou acima disto. `0` desliga o
   * adaptativo.
   */
  limiarAdaptativo?: number;
  /** Teto de amostras extras que o adaptativo pode pedir. */
  maxExtras?: number;
};

const confiancaDe = (amostras: number, degradado: boolean): Confidence => {
  if (degradado) return 'baixa';
  if (amostras >= 4) return 'alta';
  if (amostras >= 2) return 'media';
  return 'baixa';
};

/**
 * Observa um alvo ao longo do tempo.
 *
 * Não usa `waitForTimeout` cumulativo por engano: os instantes são ABSOLUTOS
 * desde o início, e a espera é a diferença até o próximo — senão `[0,250,500]`
 * viraria 0, 250, 750.
 */
export const observarTemporal = async (
  page: PaginaV2,
  opts: OpcoesTemporal,
): Promise<TemporalObservation> => {
  const instantes = [...(opts.instantes ?? INSTANTES_PADRAO)].sort((a, b) => a - b);
  const maxFrames = opts.maxFrames ?? 3;
  const limiarAdaptativo = opts.limiarAdaptativo ?? 0.03;
  const maxExtras = opts.maxExtras ?? 2;
  const prefixo = opts.prefixo ?? opts.alvo.replace(/[^\w-]/g, '_');

  const amostras: Array<{ t: number; bytes: Uint8Array; hash: string; dom: string }> = [];
  const framesGravados: string[] = [];
  const hashesGravados = new Set<string>();
  const deltas: number[] = [];
  const regioes: NormalizedBox[] = [];
  let degradado = false;
  let domMudou = false;

  const capturar = async (t: number): Promise<boolean> => {
    if (opts.signal?.aborted === true) return false;
    let bytes: Uint8Array;
    try {
      bytes = await page.screenshot(opts.clip ? { clip: opts.clip } : undefined);
    } catch {
      // Recorte fora da viewport, alvo removido: a observação segue com o que tem.
      return false;
    }
    const dom = opts.medirDom === undefined ? '' : await opts.medirDom();
    amostras.push({ t, bytes, hash: hashBytes(bytes), dom });
    return true;
  };

  let decorrido = 0;
  for (const t of instantes) {
    const esperar = t - decorrido;
    if (esperar > 0) {
      await page.esperar(esperar);
      decorrido = t;
    }
    if (!(await capturar(t))) break;
    if (opts.signal?.aborted === true) break;
  }

  // Amostragem adaptativa: se o último par mudou muito, há movimento em curso e
  // vale medir mais um pouco para saber se é loop ou transição única.
  let extras = 0;
  while (extras < maxExtras && opts.signal?.aborted !== true && amostras.length >= 2) {
    const a = amostras[amostras.length - 2];
    const b = amostras[amostras.length - 1];
    if (a === undefined || b === undefined) break;
    if (a.hash === b.hash) break;
    const d = diffPng(a.bytes, b.bytes, { mascaras: opts.mascaras });
    if (d.delta < limiarAdaptativo) break;
    const proximo = (amostras[amostras.length - 1]?.t ?? 0) + 700;
    await page.esperar(700);
    decorrido = proximo;
    if (!(await capturar(proximo))) break;
    extras++;
  }

  // Compara pares consecutivos. O `delta` reportado é o do par que mais mudou —
  // não o do primeiro contra o último: num loop, primeiro e último podem
  // coincidir (o ciclo fechou) e o resultado seria "não se move".
  for (let i = 1; i < amostras.length; i++) {
    const a = amostras[i - 1];
    const b = amostras[i];
    if (a === undefined || b === undefined) continue;
    if (a.dom !== b.dom) domMudou = true;
    if (a.hash === b.hash) {
      deltas.push(0);
      continue;
    }
    const d = diffPng(a.bytes, b.bytes, { mascaras: opts.mascaras });
    if (d.degradado) degradado = true;
    deltas.push(d.delta);
    for (const r of d.regioes) regioes.push(r);
  }

  const mov = classificarMovimento(deltas);

  // Grava só o que informa: o primeiro frame (fallback) e os que representam
  // estados visuais distintos. Frame equivalente por hash não vai para o disco.
  if (opts.sink !== undefined) {
    for (const a of amostras) {
      if (framesGravados.length >= maxFrames) break;
      if (hashesGravados.has(a.hash)) continue;
      hashesGravados.add(a.hash);
      const nome = `${prefixo}-${a.t}ms-${a.hash.slice(0, 8)}.png`;
      opts.sink(nome, a.bytes);
      framesGravados.push(nome);
    }
  }

  const changes: TemporalChange[] = [];
  if (mov.movendo) changes.push('pixels');
  if (domMudou) changes.push('dom');

  return {
    id: `tmp_${prefixo}_${amostras.length}`,
    target: opts.alvo,
    timestamps: amostras.map((a) => a.t),
    changes,
    pixelDelta: mov.maiorDelta,
    domStable: !domMudou,
    moving: mov.movendo,
    // A atribuição de causa fica para quem tem os detectores em mão (o motor):
    // aqui só se sabe que mudou, e se o DOM acompanhou.
    attributedTo: mov.movendo && !domMudou ? 'pintura fora do DOM' : undefined,
    frames: framesGravados,
    dynamicRegions: unirRegioesSimples(regioes),
    confidence: confiancaDe(amostras.length, degradado),
  };
};

/**
 * Une regiões vizinhas em blocos maiores. Versão simples e barata (grade), porque
 * as regiões vêm de um diff por bloco e já são alinhadas: não vale o custo do
 * algoritmo de união geral aqui.
 */
const unirRegioesSimples = (regioes: readonly NormalizedBox[]): NormalizedBox[] => {
  if (regioes.length === 0) return [];
  // Bounding box por "faixa" contínua: agrupa por linha aproximada e junta.
  const chave = (r: NormalizedBox): string => `${Math.round(r.y * 20)}`;
  const porFaixa = new Map<string, NormalizedBox[]>();
  for (const r of regioes) {
    const k = chave(r);
    const lista = porFaixa.get(k);
    if (lista === undefined) porFaixa.set(k, [r]);
    else lista.push(r);
  }
  const out: NormalizedBox[] = [];
  for (const lista of porFaixa.values()) {
    let x0 = 1;
    let y0 = 1;
    let x1 = 0;
    let y1 = 0;
    for (const r of lista) {
      x0 = Math.min(x0, r.x);
      y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w);
      y1 = Math.max(y1, r.y + r.h);
    }
    out.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    if (out.length >= 24) break;
  }
  return out;
};

/**
 * Atribui a causa do movimento a um detector concreto.
 *
 * Separado da observação de propósito: observar é medir, atribuir é interpretar.
 * A ordem dos testes é a ordem da força da evidência — um contexto WebGL criado
 * explica o movimento melhor que um `@keyframes` declarado.
 */
export const atribuirMovimento = (opts: {
  temWebgl: boolean;
  temCanvas2d: boolean;
  temVideo: boolean;
  temImagemAnimavel: boolean;
  temSvgSmil: boolean;
  animacoesCssQueRodaram: readonly string[];
  runtimesDetectados: readonly string[];
  domMudou: boolean;
}): { causa: string; porCss: boolean } => {
  if (opts.temWebgl) return { causa: 'WebGL', porCss: false };
  if (opts.temVideo) return { causa: 'vídeo', porCss: false };
  if (opts.temCanvas2d) return { causa: 'canvas 2D', porCss: false };
  if (opts.temSvgSmil) return { causa: 'SVG animado (SMIL)', porCss: true };
  if (opts.temImagemAnimavel) return { causa: 'imagem animada (GIF/WebP/AVIF)', porCss: false };
  if (opts.animacoesCssQueRodaram.length > 0) {
    return {
      causa: `animação CSS (${opts.animacoesCssQueRodaram.slice(0, 2).join(', ')})`,
      // Animação CSS roda por inclusão do estilo — é reproduzível no preview.
      porCss: true,
    };
  }
  if (opts.runtimesDetectados.length > 0) {
    return { causa: `runtime ${opts.runtimesDetectados[0]}`, porCss: false };
  }
  if (opts.domMudou) return { causa: 'mudança de DOM por JavaScript', porCss: false };
  return { causa: 'origem não identificada', porCss: false };
};

/**
 * Natureza da região, para escolher o limiar de comparação visual. Sem isto, um
 * componente com vídeo reprovaria a comparação por um motivo que não é defeito.
 */
export const naturezaDaRegiao = (opts: {
  temRuntimeExterno: boolean;
  temCanvas: boolean;
  temVideo: boolean;
  animado: boolean;
}): keyof typeof LIMIAR_POR_NATUREZA => {
  if (opts.temRuntimeExterno) return 'runtime-externo';
  if (opts.temCanvas) return 'canvas';
  if (opts.temVideo) return 'video';
  if (opts.animado) return 'animada';
  return 'estatica';
};
