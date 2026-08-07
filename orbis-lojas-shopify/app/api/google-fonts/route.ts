/**
 * Catálogo do Google Fonts com cache no R2 (Fase 6): o metadata público é
 * consultado no máximo uma vez por dia; cai para o cache ainda que vencido
 * quando a rede falhar, e só então para 503 — o cliente tem a reserva local.
 */
import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { CATALOG_CACHE_KEY, CATALOG_TTL_MS, GOOGLE_FONTS_METADATA_URL, parseGoogleFontsMetadata, type CatalogFont } from "@/lib/google-fonts";

type CatalogCache = { fetchedAt: number; fonts: CatalogFont[] };

async function readCache(): Promise<CatalogCache | null> {
  if (!env.MEDIA) return null;
  try {
    const object = await env.MEDIA.get(CATALOG_CACHE_KEY);
    if (!object) return null;
    const parsed = JSON.parse(await object.text()) as CatalogCache;
    return Array.isArray(parsed.fonts) && parsed.fonts.length ? parsed : null;
  } catch { return null; }
}

export async function GET() {
  const identity = await getIdentity();
  if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });

  const cached = await readCache();
  if (cached && Date.now() - cached.fetchedAt < CATALOG_TTL_MS) {
    return Response.json({ fonts: cached.fonts, fetchedAt: cached.fetchedAt, source: "cache" });
  }
  try {
    const response = await fetch(GOOGLE_FONTS_METADATA_URL, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`CATALOG_HTTP_${response.status}`);
    const fonts = parseGoogleFontsMetadata(await response.text());
    if (!fonts.length) throw new Error("CATALOG_EMPTY");
    const payload: CatalogCache = { fetchedAt: Date.now(), fonts };
    if (env.MEDIA) {
      try { await env.MEDIA.put(CATALOG_CACHE_KEY, JSON.stringify(payload), { httpMetadata: { contentType: "application/json" } }); } catch { /* cache é conforto, não requisito */ }
    }
    return Response.json({ fonts, fetchedAt: payload.fetchedAt, source: "live" });
  } catch (error) {
    /* rede falhou: cache vencido ainda é melhor que nada — declarado no source */
    if (cached) return Response.json({ fonts: cached.fonts, fetchedAt: cached.fetchedAt, source: "stale" });
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 120) : "CATALOG_UNAVAILABLE" }, { status: 503 });
  }
}
