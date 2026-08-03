import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { validateUpload } from "@/lib/business-rules.mjs";

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    await ensureDatabase();
    if (!env.MEDIA) throw new Error("MEDIA_STORAGE_UNAVAILABLE");

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "FILE_REQUIRED" }, { status: 400 });
    validateUpload(file.type, file.size);

    const id = crypto.randomUUID();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-90);
    const storageKey = `media/${viewer.id}/${id}-${safeName}`;
    await env.MEDIA.put(storageKey, file.stream(), {
      httpMetadata: { contentType: file.type },
      customMetadata: { ownerId: viewer.id },
    });
    await getD1().prepare(`INSERT INTO media_files(id, user_id, storage_key, filename, content_type, size)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, viewer.id, storageKey, safeName, file.type, file.size)
      .run();
    return Response.json({ id, url: `/api/media/${id}` }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UPLOAD_FAILED";
    return Response.json({ error: message }, { status: message.startsWith("INVALID") ? 400 : 500 });
  }
}
