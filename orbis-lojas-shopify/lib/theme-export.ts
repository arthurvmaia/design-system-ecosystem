/**
 * Exportação de tema Shopify: reaplica os valores editados no Orbis sobre os
 * arquivos ORIGINAIS do ZIP, preservando todas as chaves desconhecidas (round-trip sem perdas).
 *
 * Imagens enviadas pelo editor (`/api/media/<id>`) e data URIs viram arquivos
 * reais em `assets/` com a referência reescrita para
 * `shopify://shop_images/<arquivo>` — o formato canônico do image_picker, que o
 * próprio render do Orbis resolve por basename no round-trip.
 */
import { strFromU8, strToU8, zipSync } from "fflate";
import type { ShopifyPage, ShopifySectionInstance, ShopifyThemeImport } from "@/lib/shopify-theme";

export type ThemeExportResult = { zip: Uint8Array; modified: string[]; warnings: string[] };
export type EditorMediaFile = { filename: string; data: Uint8Array };

const EDITOR_MEDIA_URL = /^\/api\/media\/([0-9a-fA-F-]{16,64})$/;
const INLINE_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=\s]+)$/;
const INLINE_EXTENSION: Record<string, string> = { png: "png", jpg: "jpg", jpeg: "jpg", webp: "webp", gif: "gif" };
/* o draft vem do cliente: decodificar data URI sem teto é convite a estourar a memória do worker */
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

/** IDs de mídia do editor referenciados nos valores editados (globais, seções e blocos). */
export function collectEditorMediaIds(theme: ShopifyThemeImport): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (typeof value === "string") {
      const id = EDITOR_MEDIA_URL.exec(value)?.[1];
      if (id) ids.add(id);
      return;
    }
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    if (value && typeof value === "object") for (const item of Object.values(value)) visit(item);
  };
  visit(theme.globalValues);
  for (const page of theme.pages) {
    for (const section of page.sections) {
      visit(section.settings);
      for (const block of section.blocks) visit(block.settings);
    }
  }
  return Array.from(ids);
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function decodeBase64(raw: string): Uint8Array | null {
  try {
    const binary = atob(raw.replace(/\s+/g, ""));
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
    return data;
  } catch { return null; }
}

function rewriteDeep(value: unknown, rewrite: (raw: string) => string): unknown {
  if (typeof value === "string") return rewrite(value);
  if (Array.isArray(value)) return value.map((item) => rewriteDeep(item, rewrite));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = rewriteDeep(item, rewrite);
    return out;
  }
  return value;
}

type MediaRewriter = { assets: Map<string, Uint8Array>; apply: <T>(value: T) => T };

/** Alguma imagem do editor (upload ou data URI) mora nesta seção? */
function hasEditorImage(section: ShopifySectionInstance): boolean {
  const found = (value: unknown): boolean => {
    if (typeof value === "string") return EDITOR_MEDIA_URL.test(value) || INLINE_IMAGE.test(value);
    if (Array.isArray(value)) return value.some(found);
    if (value && typeof value === "object") return Object.values(value).some(found);
    return false;
  };
  return found(section.settings) || section.blocks.some((block) => found(block.settings));
}

/**
 * Converte referências de mídia do editor em assets do ZIP.
 *
 * `apply` é chamado só nos valores que de fato vão para o arquivo exportado —
 * assim nenhum asset entra no ZIP sem alguém apontando para ele (páginas com
 * template Liquid, por exemplo, não são reescritas).
 */
