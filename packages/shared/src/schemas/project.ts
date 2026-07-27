import { z } from 'zod';

export const ProjectStatus = z.enum([
  'draft',
  'ready-to-generate',
  'generating',
  'generated',
  'failed',
]);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/**
 * Versão dos JSONs persistidos do projeto (content/branding/layout). Sobe
 * quando a FORMA muda de um jeito que a leitura precisa distinguir; dados
 * antigos (sem o campo) são normalizados com defaults — nunca rejeitados.
 */
export const PROJECT_DATA_VERSION = 1;

/** Conteúdo textual fornecido pelo usuário. Estrutura semiaberta para caber vários formatos. */
export const ProjectContent = z.object({
  schemaVersion: z.number().int().positive().optional(),
  about: z.string().optional(),
  slogan: z.string().optional(),
  services: z.array(z.object({ title: z.string(), description: z.string() })).optional(),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })).optional(),
  cta: z.string().optional(),
  testimonials: z
    .array(z.object({ author: z.string(), role: z.string().optional(), quote: z.string() }))
    .optional(),
  /**
   * Copy por seção, chaveada pelo `SectionRole` do blueprint ("hero",
   * "features", ...). É o que o wizard coleta seção a seção e o que o gerador
   * usa como texto daquela dobra — em vez de inventar.
   */
  sections: z.record(z.string(), z.string()).optional(),
  custom: z.record(z.string(), z.unknown()).optional(),
});
export type ProjectContent = z.infer<typeof ProjectContent>;

/** Identidade visual e institucional do projeto. */
export const ProjectBranding = z.object({
  schemaVersion: z.number().int().positive().optional(),
  /** Nome da marca como aparece no site (pode diferir do nome do projeto). */
  brandName: z.string().optional(),
  /** Tom de voz: orienta o gerador a escrever/ajustar copy neste registro. */
  tone: z.string().optional(),
  logoPath: z.string().nullable().optional(),
  faviconPath: z.string().nullable().optional(),
  palette: z.object({
    primary: z.string(),
    secondary: z.string().optional(),
    background: z.string(),
    foreground: z.string(),
    accent: z.string().optional(),
  }),
  typography: z.object({
    display: z.string(),
    body: z.string(),
    mono: z.string().optional(),
  }),
  contact: z
    .object({
      email: z.string().optional(),
      phone: z.string().optional(),
      whatsapp: z.string().optional(),
      address: z.string().optional(),
    })
    .optional(),
  /** rede → URL. Ex.: { instagram: "https://..." }. */
  social: z.record(z.string(), z.string()).optional(),
  /** Chamada principal do site: rótulo do botão e para onde ele leva. */
  mainCta: z.object({ label: z.string().optional(), href: z.string().optional() }).optional(),
});
export type ProjectBranding = z.infer<typeof ProjectBranding>;

/** Item na manifest de mídias do projeto. */
export const MediaItem = z.object({
  path: z.string(),
  mimeType: z.string(),
  kind: z.enum(['image', 'video', 'logo', 'icon', '3d', 'lottie', 'mockup']),
  originalName: z.string(),
  alt: z.string().optional(),
  /**
   * Onde esta mídia entra no site: o `SectionRole` do slot ("hero",
   * "showcase", ...). É o que responde "esta imagem aparece onde?" sem
   * depender de o gerador adivinhar.
   */
  slotRole: z.string().optional(),
});
export type MediaItem = z.infer<typeof MediaItem>;

export const MediaManifest = z.array(MediaItem);
export type MediaManifest = z.infer<typeof MediaManifest>;

/** Entrada da tabela projects. */
export const ProjectRecord = z.object({
  id: z.string().startsWith('prj_'),
  name: z.string().min(1),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  contentJson: z.string().nullable(),
  brandingJson: z.string().nullable(),
  mediaManifestJson: z.string().nullable(),
  layoutJson: z.string().nullable(),
  status: ProjectStatus,
});
export type ProjectRecord = z.infer<typeof ProjectRecord>;

/** Relacionamento entre um projeto e um componente da library. */
export const ProjectComponentLink = z.object({
  projectId: z.string().startsWith('prj_'),
  componentId: z.string().startsWith('cmp_'),
  role: z.string(),
  position: z.number().int().nonnegative(),
});
export type ProjectComponentLink = z.infer<typeof ProjectComponentLink>;

// ── Defaults e normalização de leitura ───────────────────────────────────────
// A FONTE ÚNICA dos defaults de projeto: o server e o gerador leem daqui — não
// existe mais um default local em cada consumidor podendo divergir.

export const DEFAULT_PROJECT_CONTENT: ProjectContent = {
  about: 'Uma empresa moderna que resolve seu problema.',
  slogan: 'A solução que faltava',
  cta: 'Comece agora',
};

export const DEFAULT_PROJECT_BRANDING: ProjectBranding = {
  palette: { primary: '#7f1d1d', background: '#ffffff', foreground: '#0a0a0a' },
  typography: { display: 'Inter, sans-serif', body: 'Inter, sans-serif' },
};

const jsonSeguro = (raw: string | null): unknown => {
  if (raw === null || raw.trim().length === 0) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/**
 * Normaliza o JSON persistido de conteúdo: dado legado (sem versão) e dado
 * corrompido entram; sai SEMPRE um `ProjectContent` válido e carimbado.
 * (O comportamento antigo tinha um buraco real: JSON corrompido virava objeto
 * vazio em vez do default — a página saía sem texto nenhum, em silêncio.)
 */
export const normalizarProjectContent = (raw: string | null): ProjectContent => {
  const bruto = jsonSeguro(raw);
  if (bruto === null || typeof bruto !== 'object') {
    return { ...DEFAULT_PROJECT_CONTENT, schemaVersion: PROJECT_DATA_VERSION };
  }
  const tentado = ProjectContent.safeParse(bruto);
  const base = tentado.success ? tentado.data : DEFAULT_PROJECT_CONTENT;
  return { ...base, schemaVersion: PROJECT_DATA_VERSION };
};

/** Normaliza o branding persistido; paleta/tipografia ausentes caem no default. */
export const normalizarProjectBranding = (raw: string | null): ProjectBranding => {
  const bruto = jsonSeguro(raw);
  if (bruto === null || typeof bruto !== 'object') {
    return { ...DEFAULT_PROJECT_BRANDING, schemaVersion: PROJECT_DATA_VERSION };
  }
  const tentado = ProjectBranding.safeParse(bruto);
  if (tentado.success) return { ...tentado.data, schemaVersion: PROJECT_DATA_VERSION };
  // Parcial (legado incompleto): preserva o que der, completa com o default.
  const parcial = bruto as Partial<ProjectBranding>;
  return {
    ...DEFAULT_PROJECT_BRANDING,
    ...parcial,
    palette: { ...DEFAULT_PROJECT_BRANDING.palette, ...(parcial.palette ?? {}) },
    typography: { ...DEFAULT_PROJECT_BRANDING.typography, ...(parcial.typography ?? {}) },
    schemaVersion: PROJECT_DATA_VERSION,
  };
};
