import { strFromU8, unzipSync, zipSync } from "fflate";

export type ShopifyValue = string | number | boolean | null | ShopifyValue[] | { [key: string]: ShopifyValue };

export type ShopifySettingDefinition = {
  id: string;
  type: string;
  label: string;
  info?: string;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  placeholder?: string;
  /** Expressão visible_if do schema (Liquid), avaliada pelo editor. */
  visibleIf?: string;
  options?: Array<{ value: string; label: string }>;
  default?: ShopifyValue;
  children?: ShopifySettingDefinition[];
};

export type ShopifySectionAvailability = { templates?: string[]; groups?: string[] };

export type ShopifyBlockSchema = {
  type: string;
  name: string;
  settings: ShopifySettingDefinition[];
};

export type ShopifySectionSchema = {
  type: string;
  name: string;
  settings: ShopifySettingDefinition[];
  blocks: ShopifyBlockSchema[];
  maxBlocks?: number;
  enabledOn?: ShopifySectionAvailability;
  disabledOn?: ShopifySectionAvailability;
  presets: Array<{
    name: string;
    settings: Record<string, ShopifyValue>;
    blocks: Array<{ type: string; settings: Record<string, ShopifyValue> }>;
  }>;
};

export type ShopifyBlockInstance = {
  id: string;
  type: string;
  settings: Record<string, ShopifyValue>;
};

export type ShopifySectionInstance = {
  id: string;
  type: string;
  name: string;
  disabled?: boolean;
  settings: Record<string, ShopifyValue>;
  blocks: ShopifyBlockInstance[];
};

export type ShopifyPage = {
  id: string;
  name: string;
  template: string;
  sections: ShopifySectionInstance[];
};

export type ShopifyThemeImport = {
  format: "shopify-os-2.0" | "shopify-vintage" | "shopify-hybrid";
  themeName: string;
  version: string;
  author: string;
  sourceFile: string;
  sourceFingerprint: string;
  importedAt: string;
  summary: {
    fileCount: number;
    templateCount: number;
    jsonTemplateCount: number;
    liquidTemplateCount: number;
    sectionDefinitionCount: number;
    editableSettingCount: number;
    assetCount: number;
    snippetCount: number;
    localeCount: number;
    layoutCount: number;
  };
  sourceFiles: Array<{ path: string; kind: string; size: number }>;
  compatibility: {
    architecture: "Shopify OS 2.0" | "Shopify clássico" | "Shopify híbrido";
    preservedSource: boolean;
    externalData: string[];
    packageDepth?: number;
    themeArchivePath?: string;
  };
  globalGroups: Array<{ name: string; settings: ShopifySettingDefinition[] }>;
  globalValues: Record<string, ShopifyValue>;
  sectionSchemas: ShopifySectionSchema[];
  pages: ShopifyPage[];
  /** Mapa de nome de arquivo (minúsculo) → URL servida localmente para cada imagem do ZIP. */
  assetUrls?: Record<string, string>;
  /** Melhor imagem para representar o tema em cards e prévias. */
  assetPreview?: string;
  /** Nicho da loja gerada pela área do cliente; decide a vitrine de produtos. */
  orbisNicheId?: string;
};

export type ShopifyThemeImageAsset = {
  /** Caminho relativo dentro do tema, ex.: assets/banner.png */
  path: string;
  /** Nome do arquivo em minúsculas, ex.: banner.png */
  name: string;
  contentType: string;
  data: Uint8Array;
};

export type ShopifyThemePackage = {
  theme: ShopifyThemeImport;
  images: ShopifyThemeImageAsset[];
};

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon",
};
export const ASSET_CONTENT_TYPES: Record<string, string> = {
  ...IMAGE_EXTENSIONS,
  css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8",
  map: "application/json", json: "application/json", woff: "font/woff", woff2: "font/woff2",
  ttf: "font/ttf", otf: "font/otf", eot: "application/vnd.ms-fontobject",
  mp4: "video/mp4", webm: "video/webm", txt: "text/plain; charset=utf-8", liquid: "text/plain; charset=utf-8",
};
const MAX_IMAGE_ASSETS = 800;
const MAX_IMAGE_ASSET_BYTES = 10 * 1024 * 1024;

export const MAX_THEME_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_EXTRACTED_BYTES = 400 * 1024 * 1024;
const MAX_FILES = 10000;
const MAX_ARCHIVE_DEPTH = 4;
const MAX_NESTED_ARCHIVES = 40;
const SENSITIVE_ID = /(auth|token|licen[cs]e|secret|password|private[_-]?key)/i;
const NON_DESIGN_GROUP = /^(authentication|security|author)$/i;

