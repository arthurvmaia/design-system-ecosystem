"use client";
/* eslint-disable @next/next/no-img-element -- as imagens vêm da rota local autenticada de assets do tema */

import { useState, type ReactNode } from "react";
import type { PreviewCardModel } from "@/app/preview-model";

/**
 * Cartão-base dos previews (Fase 2): mesma linguagem visual para Temas e
 * Projetos, no padrão da página de temas da Shopify — mídia grande em cima,
 * identificação e ações embaixo.
 *
 * Estados cobertos: imagem carregando (skeleton), imagem com erro ou ausente
 * (mock de vitrine pintado com a paleta REAL), sem dados (mock neutro).
 */
export function PreviewCard({ model, size = "media", actions, onOpen, children }: {
  model: PreviewCardModel;
  size?: "grande" | "media" | "lista";
  actions?: ReactNode;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const [imageState, setImageState] = useState<"loading" | "ok" | "erro">("loading");
  const showImage = Boolean(model.image) && imageState !== "erro";
  const paletteVars = {
    "--pc-bg": model.palette.background,
    "--pc-text": model.palette.text,
    "--pc-accent": model.palette.accent,
  } as React.CSSProperties;

  const media = (
    <div className={`preview-card-media ${showImage && imageState === "loading" ? "is-loading" : ""}`} style={paletteVars}>
      {showImage ? (
        <img
          src={model.image}
          alt={`Prévia de ${model.title}`}
          loading="lazy"
          onLoad={() => setImageState("ok")}
          onError={() => setImageState("erro")}
        />
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
