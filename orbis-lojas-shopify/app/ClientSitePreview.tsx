"use client";
/* eslint-disable @next/next/no-img-element -- a logo é um data URI local do próprio cliente */

import { SECTION_LABELS } from "@/lib/site-generator.mjs";

/**
 * Prévia do fluxo do cliente (Fase 5): representa o site que o gerador vai
 * montar — as MESMAS seções do modelo escolhido, pintadas com a MESMA marca
 * que alimenta o gerador (`sanitizeBrand` usa estes campos). Só textos da
 * marca aparecem; seções sem conteúdo do cliente são blocos estruturais com o
 * nome real da seção — nada de copy inventada.
 *
 * Fonte dos dados: a etapa "Sua marca" deste fluxo. A integração com a área de
 * Marca do app de design system está registrada como pendência no
 * docs/plano-editor-visual.md (a API de lá exige a sessão do portal).
 */
export type ClientPreviewBrand = {
  name: string;
  slogan: string;
  description: string;
  primaryColor: string;
  backgroundColor: string;
  whatsapp: string;
  instagram: string;
  email: string;
  logoDataUri: string;
};

export function ClientSitePreview({ brand, sections }: { brand: ClientPreviewBrand; sections: readonly string[] }) {
  const name = brand.name.trim() || "Minha Marca";
  const usingFallbackName = !brand.name.trim();
  const contacts = [brand.whatsapp, brand.instagram, brand.email].map((value) => value.trim()).filter(Boolean);
  const vars = { "--csp-accent": brand.primaryColor, "--csp-bg": brand.backgroundColor } as React.CSSProperties;

  return (
    <div className="client-site-preview" style={vars} role="img" aria-label={`Prévia do site de ${name}: ${sections.map((section) => SECTION_LABELS[section as keyof typeof SECTION_LABELS] ?? section).join(", ")}`}>
      <div className="csp-browser" aria-hidden="true"><span /><span /><span /><i /></div>
      <div className="csp-frame">
        {sections.map((section) => {
          const label = SECTION_LABELS[section as keyof typeof SECTION_LABELS] ?? section;
          if (section === "announcement") return <div key={section} className="csp-announcement" aria-hidden="true"><i /></div>;
          if (section === "header") return (
            <div key={section} className="csp-header">
              {brand.logoDataUri ? <img src={brand.logoDataUri} alt="" /> : <b className={usingFallbackName ? "csp-placeholder" : ""}>{name}</b>}
              <span aria-hidden="true"><i /><i /><i /></span>
            </div>
          );
          if (section === "hero") return (
            <div key={section} className="csp-hero">
              <strong className={usingFallbackName ? "csp-placeholder" : ""}>{name}</strong>
              {brand.slogan.trim() && <em>{brand.slogan.trim()}</em>}
              {brand.description.trim() && <p>{brand.description.trim()}</p>}
              <u aria-hidden="true" />
            </div>
          );
          if (section === "footer") return (
            <div key={section} className="csp-footer">
              <b>{name}</b>
              {contacts.length > 0 ? <p>{contacts.join(" · ")}</p> : <p className="csp-placeholder">contatos aparecem aqui</p>}
            </div>
          );
          return (
            <div key={section} className="csp-section" data-kind={section}>
              <small>{label}</small>
              <span aria-hidden="true"><i /><i /><i /></span>
            </div>
          );
        })}
      </div>
      <p className="csp-note">Prévia estrutural com a sua marca aplicada; o site final sai com estas seções.</p>
    </div>
  );
}
