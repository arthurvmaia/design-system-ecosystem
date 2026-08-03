/**
 * Motor de renderização de temas Shopify importados.
 * Renderiza o Liquid real do tema (layout, seções, snippets, settings, traduções)
 * com objetos de loja simulados — o mesmo princípio do editor da Shopify.
 */
import { Liquid, type TagToken, type TopLevelToken, type Context, type Emitter } from "liquidjs";
import { strFromU8 } from "fflate";
import type { ShopifyPage, ShopifySectionInstance, ShopifySettingDefinition, ShopifyThemeImport, ShopifyValue } from "@/lib/shopify-theme";

export type RenderOptions = {
  theme: ShopifyThemeImport;
  files: Map<string, Uint8Array>;
  pageId: string;
  /** Converte um caminho relativo do tema (assets/foo.png) na URL servida. */
  assetBase: (path: string) => string;
};

const PLACEHOLDER_SVG = (label: string, tone = "#e5e7eb") =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200"><rect width="1200" height="1200" fill="${tone}"/><path d="M0 1200 900 300l300 300v600z" fill="#d1d5db"/><circle cx="320" cy="320" r="140" fill="#d1d5db"/><text x="50%" y="94%" font-family="Arial" font-size="64" fill="#9ca3af" text-anchor="middle">${label}</text></svg>`)}`;

function text(files: Map<string, Uint8Array>, path: string): string | undefined {
  const data = files.get(path);
  return data ? strFromU8(data) : undefined;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function parseJson<T>(source: string | undefined, fallback: T): T {
  if (!source) return fallback;
  try { return JSON.parse(source.replace(/^﻿/, "").trimStart().replace(/^(?:\/\*[\s\S]*?\*\/\s*)+/, "")) as T; } catch { return fallback; }
}

/** Objeto de imagem compatível com os acessos comuns dos temas (src, width, aspect_ratio…). */
class ThemeImage {
  src: string; url: string; width: number; height: number; aspect_ratio: number; alt: string; id: number;
  attached_to_variant = false; media_type = "image";
  preview_image: ThemeImage | null = null;
  constructor(url: string, alt = "", width = 1200, height = 1200) {
    this.src = url; this.url = url; this.width = width; this.height = height;
    this.aspect_ratio = width / height; this.alt = alt; this.id = Math.floor(Math.random() * 1e6);
  }
  toString() { return this.src; }
}

function demoImage(label: string, tone?: string) { return new ThemeImage(PLACEHOLDER_SVG(label, tone)); }

function demoVariant(productTitle: string, price: number) {
  return {
    id: 1000001, title: "Padrão", price, compare_at_price: null, available: true,
    inventory_management: null, inventory_policy: "deny", inventory_quantity: 99,
    options: ["Padrão"], option1: "Padrão", option2: null, option3: null,
    featured_image: null, featured_media: null, url: "#", weight: 0, unit_price: null,
    requires_shipping: true, taxable: true, barcode: "", sku: `DEMO-${productTitle.slice(0, 4).toUpperCase()}`,
    selected: true, requires_selling_plan: false, selling_plan_allocations: [],
  };
}

function demoProduct(handle: string, index = 0) {
  const names = ["Daily Ritual", "Balance", "Pure Form", "Focus+", "Restore", "Starter Kit"];
  const tones = ["#dbeafe", "#ede9fe", "#ffedd5", "#dcfce7", "#fce7f3", "#e0f2fe"];
  const title = names[index % names.length];
  const price = [12990, 14990, 17990, 11990, 13990, 23990][index % 6];
  const compareAt = index % 2 === 0 ? price + 3000 : null;
  const image = demoImage(title, tones[index % tones.length]);
  const variant = demoVariant(title, price);
  const media = { id: image.id, media_type: "image", position: 1, preview_image: image, alt: title, aspect_ratio: 1, width: image.width, height: image.height, src: image.src };
  return {
    id: 7000000 + index, title, handle: handle || title.toLowerCase().replace(/\W+/g, "-"),
    url: "#produto-demo", available: true, price, price_min: price, price_max: price, price_varies: false,
    compare_at_price: compareAt, compare_at_price_min: compareAt ?? 0, compare_at_price_max: compareAt ?? 0, compare_at_price_varies: false,
    featured_image: image, featured_media: media, images: [image], media: [media],
    options: ["Título"], options_with_values: [{ name: "Título", position: 1, values: ["Padrão"], selected_value: "Padrão" }],
    variants: [variant], selected_or_first_available_variant: variant, selected_variant: null, first_available_variant: variant,
    has_only_default_variant: true, vendor: "Demonstração", type: "Demo",
    description: "<p>Produto de demonstração. Conecte os produtos reais da loja para substituí-lo.</p>",
    content: "<p>Produto de demonstração. Conecte os produtos reais da loja para substituí-lo.</p>",
    tags: [], collections: [], template_suffix: null, published_at: new Date().toISOString(), created_at: new Date().toISOString(),
    requires_selling_plan: false, selling_plan_groups: [], quantity_price_breaks_configured: false, gift_card: false, metafields: {},
  };
}

const DEMO_PRODUCTS = [0, 1, 2, 3, 4, 5].map((index) => demoProduct("", index));

function demoCollection(handle: string) {
  const title = handle ? handle.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Coleção em destaque";
  return {
    id: 9000001, title, handle: handle || "colecao-demo", url: "#colecao-demo", description: "",
    products: DEMO_PRODUCTS, products_count: DEMO_PRODUCTS.length, all_products_count: DEMO_PRODUCTS.length,
    image: null, featured_image: DEMO_PRODUCTS[0].featured_image, all_tags: [], all_types: [], all_vendors: [],
    sort_by: "", default_sort_by: "best-selling", filters: [], template_suffix: null,
  };
}

const DEMO_LINKS = [
  { title: "Início", url: "#", active: true, current: true, child_active: false, child_current: false, links: [], levels: 0, handle: "inicio", type: "frontpage_link", object: null },
  { title: "Produtos", url: "#", active: false, current: false, child_active: false, child_current: false, links: [], levels: 0, handle: "produtos", type: "catalog_link", object: null },
  { title: "Contato", url: "#", active: false, current: false, child_active: false, child_current: false, links: [], levels: 0, handle: "contato", type: "page_link", object: null },
];

function proxyWithFallback<T>(base: Record<string, T>, make: (key: string) => T) {
  return new Proxy(base, {
    get(target, key) {
      if (typeof key !== "string") return undefined;
      if (key in target) return target[key];
      return make(key);
    },
    has() { return true; },
  });
}

function flattenTranslations(source: Record<string, unknown>, prefix = "", out: Record<string, string> = {}) {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") out[path] = value;
    else if (value && typeof value === "object") flattenTranslations(record(value), path, out);
  }
  return out;
}

