import { useEffect, useRef, useState } from 'react';

/**
 * Prévia fiel de um segmento ou componente.
 *
 * O documento vem pronto do server (`/api/preview/...`): head real com scripts,
 * atributos do body, base para o vault. Aqui só o exibimos, e a segurança está
 * no `sandbox="allow-scripts"` SEM `allow-same-origin` — o Tailwind CDN compila,
 * o Lucide desenha, as animações rodam, mas o documento tem origem opaca e não
 * alcança o app.
 *
 * O documento é uma página inteira; para caber num card, renderizamos num
 * "canvas virtual" de `virtualWidth` px e reduzimos por `scale` até a largura
 * real. Lazy de verdade: o iframe só monta quando entra na viewport, senão uma
 * galeria grande dispararia dezenas de documentos de uma vez.
 */
export function PreviewFrame({
  src,
  title,
  aspect = 16 / 10,
  virtualWidth = 1280,
  interactive = false,
  className,
}: {
  src: string;
  title: string;
  /** proporção do quadro (largura / altura). */
  aspect?: number;
  /** largura do documento antes de escalar. */
  virtualWidth?: number;
  /** no card, false (cliques passam para o card); no modal, true. */
  interactive?: boolean;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? el.clientWidth;
      if (w > 0) setScale(w / virtualWidth);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [virtualWidth]);

  useEffect(() => {
    const el = wrap.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: '250px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  const virtualHeight = Math.round(virtualWidth / aspect);

  return (
    <div
      ref={wrap}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={{ aspectRatio: String(aspect), backgroundColor: 'var(--color-obsidian-0)' }}
    >
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
          aria-hidden
        />
      )}
      {visible && scale > 0 && (
        <iframe
          title={title}
          src={src}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          sandbox="allow-scripts"
          className="absolute top-0 left-0 origin-top-left border-0"
          style={{
            width: virtualWidth,
            height: virtualHeight,
            transform: `scale(${scale})`,
            pointerEvents: interactive ? 'auto' : 'none',
          }}
        />
      )}
    </div>
  );
}