type ArchiveEntry = [string, Uint8Array];
type ResolvedThemeArchive = {
  entries: ArchiveEntry[];
  settingsSchemaEntry: ArchiveEntry;
  archivePath: string;
  depth: number;
  score: number;
};

export async function extractShopifyTheme(file: File): Promise<ShopifyThemeImport> {
  if (!file.name.toLowerCase().endsWith(".zip")) throw new Error("SHOPIFY_ZIP_REQUIRED");
  if (file.size <= 0 || file.size > MAX_THEME_ZIP_BYTES) throw new Error("SHOPIFY_ZIP_SIZE");
  return extractShopifyThemeBytes(new Uint8Array(await file.arrayBuffer()), file.name);
}

export function extractShopifyThemeBytes(bytes: Uint8Array, sourceFile: string): ShopifyThemeImport {
  return extractShopifyThemePackage(bytes, sourceFile).theme;
}

export function extractShopifyThemePackage(bytes: Uint8Array, sourceFile: string): ShopifyThemePackage {
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_THEME_ZIP_BYTES) throw new Error("SHOPIFY_ZIP_SIZE");
  const inspected = { archives: 0, files: 0, bytes: 0 };
  const resolved = resolveThemeArchive(bytes, "", 0, inspected);
  if (!resolved) throw new Error("SHOPIFY_THEME_STRUCTURE");
  const { entries, settingsSchemaEntry } = resolved;

  const rootPrefix = normalizedPath(settingsSchemaEntry[0]).slice(0, -"config/settings_schema.json".length);
  const byRelativePath = new Map<string, Uint8Array>();
  for (const [path, value] of entries) {
    const normalized = normalizedPath(path);
    if (!normalized.startsWith(rootPrefix)) continue;
    const relativo = normalized.slice(rootPrefix.length);
    /**
     * `previa-local/` NÃO entra no tema.
     *
     * O pacote que a Orbis entrega é importável como tema — é o objetivo dele —
     * e leva ao lado do tema uma pasta `previa-local/` com o site de prévia, o
     * CSV de produtos, o kit de logo e as instruções. Quando alguém reimporta
     * esse pacote (gesto natural: "vou pôr minha loja de volta no estúdio"), a
     * pasta entra junto e vira parte do tema para sempre.
     *
     * O estrago é silencioso e cumulativo: na geração seguinte os arquivos do
     * tema são gravados DEPOIS dos novos e sobrescrevem o CSV, o leia-me e as
     * imagens com os da entrega anterior. Um tema real desta máquina chegou a
     * 354 arquivos, 40 deles de prévia, e cada loja nova nascia com o catálogo
     * de uma loja velha.
     *
     * Aqui se corta na raiz: prévia não é arquivo de tema, e a Shopify também
     * não a reconheceria.
     */
    if (relativo.startsWith("previa-local/")) continue;
    byRelativePath.set(relativo, value);
  }

  const rawSettingsSchema = parseJson<unknown[]>(byRelativePath.get("config/settings_schema.json"), []);
  if (!rawSettingsSchema.length) throw new Error("SHOPIFY_SETTINGS_SCHEMA");
  const rawSettingsData = parseJson<Record<string, unknown>>(byRelativePath.get("config/settings_data.json"), {});
  const translationEntry = byRelativePath.get("locales/pt-BR.schema.json") ?? byRelativePath.get("locales/en.default.schema.json") ?? Array.from(byRelativePath.entries()).find(([path]) => path.startsWith("locales/") && path.endsWith(".schema.json"))?.[1];
  const translations = parseJson<Record<string, unknown>>(translationEntry, {});
  const themeInfo = record(rawSettingsSchema.find((group) => record(group).name === "theme_info"));
  const globalGroups = rawSettingsSchema
    .map((value) => record(value))
    .filter((group) => !NON_DESIGN_GROUP.test(text(group.name, "")))
    .map((group) => ({
      name: cleanLabel(group.name, "Configurações", translations),
      settings: parseSettingDefinitions(group.settings, translations),
    }))
    .filter((group) => group.settings.length > 0);

  const currentSettings = record(rawSettingsData.current);
  const globalValues = sanitizeSettings(currentSettings);
  for (const group of globalGroups) {
    for (const setting of group.settings) {
      if (!(setting.id in globalValues) && setting.default !== undefined) globalValues[setting.id] = setting.default;
    }
  }

  const sectionSchemas = Array.from(byRelativePath.entries())
    .filter(([path]) => path.startsWith("sections/") && path.endsWith(".liquid"))
    .map(([path, value]) => parseSectionSchema(path, strFromU8(value), translations))
    .filter((value): value is ShopifySectionSchema => Boolean(value));
  const schemaByType = new Map(sectionSchemas.map((schema) => [schema.type, schema]));

  /* Qualquer sections/*.json é um section group (header, footer, overlay,
     aside, o que o tema quiser). Arquivos .context.* são sobrescritas
     contextuais de mercado — ficam preservados no ZIP, mas não viram página
     do editor (a Shopify também não os lista). */
  const jsonPageEntries = Array.from(byRelativePath.entries()).filter(([path]) =>
    (path.startsWith("templates/") || path.startsWith("sections/")) && path.endsWith(".json") && !path.includes(".context."),
  );
  const liquidPageEntries = Array.from(byRelativePath.entries()).filter(([path]) => path.startsWith("templates/") && path.endsWith(".liquid"));
  const jsonPages = jsonPageEntries
    .map(([path, value]) => parsePage(path, value, schemaByType))
    .filter((value): value is ShopifyPage => Boolean(value));
  const currentSections = record(currentSettings.sections);
  const liquidPages = liquidPageEntries
    .map(([path, value]) => parseLiquidPage(path, strFromU8(value), schemaByType, currentSettings, currentSections))
    .filter((value): value is ShopifyPage => Boolean(value));
  const pageMap = new Map<string, ShopifyPage>();
  for (const page of [...liquidPages, ...jsonPages]) pageMap.set(page.id, page);
  const layoutSource = strFromU8(byRelativePath.get("layout/theme.liquid") ?? new Uint8Array());
  for (const page of parseLegacyGlobalGroups(layoutSource, schemaByType, currentSections)) {
    if (!pageMap.has(page.id)) pageMap.set(page.id, page);
  }
  ensureEssentialPages(pageMap, schemaByType);
  const pages = Array.from(pageMap.values()).sort((a, b) => pagePosition(a.id) - pagePosition(b.id) || a.id.localeCompare(b.id));
  if (!pages.length || !sectionSchemas.length) throw new Error("SHOPIFY_THEME_CONTENT");

  const editableSettingCount = globalGroups.reduce((total, group) => total + group.settings.length, 0)
    + sectionSchemas.reduce((total, section) => total + section.settings.length + section.blocks.reduce((blockTotal, block) => blockTotal + block.settings.length, 0), 0);
  const hasJsonTemplates = jsonPageEntries.some(([path]) => path.startsWith("templates/"));
  const hasLiquidTemplates = liquidPageEntries.length > 0;
  const format = hasJsonTemplates && hasLiquidTemplates ? "shopify-hybrid" : hasJsonTemplates ? "shopify-os-2.0" : "shopify-vintage";
  const architecture = format === "shopify-os-2.0" ? "Shopify OS 2.0" : format === "shopify-vintage" ? "Shopify clássico" : "Shopify híbrido";
  const sourceFiles = Array.from(byRelativePath.entries()).map(([path, value]) => ({ path: path.slice(0, 240), kind: fileKind(path), size: value.byteLength }));
  const nestedSourceFile = resolved.archivePath ? `${sourceFile} › ${resolved.archivePath}` : sourceFile;

  const theme: ShopifyThemeImport = {
    format,
    themeName: cleanLabel(themeInfo.theme_name, fileNameWithoutExtension(resolved.archivePath || sourceFile)),
    version: text(themeInfo.theme_version, "1.0"),
    author: cleanLabel(themeInfo.theme_author, "Shopify"),
    sourceFile: nestedSourceFile.slice(0, 240),
    sourceFingerprint: fingerprintBytes(bytes),
    importedAt: new Date().toISOString(),
    summary: {
      fileCount: sourceFiles.length,
      templateCount: pages.length,
      jsonTemplateCount: jsonPageEntries.length,
      liquidTemplateCount: liquidPageEntries.length,
      sectionDefinitionCount: sectionSchemas.length,
      editableSettingCount,
      assetCount: sourceFiles.filter((file) => file.kind === "asset").length,
      snippetCount: sourceFiles.filter((file) => file.kind === "snippet").length,
      localeCount: sourceFiles.filter((file) => file.kind === "locale").length,
      layoutCount: sourceFiles.filter((file) => file.kind === "layout").length,
    },
    sourceFiles,
    compatibility: {
      architecture,
      preservedSource: false,
      externalData: ["Produtos e variantes", "Coleções e menus", "Pedidos, clientes e avaliações", "Apps e extensões da loja"],
      packageDepth: resolved.depth,
      themeArchivePath: resolved.archivePath || undefined,
    },
    globalGroups,
    globalValues,
    sectionSchemas,
    pages,
  };
  return { theme, images: collectImageAssets(byRelativePath) };
}

