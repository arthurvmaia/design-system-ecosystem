import { strFromU8, unzipSync, zipSync } from "fflate";
import { MAX_UPLOAD_BYTES } from "./business-rules.mjs";
import { NICHOS } from "./marca-generator.mjs";
/* só o handle: `shopify-brand` importa daqui apenas TIPOS, que somem na
   compilação, então não há ciclo em tempo de execução. Reescrever a regra do
   handle aqui é que seria perigoso — ela tem de casar exatamente com a que a
   entrega grava, e duas cópias divergem calado. */
import { handleDeColecao } from "./shopify-brand";

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
  /**
   * A capa de cada coleção, por handle — a que a Orbis gerou para aquele nome.
   *
   * Ela nascia e MORRIA no pedido de prévia: o fluxo do cliente montava o mapa
   * na hora, a partir da marca em memória, e nada disso ficava no tema. Quem
   * abrisse a mesma loja no Editor via a vitrine com foto de produto sorteada
   * pelo handle — e, com poucos produtos, a MESMA foto em três cartões.
   *
   * Guardar aqui é o que faz a capa sobreviver ao fim do fluxo: o tema salvo no
   * projeto já leva o mapa, e o marcador `assets/orbis-loja.json` o leva no ZIP,
   * como já fazia com o nicho.
   */
  orbisCapas?: Record<string, string>;
  /**
   * O NOME de cada coleção, como a pessoa escreveu.
   *
   * O tema guarda handle: "organizacao", "cama-e-banho". Handle é slug — sem
   * acento e sem maiúscula —, e quem monta a vitrine reconstruía o título a
   * partir dele, devolvendo "Organizacao" e "Cama E Banho" na cara do cliente.
   * O acento não some por descuido de digitação: some porque foi jogado fora
   * na conversão e não havia por onde recuperá-lo. Agora há.
   */
  orbisColecoes?: string[];
  /**
   * A semente com que a home DESTA loja foi sorteada.
   *
   * Serve de trava, não de dado: aplicar a permutação duas vezes não é o mesmo
   * que aplicá-la uma, então quem já foi sorteado com esta semente volta como
   * está. Ver `sorteio-de-vitrine.ts`.
   */
  orbisSorteio?: string;
  /**
   * QUEM é esta loja — e não de que TEMA ela nasceu.
   *
   * Uma loja entregue continua carregando o `theme_info` do tema de origem: uma
   * loja feita sobre o Dawn se chama "Dawn". O estúdio deriva o id do tema desse
   * nome, então toda loja entregue importava como `import-dawn` — o MESMO id do
   * tema base — e o `ON CONFLICT DO UPDATE` a gravava por cima dele. A loja do
   * cliente virava o tema do estúdio, e duas lojas feitas sobre o mesmo tema
   * disputavam a mesma linha.
   *
   * Com o nome próprio no marcador, cada loja importa como ela mesma.
   */
  orbisLoja?: { nome: string; slug: string };
  /**
   * O modelo NATIVO do estúdio (cabeçalho, dobra, rodapé, cores) desta loja.
   *
   * O tema Shopify não é a loja inteira: o estúdio tem um modelo próprio, e ele
   * é quem desenha as telas que não passam pelo Liquid. Ele não viajava, então
   * a importação o herdava do que já estivesse naquele id — na prática, o
   * conteúdo de demonstração. A loja do cliente abria no estúdio com a marca
   * certa no tema e "CACTUS" em tudo o mais.
   */
  orbisCustomizacao?: Record<string, unknown>;
  /**
   * Os nomes de arquivo das ARTES que vieram dentro do pacote entregue.
   *
   * É por eles que a reconexão sabe quais assets instalados são da loja, em vez
   * de casar um `shopify://shop_images/<nome>` com qualquer arquivo do tema que
   * por acaso tenha o mesmo nome.
   */
  orbisArtes?: string[];
  /**
   * Arquivos de `assets/` que ficaram de FORA da instalação, com o motivo.
   *
   * Cada um destes é uma imagem quebrada esperando na prévia: o Liquid continua
   * apontando para o arquivo (ele está no ZIP), mas o servidor não o tem para
   * servir. Ficar em silêncio transforma isso em mistério — foi assim que um
   * banner de 12 MB virou um ícone de imagem partida sem explicação nenhuma.
   */
  assetsForaDaInstalacao?: Array<{ path: string; bytes: number; motivo: string }>;
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
/**
 * Teto por arquivo de `assets/`: 20 MB, o mesmo que a Shopify aceita.
 *
 * Era 10 MB, número escolhido no olho — e ele cortava arquivo LEGÍTIMO: um
 * banner 4k em PNG passa de 11 MB com folga, inclusive os que este app gera. O
 * arquivo ficava no ZIP, o Liquid continuava apontando para ele e a prévia
 * abria com a imagem partida. Medido no acervo local: 4 blobs entre 11,0 e
 * 12,3 MB, todos banners de entrega.
 *
 * 20 MB não é palpite: é o limite da própria Shopify para asset de tema. Acima
 * disso a plataforma recusaria o arquivo de qualquer jeito, então recusar aqui
 * é dizer a mesma coisa mais cedo — e agora dizendo, não em silêncio.
 */