function createMediaRewriter(
  files: Map<string, Uint8Array>,
  editorMedia: Map<string, EditorMediaFile>,
  warnings: string[],
): MediaRewriter {
  const assets = new Map<string, Uint8Array>();
  const warned = new Set<string>();
  let inlineBudget = MAX_INLINE_BYTES;
  const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, index) => byte === b[index]);
  const registerAsset = (preferredName: string, data: Uint8Array): string => {
    /* o corte é folgado de propósito: o sufixo de colisão entra DEPOIS, senão
       ele mesmo seria cortado e o nome voltaria a colidir para sempre */
    const cut = preferredName.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-80);
    const safe = /[a-zA-Z0-9]/.test(cut) ? cut : "imagem.png";
    let name = safe;
    let attempt = 1;
    /* mesmo nome só é reaproveitado se for o mesmo conteúdo */
    while (true) {
      const registered = assets.get(`assets/${name}`);
      if (registered && sameBytes(registered, data)) return name;
      if (!registered && !files.has(`assets/${name}`)) break;
      name = `${attempt++}-${safe}`;
    }
    assets.set(`assets/${name}`, data);
    return name;
  };

  const rewrite = (raw: string): string => {
    const mediaId = EDITOR_MEDIA_URL.exec(raw)?.[1];
    if (mediaId) {
      const media = editorMedia.get(mediaId);
      if (!media) {
        if (!warned.has(mediaId)) { warned.add(mediaId); warnings.push(`imagem do editor indisponível na exportação: ${mediaId}`); }
        return raw;
      }
      return `shopify://shop_images/${registerAsset(media.filename, media.data)}`;
    }
    const inline = INLINE_IMAGE.exec(raw);
    if (inline) {
      if (inlineBudget - inline[2].length * 0.75 < 0) {
        if (!warned.has("inline-budget")) {
          warned.add("inline-budget");
          warnings.push(`imagens embutidas acima de ${Math.round(MAX_INLINE_BYTES / 1024 / 1024)}MB no total ficaram como data URI`);
        }
        return raw;
      }
      const data = decodeBase64(inline[2]);
      if (!data || !data.length) {
        if (!warned.has(raw)) { warned.add(raw); warnings.push("data URI de imagem inválido mantido como estava"); }
        return raw;
      }
      inlineBudget -= data.byteLength;
      const extension = INLINE_EXTENSION[inline[1].toLowerCase()] ?? "png";
      return `shopify://shop_images/${registerAsset(`orbis-inline-${fnv1a(inline[2])}.${extension}`, data)}`;
    }
    /**
     * Data URI que não deu para converter NÃO pode ir para o arquivo.
     *
     * O `image_picker` da Shopify espera uma referência de arquivo; um data URI
     * ali invalida o template inteiro, e a página some com 404 na loja
     * publicada. Foi o que aconteceu com SVG percent-encoded, que não casa com
     * o formato base64 tratado acima. Melhor sair sem imagem, com aviso, do que
     * sair com a página quebrada.
     */
    if (/^data:image\//i.test(raw)) {
      if (!warned.has("data-uri-solto")) {
        warned.add("data-uri-solto");
        warnings.push("imagem em data URI não suportada pela Shopify foi removida do tema; envie o arquivo para virar asset");
      }
      return "";
    }
    return raw;
  };

  return { assets, apply: <T,>(value: T) => rewriteDeep(value, rewrite) as T };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJsonLoose<T>(source: string, fallback: T): T {
  try { return JSON.parse(source.replace(/^﻿/, "").trimStart().replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, "")) as T; } catch { return fallback; }
}

/** Reaplica uma instância editada sobre o registro original da seção, preservando chaves desconhecidas. */
function mergeSectionEntry(section: ShopifySectionInstance, base: Record<string, unknown>, media: MediaRewriter) {
  const entry: Record<string, unknown> = {
    ...base,
    type: section.type,
    settings: media.apply({ ...record(base.settings), ...section.settings }),
  };
  if (section.disabled === true) entry.disabled = true;
  else delete entry.disabled;
  /* o importador lê blocks/block_order fielmente, então quem tinha blocos volta
     com os blocos que restaram — inclusive nenhum, se o usuário apagou todos */
  if (section.blocks.length || "blocks" in base) {
    const originalBlocks = record(base.blocks);
    const blocks: Record<string, unknown> = {};
    for (const block of section.blocks) {
      const blockBase = record(originalBlocks[block.id]);
      blocks[block.id] = { ...blockBase, type: block.type, settings: media.apply({ ...record(blockBase.settings), ...block.settings }) };
    }
    entry.blocks = blocks;
    entry.block_order = section.blocks.map((block) => block.id);
  } else {
    delete entry.blocks;
    delete entry.block_order;
  }
  return entry;
}

/** Reconstrói o objeto `sections` de um template JSON a partir das instâncias editadas. */
function mergePageSections(page: ShopifyPage, originalSections: Record<string, unknown>, media: MediaRewriter) {
  const sections: Record<string, unknown> = {};
  for (const section of page.sections) {
    sections[section.id] = mergeSectionEntry(section, record(originalSections[section.id]), media);
  }
  return sections;
}