function collectImageAssets(byRelativePath: Map<string, Uint8Array>): ShopifyThemeImageAsset[] {
  const assets: ShopifyThemeImageAsset[] = [];
  for (const [path, data] of byRelativePath.entries()) {
    if (!path.startsWith("assets/")) continue;
    const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
    const contentType = ASSET_CONTENT_TYPES[extension] ?? "application/octet-stream";
    if (data.byteLength <= 0 || data.byteLength > MAX_IMAGE_ASSET_BYTES) continue;
    const name = path.split("/").at(-1)?.toLowerCase() ?? "";
    if (!name) continue;
    assets.push({ path, name, contentType, data });
    if (assets.length >= MAX_IMAGE_ASSETS) break;
  }
  return assets;
}

/* Extensões que o "Editar código" trata como texto editável; o resto (imagens,
   fontes, vídeo) é listado como binário e fica intocável pela edição. */
const EDITABLE_CODE_EXTENSIONS = /\.(liquid|json|js|mjs|css|scss|svg|txt|md|map)$/i;
const CODE_FOLDERS = /^(layout|sections|snippets|templates|config|locales|assets|blocks)\//;
export const MAX_CODE_FILE_BYTES = 2 * 1024 * 1024;

/** O caminho pode ser editado pelo editor de código? (pasta conhecida, extensão de texto, sem escapes) */
export function isEditableCodePath(path: string): boolean {
  const normalized = normalizedPath(path);
  return CODE_FOLDERS.test(normalized)
    && EDITABLE_CODE_EXTENSIONS.test(normalized)
    && !normalized.split("/").includes("..")
    && normalized.length <= 240;
}