const MAX_IMAGE_ASSET_BYTES = MAX_UPLOAD_BYTES;

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
  /* as artes da loja, que a entrega guarda fora de `assets/` para caber no teto
     da Shopify; entram como asset na instalação, não como arquivo do tema */
  const artesDaEntrega = new Map<string, Uint8Array>();
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
    /**
     * COM UMA EXCEÇÃO, e é ela que faz a loja voltar inteira.
     *
     * As artes da loja não estão em `assets/`: a entrega as MOVE para
     * `imagens-para-a-shopify/`, porque a Shopify recusa tema acima de 50 MB e
     * seis imagens em 4k passam disso sozinhas. Elas continuam dentro do
     * pacote — só não no lugar onde um tema guarda imagem.
     *
     * Enquanto esta pasta era descartada junto com o resto, a loja só voltava
     * com imagem se o id da mídia ainda existisse no banco DESTA máquina. Em
     * outro computador ela importava sem banner e sem logo — e o arquivo estava
     * ali o tempo todo, dentro do próprio ZIP.
     */
    if (relativo.startsWith("previa-local/")) {
      if (relativo.startsWith(ARTES_DA_ENTREGA)) {
        const nome = relativo.slice(ARTES_DA_ENTREGA.length);
        if (nome && !nome.includes("/") && IMAGE_EXTENSIONS[nome.split(".").at(-1)?.toLowerCase() ?? ""]) {
          artesDaEntrega.set(`assets/${nome}`, value);
        }
      }
      continue;
    }
    byRelativePath.set(relativo, value);
  }

  const rawSettingsSchema = parseJson<unknown[]>(byRelativePath.get("config/settings_schema.json"), []);
  if (!rawSettingsSchema.length) throw new Error("SHOPIFY_SETTINGS_SCHEMA");
  const rawSettingsData = parseJson<Record<string, unknown>>(byRelativePath.get("config/settings_data.json"), {});
  const translationEntry = escolherTraducao(byRelativePath);
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
  const { assets, fora } = collectImageAssets(byRelativePath);
  /**
   * As artes da entrega entram como asset — sem apagar nada do tema.
   *
   * Elas recebem o caminho `assets/<arquivo>`, que é onde o tema procuraria a
   * imagem se ela tivesse ficado lá. O nome é `orbis-<8 do id>-<arquivo>`, então
   * colisão com asset do tema é remotíssima; ainda assim quem já existe vence,
   * porque sobrescrever arquivo do tema com arte da loja seria trocar uma coisa
   * certa por outra.
   */
  const nomesDoTema = new Set(assets.map((asset) => asset.name));
  const daEntrega = collectImageAssets(artesDaEntrega);
  const artes = daEntrega.assets.filter((asset) => !nomesDoTema.has(asset.name));
  if (artes.length) {
    assets.push(...artes);
    theme.orbisArtes = artes.map((asset) => asset.name);
  }
  const foraDeTudo = [...fora, ...daEntrega.fora];
  if (foraDeTudo.length) theme.assetsForaDaInstalacao = foraDeTudo;
  const nicho = lerNichoDoTema(byRelativePath, pages);
  if (nicho) theme.orbisNicheId = nicho;
  const capas = lerCapasDoTema(byRelativePath);
  if (Object.keys(capas).length) theme.orbisCapas = capas;
  const loja = lerLojaDoTema(byRelativePath);
  if (loja) theme.orbisLoja = loja;
  const customizacao = lerCustomizacaoDoTema(byRelativePath);
  if (customizacao) theme.orbisCustomizacao = customizacao;
  return { theme, images: assets };
}

