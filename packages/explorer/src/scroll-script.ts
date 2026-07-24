/**
 * Instrumentação in-page da amostragem de SCROLL.
 *
 * Roda DENTRO da página (string, não TS): marca os elementos candidatos a ter
 * efeito de scroll e, a cada ponto de rolagem, lê um "quadro" de cada um —
 * geometria (x,y,w,h) e os computados que revelam o efeito (opacity, transform,
 * filter, position, top, z-index) + classes e visibilidade. O julgamento (o que
 * é reveal/parallax/sticky) fica no módulo puro `scroll-classify`, em Node.
 *
 * Genérico: a seleção usa tamanho, semântica e PADRÕES de classe comuns de
 * animação por scroll (reveal/parallax/fade/aos/sticky…) — nunca nome de site.
 */

/**
 * Marca até `maxEls` candidatos com `data-dsx-scroll="i"`, priorizando os que dão
 * pista de efeito (classe de animação/scroll, atributos data-scroll/aos), depois
 * seções, depois área. `(maxEls) => number` (quantos marcou).
 */
export const SCROLL_MARK_FN = `
(maxEls) => {
  const vh = innerHeight, vw = innerWidth;
  const HINT = /(reveal|parallax|fade|slide-?in|animate|aos|inview|in-view|scroll|sticky|pin|gsap|data-scroll)/i;
  const cands = [];
  for (const el of document.querySelectorAll('body *')) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta' || tag === 'br') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 48 || r.height < 18) continue;                 // fino/estreito demais
    if (r.width * r.height < 2000) continue;                     // área mínima absoluta
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const cls = el.getAttribute('class') || '';
    const attrs = el.getAttributeNames().join(' ');
    let score = 0;
    if (HINT.test(cls) || HINT.test(attrs)) score += 10;
    if (cs.position === 'sticky' || cs.position === 'fixed') score += 8;
    if (['section','article','header','footer','aside','figure'].includes(tag)) score += 3;
    if (cs.transform && cs.transform !== 'none') score += 2;
    if ((cs.filter||'').includes('blur')) score += 2;
    score += Math.min(3, (r.width * r.height) / (vw * vh)); // área relativa
    cands.push({ el, score });
  }
  cands.sort((a, b) => b.score - a.score);
  const n = Math.min(cands.length, maxEls);
  for (let i = 0; i < n; i++) cands[i].el.setAttribute('data-dsx-scroll', String(i));
  return n;
}`;

/**
 * Lê um quadro de todos os elementos marcados no scroll ATUAL.
 * `({progress, scrollY}) => RawScrollSample[]`.
 */
export const SCROLL_SAMPLE_FN = `
(arg) => {
  const progress = arg.progress, scrollY = arg.scrollY;
  const vh = innerHeight;
  const out = [];
  for (const el of document.querySelectorAll('[data-dsx-scroll]')) {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push({
      ref: el.getAttribute('data-dsx-scroll'),
      progress: progress,
      scrollY: scrollY,
      id: el.getAttribute('id'),
      classes: (el.getAttribute('class') || '').split(/\\s+/).filter(Boolean),
      box: { x: r.x, y: r.y, w: r.width, h: r.height },
      opacity: cs.opacity,
      transform: cs.transform,
      filter: cs.filter,
      position: cs.position,
      top: cs.top,
      zIndex: cs.zIndex,
      visible: r.top < vh && r.bottom > 0 && cs.visibility !== 'hidden' && cs.display !== 'none',
    });
  }
  return out;
}`;

/** Altura rolável total da página. `() => number`. */
export const SCROLL_HEIGHT_FN = `
() => Math.max(0, (document.documentElement.scrollHeight || document.body.scrollHeight) - innerHeight)`;

/** Rola para uma posição absoluta (px) e devolve o scrollY real. `(y) => number`. */
export const SCROLL_TO_FN = `
(y) => { window.scrollTo(0, y); return window.scrollY || window.pageYOffset || 0; }`;
