/**
 * Que categorias do kit atendem cada papel de seção — agora vem do shared
 * (vocabulário único com a sugestão automática e o gerador).
 */
export { ROLE_CATEGORIES as ROLE_CATS } from '@ds/shared/schemas';

import type {
  IdentidadeVerbal,
  LocalDeLogo,
  LogoVariante,
  PaletaDoProjeto,
  RedeSocial,
  TipografiaDoProjeto,
} from '@ds/shared/schemas';

export const mediaUrl = (prjId: string, path: string) =>
  `/api/projects/${prjId}/media/${encodeURIComponent(path)}`;

export type WizardBranding = {
  brandName: string;
  tone: string;
  primary: string;
  background: string;
  foreground: string;
  accent: string;
  fontDisplay: string;
  fontBody: string;
  logoPath: string | null;
  contact: { email: string; phone: string; whatsapp: string; address: string };
  social: Record<string, string>;
  mainCta: { label: string; href: string };
  // ── Modelo novo (A5). Os campos legados acima seguem como espelho para as
  // partes que ainda não migraram; o `toBranding` do wizard grava os dois.
  identidadeVerbal: IdentidadeVerbal;
  logos: LogoVariante[];
  logosLocais: Partial<Record<LocalDeLogo, string>>;
  paleta: PaletaDoProjeto;
  tipografia: TipografiaDoProjeto;
  sociais: RedeSocial[];
};

export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o controle vem por children; o <label> o envolve e a associação implícita vale em runtime.
    <label className="block">
      <span className="mb-1.5 block text-[12px] uppercase tracking-[0.18em]" style={rotulo}>
        {label}
      </span>
      {children}
    </label>
  );
}

// Fonte compartilhada dos tamanhos do wizard: com a moldura quase de tela
// cheia, os campos cresceram junto (rótulo 12px, texto 15px) para a tela não
// virar um formulário miúdo boiando num painel enorme.
export const INPUT =
  'w-full rounded-md border px-3.5 py-3 text-[15px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(56,189,248,0.25)]';

export const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
  color: 'var(--color-fg)',
  fontFamily: 'var(--font-body)',
};

export const rotulo: React.CSSProperties = {
  color: 'var(--color-fg-subtle)',
  fontFamily: 'var(--font-display)',
};
