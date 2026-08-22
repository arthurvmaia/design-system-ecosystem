/**
 * A comparação de pixel entre o BUNDLE e o que a captura viu, e a associação
 * dela ao segmento dono.
 *
 * ## Por que isto é um pacote e não um trecho de rota
 *
 * Isto morava dentro da rota de design systems, privado, e por isso só a
 * Galeria enxergava. A curadoria — `curar-biblioteca` — tem uma condição de
 * REPROVA que depende deste dado (`comparacaoVisualOk === false`: "o bundle não
 * bate com o que a captura viu") e lia o campo de um lugar onde ele não existe:
 * era `null` desde sempre, e a reprovação NUNCA disparou. Peça cujo bundle
 * diverge da captura entrava na Biblioteca sem que nada acusasse.
 *
 * Dois donos precisam do mesmo cálculo, então ele deixa de ser detalhe de um
 * deles. Uma segunda implementação aqui divergiria exatamente onde dói: a
 * Galeria acusando e a curadoria promovendo a mesma peça.
 */
import { existsSync, readFileSync } from 'node:fs';
import type { DesignSystemId } from './ids.js';
import { vaultCaptureV2Manifest } from './paths.js';

/** O que se mostra da conferência de pixel de um segmento. Frações 0..1. */
export type ConferenciaDePixel = { delta: number; limiar: number; passou: boolean };

/** Uma comparação como está no manifesto V2, sem round-trip de schema. */
export type ComparacaoBruta = {
  a: string;
  b: string;
  delta: number;
  threshold: number;
  ok: boolean;
  /** O dono, quando a captura o gravou (capturas novas sempre gravam). */
  position?: number;
  segmentHash?: string;
};

/**
 * As comparações de pixel do manifesto V2, lidas UMA vez por design system.
 * Parse cru de propósito: o manifesto passa de 1 MB e quem chama só precisa
 * deste array; validar o documento inteiro por schema custaria mais do que a
 * informação vale.
 */
export const lerComparacoesDaCaptura = (dsId: string): ComparacaoBruta[] => {
  const path = vaultCaptureV2Manifest(dsId as DesignSystemId);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { visualComparisons?: unknown };
    if (!Array.isArray(raw.visualComparisons)) return [];
    return raw.visualComparisons.flatMap((c): ComparacaoBruta[] => {
      if (
        typeof c !== 'object' ||
        c === null ||
        typeof (c as ComparacaoBruta).a !== 'string' ||
        typeof (c as ComparacaoBruta).b !== 'string' ||
        typeof (c as ComparacaoBruta).delta !== 'number' ||
        typeof (c as ComparacaoBruta).threshold !== 'number' ||
        typeof (c as ComparacaoBruta).ok !== 'boolean'
      )
        return [];
      const bruta = c as ComparacaoBruta & { position?: unknown; segmentHash?: unknown };
      return [
        {
          a: bruta.a,
          b: bruta.b,
          delta: bruta.delta,
          threshold: bruta.threshold,
          ok: bruta.ok,
          ...(typeof bruta.position === 'number' ? { position: bruta.position } : {}),
          ...(typeof bruta.segmentHash === 'string' ? { segmentHash: bruta.segmentHash } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
};

/**
 * De quem é cada comparação.
 *
 * A associação é HEURÍSTICA por herança: capturas antigas não gravavam o dono,
 * e o único vínculo era a ordem do array. Por isso três caminhos, do mais
 * confiável para o mais frágil — e o mais frágil ainda existe porque o acervo
 * tem capturas velhas que ninguém vai refazer.
 */
export const associarConferencias = (opts: {
  comparacoes: ComparacaoBruta[];
  /** Ids dos segmentos COM print da dobra, em ordem de posição. */
  comFrame: readonly string[];
  /** Ids dos segmentos cuja representação é cápsula de runtime, em ordem. */
  capsulas: readonly string[];
  /** position → id do segmento, para o lookup por identidade. */
  porPosicao?: ReadonlyMap<number, string>;
}): Map<string, ConferenciaDePixel> => {
  const out = new Map<string, ConferenciaDePixel>();
  const cs = opts.comparacoes;
  if (cs.length === 0) return out;

  const resumo = (c: ComparacaoBruta): ConferenciaDePixel => ({
    delta: c.delta,
    limiar: c.threshold,
    passou: c.ok,
  });

  // Identidade primeiro. Uma captura ou grava o dono em tudo ou em nada (o
  // campo nasceu junto com o compilador que o escreve), então a presença em
  // qualquer item indica manifesto novo e a ordem deixa de importar.
  const comDono = cs.filter((c) => c.position !== undefined);
  if (comDono.length > 0 && opts.porPosicao !== undefined) {
    for (const c of comDono) {
      const id = c.position !== undefined ? opts.porPosicao.get(c.position) : undefined;
      if (id !== undefined) out.set(id, resumo(c));
    }
    return out;
  }

  const daCaptura = cs.every((c) => c.a === 'captura' && c.b === 'bundle');
  if (daCaptura && cs.length === opts.comFrame.length) {
    cs.forEach((c, i) => {
      const id = opts.comFrame[i];
      if (id !== undefined) out.set(id, resumo(c));
    });
    return out;
  }

  const daValidacao = cs.every((c) => c.b === 'preview');
  const unica = cs[0];
  const capsula = opts.capsulas[0];
  if (
    daValidacao &&
    cs.length === 1 &&
    opts.capsulas.length === 1 &&
    unica !== undefined &&
    capsula !== undefined
  ) {
    out.set(capsula, resumo(unica));
  }
  return out;
};
