import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { themeFilesFromZip, type ShopifyThemeImport } from "@/lib/shopify-theme";
import { collectEditorMediaIds, exportThemeZip, type EditorMediaFile } from "@/lib/theme-export";

const FINGERPRINT = /^[0-9a-f]{16}$/;
const MAX_EDITOR_MEDIA = 100;
/* o worker tem memória curta e o ZIP inteiro passa por ela; uploads podem ter
   5MB cada, então o teto é de bytes, não só de quantidade */
const MAX_EDITOR_MEDIA_BYTES = 40 * 1024 * 1024;

/** Busca as imagens enviadas pelo editor (D1 + R2) para virarem assets do ZIP exportado. */
async function loadEditorMedia(
  userId: string,
  theme: ShopifyThemeImport,
  warnings: string[],
): Promise<Map<string, EditorMediaFile>> {
  const media = new Map<string, EditorMediaFile>();
  const requested = collectEditorMediaIds(theme);
  const ids = requested.slice(0, MAX_EDITOR_MEDIA);
  if (requested.length > ids.length) {
    warnings.push(`limite de ${MAX_EDITOR_MEDIA} imagens do editor por exportação: ${requested.length - ids.length} ficaram de fora`);
  }
  if (!ids.length || !env.MEDIA) return media;
  await ensureDatabase();
  /* o D1 aceita poucos parâmetros por statement; o lote fica bem abaixo do teto */
  const rows: Array<{ id: string; storageKey: string; filename: string; size: number }> = [];
  for (let start = 0; start < ids.length; start += 20) {
    const batch = ids.slice(start, start + 20);
    const placeholders = batch.map(() => "?").join(", ");
    const page = await getD1()
      .prepare(`SELECT id, storage_key AS storageKey, filename, size FROM media_files WHERE user_id = ? AND id IN (${placeholders})`)
      .bind(userId, ...batch)
      .all<{ id: string; storageKey: string; filename: string; size: number }>();
    rows.push(...(page.results ?? []));
  }
  let bytes = 0;
  for (const row of rows) {
    if (bytes + Math.max(row.size ?? 0, 0) > MAX_EDITOR_MEDIA_BYTES) {
      warnings.push(`imagens do editor acima de ${Math.round(MAX_EDITOR_MEDIA_BYTES / 1024 / 1024)}MB no total ficaram de fora: ${row.filename}`);
      continue;
    }
    const object = await env.MEDIA.get(row.storageKey);
    if (!object) continue;
    const data = new Uint8Array(await object.arrayBuffer());
    bytes += data.byteLength;
    media.set(row.id, { filename: `orbis-${row.id.slice(0, 8)}-${row.filename}`, data });
  }
  return media;
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    const body = await request.json() as { shopify?: ShopifyThemeImport; filename?: string };
    const shopify = body.shopify;
    if (!shopify?.sourceFingerprint || !FINGERPRINT.test(shopify.sourceFingerprint)) {
      return Response.json({ error: "EXPORT_UNAVAILABLE" }, { status: 400 });
    }
    if (!env.MEDIA) return Response.json({ error: "EXPORT_UNAVAILABLE" }, { status: 404 });
    const object = await env.MEDIA.get(`themes/${viewer.id}/${shopify.sourceFingerprint}.zip`);
    if (!object) return Response.json({ error: "EXPORT_SOURCE_MISSING" }, { status: 404 });
    const files = themeFilesFromZip(new Uint8Array(await object.arrayBuffer()));
    const mediaWarnings: string[] = [];
    /* mídia é um extra: se o D1/R2 falhar, a exportação do tema segue em pé */
    const editorMedia = await loadEditorMedia(viewer.id, shopify, mediaWarnings).catch((error: unknown) => {
      mediaWarnings.push(`não consegui anexar as imagens do editor: ${error instanceof Error ? error.message.slice(0, 120) : "erro"}`);
      return new Map<string, EditorMediaFile>();
    });
    const { zip, modified, warnings } = exportThemeZip(shopify, files, editorMedia);
    warnings.unshift(...mediaWarnings);
    const safeName = (body.filename ?? shopify.themeName ?? "tema").replace(/[^\w.-]+/g, "-").slice(0, 80) || "tema";
    return new Response(zip.slice().buffer as ArrayBuffer, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${safeName}-orbis.zip"`,
        "x-modified-files": encodeURIComponent(JSON.stringify(modified.slice(0, 60))),
        "x-export-warnings": encodeURIComponent(JSON.stringify(warnings.slice(0, 20))),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 300) : "EXPORT_FAILED" }, { status: 500 });
  }
}
