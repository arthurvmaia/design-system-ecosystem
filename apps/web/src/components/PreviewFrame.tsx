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
  // 1440 é a largura da viewport que o motor usa para capturar. Renderizar em
  // 1280 reflui o layout e corta texto grande: o hero aparecia com a primeira
  // letra fora do quadro. Mesma largura da captura, mesmo desenho do print.
  virtualWidth = 1440,
  interactive = false,
  autoHeight = false,
  ajuste = 'largura',
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
  /**
   * Como o documento se encaixa no quadro.
   *
   * - `largura`: reduz até caber na largura e recorta a altura. Serve quando o
   *   quadro cresce junto (o detalhe).
   * - `conter`: reduz até o conteúdo INTEIRO caber, e centraliza. É o que a
   *   grade usa: todos os cards com a mesma altura e nada cortado. Uma barra de
   *   navegação de 80px aparece grande e centrada; uma seção de 3000px aparece
   *   inteira, menor.
   */
  ajuste?: 'largura' | 'conter';
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [alturaConteudo, setAlturaConteudo] = useState<number | null>(null);

  // A altura chega do próprio documento. Origem opaca (sandbox sem
  // allow-same-origin) não dá para conferir, então a checagem é a janela que
  // enviou ser a DESTE iframe: nenhum outro documento consegue forjar isso.
  useEffect(() => {
    if (!autoHeight && ajuste !== 'conter') return;
    const onMsg = (e: MessageEvent) => {
      if (frame.current === null || e.source !== frame.current.contentWindow) return;
      const dado = e.data as { tipo?: unknown; altura?: unknown } | null;
      if (dado?.tipo !== 'ds-preview-altura' || typeof dado.altura !== 'number') return;
      if (Number.isFinite(dado.altura)) setAlturaConteudo(dado.altura);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [autoHeight, ajuste]);

  // Troca de documento recomeça a medição — senão a altura do anterior fica.
  useEffect(() => setAlturaConteudo(null), []);

  // Guarda a caixa do quadro. O modo `conter` precisa da ALTURA também, para
  // decidir o quanto reduzir; o modo `largura` usa só a largura, como antes.
  const [caixa, setCaixa] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      const w = r?.width ?? el.clientWidth;
      const h = r?.height ?? el.clientHeight;
      if (w > 0) setCaixa({ w, h });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const conter = ajuste === 'conter';
  // Altura do documento: a medida real quando ela chega, senão a proporção.
  const virtualHeight = alturaConteudo ?? Math.round(virtualWidth / aspect);

  const escalaLargura = caixa.w > 0 ? caixa.w / virtualWidth : 0;
  // `conter` reduz pelo lado mais apertado, então o documento inteiro entra.
  const escala =
    conter && caixa.h > 0 ? Math.min(escalaLargura, caixa.h / virtualHeight) : escalaLargura;

  // Centraliza o que sobrou de folga. Sem isto, conteúdo curto ficaria colado no
  // topo à esquerda e o card pareceria vazio.
  const sobraX = conter ? Math.max(0, (caixa.w - virtualWidth * escala) / 2) : 0;
  const sobraY = conter ? Math.max(0, (caixa.h - virtualHeight * escala) / 2) : 0;

  // Fora do modo `conter`, o quadro cresce com o documento (detalhe).
  const alturaDoQuadro =
    !conter && autoHeight && alturaConteudo !== null
      ? Math.round(alturaConteudo * escalaLargura)
      : null;

  return (
    <div
      ref={wrap}
      className={`relative overflow-hidden ${className ?? ''}`}
      style={
        alturaDoQuadro === null
          ? { aspectRatio: String(aspect), backgroundColor: 'var(--color-obsidian-0)' }
          : { height: alturaDoQuadro, backgroundColor: 'var(--color-obsidian-0)' }
      }
    >
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.03)' }}
          aria-hidden
        />
      )}
      {visible && escala > 0 && (
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
            transform: `translate(${sobraX}px, ${sobraY}px) scale(${escala})`,
            pointerEvents: interactive ? 'auto' : 'none',
          }}
        />
      )}
    </div>
  );
}
