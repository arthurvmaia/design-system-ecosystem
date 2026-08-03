import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureUser, importShopifyTheme, registerThemeSource } from "@/lib/data";
import { extractShopifyThemePackage, type ShopifyThemeImageAsset } from "@/lib/shopify-theme";

const DATA_URI_MAX_FILE = 120 * 1024;
const DATA_URI_MAX_TOTAL = 2 * 1024 * 1024;
const PREVIEW_NAME_BOOST = /(banner|hero|slide|slideshow|home|main|desktop|bg|background|cover|lifestyle)/;
const PREVIEW_NAME_PENALTY = /(icon|favicon|sprite|logo|badge|payment|flag|arrow|star|placeholder|loading|blank|pattern|texture)/;

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) return Response.json({ error: "SHOPIFY_ZIP_REQUIRED" }, { status: 400 });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { theme: imported, images } = extractShopifyThemePackage(bytes, file.name);
    let sourceKey = "";
    if (env.MEDIA) {
      try {
        sourceKey = `themes/${viewer.id}/${imported.sourceFingerprint}.zip`;
        await env.MEDIA.put(sourceKey, bytes, {
          httpMetadata: { contentType: "application/zip" },
          customMetadata: { ownerId: viewer.id, filename: imported.sourceFile, architecture: imported.compatibility.architecture },
        });
        imported.compatibility.preservedSource = true;
      } catch { sourceKey = ""; }
    }
    imported.assetUrls = await installThemeImages(viewer.id, imported.sourceFingerprint, images);
    imported.assetPreview = pickThemePreview(images, imported.assetUrls);
    const result = await importShopifyTheme(viewer, imported);
    if (sourceKey) await registerThemeSource(viewer, result.themeId, imported, sourceKey, file.size);
    return Response.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SHOPIFY_IMPORT_FAILED";
    const invalid = message.startsWith("SHOPIFY_");
    return Response.json({ error: message }, { status: invalid ? 400 : 500 });
  }
}

/** Instala todos os assets do tema no R2 (CSS, JS, fontes, imagens); sem R2, embute imagens pequenas como data URI. */
async function installThemeImages(ownerId: string, fingerprint: string, assets: ShopifyThemeImageAsset[]) {
  const urls: Record<string, string> = {};
  if (env.MEDIA) {
    for (const asset of assets) {
      try {
        await env.MEDIA.put(`theme-assets/${ownerId}/${fingerprint}/${asset.path}`, asset.data, {
          httpMetadata: { contentType: asset.contentType },
          customMetadata: { ownerId },
        });
        if (asset.contentType.startsWith("image/")) {
          urls[asset.name] = `/api/theme-assets?fp=${fingerprint}&path=${encodeURIComponent(asset.path)}`;
        }
      } catch { /* asset individual falhou; os demais continuam */ }
    }
    return urls;
  }
  let total = 0;
  for (const asset of assets) {
    if (!asset.contentType.startsWith("image/")) continue;
    if (asset.data.byteLength > DATA_URI_MAX_FILE) continue;
    if (total + asset.data.byteLength > DATA_URI_MAX_TOTAL) break;
    total += asset.data.byteLength;
    urls[asset.name] = `data:${asset.contentType};base64,${base64FromBytes(asset.data)}`;
  }
  return urls;
}

/** Elege a imagem mais representativa do tema (banners grandes ganham de ícones). */
function pickThemePreview(images: ShopifyThemeImageAsset[], urls: Record<string, string>) {
  let best: { score: number; url: string } | null = null;
  for (const image of images) {
    const url = urls[image.name];
    if (!url || !image.contentType.startsWith("image/") || image.contentType === "image/svg+xml" || image.contentType === "image/x-icon") continue;
    let score = Math.min(image.data.byteLength, 3_000_000);
    if (PREVIEW_NAME_BOOST.test(image.name)) score += 1_500_000;
    if (PREVIEW_NAME_PENALTY.test(image.name)) score -= 2_000_000;
    if (!best || score > best.score) best = { score, url };
  }
  return best && best.score > 0 ? best.url : undefined;
}

function base64FromBytes(bytes: Uint8Array) {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