/** Resolve settings de acordo com as definições do schema (fontes, esquemas de cor, imagens). */
function resolveSettingValues(
  values: Record<string, ShopifyValue>,
  definitions: ShopifySettingDefinition[],
  helpers: { imageFor: (value: ShopifyValue) => ThemeImage | null; schemeFor: (id: ShopifyValue) => unknown },
) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const resolved: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(values)) {
    const type = byId.get(id)?.type ?? "";
    if (type === "font_picker" && typeof value === "string") {
      const family = value.split("_")[0].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const weightMatch = value.match(/n(\d)/);
      resolved[id] = {
        family, fallback_families: "sans-serif", style: value.includes("i") ? "italic" : "normal",
        weight: weightMatch ? Number(weightMatch[1]) * 100 : 400, baseline_ratio: 0.71, system: true, variants: [],
      };
      continue;
    }
    if (type === "image_picker") { resolved[id] = helpers.imageFor(value); continue; }
    if (type === "color_scheme") { resolved[id] = helpers.schemeFor(value); continue; }
    if (type === "collection") { resolved[id] = demoCollection(typeof value === "string" ? value : ""); continue; }
    if (type === "product") { resolved[id] = demoProduct(typeof value === "string" ? value : "", 2); continue; }
    if (type === "collection_list") { resolved[id] = ["colecao-1", "colecao-2", "colecao-3", "colecao-4"].map((handle) => demoCollection(handle)); continue; }
    if (type === "product_list") { resolved[id] = DEMO_PRODUCTS.slice(0, 4); continue; }
    if (type === "link_list" || type === "menu") { resolved[id] = { title: "Menu", handle: String(value ?? "main-menu"), links: DEMO_LINKS, levels: 1 }; continue; }
    if (type === "blog") { resolved[id] = { title: "Blog", handle: String(value ?? "blog"), url: "#", articles: [], articles_count: 0, all_tags: [] }; continue; }
    if (type === "article") { resolved[id] = null; continue; }
    if (type === "page") { resolved[id] = { title: "Página", handle: String(value ?? "pagina"), content: "", url: "#" }; continue; }
    resolved[id] = value;
  }
  for (const definition of definitions) {
    if (!(definition.id in resolved) && definition.default !== undefined) {
      resolved[definition.id] = definition.default;
    }
  }
  return resolved;
}

function colorParse(value: string): [number, number, number, number] | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), 1];
  }
  const rgba = value.trim().match(/^rgba?\(([^)]+)\)$/i)?.[1]?.split(",").map((part) => parseFloat(part));
  if (rgba && rgba.length >= 3) return [rgba[0], rgba[1], rgba[2], rgba[3] ?? 1];
  return null;
}

const rgbString = ([r, g, b, a]: [number, number, number, number]) => a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;

function argPairs(args: unknown[]): Record<string, unknown> {
  const named: Record<string, unknown> = {};
  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === "string") named[arg[0]] = arg[1];
  }
  return named;
}

