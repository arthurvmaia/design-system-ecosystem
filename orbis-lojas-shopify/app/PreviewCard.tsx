"use client";
/* eslint-disable @next/next/no-img-element -- as imagens vêm da rota local autenticada de assets do tema */

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PreviewCardModel } from "@/app/preview-model";

/* O HTML da home é buscado uma vez por origem e reaproveitado entre cards e
   re-renders; o cap evita crescer sem limite numa sessão longa. */
const homeHtmlCache = new Map<string, string>();
const HOME_CACHE_MAX = 24;

/**
 * Miniatura REAL (recuperação, fase 2): a MESMA home que o editor abre,
 * renderizada pelo MESMO motor Liquid (GET /api/theme-render), reduzida em
 * escala para caber no card — nunca uma aproximação geométrica.
 *
 * Disciplinas: carrega só quando o card entra na viewport (lazy), o HTML é
 * cacheado por URL, o iframe é inerte (pointer-events none + tabIndex -1) e
 * os estados carregando/erro são declarados, com tentar de novo.
 */
export function RealHomeThumbnail({ src, title, baseWidth = 1280 }: { src: string; title: string; baseWidth?: number }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState({ scale: 0, height: 0 });
  const [html, setHtml] = useState<string | null>(homeHtmlCache.get(src) ?? null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  /**
   * Carregamento tardio que NÃO depende só do IntersectionObserver: em aba
   * oculta ou sem composição de quadros ele nunca reporta interseção, e a
   * miniatura ficaria presa em "carregando" para sempre. A geometria decide;
   * o observer é só o gatilho barato para quem entra depois.
   */
  useEffect(() => {
    const host = hostRef.current;
    if (!host || visible) return;
    const MARGEM = 300;
    const perto = () => {
      const rect = host.getBoundingClientRect();
      return rect.bottom > -MARGEM && rect.top < (window.innerHeight || 0) + MARGEM;
    };
    const checar = () => { if (perto()) setVisible(true); };
    checar();
    const observer = new IntersectionObserver(checar, { rootMargin: `${MARGEM}px` });
    observer.observe(host);
    window.addEventListener("scroll", checar, { passive: true, capture: true });
    window.addEventListener("resize", checar, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", checar, { capture: true });
      window.removeEventListener("resize", checar);
    };
  }, [visible]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const apply = () => setFrame({ scale: host.clientWidth / baseWidth, height: host.clientHeight });
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(host);
    return () => observer.disconnect();
  }, [baseWidth]);

  useEffect(() => {
    if (!visible || html) return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(src);
        if (!response.ok) throw new Error(String(response.status));
        const text = await response.text();
        homeHtmlCache.set(src, text);
        if (homeHtmlCache.size > HOME_CACHE_MAX) {
          const oldest = homeHtmlCache.keys().next().value;
          if (oldest) homeHtmlCache.delete(oldest);
        }
        if (!cancelled) { setHtml(text); setFailed(false); }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [visible, html, src, attempt]);

  const ready = html !== null && frame.scale > 0;
  return (
    <div ref={hostRef} className={`home-thumb ${!ready && !failed ? "is-loading" : ""}`} role="img" aria-label={`Prévia real da página inicial de ${title}`}>
      {failed ? (
        <div className="home-thumb-error">
          <p>A prévia desta home não pôde ser gerada.</p>
          <button type="button" className="secondary-button" onClick={() => { homeHtmlCache.delete(src); setFailed(false); setHtml(null); setAttempt((count) => count + 1); }}>Tentar de novo</button>
        </div>
      ) : ready ? (
        <iframe
          className="home-thumb-frame"
          title={`Prévia real de ${title}`}
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
          srcDoc={html}
          style={{ width: baseWidth, height: frame.height / frame.scale, transform: `scale(${frame.scale})` }}
        />
      ) : null}
    </div>
  );
}

/**
 * Cartão-base dos previews (Fase 2): mesma linguagem visual para Temas e
 * Projetos, no padrão da página de temas da Shopify — mídia grande em cima,
 * identificação e ações embaixo.
 *
 * Estados cobertos: imagem carregando (skeleton), imagem com erro ou ausente
 * (mock de vitrine pintado com a paleta REAL), sem dados (mock neutro).
 */
export function PreviewCard({ model, size = "media", actions, onOpen, homeSrc, unavailableReason, children }: {
  model: PreviewCardModel;
  size?: "grande" | "media" | "lista";
  actions?: ReactNode;
  onOpen?: () => void;
  /** URL do render REAL da home (GET /api/theme-render?…). Quando presente, a
   *  mídia é a home verdadeira em escala — nunca o mock. */
  homeSrc?: string;
  /** Sem home renderizável: o motivo aparece declarado — nada de wireframe fingindo ser preview. */
  unavailableReason?: string;
  children?: ReactNode;
}) {
  const [imageState, setImageState] = useState<"loading" | "ok" | "erro">("loading");
  const showImage = !homeSrc && Boolean(model.image) && imageState !== "erro";
  const paletteVars = {
    "--pc-bg": model.palette.background,
    "--pc-text": model.palette.text,
    "--pc-accent": model.palette.accent,
  } as React.CSSProperties;

  const media = (
    <div className={`preview-card-media ${showImage && imageState === "loading" ? "is-loading" : ""}`} style={paletteVars}>
      {homeSrc ? (
        <RealHomeThumbnail src={homeSrc} title={model.title} />
      ) : showImage ? (
        <img
          src={model.image}
          alt={`Prévia de ${model.title}`}
          loading="lazy"
          onLoad={() => setImageState("ok")}
          onError={() => setImageState("erro")}
        />
      ) : unavailableReason ? (
        <div className="home-thumb-error preview-unavailable"><p>{unavailableReason}</p></div>
      ) : (
        <PreviewMock title={model.title} />
      )}
      {model.badge && <span className="preview-card-badge">{model.badge}</span>}
    </div>
  );

  return (
    <article className={`preview-card preview-card-${size}`} aria-label={`${model.title}${model.status ? `, ${model.status.label}` : ""}`}>
      {onOpen ? (
        <button type="button" className="preview-card-open" onClick={onOpen} aria-label={`Abrir ${model.title}`}>
          {media}
        </button>
      ) : media}
      <div className="preview-card-body">
        <div className="preview-card-head">
          <h3>{model.title}</h3>
          {model.status && <span className={`preview-card-status tone-${model.status.tone}`}>{model.status.label}</span>}
        </div>
        {model.subtitle && <p className="preview-card-subtitle">{model.subtitle}</p>}
        {model.meta.length > 0 && <div className="preview-card-meta">{model.meta.map((item) => <span key={item}>{item}</span>)}</div>}
        {children}
        {actions && <div className="preview-card-actions">{actions}</div>}
      </div>
    </article>
  );
}

/** Vitrine em miniatura com a paleta real — o fallback quando não há foto. */
function PreviewMock({ title }: { title: string }) {
  return (
    <div className="preview-card-mock" aria-hidden="true">
      <div className="pcm-browser"><span /><span /><span /><i /></div>
      <div className="pcm-store">
        <b>{title}</b>
        <div className="pcm-hero"><em /><div><strong /><small /><u /></div></div>
        <div className="pcm-products"><span /><span /><span /></div>
      </div>
    </div>
  );
}

/** Esqueleto do cartão, para listas ainda carregando. */
export function PreviewCardSkeleton({ size = "media" }: { size?: "grande" | "media" | "lista" }) {
  return (
    <article className={`preview-card preview-card-${size} preview-card-skeleton`} aria-hidden="true">
      <div className="preview-card-media is-loading" />
      <div className="preview-card-body">
        <div className="pcs-line" style={{ width: "55%" }} />
        <div className="pcs-line" style={{ width: "35%" }} />
      </div>
    </article>
  );
}
