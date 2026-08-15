/**
 * Fundação dos previews (programa de fases, Fase 2).
 *
 * Uma única camada normaliza Tema e Projeto para o mesmo contrato visual
 * (`PreviewCardModel`), sempre a partir de dados REAIS: a foto eleita na
 * importação quando existe, senão a paleta verdadeira do tema (color schemes /
 * settings globais). Nada aqui inventa imagem ou cor.
 */
import { normalizeCustomization } from "../lib/business-rules.mjs";
import { themePalette, type PreviewPalette } from "./ShopifyStorePreview";
import type { Project, Theme } from "../lib/types";
import type { ShopifyThemeImport } from "../lib/shopify-theme";

export type PreviewStatusTone = "ok" | "info" | "warn" | "error";

export type PreviewCardModel = {
  id: string;
  title: string;
  subtitle?: string;
  /** URL da imagem real (assetPreview eleito na importação); usada só quando a home não é renderizável. */
  image?: string;
  /** A home REAL pode ser renderizada pelo motor Liquid (ZIP preservado)? */
  renderable: boolean;
  palette: PreviewPalette;
  badge?: string;
  status?: { label: string; tone: PreviewStatusTone };
  meta: string[];
  updatedAt?: string;
};

function shopifyOf(source: Record<string, unknown> | undefined): { shopify: ShopifyThemeImport | null; customization: ReturnType<typeof normalizeCustomization> } {
  const customization = normalizeCustomization(source);
  return { shopify: customization.shopify as ShopifyThemeImport | null, customization };
}

function paletteOf(shopify: ShopifyThemeImport | null, customization: ReturnType<typeof normalizeCustomization>): PreviewPalette {
  if (shopify) return themePalette(shopify.globalValues);
  return { background: customization.hero.background, text: customization.hero.textColor, accent: customization.hero.accentColor };
}

export function previewFromTheme(theme: Theme): PreviewCardModel {
  const { shopify, customization } = shopifyOf(theme.defaultSettings);
  const fora = shopify?.assetsForaDaInstalacao ?? [];
  return {
    id: theme.id,
    title: theme.name,
    subtitle: shopify?.compatibility?.architecture ?? theme.category,
    image: shopify?.assetPreview,
    renderable: Boolean(shopify?.compatibility?.preservedSource),
    palette: paletteOf(shopify, customization),
    badge: theme.badge ?? undefined,
    /* Arquivo do ZIP que não ficou disponível VENCE o "ZIP preservado": é
       imagem partida na prévia, e dizer que está tudo preservado por cima de
       uma imagem que falta é o selo mentindo. */
    status: fora.length
      ? { label: `${fora.length} ${fora.length === 1 ? "arquivo ausente" : "arquivos ausentes"}`, tone: "warn" }
      : shopify
        ? shopify.compatibility?.preservedSource
          ? { label: "ZIP preservado", tone: "ok" }
          : { label: "estrutura preservada", tone: "info" }
        : undefined,
    meta: [
      `v${theme.version}`,
      `${theme.sectionCount} seções`,
      ...(shopify ? [`${shopify.summary.templateCount} páginas`] : []),
      /* a miniatura do cartão é render de verdade, e sem nicho ela mostra o
         catálogo de exemplo: quem olha precisa saber que a mercadoria não é do
         tema, senão conclui que o tema veio com loja pronta */
      ...(shopify?.compatibility?.preservedSource && !shopify.orbisNicheId ? ["vitrine de demonstração"] : []),
      ...(fora.length ? [`não instalado: ${fora[0].path.split("/").at(-1)} (${fora[0].motivo})`] : []),
    ],
  };
}

const PROJECT_STATUS: Record<Project["status"], { label: string; tone: PreviewStatusTone }> = {
  draft: { label: "RASCUNHO", tone: "info" },
  editing: { label: "EM EDIÇÃO", tone: "info" },
  published: { label: "PUBLICADO", tone: "ok" },
  archived: { label: "ARQUIVADO", tone: "warn" },
};

export function previewFromProject(project: Project): PreviewCardModel {
  const { shopify, customization } = shopifyOf(project.customization);
  return {
    id: project.id,
    title: project.name,
    subtitle: project.themeName,
    image: shopify?.assetPreview,
    renderable: Boolean(shopify?.compatibility?.preservedSource),
    palette: paletteOf(shopify, customization),
    status: PROJECT_STATUS[project.status],
    meta: shopify ? [`${shopify.pages.length} páginas`, `${shopify.summary.sectionDefinitionCount} seções`] : [],
    updatedAt: project.updatedAt,
  };
}
