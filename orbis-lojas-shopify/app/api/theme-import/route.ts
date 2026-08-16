import { env } from "cloudflare:workers";
import { getIdentity } from "@/lib/auth";
import { ensureUser, getD1, importShopifyTheme, registerThemeSource } from "@/lib/data";
import { extractShopifyThemePackage, type ShopifyThemeImageAsset, type ShopifyThemeImport } from "@/lib/shopify-theme";
import { percorrerValores } from "@/lib/theme-export";

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
    const instalados = await installThemeImages(viewer.id, imported.sourceFingerprint, images);
    imported.assetUrls = instalados.urls;
    imported.assetPreview = pickThemePreview(images, imported.assetUrls);
    /* o que o ZIP trouxe e não ficou disponível — do corte por tamanho ao erro
       de upload — sai numa lista só, que é o que a tela mostra */
    const fora = [...(imported.assetsForaDaInstalacao ?? []), ...instalados.fora];
    if (fora.length) imported.assetsForaDaInstalacao = fora;
    /* as fotos que este app produziu voltam sozinhas: a Shopify não as põe no
       ZIP, mas o nome delas carrega o id da mídia, e o arquivo está aqui */
    const religadas = await religarImagensDaOrbis(viewer.id, imported);
    const result = await importShopifyTheme(viewer, imported);
    if (sourceKey) await registerThemeSource(viewer, result.themeId, imported, sourceKey, file.size);
    return Response.json({ ...result, imagensReligadas: religadas }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SHOPIFY_IMPORT_FAILED";
    const invalid = message.startsWith("SHOPIFY_");
    return Response.json({ error: message }, { status: invalid ? 400 : 500 });
  }
}

/**
 * RECONECTA as imagens que este app já produziu.
 *
 * Um tema exportado da Shopify aponta as fotos como `shopify://shop_images/…`,
 * e o arquivo NÃO viaja no ZIP: ele mora nos Arquivos da loja, e a Shopify não
 * o coloca no pacote. Por isso reimportar a própria loja trazia o banner em
 * branco, com o quadro de "conecte esta imagem".
 *
 * Só que quando a foto saiu DAQUI, o nome dela carrega a identidade: a
 * exportação grava `orbis-<8 primeiros do id>-<arquivo>`. Se esse id ainda está
 * em `media_files`, o arquivo continua nesta máquina e é o MESMO. Aí não há
 * nada a adivinhar: é procurar e religar.
 *
 * O limite é esse, e é de propósito. Só religa imagem com o prefixo `orbis-`
 * cujo id existe no banco DESTE usuário. Foto que veio de outra loja continua
 * como está — inventar uma imagem no lugar de outra seria pior que o quadro
 * vazio, porque o quadro vazio pelo menos avisa.
 */
async function religarImagensDaOrbis(viewerId: string, tema: ShopifyThemeImport) {
  const REFERENCIA = /^shopify:\/\/shop_images\/orbis-([0-9a-f]{8})-/i;
  const prefixos = new Set<string>();
  percorrerValores(tema, (valor) => {
    const id = REFERENCIA.exec(valor)?.[1];
    if (id) prefixos.add(id.toLowerCase());
    return null;
  });
  if (!prefixos.size) return 0;

  const lista = [...prefixos].slice(0, 60);
  const condicoes = lista.map(() => "id LIKE ?").join(" OR ");
  const linhas = await getD1()
    .prepare(`SELECT id FROM media_files WHERE user_id = ? AND (${condicoes})`)
    .bind(viewerId, ...lista.map((prefixo) => `${prefixo}%`))
    .all<{ id: string }>();
  const porPrefixo = new Map((linhas.results ?? []).map((linha) => [linha.id.slice(0, 8).toLowerCase(), linha.id]));
  if (!porPrefixo.size) return 0;

  return percorrerValores(tema, (valor) => {
    const id = REFERENCIA.exec(valor)?.[1]?.toLowerCase();
    const completo = id ? porPrefixo.get(id) : undefined;
    return completo ? `/api/media/${completo}` : null;
  });
}

/**
 * Instala todos os assets do tema no R2 (CSS, JS, fontes, imagens); sem R2,
 * embute imagens pequenas como data URI.
 *
 * Devolve também o que NÃO entrou. O tema continua pedindo esses arquivos ao
 * desenhar a página, então cada ausência é uma imagem partida na prévia — e uma
 * imagem partida sem explicação vira caça ao fantasma. Quem sabe o motivo é
 * aqui.
 */
async function installThemeImages(ownerId: string, fingerprint: string, assets: ShopifyThemeImageAsset[]) {
  const urls: Record<string, string> = {};
  const fora: Array<{ path: string; bytes: number; motivo: string }> = [];
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
      } catch (error) {
        const causa = error instanceof Error ? error.message : "falha desconhecida";
        fora.push({ path: asset.path, bytes: asset.data.byteLength, motivo: `não subiu para o armazenamento: ${causa}`.slice(0, 160) });
      }
    }
    return { urls, fora };
  }
  /* sem R2 o embutido tem teto de verdade (o HTML carrega tudo junto), então
     aqui o que sobra também é declarado em vez de sumir */
  let total = 0;
  for (const asset of assets) {
    if (!asset.contentType.startsWith("image/")) continue;
    if (asset.data.byteLength > DATA_URI_MAX_FILE) {
      fora.push({ path: asset.path, bytes: asset.data.byteLength, motivo: "sem armazenamento: grande demais para embutir na página" });
      continue;
    }
    if (total + asset.data.byteLength > DATA_URI_MAX_TOTAL) {
      fora.push({ path: asset.path, bytes: asset.data.byteLength, motivo: "sem armazenamento: o total embutido chegou ao limite" });
      continue;
    }
    total += asset.data.byteLength;
    urls[asset.name] = `data:${asset.contentType};base64,${base64FromBytes(asset.data)}`;
  }
  return { urls, fora };
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
