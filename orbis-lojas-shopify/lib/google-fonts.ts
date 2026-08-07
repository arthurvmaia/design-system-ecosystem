/**
 * Catálogo do Google Fonts (Fase 6).
 *
 * A fonte é o metadata público `https://fonts.google.com/metadata/fonts`
 * (sem chave de API). O parse reduz cada família ao que o editor precisa:
 * nome, categoria, pesos e se há itálico. O carregamento das FONTES em si é
 * sempre sob demanda via css2, nunca do catálogo inteiro.
 */

export type CatalogFont = {
  family: string;
  category: "sans-serif" | "serif" | "display" | "handwriting" | "monospace";
  weights: number[];
  italic: boolean;
};

export const CATALOG_CACHE_KEY = "cache/google-fonts-catalog.json";
export const CATALOG_TTL_MS = 24 * 60 * 60 * 1000;
export const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts";

const CATEGORIES = new Set(["sans-serif", "serif", "display", "handwriting", "monospace"]);

function normalizeCategory(value: unknown): CatalogFont["category"] {
  const category = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "-");
  return (CATEGORIES.has(category) ? category : "sans-serif") as CatalogFont["category"];
}

/** O endpoint responde com o prefixo anti-JSON `)]}'` antes do objeto. */
export function parseGoogleFontsMetadata(raw: string): CatalogFont[] {
  const clean = raw.replace(/^\)\]\}'/, "").trim();
  const data = JSON.parse(clean) as { familyMetadataList?: unknown[] };
  const list = Array.isArray(data.familyMetadataList) ? data.familyMetadataList : [];
  const fonts: CatalogFont[] = [];
  for (const item of list) {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const family = String(record.family ?? "").trim();
    if (!family) continue;
    const variantKeys = record.fonts && typeof record.fonts === "object" ? Object.keys(record.fonts as Record<string, unknown>) : [];
    const weights = Array.from(new Set(variantKeys.map((key) => Number.parseInt(key, 10)).filter((weight) => Number.isFinite(weight) && weight >= 100 && weight <= 1000))).sort((left, right) => left - right);
    fonts.push({
      family,
      category: normalizeCategory(record.category),
      weights: weights.length ? weights : [400],
      italic: variantKeys.some((key) => /\di$/.test(key)),
    });
  }
  return fonts;
}

/**
 * Reserva mínima para quando o catálogo estiver indisponível (sem rede, sem
 * cache): as famílias que o editor já conhecia. A UI declara o modo reserva.
 */
export const CATALOG_FALLBACK: CatalogFont[] = [
  "Assistant", "Archivo", "Bitter", "Cormorant", "Crimson Text", "DM Sans", "Dosis", "EB Garamond",
  "Fjalla One", "Inter", "Josefin Sans", "Karla", "Lato", "Libre Baskerville", "Lora", "Merriweather",
  "Montserrat", "Mulish", "Nunito", "Nunito Sans", "Open Sans", "Oswald", "Playfair Display", "Poppins",
  "PT Sans", "PT Serif", "Quicksand", "Raleway", "Roboto", "Rubik", "Source Sans Pro", "Space Grotesk", "Work Sans",
].map((family) => ({
  family,
  category: /Cormorant|Crimson|Garamond|Baskerville|Lora|Merriweather|Playfair|PT Serif|Bitter/.test(family) ? "serif" as const : "sans-serif" as const,
  weights: [300, 400, 500, 600, 700],
  italic: true,
}));
