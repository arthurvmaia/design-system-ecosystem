import type { ScrollBehavior } from '@ds/shared';
import type { ExplorerLimits } from './config.js';
import { buildCall } from './page-script.js';
import {
  type ScrollElementSamples,
  type ScrollSample,
  classificarScroll,
  parseBlur,
  parseTransform,
} from './scroll-classify.js';
import {
  SCROLL_HEIGHT_FN,
  SCROLL_MARK_FN,
  SCROLL_SAMPLE_FN,
  SCROLL_TO_FN,
} from './scroll-script.js';

/**
 * Amostragem de scroll — orquestra a rolagem em pontos controlados e transforma
 * os quadros crus em `ScrollBehavior[]` via o classificador puro.
 *
 * Estratégia (seção 3 do pedido): passa por pontos fixos (0/10/20/35/50/65/80/
 * 90/100%) e, adaptativamente, insere pontos onde houve MUDANÇA significativa
 * entre dois vizinhos — sem rolar pixel a pixel. Tudo sob o `AbortSignal` da fase
 * (o teto de tempo corta a amostragem e o que já foi medido permanece).
 *
 * Desacoplado do Playwright por uma interface mínima — testável com um fake.
 */

// biome-ignore lint/suspicious/noExplicitAny: evaluate é genérico por natureza
type Ava = (expr: string) => Promise<any>;
export type PaginaAmostravel = {
  evaluate: Ava;
  waitForTimeout: (ms: number) => Promise<void>;
};

type RawScrollSample = {
  ref: string;
  progress: number;
  scrollY: number;
  id: string | null;
  classes: string[];
  box: { x: number; y: number; w: number; h: number };
  opacity: string;
  transform: string;
  filter: string;
  position: string;
  top: string;
  zIndex: string;
  visible: boolean;
};

const PONTOS_FIXOS = [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 1.0];

/** Converte um quadro cru (strings do computed) num `ScrollSample` (números). */
const paraSample = (r: RawScrollSample): ScrollSample => {
  const t = parseTransform(r.transform);
  return {
    scrollProgress: r.progress,
    scrollY: r.scrollY,
    visible: r.visible,
    box: r.box,
    opacity: Number(r.opacity) || 0,
    tx: t.tx,
    ty: t.ty,
    scale: t.scale,
    blur: parseBlur(r.filter),
    position: r.position,
    zIndex: r.zIndex,
    classes: r.classes,
  };
};

/** Magnitude de mudança de um elemento entre dois quadros (para a adaptação). */
const delta = (a: ScrollSample, b: ScrollSample): number =>
  Math.abs(a.opacity - b.opacity) +
  Math.abs(a.ty - b.ty) / 50 +
  Math.abs(a.scale - b.scale) +
  Math.abs(a.blur - b.blur) / 10;

/**
 * Roda a amostragem e devolve os comportamentos classificados. `[]` quando a
 * página não rola ou nada varia.
 */
export const amostrarScroll = async (
  page: PaginaAmostravel,
  limits: ExplorerLimits,
  signal: AbortSignal,
  log: (evento: string, dados?: Record<string, unknown>) => void = () => {},
): Promise<ScrollBehavior[]> => {
  const marcados = (await page.evaluate(
    buildCall(SCROLL_MARK_FN, limits.maxScrollCandidates),
  )) as number;
  if (marcados === 0) return [];
  const alturaTotal = (await page.evaluate(buildCall(SCROLL_HEIGHT_FN))) as number;
  if (alturaTotal < 40) return []; // página não rola: sem efeito de scroll
  log('scroll-amostra', { candidatos: marcados, altura: alturaTotal });

  // ref → quadros acumulados (e identidade para religar ao segmento).
  const porRef = new Map<
    string,
    { id: string | null; classes: string[]; frames: ScrollSample[] }
  >();
  const fracsFeitas = new Set<number>();

  const amostrarEm = async (frac: number): Promise<void> => {
    const f = Math.round(frac * 1000) / 1000;
    if (fracsFeitas.has(f) || signal.aborted) return;
    fracsFeitas.add(f);
    const y = Math.round(f * alturaTotal);
    const realY = (await page.evaluate(buildCall(SCROLL_TO_FN, y))) as number;
    await page.waitForTimeout(limits.scrollSettleMs);
    const raw = (await page.evaluate(
      buildCall(SCROLL_SAMPLE_FN, { progress: f, scrollY: realY }),
    )) as RawScrollSample[];
    for (const r of raw) {
      const s = paraSample(r);
      const atual = porRef.get(r.ref);
      if (atual) atual.frames.push(s);
      else porRef.set(r.ref, { id: r.id, classes: r.classes, frames: [s] });
    }
  };

  // Passo 1: pontos fixos.
  for (const frac of PONTOS_FIXOS) {
    if (signal.aborted) break;
    await amostrarEm(frac);
  }

  // Passo 2: adaptação — insere o ponto médio no MAIOR salto entre vizinhos, até
  // o teto de amostras (ou o corte por tempo). Não rola pixel a pixel.
  let extras = 0;
  const maxExtras = Math.max(0, limits.maxScrollSamples - PONTOS_FIXOS.length);
  while (extras < maxExtras && !signal.aborted) {
    const fracs = [...fracsFeitas].sort((a, b) => a - b);
    let melhorGap = -1;
    let melhorSoma = 0;
    for (let i = 0; i < fracs.length - 1; i++) {
      const fa = fracs[i];
      const fb = fracs[i + 1];
      if (fa === undefined || fb === undefined || fb - fa < 0.03) continue; // já denso
      let soma = 0;
      for (const v of porRef.values()) {
        const a = v.frames.find((s) => s.scrollProgress === fa);
        const b = v.frames.find((s) => s.scrollProgress === fb);
        if (a && b) soma += delta(a, b);
      }
      if (soma > melhorSoma) {
        melhorSoma = soma;
        melhorGap = i;
      }
    }
    if (melhorGap < 0 || melhorSoma < 0.2) break; // nada digno de refinar
    const fa = fracs[melhorGap];
    const fb = fracs[melhorGap + 1];
    if (fa === undefined || fb === undefined) break;
    await amostrarEm((fa + fb) / 2);
    extras++;
  }

  // Volta ao topo — deixa a página no estado inicial para as fases seguintes.
  await page.evaluate(buildCall(SCROLL_TO_FN, 0));

  // Classifica cada elemento; junta tudo.
  const behaviors: ScrollBehavior[] = [];
  for (const v of porRef.values()) {
    const el: ScrollElementSamples = {
      match: { id: v.id, classes: v.classes },
      viewportH: 900,
      samples: [...v.frames].sort((a, b) => a.scrollProgress - b.scrollProgress),
    };
    behaviors.push(...classificarScroll(el));
  }
  log('scroll-amostra:fim', { pontos: fracsFeitas.size, comportamentos: behaviors.length });
  return behaviors;
};
