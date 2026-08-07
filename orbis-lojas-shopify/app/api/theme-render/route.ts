import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { themeFilesFromZip, type ShopifyThemeImport } from "@/lib/shopify-theme";
import { renderThemePage } from "@/lib/theme-render";

const FINGERPRINT = /^[0-9a-f]{16}$/;

async function renderResponse(viewerId: string, shopify: ShopifyThemeImport, pageId: string) {
  const fingerprint = shopify.sourceFingerprint;
  if (!FINGERPRINT.test(fingerprint) || !env.MEDIA) return null;
  const object = await env.MEDIA.get(`themes/${viewerId}/${fingerprint}.zip`);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const files = themeFilesFromZip(bytes);
  const html = await renderThemePage({
    theme: shopify,
    files,
    pageId,
    assetBase: (path) => `/api/theme-assets?fp=${fingerprint}&path=${encodeURIComponent(path)}`,
  });
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function GET(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return new Response("Authentication required", { status: 401 });
    const viewer = await ensureUser(identity);
    await ensureDatabase();
    const url = new URL(request.url);
    const themeId = url.searchParams.get("themeId") ?? "";
    const projectId = url.searchParams.get("projectId") ?? "";
    const pageId = url.searchParams.get("page") ?? "index";
    /* MESMO renderizador para tema salvo e para projeto (estado atual do
       usuário) — é a fonte única que as miniaturas reais consomem */
    let raw: string | null = null;
    if (projectId) {
      const row = await getD1().prepare("SELECT customization AS payload FROM projects WHERE id = ? AND user_id = ?")
        .bind(projectId, viewer.id).first<{ payload: string }>();
      if (!row) return Response.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });
      raw = row.payload;
    } else {
      const row = await getD1().prepare("SELECT default_settings AS defaults FROM themes WHERE id = ?")
        .bind(themeId).first<{ defaults: string }>();
      if (!row) return Response.json({ error: "THEME_NOT_FOUND" }, { status: 404 });
      raw = row.defaults;
    }
    let shopify: ShopifyThemeImport | null = null;
    try { shopify = (JSON.parse(raw) as { shopify?: ShopifyThemeImport }).shopify ?? null; } catch { shopify = null; }
    if (!shopify) return Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 404 });
    const response = await renderResponse(viewer.id, shopify, pageId);
    return response ?? Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 300) : "RENDER_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return new Response("Authentication required", { status: 401 });
    const viewer = await ensureUser(identity);
    const body = await request.json() as { shopify?: ShopifyThemeImport; page?: string };
    if (!body.shopify?.sourceFingerprint) return Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 400 });
    const response = await renderResponse(viewer.id, body.shopify, body.page ?? "index");
    return response ?? Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 300) : "RENDER_FAILED" }, { status: 500 });
  }
}
