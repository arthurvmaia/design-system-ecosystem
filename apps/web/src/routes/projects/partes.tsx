/**
 * Que categorias do kit atendem cada papel de seção. Se o kit tem algo, aquele
 * slot é preenchido com peça sua; se não, será criado no estilo do kit. É o que
 * a etapa de estrutura mostra em cada slot, para não haver surpresa no resultado.
 */
export const ROLE_CATS: Record<string, string[]> = {
  nav: ['nav', 'header'],
  hero: ['hero'],
  logos: [],
  features: ['feature', 'card'],
  showcase: ['card'],
  stats: [],
  pricing: ['pricing'],
  testimonials: ['testimonial'],
  faq: ['faq'],
  about: [],
  team: [],
  gallery: ['card'],
  catalog: ['card'],
  contact: ['form'],
  cta: ['cta', 'button'],
  footer: ['footer'],
};

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
};

export function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o controle vem por children; o <label> o envolve e a associação implícita vale em runtime.
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
        {label}
      </span>
      {children}
    </label>
  );
}

export const INPUT =
  'w-full rounded-md border px-3 py-2 text-[13px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]';

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