export function exportThemeZip(
  theme: ShopifyThemeImport,
  files: Map<string, Uint8Array>,
  editorMedia: Map<string, EditorMediaFile> = new Map(),
): ThemeExportResult {
  const output: Record<string, Uint8Array> = {};
  const modified: string[] = [];
  const warnings: string[] = [];
  for (const [path, data] of files.entries()) {
    /**
     * Template contextual fica de fora.
     *
     * `templates/index.context.<mercado>.json` aponta para um mercado da loja
     * de ORIGEM. Em outra loja esse id não existe, e a Shopify recusa o arquivo
     * na importação. Não é perda: sem ele o template normal atende todo mundo.
     */
    if (/^templates\/.*\.context\..*\.json$/.test(path)) {
      warnings.push(`template de mercado da loja de origem removido: ${path}`);
      continue;
    }
    output[path] = data;
  }

  /* mídia do editor e data URIs viram assets reais, com as referências reescritas */
  const media = createMediaRewriter(files, editorMedia, warnings);
  /* nem toda seção tem para onde ser gravada: página de template Liquid e
     páginas geradas pelo importador não existem como arquivo editável */
  const written = new Set<string>();

  /* config/settings_data.json — valores globais editados sobre o original */
  const settingsPath = "config/settings_data.json";
  const originalSettingsRaw = files.get(settingsPath);
  if (originalSettingsRaw) {
    const parsed = parseJsonLoose<Record<string, unknown>>(strFromU8(originalSettingsRaw), {});
    const current = record(parsed.current);
    const nextCurrent: Record<string, unknown> = { ...current };
    for (const [key, value] of Object.entries(theme.globalValues)) nextCurrent[key] = media.apply(value as unknown);
    /* seções vintage guardadas em current.sections */
    const currentSections = record(current.sections);
    if (Object.keys(currentSections).length) {
      const byId = new Map(theme.pages.flatMap((page) => page.sections.map((section) => [section.id, section] as const)));
      const nextSections: Record<string, unknown> = { ...currentSections };
      for (const [id, raw] of Object.entries(currentSections)) {
        const ours = byId.get(id);
        if (!ours) continue;
        nextSections[id] = mergeSectionEntry(ours, record(raw), media);
        written.add(id);
      }
      nextCurrent.sections = nextSections;
    }
    const merged = { ...parsed, current: nextCurrent };
    if (JSON.stringify(merged) !== JSON.stringify(parsed)) {
      output[settingsPath] = strToU8(JSON.stringify(merged, null, 2));
      modified.push(settingsPath);
    }
  } else {
    warnings.push("config/settings_data.json ausente no ZIP original");
  }

  /* templates JSON e section groups */
  for (const page of theme.pages) {
    const path = page.template;
    /* página sem arquivo de origem (gerada pelo importador) não tem onde ser
       gravada; sem esta guarda a exportação inteira estourava */
    if (typeof path !== "string" || !path.endsWith(".json")) continue;
    const originalRaw = files.get(path);
    if (!originalRaw) { warnings.push(`template ${path} não existe no ZIP original (página gerada)`); continue; }
    const parsed = parseJsonLoose<Record<string, unknown>>(strFromU8(originalRaw), {});
    const merged = {
      ...parsed,
      sections: mergePageSections(page, record(parsed.sections), media),
      order: page.sections.map((section) => section.id),
    };
    if (JSON.stringify(merged) !== JSON.stringify(parsed)) {
      output[path] = strToU8(JSON.stringify(merged, null, 2));
      modified.push(path);
    }
    for (const section of page.sections) written.add(section.id);
  }

  /* trocar uma imagem numa seção que não tem onde ser gravada é uma edição
     perdida em silêncio; o usuário precisa saber disso */
  for (const page of theme.pages) {
    const perdidas = page.sections.filter((section) => !written.has(section.id) && hasEditorImage(section));
    if (perdidas.length) {
      warnings.push(`imagens trocadas em "${page.name}" não couberam no formato do tema (a página não tem template JSON) e ficaram de fora`);
    }
  }

  /* por último: só entram os assets que alguma referência gravada aponta */
  for (const [path, data] of media.assets.entries()) {
    output[path] = data;
    modified.push(path);
  }

  return { zip: zipSync(output), modified, warnings };
}