export async function renderThemePage({ theme, files, pageId, assetBase }: RenderOptions): Promise<string> {
  const assetPathByName = new Map<string, string>();
  for (const path of files.keys()) {
    if (path.startsWith("assets/")) assetPathByName.set(path.slice("assets/".length).toLowerCase(), path);
  }
  const assetUrl = (name: string) => {
    const clean = String(name).split("?")[0].split("/").at(-1) ?? "";
    const path = assetPathByName.get(clean.toLowerCase());
    return path ? assetBase(path) : `assets/${clean}`;
  };

  const imageFor = (value: ShopifyValue): ThemeImage | null => {
    if (value == null || value === "") return null;
    if (typeof value === "object" && !Array.isArray(value)) {
      const source = value as Record<string, ShopifyValue>;
      return imageFor(source.src ?? source.url ?? null);
    }
    if (typeof value !== "string") return null;
    /* mídia enviada pelo editor do Orbis e data URIs são imagens válidas */
    if (value.startsWith("/api/media/") || value.startsWith("data:image/")) return new ThemeImage(value);
    const name = value.split("?")[0].split("/").at(-1) ?? "";
    if (/^https?:\/\//i.test(value) && !assetPathByName.has(name.toLowerCase())) return new ThemeImage(value);
    if (assetPathByName.has(name.toLowerCase())) return new ThemeImage(assetUrl(name));
    if (/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(name)) return new ThemeImage(PLACEHOLDER_SVG("Conecte esta imagem"));
    return null;
  };

  const rawSettingsData = parseJson<Record<string, unknown>>(text(files, "config/settings_data.json"), {});
  const currentSettings = record(rawSettingsData.current);
  const schemes = record(theme.globalValues.color_schemes ?? currentSettings.color_schemes);
  const schemeFor = (id: ShopifyValue) => {
    const key = typeof id === "string" && id ? id : Object.keys(schemes)[0];
    const scheme = record(schemes[key ?? ""]);
    return { id: key ?? "scheme-1", settings: record(scheme.settings), toString: () => key ?? "scheme-1" };
  };

  const allGlobalDefinitions = theme.globalGroups.flatMap((group) => group.settings);
  const settings = resolveSettingValues(theme.globalValues, allGlobalDefinitions, { imageFor, schemeFor });
  if (!("color_schemes" in settings) && Object.keys(schemes).length) settings.color_schemes = schemes;

  const localeFile =
    text(files, "locales/pt-BR.json") ?? text(files, "locales/pt-PT.json") ??
    text(files, Array.from(files.keys()).find((path) => /^locales\/[^.]+\.default\.json$/.test(path)) ?? "") ??
    text(files, "locales/en.default.json");
  const translations = flattenTranslations(parseJson<Record<string, unknown>>(localeFile, {}));

  const schemaByType = new Map(theme.sectionSchemas.map((schema) => [schema.type, schema]));
  const resolveSection = (section: ShopifySectionInstance) => {
    const schema = schemaByType.get(section.type);
    const resolvedSettings = resolveSettingValues(section.settings, schema?.settings ?? [], { imageFor, schemeFor });
    const blocks = section.blocks.map((block, index) => {
      const blockSchema = schema?.blocks.find((item) => item.type === block.type);
      return {
        id: block.id, type: block.type,
        settings: resolveSettingValues(block.settings, blockSchema?.settings ?? [], { imageFor, schemeFor }),
        shopify_attributes: `data-block-id="${block.id}"`,
        index: index + 1, index0: index,
      };
    });
    return { id: section.id, settings: resolvedSettings, blocks, index: 1, index0: 0, location: "template", type: section.type, disabled: section.disabled === true };
  };

  const collectionsProxy = proxyWithFallback<unknown>({}, (handle) => demoCollection(handle));
  const productsProxy = proxyWithFallback<unknown>({}, (handle) => demoProduct(handle, 2));
  const linklistsProxy = proxyWithFallback<unknown>({}, (handle) => ({ title: "Menu", handle, links: DEMO_LINKS, levels: 1 }));
  const pagesProxy = proxyWithFallback<unknown>({}, (handle) => ({ title: handle, handle, content: "", url: "#" }));
  const imagesProxy = proxyWithFallback<unknown>({}, (name) => imageFor(name) ?? demoImage("Imagem"));

  const pageBase = pageId.split(".")[0];
  const globals: Record<string, unknown> = {
    settings,
    shop: {
      name: theme.themeName.replace(/\s*\(.*\)$/, ""), locale: "pt-BR", currency: "BRL",
      money_format: "R$ {{amount_with_comma_separator}}", money_with_currency_format: "R$ {{amount_with_comma_separator}} BRL",
      url: "", secure_url: "", domain: "minha-loja.exemplo", permanent_domain: "minha-loja.exemplo",
      email: "contato@exemplo.com", description: "", products_count: DEMO_PRODUCTS.length, collections_count: 3,
      customer_accounts_enabled: true, customer_accounts_optional: true,
      enabled_payment_types: ["visa", "master", "pix"], published_locales: [{ iso_code: "pt-BR", primary: true }],
      metafields: {}, brand: { logo: null, colors: {} },
    },
    routes: {
      root_url: "/", cart_url: "#carrinho", cart_add_url: "#", cart_change_url: "#", cart_update_url: "#", cart_clear_url: "#",
      search_url: "#busca", predictive_search_url: "#", collections_url: "#", all_products_collection_url: "#",
      account_url: "#", account_login_url: "#", account_logout_url: "#", account_register_url: "#",
      account_addresses_url: "#", account_recover_url: "#", product_recommendations_url: "#",
    },
    request: {
      design_mode: true, visual_preview_mode: false, page_type: pageBase === "index" ? "index" : pageBase,
      path: "/", host: "minha-loja.exemplo", origin: "", locale: { iso_code: "pt-BR", endonym_name: "português (Brasil)", primary: true },
    },
    localization: {
      language: { iso_code: "pt-BR", endonym_name: "português (Brasil)" },
      country: { iso_code: "BR", name: "Brasil", currency: { iso_code: "BRL", symbol: "R$" }, unit_system: "metric", market: { handle: "br" } },
      market: { handle: "br", metafields: {} },
      available_countries: [], available_languages: [],
    },
    cart: {
      item_count: 0, items: [], total_price: 0, original_total_price: 0, items_subtotal_price: 0, total_discount: 0,
      currency: { iso_code: "BRL", symbol: "R$" }, empty: true, note: null, attributes: {}, cart_level_discount_applications: [],
      requires_shipping: true, taxes_included: false, discount_applications: [], checkout_charge_amount: 0,
    },
    customer: null,
    template: { name: pageBase, suffix: pageId.includes(".") ? pageId.split(".").slice(1).join(".") : null, directory: null, toString: () => pageBase },
    content_for_header: `<meta name="orbis-preview" content="1">`,
    linklists: linklistsProxy,
    collections: collectionsProxy,
    all_products: productsProxy,
    pages: pagesProxy,
    images: imagesProxy,
    blogs: proxyWithFallback<unknown>({}, (handle) => ({ title: "Blog", handle, url: "#", articles: [], articles_count: 0, all_tags: [] })),
    articles: proxyWithFallback<unknown>({}, () => null),
    product: demoProduct("produto-demo", 0),
    collection: demoCollection("colecao-demo"),
    article: { title: "Artigo de demonstração", content: "<p>Conteúdo do artigo aparecerá aqui.</p>", excerpt: "", author: "Equipe", published_at: new Date().toISOString(), image: null, url: "#", tags: [], comments: [], comments_count: 0, comments_enabled: false },
    blog: { title: "Blog", url: "#", articles: [], articles_count: 0, all_tags: [] },
    page: { title: "Página", content: "<p>Conteúdo da página.</p>", url: "#" },
    search: { performed: false, terms: "", results: [], results_count: 0, types: ["product"], filters: [], sort_by: "relevance", default_sort_by: "relevance" },
    recommendations: { performed: false, products_count: 0, products: [], intent: "related" },
    predictive_search: { performed: false, resources: { products: [], collections: [], pages: [], articles: [] } },
    paginate: null,
    current_page: 1, current_tags: null, handle: pageBase,
    canonical_url: "", page_title: theme.themeName, page_description: "",
    scripts: "", checkout: null, form: {}, powered_by_link: "",
    additional_checkout_buttons: false, content_for_additional_checkout_buttons: "",
  };

  const liquidFs = {
    readFileSync: (file: string) => stripSchema(text(files, file) ?? ""),
    readFile: async (file: string) => stripSchema(text(files, file) ?? ""),
    existsSync: (file: string) => files.has(file),
    exists: async (file: string) => files.has(file),
    contains: () => true,
    resolve: (root: string, file: string, ext: string) => {
      const clean = file.endsWith(ext) ? file : `${file}${ext}`;
      const base = root.replace(/\/+$/, "");
      return base && base !== "." ? `${base}/${clean}` : clean;
    },
    sep: "/",
    dirname: (file: string) => file.split("/").slice(0, -1).join("/"),
    fallback: () => undefined,
  };

  const engine = new Liquid({
    cache: false, strictFilters: false, strictVariables: false, ownPropertyOnly: false,
    extname: ".liquid", fs: liquidFs as never, root: ["."], partials: ["snippets"], layouts: ["layout"],
    relativeReference: false, lenientIf: true,
    /* CRÍTICO: {% render %} isola o escopo; como na Shopify, objetos globais
       (settings, shop, cart, routes…) precisam estar visíveis dentro dos snippets. */
    globals,
  });

  /* ---------- filtros Shopify ---------- */
  const moneyFormat = (cents: unknown) => {
    const value = typeof cents === "number" ? cents / 100 : parseFloat(String(cents ?? 0)) / 100;
    return `R$ ${(Number.isFinite(value) ? value : 0).toFixed(2).replace(".", ",")}`;
  };
  const urlOf = (value: unknown): string => value instanceof ThemeImage ? value.src : typeof value === "string" ? value : String(record(value).src ?? record(value).url ?? "");

  engine.registerFilter("asset_url", (name) => assetUrl(String(name)));
  engine.registerFilter("asset_img_url", (name) => assetUrl(String(name)));
  engine.registerFilter("global_asset_url", (name) => `https://cdn.shopify.com/shopifycloud/shopify/assets/${name}`);
  engine.registerFilter("shopify_asset_url", (name) => `https://cdn.shopify.com/shopifycloud/shopify/assets/${name}`);
  engine.registerFilter("file_url", (name) => imageFor(String(name))?.src ?? PLACEHOLDER_SVG("Arquivo da loja"));
  engine.registerFilter("file_img_url", (name) => imageFor(String(name))?.src ?? PLACEHOLDER_SVG("Arquivo da loja"));
  engine.registerFilter("image_url", (value) => urlOf(value ?? "") || PLACEHOLDER_SVG("Imagem"));
  engine.registerFilter("img_url", (value) => urlOf(value ?? "") || PLACEHOLDER_SVG("Imagem"));
  engine.registerFilter("image_tag", function (value, ...args) {
    const named = argPairs(args);
    const url = urlOf(value ?? "");
    const cls = named.class ? ` class="${named.class}"` : "";
    const alt = named.alt ?? (value instanceof ThemeImage ? value.alt : "");
    const sizes = named.sizes ? ` sizes="${named.sizes}"` : "";
    return `<img src="${url || PLACEHOLDER_SVG("Imagem")}"${cls} alt="${alt}" loading="lazy"${sizes}>`;
  });
  engine.registerFilter("placeholder_svg_tag", (name, cls) =>
    `<svg class="${cls ?? ""} placeholder-svg" viewBox="0 0 525 525" xmlns="http://www.w3.org/2000/svg"><rect width="525" height="525" fill="#e5e7eb"/><path d="M0 525 393 131l131 131v263z" fill="#d1d5db"/><circle cx="140" cy="140" r="61" fill="#d1d5db"/></svg>`);
  engine.registerFilter("inline_asset_content", (name) => {
    const path = assetPathByName.get(String(name).toLowerCase());
    return path ? text(files, path) ?? "" : "";
  });
  engine.registerFilter("stylesheet_tag", (url, ...args) => {
    const named = argPairs(args);
    return `<link rel="stylesheet" href="${url}"${named.preload ? ' data-preload="true"' : ""}>`;
  });
  engine.registerFilter("script_tag", (url) => `<script src="${url}" defer></script>`);
  engine.registerFilter("preload_tag", (url, ...args) => {
    const named = argPairs(args);
    return `<link rel="preload" href="${url}" as="${named.as ?? "style"}">`;
  });
  engine.registerFilter("t", (key, ...args) => {
    const named = argPairs(args);
    let value = translations[String(key)] ?? String(key).split(".").at(-1)?.replace(/_/g, " ") ?? "";
    for (const [name, replacement] of Object.entries(named)) {
      value = value.replaceAll(`{{ ${name} }}`, String(replacement)).replaceAll(`{{${name}}}`, String(replacement));
    }
    return value;
  });
  engine.registerFilter("money", moneyFormat);
  engine.registerFilter("money_with_currency", (cents) => `${moneyFormat(cents)} BRL`);
  engine.registerFilter("money_without_currency", (cents) => moneyFormat(cents).replace("R$ ", ""));
  engine.registerFilter("money_without_trailing_zeros", (cents) => moneyFormat(cents).replace(/,00$/, ""));
  engine.registerFilter("weight_with_unit", (grams) => `${((Number(grams) || 0) / 1000).toFixed(1)} kg`);
  engine.registerFilter("handle", (value) => String(value ?? "").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, ""));
  engine.registerFilter("handleize", (value) => String(value ?? "").toLowerCase().replace(/[^\w]+/g, "-").replace(/^-+|-+$/g, ""));
  engine.registerFilter("camelize", (value) => String(value ?? "").replace(/[-_](\w)/g, (_, c) => c.toUpperCase()));
  engine.registerFilter("json", (value) => JSON.stringify(value ?? null));
  engine.registerFilter("strip_html", (value) => String(value ?? "").replace(/<[^>]*>/g, ""));
  engine.registerFilter("newline_to_br", (value) => String(value ?? "").replace(/\n/g, "<br>"));
  engine.registerFilter("pluralize", (count, singular, plural) => Number(count) === 1 ? singular : plural);
  engine.registerFilter("within", (url) => url);
  engine.registerFilter("link_to", (label, url) => `<a href="${url ?? "#"}">${label}</a>`);
  engine.registerFilter("link_to_type", (type) => `<a href="#">${type}</a>`);
  engine.registerFilter("link_to_tag", (tag) => `<a href="#">${tag}</a>`);
  engine.registerFilter("link_to_vendor", (vendor) => `<a href="#">${vendor}</a>`);
  engine.registerFilter("highlight", (value) => value);
  engine.registerFilter("default_pagination", () => "");
  engine.registerFilter("default_errors", () => "");
  engine.registerFilter("payment_type_svg_tag", (type) => `<span class="payment-icon" data-payment="${type}"></span>`);
  engine.registerFilter("payment_type_img_url", () => PLACEHOLDER_SVG("pagamento", "#f3f4f6"));
  engine.registerFilter("time_tag", (value) => `<time datetime="${value}">${new Date(String(value)).toLocaleDateString("pt-BR")}</time>`);
  engine.registerFilter("date", (value, format) => {
    const date = value === "now" || value === "today" ? new Date() : new Date(String(value));
    if (Number.isNaN(date.getTime())) return String(value ?? "");
    if (typeof format === "string" && /%Y/.test(format)) return String(date.getFullYear());
    return date.toLocaleDateString("pt-BR");
  });
  engine.registerFilter("font_face", () => "");
  engine.registerFilter("font_url", () => "");
  engine.registerFilter("font_modify", (font, property, value) => {
    const base = record(font);
    return { ...base, [String(property)]: value, family: base.family ?? "sans-serif" };
  });
  engine.registerFilter("color_to_rgb", (value) => { const c = colorParse(String(value)); return c ? rgbString(c) : String(value ?? ""); });
  engine.registerFilter("color_to_hex", (value) => String(value ?? ""));
  engine.registerFilter("color_extract", (value, component) => {
    const c = colorParse(String(value)); if (!c) return 0;
    return component === "red" ? c[0] : component === "green" ? c[1] : component === "blue" ? c[2] : component === "alpha" ? c[3] : 0;
  });
  engine.registerFilter("color_brightness", (value) => { const c = colorParse(String(value)); return c ? Math.round((c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000) : 0; });
  engine.registerFilter("brightness_difference", (a, b) => {
    const brightness = (v: string) => { const c = colorParse(v); return c ? (c[0] * 299 + c[1] * 587 + c[2] * 114) / 1000 : 0; };
    return Math.abs(brightness(String(a)) - brightness(String(b)));
  });
  engine.registerFilter("color_difference", () => 255);
  engine.registerFilter("color_contrast", () => 7);
  engine.registerFilter("color_modify", (value, component, amount) => {
    const c = colorParse(String(value)); if (!c) return String(value ?? "");
    if (component === "alpha") return rgbString([c[0], c[1], c[2], Number(amount)]);
    return rgbString(c);
  });
  const shade = (value: unknown, amount: unknown, direction: 1 | -1) => {
    const c = colorParse(String(value)); if (!c) return String(value ?? "");
    const factor = (Number(amount) || 0) / 100;
    const adjust = (channel: number) => Math.max(0, Math.min(255, Math.round(direction > 0 ? channel + (255 - channel) * factor : channel * (1 - factor))));
    return rgbString([adjust(c[0]), adjust(c[1]), adjust(c[2]), c[3]]);
  };
  engine.registerFilter("color_lighten", (value, amount) => shade(value, amount, 1));
  engine.registerFilter("color_darken", (value, amount) => shade(value, amount, -1));
  engine.registerFilter("color_saturate", (value) => String(value ?? ""));
  engine.registerFilter("color_desaturate", (value) => String(value ?? ""));
  engine.registerFilter("color_mix", (value, other, weight) => {
    const a = colorParse(String(value)); const b = colorParse(String(other));
    if (!a || !b) return String(value ?? "");
    const w = (Number(weight) || 50) / 100;
    return rgbString([Math.round(a[0] * w + b[0] * (1 - w)), Math.round(a[1] * w + b[1] * (1 - w)), Math.round(a[2] * w + b[2] * (1 - w)), 1]);
  });
  engine.registerFilter("hex_to_rgba", (value, alpha) => {
    const c = colorParse(String(value)); return c ? rgbString([c[0], c[1], c[2], Number(alpha ?? 1)]) : String(value ?? "");
  });
  engine.registerFilter("sort_by", (input) => input);
  engine.registerFilter("item_count_for_variant", () => 0);
  engine.registerFilter("payment_terms", () => "");
  engine.registerFilter("payment_button", () => "");
  engine.registerFilter("line_items_for", () => []);
  engine.registerFilter("class_list", (value) => String(value ?? ""));
  engine.registerFilter("url_for_type", () => "#");
  engine.registerFilter("url_for_vendor", () => "#");
  engine.registerFilter("format_address", () => "");
  engine.registerFilter("structured_data", (value) => JSON.stringify(value ?? {}));

  /* ---------- tags Shopify ---------- */
  function rawBodyTag(endName: string, wrap: (body: string) => string) {
    return {
      parse(this: { tokens: TopLevelToken[]; liquid: Liquid }, tagToken: TagToken, remainTokens: TopLevelToken[]) {
        this.tokens = [];
        const stream = (this.liquid as unknown as { parser: { parseStream: (tokens: TopLevelToken[]) => { on: (event: string, handler: (token?: TopLevelToken) => void) => { on: (event: string, handler: () => void) => { start: () => void } } } } }).parser.parseStream(remainTokens);
        stream.on("token", (token) => {
          const name = (token as TagToken).name;
          if (name === endName) (stream as unknown as { stop: () => void }).stop();
          else this.tokens.push(token as TopLevelToken);
        }).on("end", () => { throw new Error(`tag {% ${endName.replace("end", "")} %} não fechada`); });
        (stream as unknown as { start: () => void }).start();
      },
      render(this: { tokens: Array<{ getText?: () => string; raw?: string }> }) {
        const body = this.tokens.map((token) => token.getText ? token.getText() : token.raw ?? "").join("");
        return wrap(body);
      },
    };
  }

  engine.registerTag("schema", rawBodyTag("endschema", () => ""));
  engine.registerTag("javascript", rawBodyTag("endjavascript", (body) => `<script>${body}</script>`));
  engine.registerTag("stylesheet", rawBodyTag("endstylesheet", (body) => `<style>${body}</style>`));
  engine.registerTag("style", {
    parse(this: { templates: unknown[]; liquid: Liquid }, tagToken: TagToken, remainTokens: TopLevelToken[]) {
      this.templates = [];
      const parser = (this.liquid as unknown as { parser: { parseStream: (t: TopLevelToken[]) => never } }).parser;
      const stream = (parser as unknown as { parseStream: (t: TopLevelToken[]) => { on: (e: string, h: (tk?: unknown) => void) => { on: (e: string, h: (tk?: unknown) => void) => { on: (e: string, h: () => void) => { start: () => void } } } } }).parseStream(remainTokens);
      stream
        .on("tag:endstyle", () => (stream as unknown as { stop: () => void }).stop())
        .on("template", (tpl) => this.templates.push(tpl))
        .on("end", () => { throw new Error("tag {% style %} não fechada"); });
      (stream as unknown as { start: () => void }).start();
    },
    * render(this: { templates: unknown[]; liquid: Liquid }, ctx: Context, emitter: Emitter) {
      emitter.write("<style>");
      yield (this.liquid as unknown as { renderer: { renderTemplates: (tpls: unknown[], ctx: Context, emitter: Emitter) => unknown } }).renderer.renderTemplates(this.templates as never, ctx, emitter);
      emitter.write("</style>");
    },
  });
  engine.registerTag("form", {
    parse(this: { templates: unknown[]; liquid: Liquid; args: string }, tagToken: TagToken, remainTokens: TopLevelToken[]) {
      this.args = tagToken.args;
      this.templates = [];
      const stream = (this.liquid as unknown as { parser: { parseStream: (t: TopLevelToken[]) => { on: (e: string, h: (tk?: unknown) => void) => { on: (e: string, h: (tk?: unknown) => void) => { on: (e: string, h: () => void) => { start: () => void } } } } } }).parser.parseStream(remainTokens);
      stream
        .on("tag:endform", () => (stream as unknown as { stop: () => void }).stop())
        .on("template", (tpl) => this.templates.push(tpl))
        .on("end", () => { throw new Error("tag {% form %} não fechada"); });
      (stream as unknown as { start: () => void }).start();
    },
    * render(this: { templates: unknown[]; liquid: Liquid }, ctx: Context, emitter: Emitter) {
      emitter.write(`<form action="#" method="post" onsubmit="return false">`);
      yield (this.liquid as unknown as { renderer: { renderTemplates: (tpls: unknown[], ctx: Context, emitter: Emitter) => unknown } }).renderer.renderTemplates(this.templates as never, ctx, emitter);
      emitter.write("</form>");
    },
  });
  engine.registerTag("paginate", {
    parse(this: { templates: unknown[]; liquid: Liquid }, tagToken: TagToken, remainTokens: TopLevelToken[]) {
      this.templates = [];
      const stream = (this.liquid as unknown as { parser: { parseStream: (t: TopLevelToken[]) => { on: (e: string, h: (tk?: unknown) => void) => { on: (e: string, h: (tk?: unknown) => void) => { on: (e: string, h: () => void) => { start: () => void } } } } } }).parser.parseStream(remainTokens);
      stream
        .on("tag:endpaginate", () => (stream as unknown as { stop: () => void }).stop())
        .on("template", (tpl) => this.templates.push(tpl))
        .on("end", () => { throw new Error("tag {% paginate %} não fechada"); });
      (stream as unknown as { start: () => void }).start();
    },
    * render(this: { templates: unknown[]; liquid: Liquid }, ctx: Context, emitter: Emitter) {
      ctx.push({ paginate: { pages: 1, current_page: 1, current_offset: 0, items: DEMO_PRODUCTS.length, parts: [], previous: null, next: null, page_size: 24 } });
      yield (this.liquid as unknown as { renderer: { renderTemplates: (tpls: unknown[], ctx: Context, emitter: Emitter) => unknown } }).renderer.renderTemplates(this.templates as never, ctx, emitter);
      ctx.pop();
    },
  });
  engine.registerTag("layout", { parse() { /* layout tratado externamente */ }, render() { return ""; } });

  const renderSectionInstance = async (section: ShopifySectionInstance): Promise<string> => {
    if (section.disabled) return "";
    const source = text(files, `sections/${section.type}.liquid`);
    const drop = resolveSection(section);
    let inner = "";
    if (source) {
      try {
        inner = await engine.parseAndRender(stripSchema(source), { ...globals, section: drop });
      } catch (error) {
        inner = `<!-- seção ${section.type}: ${error instanceof Error ? error.message.slice(0, 200) : "erro"} -->`;
      }
    } else {
      inner = `<!-- seção ${section.type} sem arquivo .liquid -->`;
    }
    return `<div id="shopify-section-${section.id}" class="shopify-section section-${section.type}" data-orbis-section="${section.id}">${inner}</div>`;
  };

  const renderGroup = async (groupId: string): Promise<string> => {
    const group = theme.pages.find((item) => item.id === groupId || item.id.startsWith(groupId));
    if (!group) return "";
    const parts = await Promise.all(group.sections.map((section) => renderSectionInstance(section)));
    return parts.join("\n");
  };

  const sectionByType = (type: string): ShopifySectionInstance => {
    for (const candidate of theme.pages) {
      const found = candidate.sections.find((section) => section.type === type);
      if (found && (candidate.id.startsWith("header-group") || candidate.id.startsWith("footer-group") || candidate.id.startsWith("overlay-group"))) return found;
    }
    const rawSections = record(currentSettings.sections);
    for (const [id, value] of Object.entries(rawSections)) {
      const raw = record(value);
      if (raw.type === type) return { id, type, name: type, settings: record(raw.settings) as Record<string, ShopifyValue>, blocks: [] };
    }
    const schema = schemaByType.get(type);
    const defaults = Object.fromEntries((schema?.settings ?? []).filter((setting) => setting.default !== undefined).map((setting) => [setting.id, setting.default])) as Record<string, ShopifyValue>;
    return { id: `static-${type}`, type, name: type, settings: defaults, blocks: [] };
  };

  engine.registerTag("section", {
    parse(this: { name: string }, tagToken: TagToken) { this.name = tagToken.args.replace(/['"]/g, "").trim(); },
    async render(this: { name: string }) { return renderSectionInstance(sectionByType(this.name)); },
  });
  engine.registerTag("sections", {
    parse(this: { name: string }, tagToken: TagToken) { this.name = tagToken.args.replace(/['"]/g, "").trim(); },
    async render(this: { name: string }) { return renderGroup(this.name); },
  });

  /* ---------- conteúdo da página ---------- */
  const page: ShopifyPage | undefined =
    theme.pages.find((item) => item.id === pageId) ??
    theme.pages.find((item) => item.id === "index") ??
    theme.pages.find((item) => !item.id.includes("-group"));
  if (!page) throw new Error("PAGE_NOT_FOUND");

  let contentForLayout = "";
  const liquidTemplate = page.template.endsWith(".liquid") ? text(files, page.template) : undefined;
  if (liquidTemplate) {
    try {
      contentForLayout = await engine.parseAndRender(stripSchema(liquidTemplate), globals);
    } catch (error) {
      contentForLayout = `<!-- template ${page.template}: ${error instanceof Error ? error.message.slice(0, 200) : "erro"} -->`;
    }
  }
  if (!contentForLayout.trim()) {
    const rendered = await Promise.all(
      page.sections.filter((section) => !section.disabled).map((section) => renderSectionInstance(section)),
    );
    contentForLayout = rendered.join("\n");
  }

  const layoutSource = text(files, "layout/theme.liquid");
  let html: string;
  if (layoutSource) {
    html = await engine.parseAndRender(stripSchema(layoutSource), { ...globals, content_for_layout: contentForLayout });
  } else {
    html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${contentForLayout}</body></html>`;
  }

  const bridge = `<script>(function(){document.addEventListener("click",function(event){var anchor=event.target.closest("a");if(anchor){event.preventDefault();}var section=event.target.closest("[data-orbis-section]");if(section&&window.parent!==window){window.parent.postMessage({orbisSection:section.getAttribute("data-orbis-section")},"*");}},true);})();</script>`;
  html = html.includes("</body>") ? html.replace("</body>", `${bridge}</body>`) : html + bridge;
  return html;
}

function stripSchema(source: string): string {
  return source.replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/gi, "");
}
