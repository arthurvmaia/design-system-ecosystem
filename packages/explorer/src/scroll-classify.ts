import { randomUUID } from 'node:crypto';
import type { Confidence, ScrollBehavior, ScrollBehaviorKind, ScrollKeyframe } from '@ds/shared';

/**
 * Classificação de comportamento de scroll — função PURA sobre amostras.
 *
 * A captura rola a página e, em pontos controlados, tira um "quadro" de cada
 * elemento relevante: onde está (x,y), quão visível, e os estilos computados que
 * revelam efeito de scroll (opacity, transform, filter, position, top, z-index).
 * Aqui, sem tocar no navegador, decidimos O QUE é cada mudança — reveal,
 * parallax, sticky, progressão de opacity/scale/blur, toggle de classe — e
 * montamos a representação portátil com keyframes e confiança. Diferencia
 * mudança causada pelo SCROLL de animação contínua sem relação (exige correlação
 * monotônica com o progresso, não só "mudou").
 *
 * O que não dá para medir com segurança (GSAP/Three) não é classificado aqui —
 * fica para o detector de runtime marcar como externo.
 */

/** Um quadro de um elemento num ponto de scroll. */
export type ScrollSample = {
  /** Progresso do scroll da página (0-1) neste quadro. */
  scrollProgress: number;
  /** Pixels rolados neste quadro (para taxas). */
  scrollY: number;
  visible: boolean;
  /** Retângulo relativo à viewport. */
  box: { x: number; y: number; w: number; h: number };
  opacity: number;
  /** translateX/Y e escala extraídos do `transform` computado. */
  tx: number;
  ty: number;
  scale: number;
  /** blur(px) extraído do `filter`. */
  blur: number;
  position: string;
  zIndex: string;
  classes: string[];
};

/** Amostras de UM elemento ao longo do scroll + como religá-lo a um segmento. */
export type ScrollElementSamples = {
  match: { id: string | null; classes: string[] };
  /** Altura da viewport, para julgar "entrou/saiu". */
  viewportH: number;
  samples: ScrollSample[];
};

// ── Parsers do computed (usados pelo sampler in-page e nos testes) ────────────

/** Extrai translateX/Y e escala de um `transform` computado (matrix/matrix3d/none). */
export const parseTransform = (t: string): { tx: number; ty: number; scale: number } => {
  if (!t || t === 'none') return { tx: 0, ty: 0, scale: 1 };
  const m = t.match(/matrix\(([^)]+)\)/);
  if (m?.[1]) {
    const p = m[1].split(',').map((x) => Number(x.trim()));
    return { tx: p[4] ?? 0, ty: p[5] ?? 0, scale: p[0] ?? 1 };
  }
  const m3 = t.match(/matrix3d\(([^)]+)\)/);
  if (m3?.[1]) {
    const p = m3[1].split(',').map((x) => Number(x.trim()));
    return { tx: p[12] ?? 0, ty: p[13] ?? 0, scale: p[0] ?? 1 };
  }
  return { tx: 0, ty: 0, scale: 1 };
};

/** Extrai o blur(px) de um `filter` computado. */
export const parseBlur = (f: string): number => {
  const m = f?.match(/blur\(([\d.]+)px\)/i);
  return m?.[1] ? Number(m[1]) : 0;
};

// ── Utilidades ────────────────────────────────────────────────────────────────

const min = (xs: number[]): number => xs.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
const max = (xs: number[]): number => xs.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);

/** Correlação monotônica grosseira: o quanto a série sobe OU desce sem zig-zag. */
const monotonicidade = (v: number[]): number => {
  if (v.length < 2) return 0;
  let sobe = 0;
  let desce = 0;
  for (let i = 1; i < v.length; i++) {
    const d = (v[i] ?? 0) - (v[i - 1] ?? 0);
    if (d > 0) sobe++;
    else if (d < 0) desce++;
  }
  const total = sobe + desce;
  return total === 0 ? 0 : Math.abs(sobe - desce) / total;
};

