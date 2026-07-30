/**
 * Análise de cor: do literal do CSS para um canônico comparável.
 *
 * O problema que isto resolve: as peças extraídas carregam a MESMA cor escrita
 * de vários jeitos — `#F69066`, `rgb(246 144 102 / 0.5)`,
 * `rgba(246,144,102,.5)` — e a consolidação precisa enxergar tudo isso como UM
 * membro. O canônico é o `#rrggbb` minúsculo da parte opaca; o alfa é guardado
 * como EXPRESSÃO crua, porque no acervo real ele quase nunca é um número: é
 * `var(--tw-bg-opacity, 1)`, e reescrever isso exigiria carregá-lo intacto.
 *
 * O que fica de fora, de propósito:
 *
 * - **Keywords (`white`, `red`, `transparent`, `currentColor`).** Recolorir
 *   todo `white` de um site é agressivo demais: a palavra aparece em lugares
 *   que não são decisão de marca (scrollbar, seleção, sombra de foco). O
 *   inventário só enxerga o que o autor escreveu como VALOR de cor explícito.
 * - **`color-mix()`, `var()` como cor inteira, sintaxe relativa.** Não há
 *   canônico honesto sem resolver o contexto; devolver null deixa o literal em
 *   paz, que é o contrato de degradação de todo o pipeline.
 */

export type CorAnalisada = {
  /** Canônico `#rrggbb` minúsculo da parte opaca. A chave de agrupamento. */
  hexOpaco: string;
  /** A expressão crua do alfa, quando houver: `0.5`, `50%`, `var(--x, 1)`. */
  alfa?: string;
  /** O texto exato encontrado no CSS. É ele que a recoloração substitui. */
  literal: string;
};

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** Um canal numérico ou percentual → 0..255 (inteiro), ou null se não parsear. */
const canal = (bruto: string): number | null => {
  const t = bruto.trim();
  if (t.endsWith('%')) {
    const p = Number.parseFloat(t.slice(0, -1));
    return Number.isFinite(p) ? Math.round((p / 100) * 255) : null;
  }
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(255, n))) : null;
};

const paraHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;

/** hsl → rgb, ângulo em graus, s/l em 0..1. Fórmula padrão do CSS Color 4. */
const hslParaRgb = (h: number, s: number, l: number): [number, number, number] => {
  const hh = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = l - c / 2;
  const [r, g, b] =
    hh < 60
      ? [c, x, 0]
      : hh < 120
        ? [x, c, 0]
        : hh < 180
          ? [0, c, x]
          : hh < 240
            ? [0, x, c]
            : hh < 300
              ? [x, 0, c]
              : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
};

/**
 * Divide os argumentos de uma função de cor respeitando parênteses aninhados.
 *
 * `rgb(13 60 31 / var(--tw-bg-opacity, 1))` tem vírgula DENTRO do var(): um
 * split ingênuo por vírgula partiria a expressão do alfa ao meio.
 */
const dividirArgs = (interno: string, separadores: RegExp): string[] => {
  const partes: string[] = [];
  let nivel = 0;
  let atual = '';
  for (const ch of interno) {
    if (ch === '(') nivel++;
    if (ch === ')') nivel--;
    if (nivel === 0 && separadores.test(ch)) {
      if (atual.trim().length > 0) partes.push(atual.trim());
      atual = '';
      continue;
    }
    atual += ch;
  }
  if (atual.trim().length > 0) partes.push(atual.trim());
  return partes;
};