/**
 * Regrava UM arquivo dentro do ZIP preservado, byte a byte para todo o resto.
 * É a base do "Editar código": o ZIP no R2 é a fonte da verdade do render e da
 * exportação, então salvar aqui já muda a prévia e o ZIP exportado.
 */
export function updateThemeSourceFile(bytes: Uint8Array, relativePath: string, data: Uint8Array): Uint8Array {
  if (!isEditableCodePath(relativePath)) throw new Error("SHOPIFY_CODE_PATH");
  if (data.byteLength > MAX_CODE_FILE_BYTES) throw new Error("SHOPIFY_CODE_SIZE");
  const inspected = { archives: 0, files: 0, bytes: 0 };
  const resolved = resolveThemeArchive(bytes, "", 0, inspected);
  if (!resolved) throw new Error("SHOPIFY_THEME_STRUCTURE");
  /* tema dentro de pacote aninhado: regravar exigiria reescrever ZIP dentro de
     ZIP; melhor recusar com clareza do que corromper o pacote original */
  if (resolved.depth > 0) throw new Error("SHOPIFY_CODE_NESTED");
  const rootPrefix = normalizedPath(resolved.settingsSchemaEntry[0]).slice(0, -"config/settings_schema.json".length);
  const unzipped = unzipSync(bytes);
  unzipped[`${rootPrefix}${relativePath}`] = data;
  return zipSync(unzipped);
}

/** Reabre o ZIP de origem e devolve o mapa de arquivos relativos à raiz do tema (layout/, sections/, snippets/, config/, locales/, templates/, assets/). */
export function themeFilesFromZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const inspected = { archives: 0, files: 0, bytes: 0 };
  const resolved = resolveThemeArchive(bytes, "", 0, inspected);
  if (!resolved) throw new Error("SHOPIFY_THEME_STRUCTURE");
  const rootPrefix = normalizedPath(resolved.settingsSchemaEntry[0]).slice(0, -"config/settings_schema.json".length);
  const byRelativePath = new Map<string, Uint8Array>();
  for (const [path, value] of resolved.entries) {
    const normalized = normalizedPath(path);
    if (!normalized.startsWith(rootPrefix)) continue;
    const relativo = normalized.slice(rootPrefix.length);
    /**
     * `previa-local/` NÃO entra no tema.
     *
     * O pacote que a Orbis entrega é importável como tema — é o objetivo dele —
     * e leva ao lado do tema uma pasta `previa-local/` com o site de prévia, o
     * CSV de produtos, o kit de logo e as instruções. Quando alguém reimporta
     * esse pacote (gesto natural: "vou pôr minha loja de volta no estúdio"), a
     * pasta entra junto e vira parte do tema para sempre.
     *
     * O estrago é silencioso e cumulativo: na geração seguinte os arquivos do
     * tema são gravados DEPOIS dos novos e sobrescrevem o CSV, o leia-me e as
     * imagens com os da entrega anterior. Um tema real desta máquina chegou a
     * 354 arquivos, 40 deles de prévia, e cada loja nova nascia com o catálogo
     * de uma loja velha.
     *
     * Aqui se corta na raiz: prévia não é arquivo de tema, e a Shopify também
     * não a reconheceria.
     */
    if (relativo.startsWith("previa-local/")) continue;
    byRelativePath.set(relativo, value);
  }
  return byRelativePath;
}