/** Onde um tema entregue pela Orbis guarda de que loja ele é. */
export const ARQUIVO_DA_LOJA = "assets/orbis-loja.json";

/**
 * Onde a entrega guarda as ARTES da loja.
 *
 * Fora de `assets/` de propósito: a Shopify recusa tema acima de 50 MB, e a
 * arte estava no pacote duas vezes — uma em `assets/` e outra na pasta de
 * upload —, o que levava o ZIP a 140 MB. Ela ficou só aqui, com o nome que a
 * referência do tema espera, para a pessoa subir em Content › Files.
 *
 * E é daqui que a importação as recupera: o arquivo viaja no pacote, então a
 * loja volta inteira em qualquer computador, não só naquele que a gerou.
 */
export const ARTES_DA_ENTREGA = "previa-local/imagens-para-a-shopify/";

/** O conteúdo do marcador, para quem monta o ZIP da entrega. */
export function marcadorDaLoja(
  nicheId: string,
  capas: Record<string, string> = {},
  loja: { nome?: string; slug?: string; customizacao?: Record<string, unknown> } = {},
) {
  const corpo: Record<string, unknown> = { orbisNicheId: nicheId };
  /* as capas só aparecem quando existem: marcador com campo vazio faz quem lê
     achar que a loja declarou "sem capa", e o certo é ele nem perguntar */
  if (Object.keys(capas).length) corpo.orbisCapas = capas;
  /* nome E apelido, ou nenhum dos dois: meia identidade faz o importador
     inventar a outra metade, que é exatamente o palpite que isto evita */
  if (loja.nome && loja.slug) corpo.orbisLoja = { nome: loja.nome.slice(0, 80), slug: loja.slug.slice(0, 56) };
  if (loja.customizacao && Object.keys(loja.customizacao).length) corpo.orbisCustomizacao = loja.customizacao;
  return JSON.stringify(corpo, null, 2);
}

/**
 * Com que IDENTIDADE um tema importado entra no estúdio.
 *
 * Mora aqui, junto do marcador que a alimenta, e é pura de propósito: era uma
 * linha dentro do `importShopifyTheme`, que precisa de banco para rodar, e por
 * isso a regra mais consequente da importação não tinha teste nenhum.
 *
 * Três casos, nesta ordem: a loja que declara seu nome entra como ela mesma; o
 * ShrinePro tem id fixo porque o estúdio o trata como tema de casa; o resto
 * segue pelo nome do tema.
 */
export function identidadeDoTemaImportado(
  imported: Pick<ShopifyThemeImport, "themeName" | "sourceFile" | "orbisLoja">,
): { id: string; slug: string; nome: string } {
  const loja = imported.orbisLoja;
  const base = slugify(loja?.slug || loja?.nome || imported.themeName) || "tema-shopify";
  if (loja) return { id: `loja-${base.slice(0, 48)}`, slug: `loja-${base.slice(0, 50)}`, nome: loja.nome.slice(0, 80) };
  if (/shrine/i.test(imported.themeName) || /shrine/i.test(imported.sourceFile)) {
    return { id: "shrine-pro", slug: "shrine-pro", nome: "ShrinePro" };
  }
  return { id: `import-${base.slice(0, 48)}`, slug: base.slice(0, 56), nome: imported.themeName.slice(0, 80) };
}

