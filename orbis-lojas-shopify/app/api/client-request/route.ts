import { env } from "cloudflare:workers";
import { strToU8, zipSync, unzipSync } from "fflate";
import { z } from "zod";
import { getIdentity } from "@/lib/auth";
import { ensureDatabase, ensureUser, getD1, saveProject, unlockTheme } from "@/lib/data";
import { brandCustomization, generateClientSite, sanitizeBrand } from "@/lib/site-generator.mjs";
import { gerarMarca, logoDaMarca } from "@/lib/marca-generator.mjs";
import { aplicarMarcaNoTema } from "@/lib/shopify-brand";
import { themeFilesFromZip, type ShopifyThemeImport } from "@/lib/shopify-theme";
import { collectEditorMediaIds, exportThemeZip, type EditorMediaFile } from "@/lib/theme-export";
import { pecasDaMarca } from "@/lib/marca-imagens";

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
  /* o que a loja VENDE. Não diz nada sobre quem escreve a marca. */
  nicheId: z.string().min(1).max(40).optional(),
  /**
   * Quem escreve a MARCA: `true` = a Orbis inventa a partir do nicho, `false` =
   * o cliente já tem a dele e só preencheu.
   *
   * Existe porque o servidor deduzia isso da presença do `nicheId`, e as duas
   * coisas não são a mesma pergunta. Com a dedução, um cliente com marca
   * própria que escolhesse o nicho — só para ter catálogo — teria os campos em
   * branco preenchidos com uma identidade inventada. Ausente, a dedução antiga
   * vale, para não quebrar pedido gravado antes disto.
   */
  criarMarca: z.boolean().optional(),
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
  /**
   * Imagens já geradas pelo provedor de IA, por chave de peça, como id de mídia
   * (`/api/media/<id>`). Só chegam quando o cliente pediu a geração; sem elas a
   * loja usa os desenhos locais e nasce completa do mesmo jeito.
   */
  imagens: z.record(z.string().max(40), z.string().regex(/^\/api\/media\/[0-9a-fA-F-]{16,64}$/)).optional(),
});

/**
 * O tema Shopify completo, com a marca já gravada nos settings.
 *
 * Reaproveita o ZIP original preservado no R2 e o mesmo exportador da área do
 * estúdio, então o pacote sai com layout, templates, seções, snippets, assets e
 * locales — tudo que a Shopify exige para aceitar o upload. Sem o ZIP de origem
 * (tema antigo, importado antes da preservação) devolve nulo, e a entrega segue
 * só com a prévia local em vez de quebrar.
 */
async function montarTemaShopify(viewerId: string, tema: ShopifyThemeImport): Promise<Record<string, Uint8Array> | null> {
  if (!env.MEDIA || !/^[0-9a-f]{16}$/.test(tema.sourceFingerprint)) return null;
  const objeto = await env.MEDIA.get(`themes/${viewerId}/${tema.sourceFingerprint}.zip`);
  if (!objeto) return null;
  const originais = themeFilesFromZip(new Uint8Array(await objeto.arrayBuffer()));
  /* as imagens enviadas pelo cliente e as geradas viram `/api/media/<id>` nos
     settings; sem carregá-las aqui, o ZIP sairia apontando para um endereço
     que não existe fora deste computador, e a loja subiria sem banner */
  const midias = await carregarMidias(viewerId, tema);
  const { zip } = exportThemeZip(tema, originais, midias);
  return unzipSync(zip) as Record<string, Uint8Array>;
}

