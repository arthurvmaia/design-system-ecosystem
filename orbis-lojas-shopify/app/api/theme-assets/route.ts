import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureUser } from "@/lib/data";
import { ASSET_CONTENT_TYPES } from "@/lib/shopify-theme";

const FINGERPRINT = /^[0-9a-f]{16}$/;
const CONTENT_TYPES: Record<string, string> = ASSET_CONTENT_TYPES;

export async function GET(request: Request) {
  const identity = await getIdentity();
  if (!identity) return new Response("Authentication required", { status: 401 });
  const viewer = await ensureUser(identity);
  const url = new URL(request.url);
  const fingerprint = url.searchParams.get("fp") ?? "";
  const path = url.searchParams.get("path") ?? "";
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPES[extension];
  if (!FINGERPRINT.test(fingerprint) || !path.startsWith("assets/") || path.includes("..") || !contentType) {
    return new Response("Not found", { status: 404 });
  }
  if (!env.MEDIA) return new Response("Not found", { status: 404 });
  const object = await env.MEDIA.get(`theme-assets/${viewer.id}/${fingerprint}/${path}`);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": contentType,
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
