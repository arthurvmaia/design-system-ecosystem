import type { ScrollViewportPass } from '@ds/shared';
import type { PaginaV2 } from '../browser/page.js';
import { ROLAR_PARA_FN, chamar } from '../instrumentation/index.js';

/**
 * Percurso da página por viewports **sobrepostas**.
 *
 * O V1 rolava de 400 em 400px com um `setInterval` e **voltava ao topo no fim**,
 * antes de registrar qualquer coisa (`AUTO_SCROLL_FN`, browser.ts). Servia para
 * disparar lazy-load, e só. Nada do que acontecia em cada viewport era observado,
 * e o que estava perto das bordas caía entre dois passos.
 *
 * Aqui cada viewport é uma **parada de trabalho**: estabiliza, observa no tempo,
 * varre o ponteiro, descobre candidatos, captura. Só depois rola — e rola
 * 70–80% da altura, de propósito: a sobreposição é o que garante que um elemento
 * partido entre duas viewports seja visto inteiro em pelo menos uma.
 *
 * A página **não volta ao topo antes de registrar** o que foi observado.
 */

/** Sobreposição padrão: rola 75% da viewport, mantendo 25% do que já se viu. */
export const SOBREPOSICAO_PADRAO = 0.25;

export type ParadaContexto = {
  /** Índice da parada. */
  indice: number;
  /** Posição de scroll em px. */
  scrollY: number;
  /** Progresso global 0..1. */
  progresso: number;
  /** Direção da passagem. */
  direcao: 'descendo' | 'subindo';
  /** Altura total da página naquele momento (muda com lazy-load). */
  pageHeight: number;
};

export type OpcoesPercurso = {
  /** Fração da viewport mantida entre paradas (0..0.5). */
  sobreposicao?: number;
  /** Espera após rolar, para o efeito assentar (ms). */
  assentarMs?: number;
  /** Teto de paradas na passagem descendente. */
  maxParadas?: number;
  /** Fazer a passagem ascendente resumida? */
  ascendente?: boolean;
  /** Teto de paradas na passagem ascendente (resumida de propósito). */
  maxParadasAscendente?: number;
  signal?: AbortSignal;
  /** O trabalho de cada parada. Devolve o que o manifesto registra. */
  trabalho: (ctx: ParadaContexto) => Promise<{
    visible: string[];
    appeared: string[];
    temporalIds: string[];
    pointerPathIds: string[];
    assetsLoaded: string[];
  }>;
};

type PosicaoScroll = { scrollY: number; pageHeight: number; viewportHeight: number };

/**
 * Percorre a página. Devolve uma parada por viewport, na ordem em que foram
 * visitadas.
 *
 * A altura da página é relida a cada parada: lazy-load faz o documento crescer
 * durante o percurso, e um total calculado uma vez só faria a varredura parar no
 * meio de um site infinito — ou, pior, girar sem fim. O teto de paradas é o freio.
 */
