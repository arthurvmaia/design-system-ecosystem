/**
 * Editar código: lê e grava os arquivos REAIS do tema, direto no ZIP
 * preservado no R2 — a mesma fonte que alimenta o render e a exportação.
 * Salvar aqui já muda a prévia e o ZIP exportável, sem cópia intermediária.
 */
import { env } from "cloudflare:workers";
import { strFromU8, strToU8 } from "fflate";
import { getIdentity } from "@/lib/auth";
import { ensureUser, getD1, ensureDatabase } from "@/lib/data";
import { ASSET_CONTENT_TYPES, isEditableCodePath, MAX_CODE_FILE_BYTES, themeFilesFromZip, updateThemeSourceFile, type ShopifyThemeImport } from "@/lib/shopify-theme";

const FINGERPRINT = /^[0-9a-f]{16}$/;

async function loadThemeZip(viewerId: string, themeId: string): Promise<{ key: string; fingerprint: string; bytes: Uint8Array } | null> {
  await ensureDatabase();
  const row = await getD1().prepare("SELECT default_settings AS defaults FROM themes WHERE id = ? AND status = 'published'")
    .bind(themeId).first<{ defaults: string }>();
  if (!row) return null;
  let shopify: ShopifyThemeImport | null = null;
  try { shopify = (JSON.parse(row.defaults) as { shopify?: ShopifyThemeImport }).shopify ?? null; } catch { shopify = null; }
  const fingerprint = shopify?.sourceFingerprint ?? "";
  if (!FINGERPRINT.test(fingerprint) || !env.MEDIA) return null;
  const key = `themes/${viewerId}/${fingerprint}.zip`;
  const object = await env.MEDIA.get(key);
  if (!object) return null;
  return { key, fingerprint, bytes: new Uint8Array(await object.arrayBuffer()) };
}

export async function GET(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    const url = new URL(request.url);
    const themeId = url.searchParams.get("themeId") ?? "";
    const path = url.searchParams.get("path") ?? "";
    const source = await loadThemeZip(viewer.id, themeId);
    if (!source) return Response.json({ error: "CODE_SOURCE_UNAVAILABLE" }, { status: 404 });
    const files = themeFilesFromZip(source.bytes);
    if (!path) {
      const listing = Array.from(files.entries())
        .map(([filePath, data]) => ({ path: filePath, size: data.byteLength, editable: isEditableCodePath(filePath) }))
        .sort((left, right) => left.path.localeCompare(right.path));
      return Response.json({ files: listing });
    }
    const data = files.get(path);
    if (!data) return Response.json({ error: "CODE_FILE_NOT_FOUND" }, { status: 404 });
    if (!isEditableCodePath(path)) return Response.json({ path, binary: true, size: data.byteLength });
    return Response.json({ path, size: data.byteLength, content: strFromU8(data) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 200) : "CODE_READ_FAILED" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    const body = await request.json() as { themeId?: string; path?: string; content?: string };
    const themeId = String(body.themeId ?? "");
    const path = String(body.path ?? "");
    if (typeof body.content !== "string") return Response.json({ error: "CODE_CONTENT_REQUIRED" }, { status: 400 });
    if (!isEditableCodePath(path)) return Response.json({ error: "CODE_PATH_NOT_EDITABLE" }, { status: 400 });
    const data = strToU8(body.content);
    if (data.byteLength > MAX_CODE_FILE_BYTES) return Response.json({ error: "CODE_FILE_TOO_LARGE" }, { status: 400 });
    const source = await loadThemeZip(viewer.id, themeId);
    if (!source || !env.MEDIA) return Response.json({ error: "CODE_SOURCE_UNAVAILABLE" }, { status: 404 });
    const nextZip = updateThemeSourceFile(source.bytes, path, data);
    await env.MEDIA.put(source.key, nextZip, {
      httpMetadata: { contentType: "application/zip" },
      customMetadata: { ownerId: viewer.id, editedPath: path.slice(0, 200) },
    });
    /* a prévia serve assets pela cópia instalada em theme-assets/ — um CSS/JS
       editado precisa valer nos dois lugares, senão o render fica defasado */
    if (path.startsWith("assets/")) {
      const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
      await env.MEDIA.put(`theme-assets/${viewer.id}/${source.fingerprint}/${path}`, data, {
        httpMetadata: { contentType: ASSET_CONTENT_TYPES[extension] ?? "text/plain; charset=utf-8" },
        customMetadata: { ownerId: viewer.id },
      });
    }
    return Response.json({ ok: true, path, size: data.byteLength });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CODE_SAVE_FAILED";
    const invalid = message.startsWith("SHOPIFY_CODE");
    return Response.json({ error: message.slice(0, 200) }, { status: invalid ? 400 : 500 });
  }
}