function slugify(value: string) {
  /* `\p{M}` em vez do intervalo escrito à mão: a marca combinante literal some
     em qualquer ferramenta que normalize o arquivo, e aí a regra para de tirar
     acento sem ninguém perceber — "Óculos Já" viraria "-culos-j-" */
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** O nome próprio da loja, quando o pacote entregue o declara. */
function lerLojaDoTema(byRelativePath: Map<string, Uint8Array>): { nome: string; slug: string } | null {
  const marcador = byRelativePath.get(ARQUIVO_DA_LOJA);
  if (!marcador) return null;
  const cru = parseJson<Record<string, unknown>>(marcador, {}).orbisLoja;
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) return null;
  const { nome, slug } = cru as { nome?: unknown; slug?: unknown };
  if (typeof nome !== "string" || typeof slug !== "string" || !nome.trim() || !slug.trim()) return null;
  return { nome: nome.slice(0, 80), slug: slug.slice(0, 56) };
}

/** O modelo nativo do estúdio que a loja entregue leva consigo. */
function lerCustomizacaoDoTema(byRelativePath: Map<string, Uint8Array>): Record<string, unknown> | null {
  const marcador = byRelativePath.get(ARQUIVO_DA_LOJA);
  if (!marcador) return null;
  const cru = parseJson<Record<string, unknown>>(marcador, {}).orbisCustomizacao;
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) return null;
  /* o `shopify` NÃO entra: o tema já está sendo lido do ZIP, e deixar uma cópia
     dentro do modelo nativo faria a loja carregar duas versões de si mesma */
  const resto = { ...(cru as Record<string, unknown>) };
  delete resto.shopify;
  return Object.keys(resto).length ? resto : null;
}

/**
 * De que loja é este tema.
 *
 * `orbisNicheId` decide a vitrine da prévia, e ele vivia SÓ no banco do app.
 * O ZIP entregue não levava nada disso, então reimportar a própria loja — gesto
 * natural, "vou pôr minha loja de volta no estúdio" — perdia o nicho e a
 * vitrine caía no catálogo de demonstração: óculos e panela numa loja de roupa.
 *
 * Duas fontes, nesta ordem:
 *
 * 1. o marcador que a entrega passa a gravar. Explícito, exato, sobrevive a
 *    edição no editor.
 * 2. as COLEÇÕES do tema, para as entregas que saíram antes do marcador
 *    existir. Elas são do nicho — "Alfaiataria" e "Últimas peças" só aparecem
 *    em roupas — e já estão gravadas nos templates. Exige maioria (metade das
 *    seis) para não confundir loja por coincidência de "Novidades".
 */
/**
 * As capas de coleção que a entrega gravou no marcador.
 *
 * Só o marcador, e sem palpite: capa de coleção não se deduz do resto do tema,
 * e o palpite disponível — sortear uma foto de produto pelo handle — é
 * exatamente o defeito que ela existe para corrigir.
 */
function lerCapasDoTema(byRelativePath: Map<string, Uint8Array>): Record<string, string> {
  const marcador = byRelativePath.get(ARQUIVO_DA_LOJA);
  if (!marcador) return {};
  const cru = parseJson<Record<string, unknown>>(marcador, {}).orbisCapas;
  if (!cru || typeof cru !== "object" || Array.isArray(cru)) return {};
  const capas: Record<string, string> = {};
  for (const [handle, url] of Object.entries(cru as Record<string, unknown>)) {
    if (handle && typeof url === "string" && url) capas[handle.slice(0, 80)] = url.slice(0, 300);
  }
  return capas;
}

function lerNichoDoTema(byRelativePath: Map<string, Uint8Array>, pages: ShopifyPage[]): string {
  const marcador = byRelativePath.get(ARQUIVO_DA_LOJA);
  if (marcador) {
    const id = text(parseJson<Record<string, unknown>>(marcador, {}).orbisNicheId, "").trim();
    if (id) return id.slice(0, 40);
  }

  const handles = new Set<string>();
  for (const page of pages) {
    for (const secao of page.sections) {
      for (const valor of [...Object.values(secao.settings), ...secao.blocks.flatMap((b) => Object.values(b.settings))]) {
        if (typeof valor === "string" && valor && !valor.includes(" ") && valor.length <= 60) handles.add(valor.toLowerCase());
      }
    }
  }
  if (!handles.size) return "";

  let melhor = { id: "", acertos: 0 };
  for (const nicho of NICHOS) {
    const acertos = nicho.colecoes.filter((nome: string) => handles.has(handleDeColecao(nome))).length;
    if (acertos > melhor.acertos) melhor = { id: nicho.id, acertos };
  }
  return melhor.acertos >= 3 ? melhor.id : "";
}

