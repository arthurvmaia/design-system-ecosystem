/**
 * Ferramentas de cor do inspetor (Fase 9): parse/formatação com alfa e
 * contraste WCAG. Puras e testáveis — a UI só apresenta.
 */

export type ParsedColor = { hex: string; alpha: number };

/** Aceita #rgb, #rrggbb, #rrggbbaa, rgb() e rgba(); devolve hex + alfa. */
export function parseColorValue(value: string): ParsedColor | null {
  const raw = String(value ?? "").trim();
  const hex = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const alpha = full.length === 8 ? Math.round((parseInt(full.slice(6, 8), 16) / 255) * 100) / 100 : 1;
    return { hex: `#${full.slice(0, 6).toLowerCase()}`, alpha };
  }
  const rgba = raw.match(/^rgba?\(([^)]+)\)$/i)?.[1]?.split(/[,/\s]+/).filter(Boolean).map(Number);
  if (rgba && rgba.length >= 3 && rgba.slice(0, 3).every((channel) => Number.isFinite(channel))) {
    const toHex = (channel: number) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0");
    return { hex: `#${toHex(rgba[0])}${toHex(rgba[1])}${toHex(rgba[2])}`, alpha: Number.isFinite(rgba[3]) ? Math.max(0, Math.min(1, rgba[3])) : 1 };
  }
  return null;
}

/** Alfa cheio sai como hex (o formato dos temas); alfa parcial sai como rgba. */
export function formatColorValue(hex: string, alpha: number): string {
  const parsed = parseColorValue(hex);
  if (!parsed) return hex;
  if (alpha >= 1) return parsed.hex;
  const r = parseInt(parsed.hex.slice(1, 3), 16);
  const g = parseInt(parsed.hex.slice(3, 5), 16);
  const b = parseInt(parsed.hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(alpha * 100) / 100})`;
}

function relativeLuminance(hex: string): number | null {
  const parsed = parseColorValue(hex);
  if (!parsed) return null;
  const channels = [parsed.hex.slice(1, 3), parsed.hex.slice(3, 5), parsed.hex.slice(5, 7)].map((part) => {
    const value = parseInt(part, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Razão de contraste WCAG (1 a 21); null quando alguma cor não parseia. */
export function contrastRatio(foreground: string, background: string): number | null {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  if (first === null || second === null) return null;
  const [lighter, darker] = first >= second ? [first, second] : [second, first];
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 10) / 10;
}

export const CONTRAST_MINIMUM = 4.5;

/** O id parece um setting de TEXTO? (candidato ao alerta de contraste) */
export function isTextColorSetting(id: string): boolean {
  return /text|foreground|label|heading|title|caption/i.test(id) && !/background|bg\b/i.test(id);
}

/** Um fundo no MESMO contexto (seção/bloco) para medir o contraste contra. */
export function contextBackgroundColor(context: Record<string, unknown>): string | null {
  for (const [id, value] of Object.entries(context)) {
    if (!/background|(^|_)bg(_|$)/i.test(id) || /gradient|image|opacity/i.test(id)) continue;
    if (typeof value === "string" && parseColorValue(value)) return value;
  }
  return null;
}
