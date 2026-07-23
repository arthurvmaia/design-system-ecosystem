/**
 * Brasas — as "bolinhas" vermelhas que sobem devagar no fundo.
 *
 * Nascidas na intro, agora reaproveitadas como elemento de fundo do app inteiro.
 * Como o fundo roda o tempo todo, a eficiência importa: em vez de criar um
 * gradiente radial por partícula por frame (caro), pré-renderizamos UMA brasa
 * num sprite e só a desenhamos com `drawImage` e alfa variável. Isso mantém o
 * custo baixo mesmo com o loop sempre ligado.
 *
 * Devolve um `stop` que encerra o loop e solta os listeners.
 */

export type EmbersOpts = {
  /** Quantidade de brasas. */
  count?: number;
  /** Alfa máximo de cada brasa (0–1). Fundo do app pede valor baixo, discreto. */
  peakAlpha?: number;
  /** Desenhar também as duas luzes grandes à deriva? (a intro usa; o app já tem
   *  as `.ds-ambient` no Shell, então o fundo passa `false`). */
  glows?: boolean;
};

/** Uma brasa suave (gradiente radial crimson) pré-renderizada num sprite. */
const criarSprite = (): HTMLCanvasElement => {
  const s = document.createElement('canvas');
  const size = 64;
  s.width = size;
  s.height = size;
  const c = s.getContext('2d');
  if (c) {
    const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(224, 53, 53, 1)');
    g.addColorStop(0.4, 'rgba(224, 53, 53, 0.45)');
    g.addColorStop(1, 'rgba(224, 53, 53, 0)');
    c.fillStyle = g;
    c.fillRect(0, 0, size, size);
  }
  return s;
};

export const criarEmbers = (canvas: HTMLCanvasElement, opts: EmbersOpts = {}): (() => void) => {
  const count = opts.count ?? 60;
  const peakAlpha = opts.peakAlpha ?? 0.55;
  const comGlows = opts.glows ?? false;

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
  const resize = (): void => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
  };
  resize();
  window.addEventListener('resize', resize);
  const sprite = criarSprite();

  type P = { x: number; y: number; vy: number; vx: number; r: number; life: number; max: number };
  const nova = (espalhar: boolean): P => {
    const max = 3 + Math.random() * 4;
    return {
      x: Math.random() * canvas.width,
      y: espalhar ? Math.random() * canvas.height : canvas.height + Math.random() * 40 * dpr,
      vy: -(0.12 + Math.random() * 0.45) * dpr,
      vx: (Math.random() - 0.5) * 0.2 * dpr,
      r: (1.2 + Math.random() * 2.6) * dpr,
      life: espalhar ? Math.random() * max : 0,
      max,
    };
  };
  const parts: P[] = Array.from({ length: count }, () => nova(true));

  let raf = 0;
  let rodando = true;
  const t0 = performance.now();
  const frame = (): void => {
    if (!rodando) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (comGlows) {
      const t = (performance.now() - t0) / 1000;
      const glow = (cx: number, cy: number, raio: number, alpha: number): void => {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, raio);
        g.addColorStop(0, `rgba(138, 26, 26, ${alpha})`);
        g.addColorStop(1, 'rgba(138, 26, 26, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      };
      glow(
        canvas.width * (0.3 + 0.06 * Math.sin(t * 0.3)),
        canvas.height * (0.28 + 0.05 * Math.cos(t * 0.24)),
        canvas.width * 0.42,
        0.16,
      );
      glow(
        canvas.width * (0.72 + 0.05 * Math.cos(t * 0.21)),
        canvas.height * (0.7 + 0.05 * Math.sin(t * 0.19)),
        canvas.width * 0.5,
        0.12,
      );
    }

    for (const p of parts) {
      p.life += 0.016;
      p.x += p.vx;
      p.y += p.vy;
      p.vy -= 0.0005 * dpr;
      if (p.life >= p.max || p.y < -30 * dpr) Object.assign(p, nova(false));
      const a = Math.sin(Math.min(1, p.life / p.max) * Math.PI) * peakAlpha;
      const d = p.r * 5;
      ctx.globalAlpha = a;
      ctx.drawImage(sprite, p.x - d / 2, p.y - d / 2, d, d);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  return () => {
    rodando = false;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
  };
};