/** Busca no D1 + R2 as imagens que o tema referencia, para virarem assets. */
async function carregarMidias(viewerId: string, tema: ShopifyThemeImport) {
  const midias = new Map<string, EditorMediaFile>();
  const ids = collectEditorMediaIds(tema).slice(0, 60);
  if (!ids.length || !env.MEDIA) return midias;
  const marcadores = ids.map(() => "?").join(", ");
  const linhas = await getD1()
    .prepare(`SELECT id, storage_key AS storageKey, filename FROM media_files WHERE user_id = ? AND id IN (${marcadores})`)
    .bind(viewerId, ...ids)
    .all<{ id: string; storageKey: string; filename: string }>();
  for (const linha of linhas.results ?? []) {
    const arquivo = await env.MEDIA.get(linha.storageKey);
    if (!arquivo) continue;
    midias.set(linha.id, { filename: `orbis-${linha.id.slice(0, 8)}-${linha.filename}`, data: new Uint8Array(await arquivo.arrayBuffer()) });
  }
  return midias;
}

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

    /* a marca do pedido: gerada a partir do nicho SÓ quando o cliente pediu
       isso, com o que ele digitou vencendo campo a campo. O nicho sozinho não
       autoriza inventar identidade — ele é o catálogo. */
    const criarMarca = parsed.data.criarMarca ?? Boolean(parsed.data.nicheId);
    const marca = criarMarca && parsed.data.nicheId
      ? gerarMarca({ nicheId: parsed.data.nicheId, semente: parsed.data.seed ?? "orbis", sobrescritas: parsed.data.brand })
      : { ...parsed.data.brand, collections: [] as string[], announcement: "" };
    /* toda loja sai com logo, inclusive a preenchida à mão: sem isto o
       cabeçalho do site entregue ficava com o espaço da marca vazio */
    if (!marca.logoDataUri) marca.logoDataUri = logoDaMarca(marca).dataUri;

    /**
     * As imagens que vão para o TEMA são só as reais: o que o cliente enviou ou
     * o provedor gerou. A arte local da Orbis fica na prévia e no site estático
     * entregue — em setting de tema ela é um data URI, e data URI no
     * `image_picker` derruba o template na Shopify (a home vira 404). Onde não
     * há imagem real, o tema segue com a imagem que ele já trazia.
     */
    const pecas = pecasDaMarca({ ...marca, nicheId: parsed.data.nicheId });
    const imagens: Record<string, string> = {};
    for (const peca of pecas) {
      const enviada = parsed.data.imagens?.[peca.chave];
      if (enviada) imagens[peca.chave] = enviada;
    }

    const escolhido = parsed.data.themeId ? await temaPublicado(parsed.data.themeId) : null;
    const themeId = escolhido?.id ?? "shrine-pro";

    const unlocked = await unlockTheme(viewer, themeId, `client-site-${crypto.randomUUID()}`);
    const projectId = unlocked.projectId as string;

    /* a customização base vem do gerador do site; quando o tema tem Shopify
       importado, ela leva junto o tema com a marca já aplicada */
    const customizacao = brandCustomization(marca) as unknown as Record<string, unknown>;
    let alterados: string[] = [];
    let temaComMarca: ShopifyThemeImport | null = null;
    if (escolhido) {
      let shopify: ShopifyThemeImport | null = null;
      try { shopify = (JSON.parse(escolhido.defaults) as { shopify?: ShopifyThemeImport }).shopify ?? null; } catch { shopify = null; }
      if (shopify) {
        const resultado = aplicarMarcaNoTema(shopify, { ...marca, imagens });
        /* o nicho fica gravado no tema do projeto: é o que faz a vitrine da
           loja mostrar os produtos daquele nicho em toda rota de render */
        temaComMarca = { ...resultado.theme, orbisNicheId: parsed.data.nicheId };
        customizacao.shopify = temaComMarca;
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
    /* a prévia local vai numa subpasta: o topo do ZIP tem de ser o tema, senão
       a Shopify recusa com "missing template layout/theme.liquid" */
    const arquivos: Record<string, Uint8Array> = {};
    for (const [caminho, conteudo] of Object.entries(site.files as Record<string, string | Uint8Array>)) {
      arquivos[`previa-local/${caminho}`] = typeof conteudo === "string" ? strToU8(conteudo) : conteudo;
    }

    /* O tema Shopify de verdade: o ZIP tem de subir em Temas → Adicionar tema.
       Sem isto a entrega era um site estático, e a importação falhava. */
    const tema = temaComMarca ? await montarTemaShopify(viewer.id, temaComMarca) : null;
    if (tema) for (const [caminho, dados] of Object.entries(tema)) arquivos[caminho] = dados;

    const zip = zipSync(arquivos, { level: 6 });
    return new Response(zip.slice().buffer, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="loja-${site.brand.slug}.zip"`,
        "x-site-name": site.brand.slug,
        "x-project-id": projectId,
        "x-theme-id": themeId,
        "x-brand-settings": String(alterados.length),
        "x-theme-files": String(tema ? Object.keys(tema).length : 0),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR";
    return Response.json({ error: message }, { status: message.includes("NOT_FOUND") ? 404 : 500 });
  }
}
