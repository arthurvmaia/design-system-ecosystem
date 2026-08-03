import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { getIdentity } from "@/lib/auth";
import { ensureUser, getD1, saveProject, unlockTheme } from "@/lib/data";
import { brandCustomization, generateClientSite, sanitizeBrand } from "@/lib/site-generator.mjs";

/**
 * Solicitação de site do Fluxo Cliente.
 *
 * Conversa com o backend admin de verdade: desbloqueia o ShrinePro (grátis, os
 * triggers criam o projeto atomicamente), salva a customização com a marca
 * aplicada e devolve o site estático em ZIP. A gravação na Área de Trabalho
 * acontece depois, no middleware Node do dev server, porque aqui é workerd e
 * não há filesystem.
 */

const requestSchema = z.object({
  templateId: z.enum(["essencial", "vitrine"]),
  brand: z.object({
    name: z.string().min(2).max(48),
    slogan: z.string().max(140).optional(),
    description: z.string().max(240).optional(),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    whatsapp: z.string().max(24).optional(),
    instagram: z.string().max(60).optional(),
    email: z.string().max(120).optional(),
    logoDataUri: z.string().max(2_000_000).optional(),
  }),
});

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
    }

    const brand = sanitizeBrand(parsed.data.brand);

    const unlocked = await unlockTheme(viewer, "shrine-pro", `client-site-${crypto.randomUUID()}`);
    const projectId = unlocked.projectId as string;
    await saveProject(viewer, projectId, brandCustomization(parsed.data.brand) as unknown as Record<string, unknown>);
    await getD1()
      .prepare("UPDATE projects SET name = ? WHERE id = ? AND user_id = ?")
      .bind(`Site de ${brand.name} · ${parsed.data.templateId}`, projectId, viewer.id)
      .run();

    const site = generateClientSite({ brand: parsed.data.brand, templateId: parsed.data.templateId });
    const zip = zipSync(
      Object.fromEntries(Object.entries(site.files as Record<string, string | Uint8Array>)
        .map(([path, content]) => [path, typeof content === "string" ? strToU8(content) : content])),
      { level: 6 },
    );

    return new Response(zip.slice().buffer, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="site-${site.brand.slug}.zip"`,
        "x-site-name": site.brand.slug,
        "x-project-id": projectId,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
    return Response.json({ error: message }, { status: message.includes("NOT_FOUND") ? 404 : 500 });
  }
}