function resolveThemeArchive(
  bytes: Uint8Array,
  archivePath: string,
  depth: number,
  inspected: { archives: number; files: number; bytes: number },
): ResolvedThemeArchive | null {
  if (depth > MAX_ARCHIVE_DEPTH || inspected.archives >= MAX_NESTED_ARCHIVES) return null;
  if (bytes.byteLength <= 0 || bytes.byteLength > MAX_THEME_ZIP_BYTES) return null;

  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    if (depth === 0) throw new Error("SHOPIFY_ZIP_INVALID");
    return null;
  }

  inspected.archives += 1;
  const entries = Object.entries(unzipped).filter(([path]) => !path.endsWith("/") && safeArchivePath(path)) as ArchiveEntry[];
  if (!entries.length) return null;
  inspected.files += entries.length;
  inspected.bytes += entries.reduce((total, [, value]) => total + value.byteLength, 0);
  if (inspected.files > MAX_FILES) throw new Error("SHOPIFY_ZIP_FILES");
  if (inspected.bytes > MAX_EXTRACTED_BYTES) throw new Error("SHOPIFY_ZIP_EXPANDED_SIZE");

  let best = themeCandidate(entries, archivePath, depth);
  if (depth === MAX_ARCHIVE_DEPTH) return best;

  const nestedArchives = entries
    .filter(([path, value]) => path.toLowerCase().endsWith(".zip") && value.byteLength > 0 && value.byteLength <= MAX_THEME_ZIP_BYTES)
    .sort(([leftPath], [rightPath]) => nestedArchivePriority(rightPath) - nestedArchivePriority(leftPath));

  for (const [path, nestedBytes] of nestedArchives) {
    const nestedPath = archivePath ? `${archivePath} › ${normalizedPath(path)}` : normalizedPath(path);
    const candidate = resolveThemeArchive(nestedBytes, nestedPath, depth + 1, inspected);
    if (candidate && (!best || candidate.score > best.score)) best = candidate;
  }
  return best;
}

function themeCandidate(entries: ArchiveEntry[], archivePath: string, depth: number): ResolvedThemeArchive | null {
  const schemas = entries.filter(([path]) => normalizedPath(path).endsWith("config/settings_schema.json"));
  let best: ResolvedThemeArchive | null = null;
  for (const settingsSchemaEntry of schemas) {
    const normalized = normalizedPath(settingsSchemaEntry[0]);
    const rootPrefix = normalized.slice(0, -"config/settings_schema.json".length);
    const paths = entries
      .map(([path]) => normalizedPath(path))
      .filter((path) => path.startsWith(rootPrefix))
      .map((path) => path.slice(rootPrefix.length));
    const score = 1000
      + (paths.includes("layout/theme.liquid") ? 400 : 0)
      + (paths.includes("config/settings_data.json") ? 150 : 0)
      + Math.min(200, paths.filter((path) => path.startsWith("templates/")).length * 10)
      + Math.min(200, paths.filter((path) => path.startsWith("sections/")).length * 4)
      + Math.min(100, paths.filter((path) => path.startsWith("assets/")).length);
    if (!best || score > best.score) best = { entries, settingsSchemaEntry, archivePath, depth, score };
  }
  return best;
}

function nestedArchivePriority(path: string) {
  const normalized = normalizedPath(path).toLowerCase();
  return (/theme|tema|shopify|install|upload|kalles/.test(normalized) ? 10 : 0)
    - (/documentation|docs|manual|backup/.test(normalized) ? 10 : 0);
}

