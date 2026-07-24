/**
 * Decisão automática de profundidade da exploração — função pura.
 *
 * A extração normal decide sozinha se roda a varredura profunda (descoberta de
 * estados interativos), sem o usuário escolher. A política é simples e
 * verificável: procura, no HTML JÁ RENDERIZADO, sinais de que a página tem
 * comportamento que a varredura estática não explica (canvas, WebGL, Lottie,
 * GSAP, sticky, scroll-runtimes, cursor custom, muitos scripts…). Cada sinal
 * encontrado vira um "motivo" registrado no manifesto.
 *
 * Não é o grafo avançado — é o gatilho honesto que liga a captura profunda no
 * caso certo e a deixa desligada onde ela só custaria tempo.
 */

export type DepthMode = 'auto' | 'force' | 'off';

export type DepthDecision = { deep: boolean; reasons: string[] };

/** Cada sinal: um rótulo (motivo) e um teste no HTML. */
const SINAIS: Array<[string, RegExp]> = [
  ['canvas', /<canvas[\s>]/i],
  ['webgl/three', /\b(webgl2?|three(?:\.min)?\.js|THREE\.|createShader|gl_frag)\b/i],
  ['lottie', /<lottie-player|\blottie(?:-web)?\b|dotlottie/i],
  ['gsap/scrolltrigger', /\bgsap\b|ScrollTrigger|TweenMax|TimelineMax/i],
  ['smooth-scroll', /\b(lenis|locomotive-scroll|LocomotiveScroll|data-scroll)\b/i],
  ['sticky', /position\s*:\s*sticky|\bsticky\b(?![\w-])|data-sticky/i],
  ['swiper/carousel', /\bswiper\b|\bembla\b|\bsplide\b|data-carousel/i],
  ['video-interativo', /<video[^>]*\b(autoplay|data-scroll|playsinline)/i],
  ['cursor-custom', /cursor\s*:\s*none|custom-cursor|data-cursor|magnetic/i],
  ['parallax', /parallax|data-speed|data-depth|rellax/i],
  ['framer-motion', /framer-motion|data-framer/i],
  // Estado interativo DESCOBRÍVEL: accordion, tabs, dropdown, modal — o que a
  // exploração profunda existe para encenar. Sinais estruturais (ARIA/data),
  // específicos o bastante para não disparar em qualquer página estática.
  [
    'estados-interativos',
    /aria-expanded|role=["']tab["']|role=["']dialog["']|aria-haspopup|data-(toggle|accordion|tab|modal|dropdown|collapse|state|drawer|popover)/i,
  ],
  ['overlay', /class=["'][^"']*\b(modal|dropdown|drawer|popover|offcanvas|lightbox|dialog)\b/i],
  ['scroll-reveal', /IntersectionObserver|data-(aos|reveal|inview|scroll-reveal)/i],
  ['muitos-scripts', /(<script\b[\s\S]*?){12,}/i],
];

/**
 * Decide a profundidade a partir do HTML renderizado. No modo `auto`, procura os
 * sinais; `force` sempre profunda; `off` sempre rápida.
 */
export const decidirProfundidade = (html: string, mode: DepthMode = 'auto'): DepthDecision => {
  if (mode === 'off') return { deep: false, reasons: [] };
  if (mode === 'force') return { deep: true, reasons: ['forçado'] };

  const reasons: string[] = [];
  for (const [motivo, padrao] of SINAIS) {
    if (padrao.test(html)) reasons.push(motivo);
  }
  return { deep: reasons.length > 0, reasons };
};

/** Lê o modo do ambiente (`DS_EXPLORER_DEPTH`), default `auto`. Para dev/testes. */
export const resolveDepthMode = (): DepthMode => {
  const raw = (process.env.DS_EXPLORER_DEPTH ?? '').trim().toLowerCase();
  if (raw === 'force' || raw === 'deep') return 'force';
  if (raw === 'off' || raw === 'quick') return 'off';
  return 'auto';
};
