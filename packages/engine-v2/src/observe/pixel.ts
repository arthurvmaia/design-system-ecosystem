import { createHash } from 'node:crypto';
import type { NormalizedBox } from '@ds/shared';
import { type ImagemRaw, PngNaoSuportado, decodePng } from './png.js';

/**
 * Comparação perceptual de imagens — função pura.
 *
 * O V1 não tinha nada disto: "tem animação" era o regex `animate-` no nome da
 * classe. Aqui a pergunta é respondida medindo. Duas conclusões saem daqui e
 * mudam todo o resto do pipeline:
 *
 * 1. **Pixels mudaram e o DOM não** ⇒ há um runtime pintando (vídeo, canvas,
 *    WebGL, SVG animado, animação CSS contínua). É o que diferencia um fundo
 *    animado de verdade de um `<div>` com nome bonito.
 * 2. **Onde** mudou ⇒ as regiões dinâmicas, que viram máscara na comparação
 *    visual. Sem máscara, todo componente com um vídeo reprova a comparação por
 *    um motivo que não é defeito.
 *
 * A comparação é por BLOCO, não por pixel isolado: ruído de compressão e
 * anti-aliasing mexem pixels sozinhos sem mudar nada perceptível, e o custo cai.
 */

/** Diferença perceptual entre dois canais RGB, com peso de luminância. */
const distancia = (a: Uint8Array, b: Uint8Array, ia: number, ib: number): number => {
  // Pesos de luminância (Rec. 601). O olho vê verde muito mais que azul, e usar
  // distância euclidiana crua faz um deslocamento de matiz imperceptível pesar
  // igual a uma mudança de brilho evidente.
  const dr = (a[ia] ?? 0) - (b[ib] ?? 0);
  const dg = (a[ia + 1] ?? 0) - (b[ib + 1] ?? 0);
  const db = (a[ia + 2] ?? 0) - (b[ib + 2] ?? 0);
  const da = (a[ia + 3] ?? 255) - (b[ib + 3] ?? 255);
  return Math.abs(0.299 * dr + 0.587 * dg + 0.114 * db) + Math.abs(da) * 0.5;
};

export type OpcoesDiff = {
  /** Lado do bloco em px. Menor = mais preciso, mais caro. */
  bloco?: number;
  /**
   * Diferença perceptual por pixel a partir da qual ele conta como alterado.
   * `8` ignora ruído de compressão e anti-aliasing sem perder mudança real.
   */
  limiarPixel?: number;
  /** Fração de pixels alterados no bloco para o BLOCO contar como alterado. */
  limiarBloco?: number;
  /** Regiões normalizadas a IGNORAR (máscara). */
  mascaras?: readonly NormalizedBox[];
};

export type ResultadoDiff = {
  /** Fração de pixels alterados fora das máscaras (0..1). */
  delta: number;
  /** Fração de blocos alterados. */
  blocosAlterados: number;
  /** Regiões normalizadas onde houve mudança. */
  regioes: NormalizedBox[];
  /** As duas imagens tinham dimensões diferentes (comparação impossível). */
  incomparavel: boolean;
};

const dentroDaMascara = (
  x: number,
  y: number,
  w: number,
  h: number,
  mascaras: readonly NormalizedBox[],
): boolean => {
  if (mascaras.length === 0) return false;
  const nx = x / w;
  const ny = y / h;
  for (const m of mascaras) {
    if (nx >= m.x && nx <= m.x + m.w && ny >= m.y && ny <= m.y + m.h) return true;
  }
  return false;
};

/** Compara duas imagens RGBA já decodificadas. */
export const diffImagens = (a: ImagemRaw, b: ImagemRaw, opts: OpcoesDiff = {}): ResultadoDiff => {
  if (a.width !== b.width || a.height !== b.height) {
    return { delta: 1, blocosAlterados: 1, regioes: [], incomparavel: true };
  }
  const bloco = Math.max(4, opts.bloco ?? 24);
  const limiarPixel = opts.limiarPixel ?? 8;
  const limiarBloco = opts.limiarBloco ?? 0.06;
  const mascaras = opts.mascaras ?? [];

  const { width: w, height: h } = a;
  const colunas = Math.ceil(w / bloco);
  const linhas = Math.ceil(h / bloco);
  const regioes: NormalizedBox[] = [];

  let pixelsComparados = 0;
  let pixelsAlterados = 0;
  let blocosAlteradosCount = 0;
  let blocosComparados = 0;

  for (let br = 0; br < linhas; br++) {
    for (let bc = 0; bc < colunas; bc++) {
      const x0 = bc * bloco;
      const y0 = br * bloco;
      const x1 = Math.min(w, x0 + bloco);
      const y1 = Math.min(h, y0 + bloco);

      let noBloco = 0;
      let alteradosNoBloco = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          if (dentroDaMascara(x, y, w, h, mascaras)) continue;
          const i = (y * w + x) * 4;
          noBloco++;
          if (distancia(a.data, b.data, i, i) > limiarPixel) alteradosNoBloco++;
        }
      }
      if (noBloco === 0) continue; // bloco inteiro mascarado
      blocosComparados++;
      pixelsComparados += noBloco;
      pixelsAlterados += alteradosNoBloco;
      if (alteradosNoBloco / noBloco >= limiarBloco) {
        blocosAlteradosCount++;
        regioes.push({ x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h });
      }
    }
  }

  return {
    delta: pixelsComparados === 0 ? 0 : pixelsAlterados / pixelsComparados,
    blocosAlterados: blocosComparados === 0 ? 0 : blocosAlteradosCount / blocosComparados,
    regioes,
    incomparavel: false,
  };
};