function parseSectionSchema(path: string, liquid: string, translations: Record<string, unknown>): ShopifySectionSchema | null {
  const match = liquid.match(/{%[-\s]*schema[-\s]*%}([\s\S]*?){%[-\s]*endschema[-\s]*%}/i);
  if (!match) return null;
  let source: Record<string, unknown>;
  try { source = record(JSON.parse(match[1])); } catch { return null; }
  const type = path.replace(/^sections\//, "").replace(/\.liquid$/, "");
  const blocks = Array.isArray(source.blocks) ? source.blocks.map((value) => record(value)).map((block) => ({
    type: text(block.type, "block").slice(0, 80),
    name: cleanLabel(block.name, humanize(text(block.type, "Bloco")), translations),
    settings: parseSettingDefinitions(block.settings, translations),
  })) : [];
  const presets = Array.isArray(source.presets) ? source.presets.slice(0, 80).map((value) => record(value)).map((preset) => ({
    name: cleanLabel(preset.name, "Predefinição", translations),
    settings: sanitizeSettings(record(preset.settings)),
    blocks: Array.isArray(preset.blocks) ? preset.blocks.slice(0, 120).map((value) => record(value)).map((block) => ({ type: text(block.type, "block").slice(0, 80), settings: sanitizeSettings(record(block.settings)) })) : [],
  })) : [];
  const availability = (value: unknown): ShopifySectionAvailability | undefined => {
    const source = record(value);
    const templates = Array.isArray(source.templates) ? source.templates.map(String).slice(0, 60) : undefined;
    const groups = Array.isArray(source.groups) ? source.groups.map(String).slice(0, 20) : undefined;
    return templates || groups ? { templates, groups } : undefined;
  };
  return {
    type,
    name: cleanLabel(source.name, humanize(type), translations),
    settings: parseSettingDefinitions(source.settings, translations),
    blocks,
    maxBlocks: Number.isFinite(source.max_blocks) ? Number(source.max_blocks) : undefined,
    enabledOn: availability(source.enabled_on),
    disabledOn: availability(source.disabled_on),
    presets,
  };
}

function parsePage(path: string, bytes: Uint8Array, schemaByType: Map<string, ShopifySectionSchema>): ShopifyPage | null {
  const source = parseJson<Record<string, unknown>>(bytes, {});
  const rawSections = record(source.sections);
  if (!Object.keys(rawSections).length) return null;
  const order = Array.isArray(source.order) ? source.order.map(String) : Object.keys(rawSections);
  const sectionIds = [...order, ...Object.keys(rawSections).filter((id) => !order.includes(id))];
  const sections = sectionIds.map((id) => sectionFromRecord(id, record(rawSections[id]), schemaByType));
  const id = path.replace(/^(templates|sections)\//, "").replace(/\.json$/, "");
  return { id, name: pageLabel(id), template: path, sections };
}

function parseLiquidPage(path: string, liquid: string, schemaByType: Map<string, ShopifySectionSchema>, currentSettings: Record<string, unknown>, currentSections: Record<string, unknown>): ShopifyPage | null {
  const id = path.replace(/^templates\//, "").replace(/\.liquid$/, "");
  const sections: ShopifySectionInstance[] = [];
  if (id === "index" && Array.isArray(currentSettings.content_for_index)) {
    for (const sectionId of currentSettings.content_for_index.map(String)) {
      const raw = record(currentSections[sectionId]);
      if (Object.keys(raw).length) sections.push(sectionFromRecord(sectionId, raw, schemaByType));
    }
  }
  if (!sections.length) {
    const tags = Array.from(liquid.matchAll(/{%[-\s]*(?:section|sections)\s+['"]([^'"]+)['"][\s-]*%}/gi)).map((match) => match[1]);
    for (const [index, type] of tags.entries()) sections.push(defaultSection(type, `liquid-${index}-${type}`, schemaByType));
  }
  if (!sections.length) {
    const fallbackTypes = legacyPageSections(id);
    for (const [index, type] of fallbackTypes.entries()) sections.push(defaultSection(type, `legacy-${index}-${type}`, schemaByType));
  }
  if (!sections.length) sections.push({ id: `liquid-${id}`, type: "custom-liquid", name: "Template Liquid", settings: { template_note: "Código Liquid preservado no ZIP original" }, blocks: [] });
  return { id, name: pageLabel(id), template: path, sections };
}

function parseLegacyGlobalGroups(
  layout: string,
  schemaByType: Map<string, ShopifySectionSchema>,
  currentSections: Record<string, unknown> = {},
) {
  const types = Array.from(layout.matchAll(/{%[-\s]*section\s+['"]([^'"]+)['"][\s-]*%}/gi)).map((match) => match[1]);
  const headerTypes = types.filter((type) => /header|announcement|ticker/i.test(type));
  const footerTypes = types.filter((type) => /footer/i.test(type));
  const overlayTypes = types.filter((type) => !headerTypes.includes(type) && !footerTypes.includes(type) && schemaByType.has(type));
  if (!headerTypes.length && schemaByType.has("header")) headerTypes.push("header");
  if (!footerTypes.length && schemaByType.has("footer")) footerTypes.push("footer");
  /**
   * A configuração REAL destas seções vive em `settings_data.current.sections`
   * — é lá que a Shopify guarda os blocos do cart drawer, do cabeçalho e do
   * rodapé de temas clássicos. Sem ler isso, a gaveta do carrinho nascia sem
   * blocos e aparecia VAZIA no preview, mesmo com produtos dentro.
   */
  const instancia = (type: string, fallbackId: string): ShopifySectionInstance => {
    for (const [key, value] of Object.entries(currentSections)) {
      const raw = record(value);
      if (text(raw.type, "") === type) return sectionFromRecord(key, raw, schemaByType);
    }
    return defaultSection(type, fallbackId, schemaByType);
  };
  return [
    headerTypes.length ? { id: "header-group", name: pageLabel("header-group"), template: "layout/theme.liquid", sections: headerTypes.map((type, index) => instancia(type, `legacy-header-${index}`)) } : null,
    overlayTypes.length ? { id: "overlay-group", name: pageLabel("overlay-group"), template: "layout/theme.liquid", sections: overlayTypes.map((type, index) => instancia(type, `legacy-overlay-${index}`)) } : null,
    footerTypes.length ? { id: "footer-group", name: pageLabel("footer-group"), template: "layout/theme.liquid", sections: footerTypes.map((type, index) => instancia(type, `legacy-footer-${index}`)) } : null,
  ].filter((value): value is ShopifyPage => Boolean(value));
}

function sectionFromRecord(id: string, raw: Record<string, unknown>, schemaByType: Map<string, ShopifySectionSchema>): ShopifySectionInstance {
  const type = text(raw.type, "section").slice(0, 100);
  const schema = schemaByType.get(type);
  const rawBlocks = record(raw.blocks);
  const order = Array.isArray(raw.block_order) ? raw.block_order.map(String) : Object.keys(rawBlocks);
  const blockIds = [...order, ...Object.keys(rawBlocks).filter((blockId) => !order.includes(blockId))];
  const blocks = blockIds.map((blockId) => {
    const block = record(rawBlocks[blockId]);
    return { id: blockId.slice(0, 120), type: text(block.type, "block").slice(0, 80), settings: sanitizeSettings(record(block.settings)) };
  });
  return { id: id.slice(0, 120), type, name: schema?.name ?? humanize(type), disabled: raw.disabled === true, settings: sanitizeSettings(record(raw.settings)), blocks };
}

function defaultSection(type: string, id: string, schemaByType: Map<string, ShopifySectionSchema>): ShopifySectionInstance {
  const schema = schemaByType.get(type);
  const preset = schema?.presets?.[0];
  const defaults = Object.fromEntries((schema?.settings ?? []).filter((setting) => setting.default !== undefined).map((setting) => [setting.id, setting.default])) as Record<string, ShopifyValue>;
  const blocks = (preset?.blocks ?? []).map((block, index) => ({ id: `${id}-block-${index}`, type: block.type, settings: block.settings }));
  return { id: id.slice(0, 120), type: type.slice(0, 100), name: schema?.name ?? humanize(type), settings: { ...defaults, ...(preset?.settings ?? {}) }, blocks };
}

function ensureEssentialPages(pages: Map<string, ShopifyPage>, schemaByType: Map<string, ShopifySectionSchema>) {
  const required: Array<[string, string[]]> = [["index", ["slideshow", "image-banner", "rich-text"]], ["product", ["main-product"]], ["collection", ["main-collection-banner", "main-collection-product-grid"]], ["search", ["main-search"]], ["cart", ["main-cart-items", "main-cart-footer"]]];
  for (const [id, preferredTypes] of required) {
    if (pages.has(id)) continue;
    const available = preferredTypes.filter((type) => schemaByType.has(type));
    const types = available.length ? available : preferredTypes.slice(0, 1);
    pages.set(id, { id, name: pageLabel(id), template: "generated-from-theme-structure", sections: types.map((type, index) => defaultSection(type, `generated-${id}-${index}`, schemaByType)) });
  }
}

function legacyPageSections(id: string) {
  const base = id.split(".")[0].split("/").at(-1) ?? id;
  const map: Record<string, string[]> = { index: ["slideshow"], product: ["main-product"], collection: ["main-collection-banner", "main-collection-product-grid"], search: ["main-search"], cart: ["main-cart-items", "main-cart-footer"], blog: ["main-blog"], article: ["main-article"], page: ["main-page"], "404": ["main-404"], password: ["main-password-header"] };
  return map[base] ?? [];
}

function parseSettingDefinitions(value: unknown, translations: Record<string, unknown>): ShopifySettingDefinition[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 5000).map((item, index) => ({ raw: record(item), index })).filter(({ raw }) => {
    const id = text(raw.id, "");
    const type = text(raw.type, "");
    if (["header", "paragraph"].includes(type)) return true;
    return Boolean(id && type && !SENSITIVE_ID.test(id));
  }).map(({ raw: setting, index }) => {
    const type = text(setting.type, "text").slice(0, 60);
    const isDisplay = ["header", "paragraph"].includes(type);
    const definition: ShopifySettingDefinition = {
      id: text(setting.id, isDisplay ? `__display_${index}` : "").slice(0, 120),
      type,
      label: cleanLabel(isDisplay ? setting.content : setting.label, humanize(text(setting.id, "Campo")), translations),
    };
    if (setting.info) definition.info = cleanLabel(setting.info, "", translations).slice(0, 240);
    if (typeof setting.placeholder === "string") definition.placeholder = cleanLabel(setting.placeholder, "", translations).slice(0, 160);
    if (typeof setting.visible_if === "string") definition.visibleIf = setting.visible_if.slice(0, 400);
    if (Number.isFinite(setting.min)) definition.min = Number(setting.min);
    if (Number.isFinite(setting.max)) definition.max = Number(setting.max);
    if (Number.isFinite(setting.step)) definition.step = Number(setting.step);
    if (setting.unit) definition.unit = text(setting.unit, "").slice(0, 20);
    if (Array.isArray(setting.options)) definition.options = setting.options.slice(0, 300).map((option) => record(option)).map((option) => ({ value: text(option.value, "").slice(0, 120), label: cleanLabel(option.label, text(option.value, "Opção"), translations) }));
    if (Array.isArray(setting.definition)) definition.children = parseSettingDefinitions(setting.definition, translations);
    const defaultValue = sanitizeValue(setting.default);
    if (defaultValue !== undefined) definition.default = defaultValue;
    return definition;
  });
}

function sanitizeSettings(source: Record<string, unknown>) {
  const result: Record<string, ShopifyValue> = {};
  for (const [key, value] of Object.entries(source).slice(0, 5000)) {
    if (SENSITIVE_ID.test(key)) continue;
    const clean = sanitizeValue(value);
    if (clean !== undefined) result[key.slice(0, 120)] = clean;
  }
  return result;
}

function sanitizeValue(value: unknown): ShopifyValue | undefined {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.replace(/<script[\s\S]*?<\/script>/gi, "").slice(0, 50000);
  if (value === null) return null;
  if (Array.isArray(value)) return value.slice(0, 500).map(sanitizeValue).filter((item): item is ShopifyValue => item !== undefined);
  if (typeof value === "object") {
    const result: Record<string, ShopifyValue> = {};
    for (const [key, item] of Object.entries(record(value)).slice(0, 5000)) {
      if (SENSITIVE_ID.test(key)) continue;
      const clean = sanitizeValue(item);
      if (clean !== undefined) result[key.slice(0, 120)] = clean;
    }
    return result;
  }
  return undefined;
}

function parseJson<T>(bytes: Uint8Array | undefined, fallback: T): T {
  if (!bytes) return fallback;
  try {
    const source = strFromU8(bytes).replace(/^\uFEFF/, "").trimStart().replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, "");
    return JSON.parse(source) as T;
  } catch { return fallback; }
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback: string) { return typeof value === "string" ? value : fallback; }
function normalizedPath(path: string) { return path.replace(/\\/g, "/").replace(/^\.\//, ""); }
function safeArchivePath(path: string) { const normalized = normalizedPath(path); return !normalized.startsWith("/") && !normalized.split("/").includes(".."); }
function fileNameWithoutExtension(value: string) { return value.replace(/\.zip$/i, "").replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim() || "Tema Shopify"; }
function humanize(value: string) { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()).trim(); }
function fileKind(path: string) { const folder = path.split("/")[0]; const kinds: Record<string, string> = { assets: "asset", snippets: "snippet", locales: "locale", layout: "layout", templates: "template", sections: "section", config: "config" }; return kinds[folder] ?? "other"; }
function fingerprintBytes(bytes: Uint8Array) { let first = 2166136261; let second = 2246822507; for (let index = 0; index < bytes.length; index += 1) { first = Math.imul(first ^ bytes[index], 16777619); second = Math.imul(second ^ bytes[index], 3266489917); } return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`; }
function pagePosition(id: string) { const base = id.split(".")[0]; const order = ["header-group", "overlay-group", "index", "collection", "product", "search", "cart", "blog", "article", "page", "list-collections", "404", "password", "footer-group"]; const index = order.indexOf(base); return index < 0 ? 100 : index; }
function cleanLabel(value: unknown, fallback: string, translations?: Record<string, unknown>) { const label = text(value, fallback); if (label.startsWith("t:") && translations) { let cursor: unknown = translations; for (const segment of label.slice(2).split(".")) { cursor = record(cursor)[segment]; } if (typeof cursor === "string") return cursor.replace(/[<>]/g, "").slice(0, 180); } return label.startsWith("t:") ? humanize(label.split(".").at(-1) ?? fallback) : label.replace(/[<>]/g, "").slice(0, 180); }
function pageLabel(id: string) {
  const base = id.split(".")[0];
  const labels: Record<string, string> = { index: "Página inicial", product: "Produto", collection: "Coleção", cart: "Carrinho", search: "Pesquisa", blog: "Blog", article: "Artigo", "404": "Página 404", password: "Senha", "list-collections": "Lista de coleções", "page": "Página", "page.contact": "Contato", "page.faq": "FAQ", "page.track-order": "Rastrear pedido", "header-group": "Cabeçalho global", "overlay-group": "Seções globais", "footer-group": "Rodapé global" };
  return labels[id] ?? labels[base] ?? humanize(id);
}
