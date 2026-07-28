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
  autoHeight = false,
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
  /**
   * Cresce até a altura real do conteúdo, em vez de recortar na proporção.
   *
   * Na grade o recorte é proposital — cards de altura igual. No detalhe não:
   * uma seção alta aparecia cortada e não havia como ver o resto. O documento
   * de preview informa a própria altura; enquanto não informa, vale a
   * proporção, então nada pisca nem quebra em preview que não reporta
   * (replay e scroll têm palco próprio).
   */
  autoHeight?: boolean;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [alturaConteudo, setAlturaConteudo] = useState<number | null>(null);

  // A altura chega do próprio documento. Origem opaca (sandbox sem
  // allow-same-origin) não dá para conferir, então a checagem é a janela que
  // enviou ser a DESTE iframe — nenhum outro documento consegue forjar isso.
  useEffect(() => {
    if (!autoHeight) return;
    const onMsg = (e: MessageEvent) => {
      if (frame.current === null || e.source !== frame.current.contentWindow) return;
      const dado = e.data as { tipo?: unknown; altura?: unknown } | null;
      if (dado?.tipo !== 'ds-preview-altura' || typeof dado.altura !== 'number') return;
      if (Number.isFinite(dado.altura)) setAlturaConteudo(dado.altura);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [autoHeight]);

  // Troca de documento recomeça a medição — senão a altura do anterior fica.
  useEffect(() => setAlturaConteudo(null), []);

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

  const medida = autoHeight ? alturaConteudo : null;
  const virtualHeight = medida ?? Math.round(virtualWidth / aspect);

  return (
    <div
      ref={wrap}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={
        medida === null
          ? { aspectRatio: String(aspect), backgroundColor: 'var(--color-obsidian-0)' }
          : // Com a altura real, o quadro acompanha o documento reduzido.
            { height: Math.round(medida * scale), backgroundColor: 'var(--color-obsidian-0)' }
      }
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
          ref={frame}
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