/**
 * Compara dois PNGs. Quando o decode falha (formato fora do escopo), degrada
 * para comparação por hash: ainda responde "mudou / não mudou", com `delta`
 * binário e sem regiões — e declara isso em `degradado`, para nada a jusante
 * tratar um palpite como medição.
 */
export const diffPng = (
  a: Uint8Array,
  b: Uint8Array,
  opts: OpcoesDiff = {},
): ResultadoDiff & { degradado: boolean } => {
  try {
    return { ...diffImagens(decodePng(a), decodePng(b), opts), degradado: false };
  } catch (err) {
    if (!(err instanceof PngNaoSuportado)) throw err;
    const igual = hashBytes(a) === hashBytes(b);
    return {
      delta: igual ? 0 : 1,
      blocosAlterados: igual ? 0 : 1,
      regioes: [],
      incomparavel: false,
      degradado: true,
    };
  }
};

/** Recorta uma janela de uma imagem RGBA já decodificada. Coordenadas em px. */
export const recortarImagem = (
  img: ImagemRaw,
  x: number,
  y: number,
  w: number,
  h: number,
): ImagemRaw => {
  const out = new Uint8Array(w * h * 4);
  for (let linha = 0; linha < h; linha++) {
    const origem = ((y + linha) * img.width + x) * 4;
    out.set(img.data.subarray(origem, origem + w * 4), linha * w * 4);
  }
  return { width: w, height: h, channels: 4, data: out };
};

/**
 * Procura o deslocamento em que a diferença é MENOR.
 *
 * Comparação pixel a pixel sem alinhamento não separa "o bundle está errado"
 * de "o bundle está 3 px mais abaixo" — e em tira fina (frames de 80 px de
 * altura no acervo) um deslocamento de nada altera quase todas as linhas.
 * Aqui a base desliza sobre a imagem expandida e o deslocamento encontrado
 * vira DADO ("a peça está 6 px mais baixa"), não ruído no delta.
 *
 * `origemX/origemY` é onde a janela sem deslocamento começa dentro de
 * `expandida`. Pura: quem chama decide os offsets e paga o custo por eles.
 */
export const melhorJanela = (
  base: ImagemRaw,
  expandida: ImagemRaw,
  origemX: number,
  origemY: number,
  offsets: ReadonlyArray<{ dx: number; dy: number }>,
  opts: OpcoesDiff = {},
): { delta: number; dx: number; dy: number } => {
  let melhor = { delta: Number.POSITIVE_INFINITY, dx: 0, dy: 0 };
  for (const { dx, dy } of offsets) {
    const sx = origemX + dx;
    const sy = origemY + dy;
    if (sx < 0 || sy < 0) continue;
    if (sx + base.width > expandida.width || sy + base.height > expandida.height) continue;
    const janela = recortarImagem(expandida, sx, sy, base.width, base.height);
    const d = diffImagens(base, janela, opts);
    if (d.delta < melhor.delta) melhor = { delta: d.delta, dx, dy };
  }
  return melhor.delta === Number.POSITIVE_INFINITY ? { delta: 1, dx: 0, dy: 0 } : melhor;
};

/** Hash de bytes — dedup de frames equivalentes, sem guardar o frame duas vezes. */
export const hashBytes = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex').slice(0, 20);

/**
 * A conclusão que interessa: isto se move?
 *
 * `movimento` exige mudança acima do ruído em pelo menos um par consecutivo. Um
 * único par com mudança já basta — um vídeo em loop pode ter dois frames iguais
 * seguidos, e exigir mudança em todos os pares perderia animação lenta.
 */
export const classificarMovimento = (
  deltas: readonly number[],
  limiar = 0.004,
): { movendo: boolean; maiorDelta: number; parescomMudanca: number } => {
  let maior = 0;
  let pares = 0;
  for (const d of deltas) {
    if (d > maior) maior = d;
    if (d > limiar) pares++;
  }
  return { movendo: pares > 0, maiorDelta: maior, parescomMudanca: pares };
};

/**
 * Limiar de comparação visual por natureza da região.
 *
 * A regra do pedido é explícita: **não usar um limiar único para todos os casos**.
 * Uma região estática que muda 3% está errada; um canvas de partículas que muda
 * 60% entre dois instantes está certo — e o bundle nunca vai reproduzir os mesmos
 * pixels de um `Math.random()`.
 */
export const LIMIAR_POR_NATUREZA: Record<
  'estatica' | 'animada' | 'video' | 'canvas' | 'runtime-externo',
  number
> = {
  estatica: 0.02,
  animada: 0.18,
  video: 0.55,
  canvas: 0.6,
  'runtime-externo': 0.75,
};
