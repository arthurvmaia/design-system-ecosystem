import { criarEmbers } from '@/lib/embers';
import { useEffect, useRef } from 'react';

/**
 * Brasas de fundo do app.
 *
 * Um canvas fixo cobrindo a viewport, ATRÁS de tudo (z-0, sem capturar ponteiro).
 * As mesmas "bolinhas" que sobem na intro, agora como elemento vivo do fundo em
 * todas as telas — vistas através dos painéis de vidro, como as manchas de luz
 * `.ds-ambient`. Discretas de propósito: são fundo, não conteúdo.
 *
 * Sem as duas luzes grandes (`glows: false`): essas o Shell já provê via
 * `.ds-ambient`. Respeita "reduzir movimento": nesse caso não anima (e o CSS
 * esconde o canvas). O requestAnimationFrame já pausa sozinho em aba oculta.
 */
export function AmbientEmbers() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = ref.current;
    if (!cv || reduzido) return;
    return criarEmbers(cv, { count: 48, peakAlpha: 0.5, glows: false });
  }, []);

  return (
    <canvas
      ref={ref}
      className="ds-embers pointer-events-none fixed inset-0 h-full w-full"
      style={{ zIndex: 0 }}
    />
  );
}
