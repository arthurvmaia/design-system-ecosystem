import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getIdentity();
  if (!identity) return new Response("Authentication required", { status: 401 });
  const viewer = await ensureUser(identity);
  await ensureDatabase();
  const { id } = await params;
  const media = await getD1().prepare(`SELECT storage_key AS storageKey, content_type AS contentType
    FROM media_files WHERE id = ? AND user_id = ?`)
    .bind(id, viewer.id)
    .first<{ storageKey: string; contentType: string }>();
  if (!media || !env.MEDIA) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA.get(media.storageKey);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": media.contentType,
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