/**
 * Escolhe de qual idioma saem os RÓTULOS do editor (nome de seção, de campo).
 *
 * A ordem importa e a última posição era um sorteio: sem `pt-BR` e sem
 * `en.default`, pegava-se o primeiro `locales/*.schema.json` que aparecesse no
 * ZIP. Num Dawn com trinta idiomas, isso deu um editor inteiro em tcheco —
 * "Záhlaví" no lugar de "Cabeçalho", "Barvy" no lugar de "Cores".
 *
 * Agora a escada é declarada: português primeiro (qualquer variante), depois o
 * idioma que o TEMA marcou como padrão (`*.default.schema.json` — escolha do
 * autor, não palpite nosso), depois inglês, e só então o que houver — porque
 * rótulo em idioma estranho ainda é melhor que a chave crua
 * `t:sections.header.name`.
 *
 * O `dawn8.zip` desta máquina é o caso exato: ele traz
 * `pt-BR.default.schema.json`, ou seja, português JÁ ERA o padrão do tema. O
 * código antigo procurava `pt-BR.schema.json` (nome que não existe ali) e
 * `en.default.schema.json` (idem), errava as duas e caía no primeiro da lista,
 * `cs.schema.json`.
 */
function escolherTraducao(byRelativePath: Map<string, Uint8Array>) {
  const locales = Array.from(byRelativePath.entries())
    .filter(([path]) => path.startsWith("locales/") && path.endsWith(".schema.json"))
    .map(([path, data]) => [path.slice("locales/".length), data] as const);
  const acharPor = (teste: RegExp) => locales.find(([nome]) => teste.test(nome))?.[1];
  return (
    acharPor(/^pt\b/i) ??
    acharPor(/\.default\.schema\.json$/i) ??
    acharPor(/^en\b/i) ??
    locales[0]?.[1]
  );
}

/**
 * Separa os arquivos de `assets/` que serão instalados dos que ficam de fora.
 *
 * O que fica de fora é DECLARADO. Um asset descartado não some da página: o
 * Liquid continua pedindo aquele arquivo e a prévia mostra imagem partida, sem
 * dizer por quê. Devolver a lista é o que transforma o mistério em recado.
 */
function collectImageAssets(byRelativePath: Map<string, Uint8Array>) {
  const assets: ShopifyThemeImageAsset[] = [];
  const fora: Array<{ path: string; bytes: number; motivo: string }> = [];
  let excedentes = 0;
  for (const [path, data] of byRelativePath.entries()) {
    if (!path.startsWith("assets/")) continue;
    const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
    const contentType = ASSET_CONTENT_TYPES[extension] ?? "application/octet-stream";
    const name = path.split("/").at(-1)?.toLowerCase() ?? "";
    if (!name) continue;
    if (data.byteLength <= 0) { fora.push({ path, bytes: 0, motivo: "arquivo vazio" }); continue; }
    if (data.byteLength > MAX_IMAGE_ASSET_BYTES) {
      const mb = (data.byteLength / (1024 * 1024)).toFixed(1);
      fora.push({ path, bytes: data.byteLength, motivo: `${mb} MB, acima do limite de 20 MB da Shopify` });
      continue;
    }
    if (assets.length >= MAX_IMAGE_ASSETS) {
      excedentes++;
      continue;
    }
    assets.push({ path, name, contentType, data });
  }
  /* o excedente do teto de arquivos vira UMA linha com a conta: listar mil
     caminhos não informa mais que o número, e ainda incha o registro do tema */
  if (excedentes) fora.push({ path: `assets/ (+${excedentes})`, bytes: 0, motivo: `acima de ${MAX_IMAGE_ASSETS} arquivos instalados` });
  return { assets, fora };
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