/** Easing aproximado a partir da forma da curva (só um rótulo indicativo). */
const easingAprox = (v: number[]): string => {
  if (v.length < 3) return 'linear';
  const ini = v[0] ?? 0;
  const fim = v[v.length - 1] ?? 0;
  const meio = v[Math.floor(v.length / 2)] ?? 0;
  const esperadoLinear = (ini + fim) / 2;
  const desvio = meio - esperadoLinear;
  const amplitude = Math.abs(fim - ini) || 1;
  if (Math.abs(desvio) / amplitude < 0.12) return 'linear';
  // Adiantou (perto do fim cedo) → ease-out; atrasou → ease-in.
  const sentido = fim >= ini ? 1 : -1;
  return desvio * sentido > 0 ? 'ease-out' : 'ease-in';
};

/** Monta keyframes a partir das amostras (progress local no intervalo + props). */
const montarKeyframes = (
  sub: ScrollSample[],
  props: (s: ScrollSample) => Record<string, string>,
): ScrollKeyframe[] => {
  const first = sub[0];
  const last = sub[sub.length - 1];
  if (!first || !last) return [];
  const p0 = first.scrollProgress;
  const p1 = last.scrollProgress;
  const span = p1 - p0 || 1;
  return sub.map((s) => ({
    progress: Math.min(1, Math.max(0, (s.scrollProgress - p0) / span)),
    properties: props(s),
  }));
};

const novoId = (): string => `scb_${randomUUID().replace(/-/g, '').slice(0, 16)}`;

const LIM = {
  opacity: 0.15,
  translate: 6,
  scale: 0.03,
  blur: 1,
};

const behavior = (
  kind: ScrollBehaviorKind,
  el: ScrollElementSamples,
  sub: ScrollSample[],
  over: Partial<ScrollBehavior>,
): ScrollBehavior => ({
  id: novoId(),
  kind,
  trigger: 'progress',
  target: { id: el.match.id, classes: el.match.classes },
  scrollContainer: 'window',
  start: sub[0]?.scrollProgress ?? 0,
  end: sub[sub.length - 1]?.scrollProgress ?? 0,
  keyframes: [],
  scrub: true,
  pin: false,
  confidence: 'media',
  limitations: [],
  ...over,
});

/**
 * Classifica os comportamentos de scroll de um elemento a partir das amostras.
 * Um elemento pode ter mais de um (ex.: fade + translate). Devolve `[]` quando
 * nada varia de forma correlacionada ao scroll.
 */