export const analisarCor = (literal: string): CorAnalisada | null => {
  const t = literal.trim();

  // ── Hex ───────────────────────────────────────────────────────────────────
  const hex = HEX_RE.exec(t);
  if (hex !== null) {
    let corpo = hex[1] as string;
    let alfa: string | undefined;
    if (corpo.length === 3 || corpo.length === 4) {
      const expandido = [...corpo].map((c) => c + c).join('');
      corpo = expandido;
    }
    if (corpo.length === 8) {
      const a = Number.parseInt(corpo.slice(6, 8), 16) / 255;
      // 1.0 é opaco: não vira alfa, para `#ffffffff` agrupar com `#ffffff`.
      if (a < 1) alfa = a.toFixed(3);
      corpo = corpo.slice(0, 6);
    }
    return { hexOpaco: `#${corpo.toLowerCase()}`, alfa, literal };
  }

  // ── rgb()/rgba()/hsl()/hsla() ─────────────────────────────────────────────
  const fn = /^(rgba?|hsla?)\(([\s\S]*)\)$/i.exec(t);
  if (fn === null) return null;
  const nome = (fn[1] as string).toLowerCase();
  const interno = fn[2] as string;

  // Sintaxe moderna separa o alfa com '/'; a legada, com a quarta vírgula.
  let corpoArgs = interno;
  let alfa: string | undefined;
  const idxBarra = (() => {
    let nivel = 0;
    for (let i = 0; i < interno.length; i++) {
      const ch = interno[i];
      if (ch === '(') nivel++;
      if (ch === ')') nivel--;
      if (nivel === 0 && ch === '/') return i;
    }
    return -1;
  })();
  if (idxBarra >= 0) {
    corpoArgs = interno.slice(0, idxBarra);
    alfa = interno.slice(idxBarra + 1).trim();
  }

  const args = dividirArgs(corpoArgs, /[\s,]/);
  if (idxBarra < 0 && args.length === 4) {
    alfa = args.pop();
  }
  if (args.length !== 3) return null;

  if (nome.startsWith('rgb')) {
    const [r, g, b] = [canal(args[0] ?? ''), canal(args[1] ?? ''), canal(args[2] ?? '')];
    if (r === null || g === null || b === null) return null;
    return { hexOpaco: paraHex(r, g, b), alfa, literal };
  }

  const h = Number.parseFloat(args[0] ?? '');
  const s = Number.parseFloat((args[1] ?? '').replace('%', ''));
  const l = Number.parseFloat((args[2] ?? '').replace('%', ''));
  if (!Number.isFinite(h) || !Number.isFinite(s) || !Number.isFinite(l)) return null;
  const [r, g, b] = hslParaRgb(h, s / 100, l / 100);
  return { hexOpaco: paraHex(r, g, b), alfa, literal };
};

// ── OKLCH ────────────────────────────────────────────────────────────────────
//
// O espaço de comparação. RGB mente sobre distância perceptual (dois azuis a
// 30 unidades parecem iguais; dois amarelos a 30 parecem cores diferentes);
// OKLab foi desenhado para a distância euclidiana corresponder ao olho. As
// matrizes são as publicadas por Björn Ottosson, as mesmas do CSS Color 4.

export type Oklch = { l: number; c: number; h: number };

const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

const paraOklab = (hexOpaco: string): { l: number; a: number; b: number } => {
  const r = linear(Number.parseInt(hexOpaco.slice(1, 3), 16) / 255);
  const g = linear(Number.parseInt(hexOpaco.slice(3, 5), 16) / 255);
  const b = linear(Number.parseInt(hexOpaco.slice(5, 7), 16) / 255);

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
};

export const paraOklch = (hexOpaco: string): Oklch => {
  const { l, a, b } = paraOklab(hexOpaco);
  const c = Math.hypot(a, b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l, c, h };
};

/** ΔE euclidiano em OKLab. < 0.03 é "a mesma cor" para efeito de cluster. */
export const distanciaOk = (a: Oklch, b: Oklch): number => {
  const ax = a.c * Math.cos((a.h * Math.PI) / 180);
  const ay = a.c * Math.sin((a.h * Math.PI) / 180);
  const bx = b.c * Math.cos((b.h * Math.PI) / 180);
  const by = b.c * Math.sin((b.h * Math.PI) / 180);
  return Math.hypot(a.l - b.l, ax - bx, ay - by);
};
