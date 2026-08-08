import { strToU8, zipSync } from "fflate";
import { z } from "zod";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1, saveProject, unlockTheme } from "@/lib/data";
import { brandCustomization, generateClientSite, sanitizeBrand } from "@/lib/site-generator.mjs";
import { gerarMarca } from "@/lib/marca-generator.mjs";
import { aplicarMarcaNoTema } from "@/lib/shopify-brand";
import type { ShopifyThemeImport } from "@/lib/shopify-theme";

/**
 * Solicitação de loja do Fluxo Cliente.
 *
 * Conversa com o backend admin de verdade: desbloqueia o tema escolhido (os
 * triggers criam o projeto atomicamente), salva a customização com a marca
 * aplicada e devolve o site em ZIP. A gravação na Área de Trabalho acontece
 * depois, no middleware Node do dev server, porque aqui é workerd e não há
 * filesystem.
 *
 * ## A marca é regerada aqui, não recebida pronta
 *
 * O navegador manda o nicho, a semente e o que a pessoa digitou. O servidor roda
 * o MESMO gerador determinístico e chega na mesma marca da prévia. Isso evita
 * confiar em SVG e em cores vindos do cliente, e mantém a prévia honesta: o que
 * ela viu é o que foi gerado.
 *
 * ## Tema qualquer, não só o ShrinePro
 *
 * O cliente escolhe entre todos os temas publicados do estúdio. Quando o tema
 * tem dados Shopify importados, a marca é aplicada sobre os settings reais dele
 * (`aplicarMarcaNoTema`) e o projeto nasce já com a cara da marca; o ZIP
 * entregue continua sendo o site navegável, para a pessoa ver o resultado sem
 * depender de nada instalado.
 */

const requestSchema = z.object({
  themeId: z.string().min(1).max(80).optional(),
  templateId: z.enum(["essencial", "vitrine"]),
  /* geração por nicho: o servidor refaz a marca a partir daqui */
  nicheId: z.string().min(1).max(40).optional(),
  seed: z.string().min(1).max(40).optional(),
  brand: z.object({
    name: z.string().min(2).max(48),
    slogan: z.string().max(140).optional(),
    description: z.string().max(240).optional(),
    primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
    headingFont: z.string().max(60).optional(),
    bodyFont: z.string().max(60).optional(),
    whatsapp: z.string().max(24).optional(),
    instagram: z.string().max(60).optional(),
    email: z.string().max(120).optional(),
    logoDataUri: z.string().max(2_000_000).optional(),
  }),
});

/** O tema escolhido só entra se estiver publicado — a lista da tela é a mesma. */
async function temaPublicado(themeId: string) {
  const linha = await getD1()
    .prepare("SELECT id, name, default_settings AS defaults FROM themes WHERE id = ? AND status = 'published'")
    .bind(themeId)
    .first<{ id: string; name: string; defaults: string }>();
  return linha ?? null;
}

export async function POST(request: Request) {
  try {
    const identity = await getIdentity();
    if (!identity) return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401 });
    const viewer = await ensureUser(identity);
    await ensureDatabase();

    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "INVALID_REQUEST", issues: parsed.error.flatten() }, { status: 400 });
    }

    /* a marca do pedido: gerada pelo nicho quando houver, com o que a pessoa
       digitou vencendo campo a campo */
    const marca = parsed.data.nicheId
      ? gerarMarca({ nicheId: parsed.data.nicheId, semente: parsed.data.seed ?? "orbis", sobrescritas: parsed.data.brand })
      : { ...parsed.data.brand, collections: [], announcement: "" };

    const escolhido = parsed.data.themeId ? await temaPublicado(parsed.data.themeId) : null;
    const themeId = escolhido?.id ?? "shrine-pro";

    const unlocked = await unlockTheme(viewer, themeId, `client-site-${crypto.randomUUID()}`);
    const projectId = unlocked.projectId as string;

    /* a customização base vem do gerador do site; quando o tema tem Shopify
       importado, ela leva junto o tema com a marca já aplicada */
    const customizacao = brandCustomization(marca) as unknown as Record<string, unknown>;
    let alterados: string[] = [];
    if (escolhido) {
      let shopify: ShopifyThemeImport | null = null;
      try { shopify = (JSON.parse(escolhido.defaults) as { shopify?: ShopifyThemeImport }).shopify ?? null; } catch { shopify = null; }
      if (shopify) {
        const resultado = aplicarMarcaNoTema(shopify, marca);
        customizacao.shopify = resultado.theme;
        alterados = resultado.alterados;
      }
    }
    await saveProject(viewer, projectId, customizacao);

    const brand = sanitizeBrand(marca);
    await getD1()
      .prepare("UPDATE projects SET name = ? WHERE id = ? AND user_id = ?")
      .bind(`Loja de ${brand.name}`, projectId, viewer.id)
      .run();

    const site = generateClientSite({ brand: marca, templateId: parsed.data.templateId });
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
        "x-theme-id": themeId,
        "x-brand-settings": String(alterados.length),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
    return Response.json({ error: message }, { status: message.includes("NOT_FOUND") ? 404 : 500 });
  }
}