export const classificarScroll = (el: ScrollElementSamples): ScrollBehavior[] => {
  const out: ScrollBehavior[] = [];
  // Só amostras onde o elemento tem presença (perto da viewport) importam.
  const relev = el.samples.filter((s) => s.box.w > 0 && s.box.h > 0);
  if (relev.length < 2) return out;
  const q0 = relev[0];
  const qN = relev[relev.length - 1];
  if (!q0 || !qN) return out;

  // ── sticky/fixed: position preso durante um intervalo ──────────────────────
  const presos = relev.filter((s) => s.position === 'sticky' || s.position === 'fixed');
  if (presos.length >= 2) {
    out.push(
      behavior('sticky', el, presos, {
        trigger: 'sticky',
        scrub: false,
        pin: true,
        confidence: 'alta',
        limitations: ['Sticky aproximado: reproduzido como position:sticky no intervalo medido.'],
      }),
    );
  }

  // ── opacity: reveal (0→1 e fica) x viewport-hide x progress-opacity ─────────
  const ops = relev.map((s) => s.opacity);
  if (max(ops) - min(ops) >= LIM.opacity) {
    const kf = montarKeyframes(relev, (s) => ({ opacity: s.opacity.toFixed(3) }));
    const primeiro = ops[0] ?? 0;
    const ultimo = ops[ops.length - 1] ?? 0;
    const revela = primeiro < 0.3 && ultimo > 0.7;
    const esconde = primeiro > 0.7 && ultimo < 0.3;
    if (revela && monotonicidade(ops) > 0.6) {
      out.push(
        behavior('viewport-reveal', el, relev, {
          trigger: 'viewport',
          scrub: false,
          confidence: 'alta',
          keyframes: kf,
          easing: easingAprox(ops),
        }),
      );
    } else if (esconde && monotonicidade(ops) > 0.6) {
      out.push(
        behavior('viewport-hide', el, relev, {
          trigger: 'viewport',
          scrub: false,
          confidence: 'media',
          keyframes: kf,
        }),
      );
    } else {
      out.push(
        behavior('progress-opacity', el, relev, {
          scrub: true,
          confidence: monotonicidade(ops) > 0.5 ? 'media' : 'baixa',
          keyframes: kf,
          easing: easingAprox(ops),
        }),
      );
    }
  }

  // ── translateY variando com o scroll → parallax (scrub) ────────────────────
  const tys = relev.map((s) => s.ty);
  if (max(tys) - min(tys) >= LIM.translate && monotonicidade(tys) > 0.5) {
    out.push(
      behavior('parallax', el, relev, {
        scrub: true,
        confidence: 'media',
        keyframes: montarKeyframes(relev, (s) => ({
          transform: `translateY(${s.ty.toFixed(1)}px)`,
        })),
        easing: easingAprox(tys),
        limitations: ['Parallax aproximado por keyframes de translateY vinculados ao progresso.'],
      }),
    );
  }

  // ── scale variando → progress-scale ────────────────────────────────────────
  const scales = relev.map((s) => s.scale);
  if (max(scales) - min(scales) >= LIM.scale && monotonicidade(scales) > 0.5) {
    out.push(
      behavior('progress-scale', el, relev, {
        scrub: true,
        confidence: 'media',
        keyframes: montarKeyframes(relev, (s) => ({ transform: `scale(${s.scale.toFixed(3)})` })),
        easing: easingAprox(scales),
      }),
    );
  }

  // ── blur variando → progress-blur ──────────────────────────────────────────
  const blurs = relev.map((s) => s.blur);
  if (max(blurs) - min(blurs) >= LIM.blur && monotonicidade(blurs) > 0.5) {
    out.push(
      behavior('progress-blur', el, relev, {
        scrub: true,
        confidence: 'media',
        keyframes: montarKeyframes(relev, (s) => ({ filter: `blur(${s.blur.toFixed(1)}px)` })),
        easing: easingAprox(blurs),
      }),
    );
  }

  // ── classes que VARIAM ao longo do scroll → class-toggle ───────────────────
  // Compara todos os quadros (não só o primeiro/último): uma classe que aparece
  // em ALGUNS e some em outros é um toggle por viewport — mesmo que a fixture a
  // adicione ao entrar e remova ao sair (primeiro e último quadros iguais).
  const contagem = new Map<string, number>();
  for (const s of relev)
    for (const c of new Set(s.classes)) contagem.set(c, (contagem.get(c) ?? 0) + 1);
  const variam = [...contagem.entries()]
    .filter(([, n]) => n > 0 && n < relev.length)
    .map(([c]) => c);
  if (variam.length > 0) {
    const virada = relev.find((s) => variam.some((c) => s.classes.includes(c)));
    out.push(
      behavior('class-toggle', el, relev, {
        trigger: 'viewport',
        scrub: false,
        confidence: 'alta',
        classesAdicionadas: variam,
        start: virada?.scrollProgress ?? q0.scrollProgress,
        limitations: ['Toggle de classe reproduzido por IntersectionObserver no limiar medido.'],
      }),
    );
  }

  return out;
};

/** Confiança agregada de um conjunto de comportamentos (a pior). */
export const confiancaScroll = (bs: ScrollBehavior[]): Confidence => {
  const rank: Record<Confidence, number> = { alta: 3, media: 2, baixa: 1, nenhuma: 0 };
  if (bs.length === 0) return 'nenhuma';
  return bs.map((b) => b.confidence).reduce((a, b) => (rank[a] <= rank[b] ? a : b));
};
