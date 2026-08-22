import { env } from "cloudflare:workers";
import { urlDeAssetDoTema } from "@/lib/asset-do-tema";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1 } from "@/lib/data";
import { themeFilesFromZip, type ShopifyThemeImport } from "@/lib/shopify-theme";
import { renderThemePage, type PreviewCartItem } from "@/lib/theme-render";
import { aplicarMarcaNoTema, handleDeColecao } from "@/lib/shopify-brand";

const FINGERPRINT = /^[0-9a-f]{16}$/;

type RenderExtras = { cartItems?: PreviewCartItem[]; onlySections?: string[]; handle?: string; variantId?: number; nicheId?: string; capasDeColecao?: Record<string, string> };

async function renderResponse(viewerId: string, shopify: ShopifyThemeImport, pageId: string, extras: RenderExtras = {}) {
  const fingerprint = shopify.sourceFingerprint;
  if (!FINGERPRINT.test(fingerprint) || !env.MEDIA) return null;
  const object = await env.MEDIA.get(`themes/${viewerId}/${fingerprint}.zip`);
  if (!object) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  const files = themeFilesFromZip(bytes);
  const saida = await renderThemePage({
    theme: shopify,
    files,
    pageId,
    assetBase: (path) => urlDeAssetDoTema(fingerprint, path),
    cartItems: extras.cartItems,
    onlySections: extras.onlySections,
    handle: extras.handle,
    variantId: extras.variantId,
    /* o nicho viaja dentro do tema salvo no projeto: a vitrine da loja gerada
       precisa dos produtos daquele nicho em qualquer rota de render */
    nicheId: extras.nicheId ?? shopify.orbisNicheId,
    /**
     * A capa vem do TEMA quando o pedido não a traz.
     *
     * O fluxo do cliente monta o mapa na hora, a partir da marca que ele tem em
     * memória, e por isso a prévia dele sempre teve capa. O Editor não tem
     * marca nenhuma — ele abre o tema salvo — e caía na foto de produto
     * sorteada pelo handle: a mesma loja mostrava capa certa num lugar e foto
     * repetida no outro. Agora o tema carrega o mapa (`orbisCapas`), e as duas
     * telas leem da mesma fonte.
     */
    capasDeColecao: extras.capasDeColecao ?? shopify.orbisCapas,
  });
  /* pedido de seções soltas volta como JSON (Section Rendering API) */
  if (extras.onlySections?.length) {
    return new Response(saida, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
  }
  return new Response(saida, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Handle vem do iframe: só letras, números e hífen, para não virar caminho. */
function sanitizeHandle(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const limpo = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 120);
  return limpo || undefined;
}

/** Aceita só o essencial do carrinho, com limites — nada vindo do cliente entra cru. */
function sanitizeCartItems(value: unknown): PreviewCartItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.slice(0, 50).map((item) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    return { variantId: Number(record.variantId) || 0, quantity: Math.max(1, Math.min(99, Math.floor(Number(record.quantity)) || 1)) };
  }).filter((item) => item.variantId > 0);
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
    const body = await request.json() as {
      shopify?: ShopifyThemeImport; page?: string; sections?: unknown; cartItems?: unknown;
      handle?: unknown; variantId?: unknown; themeId?: unknown; marca?: unknown;
    };

    /**
     * Prévia da loja do cliente: tema pelo id, com a marca aplicada na hora.
     *
     * A área do cliente não tem o tema em mãos (ele mora no banco), e mostrar o
     * tema cru seria mentir — a pessoa está escolhendo cores e fontes. Aqui o
     * MESMO `aplicarMarcaNoTema` da entrega roda antes de renderizar, então a
     * prévia é a loja que vai sair.
     */
    if (typeof body.themeId === "string" && body.marca && typeof body.marca === "object") {
      await ensureDatabase();
      const linha = await getD1()
        .prepare("SELECT default_settings AS defaults FROM themes WHERE id = ? AND status = 'published'")
        .bind(body.themeId).first<{ defaults: string }>();
      if (!linha) return Response.json({ error: "THEME_NOT_FOUND" }, { status: 404 });
      let base: ShopifyThemeImport | null = null;
      try { base = (JSON.parse(linha.defaults) as { shopify?: ShopifyThemeImport }).shopify ?? null; } catch { base = null; }
      if (!base) return Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 404 });
      const marca = body.marca as Parameters<typeof aplicarMarcaNoTema>[1];
      const { theme } = aplicarMarcaNoTema(base, marca);
      /**
       * A capa de cada coleção, casada pelo HANDLE.
       *
       * `colecao-1` é a capa da primeira coleção, `colecao-2` da segunda: a
       * ordem é a mesma em que as peças foram pedidas, e é ela que garante que
       * a foto de "Bolsas" vá para o cartão de "Bolsas". Casar por posição só
       * funciona porque as duas listas saem da MESMA lista de nomes.
       */
      const nomes = Array.isArray(marca.collections) ? marca.collections : [];
      const capasDeColecao: Record<string, string> = {};
      nomes.forEach((nome, indice) => {
        const capa = (marca.imagens as Record<string, string> | undefined)?.[`colecao-${indice + 1}`];
        const chave = handleDeColecao(String(nome));
        if (capa && chave) capasDeColecao[chave] = capa;
      });
      const resposta = await renderResponse(viewer.id, theme, String(body.page ?? "index"), {
        capasDeColecao,
        nicheId: typeof (body.marca as { nicheId?: unknown }).nicheId === "string" ? (body.marca as { nicheId: string }).nicheId : undefined,
      });
      return resposta ?? Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 404 });
    }

    if (!body.shopify?.sourceFingerprint) return Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 400 });
    const onlySections = Array.isArray(body.sections) ? body.sections.map(String).slice(0, 8) : undefined;
    const response = await renderResponse(viewer.id, body.shopify, body.page ?? "index", { cartItems: sanitizeCartItems(body.cartItems), onlySections, handle: sanitizeHandle(body.handle), variantId: Number(body.variantId) || undefined });
    return response ?? Response.json({ error: "RENDER_UNAVAILABLE" }, { status: 404 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message.slice(0, 300) : "RENDER_FAILED" }, { status: 500 });
  }
}