export const percorrerComScroll = async (
  page: PaginaV2,
  opts: OpcoesPercurso,
): Promise<ScrollViewportPass[]> => {
  const sobreposicao = Math.min(0.5, Math.max(0, opts.sobreposicao ?? SOBREPOSICAO_PADRAO));
  const assentar = opts.assentarMs ?? 250;
  const maxParadas = opts.maxParadas ?? 24;
  const maxAscendente = opts.maxParadasAscendente ?? 6;

  const passes: ScrollViewportPass[] = [];
  const vistos = new Set<string>();

  /**
   * Lido por função, não inline: `signal.aborted` é um getter que muda com o
   * tempo, e o TypeScript estreita o resultado de `opts.signal?.aborted` entre
   * statements como se fosse constante — o que faria o segundo `if` do percurso
   * ser considerado morto.
   */
  const abortado = (): boolean => opts.signal?.aborted === true;

  const rolarPara = async (y: number): Promise<PosicaoScroll> => {
    const r = await page.evaluate<PosicaoScroll>(chamar(ROLAR_PARA_FN, Math.max(0, Math.round(y))));
    await page.esperar(assentar);
    return r;
  };

  // ── Passagem descendente ─────────────────────────────────────────────────
  let pos = await rolarPara(0);
  let indice = 0;
  let ultimoY = -1;

  while (indice < maxParadas) {
    if (abortado()) break;

    const progresso =
      pos.pageHeight <= pos.viewportHeight
        ? 0
        : Math.min(1, pos.scrollY / (pos.pageHeight - pos.viewportHeight));

    const resultado = await opts.trabalho({
      indice,
      scrollY: pos.scrollY,
      progresso,
      direcao: 'descendo',
      pageHeight: pos.pageHeight,
    });

    // `appeared` = ficou visível AGORA. É o que identifica reveal e lazy-load, e
    // é calculado aqui (não no trabalho) porque só o percurso sabe o histórico.
    const novos = resultado.visible.filter((h) => !vistos.has(h));
    for (const h of resultado.visible) vistos.add(h);

    passes.push({
      index: indice,
      scrollY: pos.scrollY,
      progress: progresso,
      overlap: indice === 0 ? 0 : sobreposicao,
      direction: 'descendo',
      visible: resultado.visible,
      appeared: [...new Set([...novos, ...resultado.appeared])],
      temporalIds: resultado.temporalIds,
      pointerPathIds: resultado.pointerPathIds,
      assetsLoaded: resultado.assetsLoaded,
    });

    // Chegou ao fim? Duas condições, e as duas importam: a matemática (não há
    // mais página) e a empírica (o scroll não avançou). A segunda pega o caso do
    // container com `overflow:hidden` no body, em que rolar não faz nada.
    const fim = pos.scrollY + pos.viewportHeight >= pos.pageHeight - 2;
    if (fim) break;
    if (pos.scrollY === ultimoY) break;
    ultimoY = pos.scrollY;

    const passo = Math.max(80, Math.round(pos.viewportHeight * (1 - sobreposicao)));
    pos = await rolarPara(pos.scrollY + passo);
    indice++;
  }

  // ── Passagem ascendente resumida ─────────────────────────────────────────
  // Existe porque muito efeito só acontece na subida: header que reaparece,
  // reveal que reverte, `scroll-direction` que troca de tema. Resumida de
  // propósito — a descida já mapeou a estrutura; aqui só se procura o que muda
  // com a direção.
  if (opts.ascendente !== false && passes.length > 1 && !abortado()) {
    const alvos: number[] = [];
    const total = pos.pageHeight - pos.viewportHeight;
    const quantas = Math.min(maxAscendente, passes.length);
    for (let i = 0; i < quantas; i++) {
      alvos.push(Math.round(total * (1 - i / Math.max(1, quantas - 1 || 1))));
    }
    let j = 0;
    for (const y of alvos) {
      if (abortado()) break;
      const p = await rolarPara(y);
      const progresso =
        p.pageHeight <= p.viewportHeight
          ? 0
          : Math.min(1, p.scrollY / (p.pageHeight - p.viewportHeight));
      const resultado = await opts.trabalho({
        indice: indice + 1 + j,
        scrollY: p.scrollY,
        progresso,
        direcao: 'subindo',
        pageHeight: p.pageHeight,
      });
      passes.push({
        index: indice + 1 + j,
        scrollY: p.scrollY,
        progress: progresso,
        overlap: sobreposicao,
        direction: 'subindo',
        visible: resultado.visible,
        appeared: resultado.appeared,
        temporalIds: resultado.temporalIds,
        pointerPathIds: resultado.pointerPathIds,
        assetsLoaded: resultado.assetsLoaded,
      });
      j++;
    }
  }

  return passes;
};

/**
 * As posições que a passagem descendente visitaria — função pura, para testar a
 * sobreposição sem navegador.
 *
 * É o contrato que o pedido cobra ("scroll de 70% a 80% da viewport"): cada parada
 * mantém 20–30% do que a anterior mostrou.
 */
export const posicoesDeParada = (
  pageHeight: number,
  viewportHeight: number,
  sobreposicao = SOBREPOSICAO_PADRAO,
  maxParadas = 24,
): number[] => {
  if (viewportHeight <= 0) return [0];
  const out = [0];
  if (pageHeight <= viewportHeight) return out;
  const passo = Math.max(80, Math.round(viewportHeight * (1 - sobreposicao)));
  let y = passo;
  while (out.length < maxParadas && y + viewportHeight < pageHeight + passo) {
    const clamped = Math.min(y, pageHeight - viewportHeight);
    if (clamped <= (out[out.length - 1] ?? 0)) break;
    out.push(clamped);
    if (clamped >= pageHeight - viewportHeight) break;
    y += passo;
  }
  return out;
};
