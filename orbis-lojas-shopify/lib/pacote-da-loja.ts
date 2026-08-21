/**
 * O PACOTE DA LOJA: o tema completo, com a marca já gravada nos settings.
 *
 * Mora aqui, e não dentro de uma rota, porque agora são DUAS as portas de saída
 * da mesma loja — o ZIP que o cliente baixa e a instalação direta na conta dele
 * pela API. As duas precisam exatamente dos mesmos arquivos, e duas cópias
 * disso divergiriam no primeiro conserto que alguém fizesse só de um lado.
 */
import { env } from "cloudflare:workers";
import { unzipSync } from "fflate";
import { getD1 } from "./data";
import { themeFilesFromZip, type ShopifyThemeImport } from "./shopify-theme";
import { collectEditorMediaIds, exportThemeZip, type EditorMediaFile } from "./theme-export";

/**
 * O tema Shopify completo, com a marca já gravada nos settings.
 *
 * Reaproveita o ZIP original preservado no R2 e o mesmo exportador da área do
 * estúdio, então o pacote sai com layout, templates, seções, snippets, assets e
 * locales — tudo que a Shopify exige para aceitar o upload. Sem o ZIP de origem
 * (tema antigo, importado antes da preservação) devolve nulo, e a entrega segue
 * só com a prévia local em vez de quebrar.
 */
export async function montarTemaShopify(viewerId: string, tema: ShopifyThemeImport): Promise<Record<string, Uint8Array> | null> {
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
export async function carregarMidias(viewerId: string, tema: ShopifyThemeImport) {
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
