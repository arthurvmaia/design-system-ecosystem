/**
 * Motor de renderização de temas Shopify importados.
 * Renderiza o Liquid real do tema (layout, seções, snippets, settings, traduções)
 * com objetos de loja simulados — o mesmo princípio do editor da Shopify.
 */
import { Liquid, type TagToken, type TopLevelToken, type Context, type Emitter } from "liquidjs";
import { strFromU8 } from "fflate";
import type { ShopifyPage, ShopifySectionInstance, ShopifySettingDefinition, ShopifyThemeImport, ShopifyValue } from "@/lib/shopify-theme";
import { CATALOGO_LOJA, type CatalogoProduto } from "./catalogo-loja";

/** Item do carrinho simulado: o preview guarda só o essencial. */
export type PreviewCartItem = { variantId: number; quantity: number };

export type RenderOptions = {
  theme: ShopifyThemeImport;
  files: Map<string, Uint8Array>;
  pageId: string;
  /** Converte um caminho relativo do tema (assets/foo.png) na URL servida. */
  assetBase: (path: string) => string;
  /** Estado do carrinho simulado; sem ele o carrinho nasce vazio. */
  cartItems?: PreviewCartItem[];
  /** Quando presente, devolve só o HTML destas seções (Section Rendering API). */
  onlySections?: string[];
  /** Handle do recurso da rota: /products/<handle> ou /collections/<handle>. */
  handle?: string;
  /** Variante pedida na rota (?variant=), como o seletor de opções faz. */
  variantId?: number;
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

/**
 * Monta um produto no formato que os temas leem a partir de uma entrada do
 * catálogo real (`lib/catalogo-loja.ts`): título, descrição, preços, opções,
 * variantes e imagens saem todos da loja de origem.
 */
function produtoDoCatalogo(fonte: CatalogoProduto) {
  const imagens = fonte.images.map((img) => new ThemeImage(img.src, img.alt, img.width, img.height));
  const principal = imagens[0] ?? demoImage(fonte.title);
  const midias = imagens.map((image, posicao) => ({
    id: image.id, media_type: "image", position: posicao + 1, preview_image: image,
    alt: image.alt, aspect_ratio: image.aspect_ratio, width: image.width, height: image.height, src: image.src,
  }));
  const imagemDaVariante = (src: string | null) => (src ? imagens.find((img) => img.src === src) ?? new ThemeImage(src, fonte.title) : null);

  const variantes = fonte.variants.map((v) => ({
    id: v.id, title: v.title, price: v.price, compare_at_price: v.compareAtPrice, available: v.available,
    inventory_management: "shopify", inventory_policy: "deny", inventory_quantity: v.available ? 25 : 0,
    options: [v.option1, v.option2, v.option3].filter((opcao): opcao is string => Boolean(opcao)),
    option1: v.option1, option2: v.option2, option3: v.option3,
    featured_image: imagemDaVariante(v.imageSrc), featured_media: null,
    url: `/products/${fonte.handle}?variant=${v.id}`, weight: 0, unit_price: null,
    requires_shipping: true, taxable: true, barcode: "", sku: v.sku,
    selected: false, requires_selling_plan: false, selling_plan_allocations: [],
  }));
  const primeira = variantes[0];
  primeira.selected = true;

  const precos = variantes.map((v) => v.price);
  const comparados = variantes.map((v) => v.compare_at_price ?? 0);
  const precoMin = Math.min(...precos);
  const precoMax = Math.max(...precos);
  const comparadoMax = Math.max(...comparados);

  return {
    id: fonte.id, title: fonte.title, handle: fonte.handle,
    url: `/products/${fonte.handle}`, available: variantes.some((v) => v.available),
    price: primeira.price, price_min: precoMin, price_max: precoMax, price_varies: precoMin !== precoMax,
    compare_at_price: primeira.compare_at_price, compare_at_price_min: Math.min(...comparados),
    compare_at_price_max: comparadoMax, compare_at_price_varies: Math.min(...comparados) !== comparadoMax,
    featured_image: principal, featured_media: midias[0] ?? null, images: imagens, media: midias,
    options: fonte.options.map((opcao) => opcao.name),
    options_with_values: fonte.options.map((opcao) => ({
      name: opcao.name, position: opcao.position, values: opcao.values,
      selected_value: opcao.position === 1 ? primeira.option1 : opcao.position === 2 ? primeira.option2 : primeira.option3,
    })),
    variants: variantes, selected_or_first_available_variant: primeira, selected_variant: null,
    first_available_variant: variantes.find((v) => v.available) ?? primeira,
    has_only_default_variant: variantes.length === 1 && fonte.options.length <= 1,
    vendor: fonte.vendor, type: fonte.type,
    description: fonte.descriptionHtml, content: fonte.descriptionHtml,
    tags: fonte.tags, collections: [], template_suffix: null,
    published_at: fonte.publishedAt, created_at: fonte.publishedAt,
    requires_selling_plan: false, selling_plan_groups: [], quantity_price_breaks_configured: false, gift_card: false, metafields: {},
  };
}

/** Os 10 produtos reais que abastecem toda prévia de tema importado. */
const DEMO_PRODUCTS = CATALOGO_LOJA.map(produtoDoCatalogo);

type ProdutoDaLoja = (typeof DEMO_PRODUCTS)[number];

/** Todas as variantes do catálogo, para o carrinho casar item com produto. */
const VARIANTE_PARA_PRODUTO = new Map<number, ProdutoDaLoja>();
for (const produto of DEMO_PRODUCTS) {
  for (const variante of produto.variants) VARIANTE_PARA_PRODUTO.set(variante.id, produto);
}

/**
 * Resolve o produto de um handle qualquer pedido pelo tema. Handle conhecido
 * devolve o produto real; handle desconhecido gira pelo catálogo (índice) para
 * cada slot da página mostrar um produto diferente.
 */
/**
 * Produto com a variante pedida em `?variant=` marcada como selecionada — é
 * assim que o seletor de opções do tema troca preço, imagem e id de compra.
 */
function comVarianteSelecionada(produto: ProdutoDaLoja, variantId: number | undefined): ProdutoDaLoja {
  const escolhida = variantId ? produto.variants.find((variante) => variante.id === variantId) : undefined;
  if (!escolhida) return produto;
  for (const variante of produto.variants) variante.selected = variante.id === escolhida.id;
  return {
    ...produto,
    price: escolhida.price, compare_at_price: escolhida.compare_at_price,
    selected_variant: escolhida, selected_or_first_available_variant: escolhida,
    featured_image: escolhida.featured_image ?? produto.featured_image,
    options_with_values: produto.options_with_values.map((opcao) => ({
      ...opcao,
      selected_value: opcao.position === 1 ? escolhida.option1 : opcao.position === 2 ? escolhida.option2 : escolhida.option3,
    })),
  };
}

/** Índice variante → dados de linha, para a ponte do carrinho dentro do preview. */
function catalogoPorVariante() {
  const mapa: Record<string, unknown> = {};
  for (const produto of DEMO_PRODUCTS) {
    for (const variante of produto.variants) {
      const imagem = variante.featured_image ?? produto.featured_image;
      mapa[String(variante.id)] = {
        title: produto.has_only_default_variant ? produto.title : `${produto.title} - ${variante.title}`,
        product_title: produto.title,
        variant_title: produto.has_only_default_variant ? null : variante.title,
        price: variante.price, image: imagem?.src ?? null,
        handle: produto.handle, product_id: produto.id, url: variante.url,
        options: [variante.option1, variante.option2, variante.option3],
      };
    }
  }
  return mapa;
}

function demoProduct(handle: string, index = 0): ProdutoDaLoja {
  const alvo = handle.trim().toLowerCase();
  if (alvo) {
    const exato = DEMO_PRODUCTS.find((produto) => produto.handle === alvo);
    if (exato) return exato;
  }
  return DEMO_PRODUCTS[index % DEMO_PRODUCTS.length];
}

/**
 * Carrinho simulado no formato que os temas leem (Dawn e derivados):
 * itens com produto, variante, preços e a linha final. É o que faz a gaveta
 * mostrar item, quantidade e total de verdade.
 */
function buildCart(items: PreviewCartItem[] | undefined) {
  const linhas = (items ?? [])
    .map((item, index) => {
      const produto = VARIANTE_PARA_PRODUTO.get(item.variantId) ?? DEMO_PRODUCTS[index % DEMO_PRODUCTS.length];
      const quantidade = Math.max(1, Math.min(99, Math.floor(item.quantity) || 1));
      const variante = produto.variants.find((candidate) => candidate.id === item.variantId) ?? produto.variants[0];
      const preco = variante.price;
      const semVariacao = produto.has_only_default_variant;
      return {
        id: variante.id, key: `${variante.id}:${index}`, quantity: quantidade,
        title: semVariacao ? produto.title : `${produto.title} - ${variante.title}`,
        product_title: produto.title, variant_title: semVariacao ? null : variante.title,
        product_id: produto.id, variant_id: variante.id, handle: produto.handle,
        url: variante.url, product_has_only_default_variant: semVariacao,
        price: preco, final_price: preco, original_price: preco, discounted_price: preco,
        line_price: preco * quantidade, final_line_price: preco * quantidade,
        original_line_price: preco * quantidade, total_discount: 0,
        image: variante.featured_image ?? produto.featured_image,
        featured_image: variante.featured_image ?? produto.featured_image,
        product: produto, variant: variante, options_with_values: produto.options_with_values,
        properties: {}, selling_plan_allocation: null, discounts: [], line_level_discount_allocations: [],
        requires_shipping: true, taxable: true, gift_card: false, sku: variante.sku, vendor: produto.vendor,
      };
    });
  const total = linhas.reduce((soma, linha) => soma + linha.line_price, 0);
  const contagem = linhas.reduce((soma, linha) => soma + linha.quantity, 0);
  return {
    item_count: contagem, items: linhas, total_price: total, original_total_price: total,
    items_subtotal_price: total, total_discount: 0, empty: linhas.length === 0,
    currency: { iso_code: "BRL", symbol: "R$" }, note: null, attributes: {},
    cart_level_discount_applications: [], discount_applications: [],
    requires_shipping: linhas.length > 0, taxes_included: false, checkout_charge_amount: total,
    token: "orbis-preview-cart", created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  };
}

function demoCollection(handle: string) {
  const title = handle ? handle.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Coleção em destaque";
  return {
    id: 9000001, title, handle: handle || "colecao-demo", url: `/collections/${handle || "colecao-demo"}`, description: "",
    products: DEMO_PRODUCTS, products_count: DEMO_PRODUCTS.length, all_products_count: DEMO_PRODUCTS.length,
    image: DEMO_PRODUCTS[0].featured_image, featured_image: DEMO_PRODUCTS[0].featured_image,
    all_tags: [...new Set(DEMO_PRODUCTS.flatMap((produto) => produto.tags))],
    all_types: [...new Set(DEMO_PRODUCTS.map((produto) => produto.type).filter(Boolean))],
    all_vendors: [...new Set(DEMO_PRODUCTS.map((produto) => produto.vendor))],
    sort_by: "", default_sort_by: "best-selling", filters: [], template_suffix: null,
  };
}

const DEMO_LINKS = [
  { title: "Início", url: "/", active: true, current: true, child_active: false, child_current: false, links: [], levels: 0, handle: "inicio", type: "frontpage_link", object: null },
  { title: "Produtos", url: "/collections/all", active: false, current: false, child_active: false, child_current: false, links: [], levels: 0, handle: "produtos", type: "catalog_link", object: null },
  { title: "Contato", url: "/pages/contact", active: false, current: false, child_active: false, child_current: false, links: [], levels: 0, handle: "contato", type: "page_link", object: null },
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
  helpers: { imageFor: (value: ShopifyValue) => ThemeImage | null; schemeFor: (id: ShopifyValue) => unknown; registerFont?: (font: ShopifyFontDrop) => void },
) {
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  const resolved: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(values)) {
    const type = byId.get(id)?.type ?? "";
    if (type === "font_picker" && typeof value === "string") {
      const font = shopifyFontFromHandle(value);
      helpers.registerFont?.(font);
      resolved[id] = font;
      continue;
    }
    if ((type === "color" || type === "color_background") && typeof value === "string" && value) {
      /* gradientes (color_background) não têm canais e seguem como string */
      resolved[id] = colorDrop(value);
      continue;
    }
    if (type === "image_picker") { resolved[id] = helpers.imageFor(value); continue; }
    if (type === "color_scheme") { resolved[id] = helpers.schemeFor(value); continue; }
    if (type === "collection") { resolved[id] = demoCollection(typeof value === "string" ? value : ""); continue; }
    if (type === "product") { resolved[id] = demoProduct(typeof value === "string" ? value : "", 2); continue; }
    if (type === "collection_list") { resolved[id] = ["colecao-1", "colecao-2", "colecao-3", "colecao-4"].map((handle) => demoCollection(handle)); continue; }
    if (type === "product_list") { resolved[id] = DEMO_PRODUCTS; continue; }
    if (type === "link_list" || type === "menu") { resolved[id] = { title: "Menu", handle: String(value ?? "main-menu"), links: DEMO_LINKS, levels: 1 }; continue; }
    if (type === "blog") { const blogHandle = String(value ?? "blog"); resolved[id] = { title: "Blog", handle: blogHandle, url: `/blogs/${blogHandle}`, articles: [], articles_count: 0, all_tags: [] }; continue; }
    if (type === "article") { resolved[id] = null; continue; }
    if (type === "page") { const pageHandle = String(value ?? "pagina"); resolved[id] = { title: "Página", handle: pageHandle, content: "", url: `/pages/${pageHandle}` }; continue; }
    resolved[id] = value;
  }
  for (const definition of definitions) {
    if (definition.id in resolved || definition.default === undefined) continue;
    const fallback = definition.default;
    if (definition.type === "font_picker" && typeof fallback === "string") {
      const font = shopifyFontFromHandle(fallback);
      helpers.registerFont?.(font);
      resolved[definition.id] = font;
    } else if ((definition.type === "color" || definition.type === "color_background") && typeof fallback === "string" && fallback) {
      resolved[definition.id] = colorDrop(fallback);
    } else {
      resolved[definition.id] = fallback;
    }
  }
  return resolved;
}

function colorParse(value: string): [number, number, number, number] | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().match(/^#?([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3})$/i)?.[1];
  if (hex) {
    const full = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
    const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), alpha];
  }
  const rgba = value.trim().match(/^rgba?\(([^)]+)\)$/i)?.[1]?.split(/[,/\s]+/).filter(Boolean).map((part) => parseFloat(part));
  if (rgba && rgba.length >= 3) return [rgba[0], rgba[1], rgba[2], rgba[3] ?? 1];
  return null;
}

const rgbString = ([r, g, b, a]: [number, number, number, number]) => a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${a})`;

/**
 * Cor como a Shopify entrega ao Liquid: imprime o valor original, mas expõe os
 * canais (.red/.green/.blue/.alpha/.rgb…). É disso que os temas Dawn-based
 * dependem para gerar as variáveis CSS — sem os canais, todo o esquema de cores
 * do tema sai quebrado (`--color-base-text: , , ;`).
 */
function colorDrop(value: string): unknown {
  const parsed = colorParse(value);
  if (!parsed) return value;
  const [red, green, blue, alpha] = parsed;
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;
  const lightness = (max + min) / 2;
  const delta = max - min;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  const [r1, g1, b1] = [red / 255, green / 255, blue / 255];
  let hue = 0;
  if (delta > 0) {
    if (max === r1) hue = 60 * (((g1 - b1) / delta) % 6);
    else if (max === g1) hue = 60 * ((b1 - r1) / delta + 2);
    else hue = 60 * ((r1 - g1) / delta + 4);
  }
  return {
    red, green, blue, alpha,
    rgb: `${red} ${green} ${blue}`,
    rgba: `${red} ${green} ${blue} / ${alpha}`,
    hue: Math.round((hue + 360) % 360),
    saturation: Math.round(saturation * 100),
    lightness: Math.round(lightness * 100),
    toString() { return value; },
  };
}

/** Fallback genérico coerente por família (a Shopify manda o fallback real; aqui é heurística declarada). */
const SERIF_FONTS = /playfair|merriweather|lora|georgia|garamond|baskerville|cormorant|crimson|spectral|source serif|pt serif|noto serif|dm serif|ibm plex serif|bitter|domine|cardo|vollkorn|alegreya|eb garamond|libre caslon|zilla|frank ruhl|tinos|rozha|abril|prata|bodoni|didot|times/i;
const MONO_FONTS = /mono|courier|consolas|menlo/i;

type ShopifyFontDrop = {
  family: string;
  fallback_families: string;
  style: string;
  weight: number | string;
  baseline_ratio: number;
  system: boolean;
  "system?": boolean;
  variants: unknown[];
  toString(): string;
};

/**
 * Interpreta o handle do font_picker da Shopify (ex.: "poppins_n7",
 * "harmonia_sans_n4", "playfair_display_i7"): tudo antes do último token
 * `_n<d>`/`_i<d>` é a família (com underscores como espaços), o token final dá
 * peso e itálico. O parser antigo cortava a família na primeira palavra e
 * marcava itálico para qualquer nome contendo a letra "i".
 */
function shopifyFontFromHandle(value: string): ShopifyFontDrop {
  const handle = value.trim().toLowerCase();
  const match = handle.match(/^(.*?)_(n|i)(\d{1,2})$/);
  const rawFamily = (match ? match[1] : handle).replace(/_/g, " ").trim();
  const family = rawFamily.replace(/\b\w/g, (letter) => letter.toUpperCase()) || "Assistant";
  const weight = match ? Math.min(900, Math.max(100, Number(match[3]) * 100)) : 400;
  const style = match?.[2] === "i" ? "italic" : "normal";
  const fallback = MONO_FONTS.test(family) ? "monospace" : SERIF_FONTS.test(family) ? "serif" : "sans-serif";
  return {
    family,
    fallback_families: fallback,
    style,
    weight,
    baseline_ratio: 0.71,
    system: false,
    "system?": false,
    variants: [],
    toString() { return family; },
  };
}

/**
 * URL do Google Fonts para as fontes usadas no tema. A biblioteca de fontes da
 * Shopify é majoritariamente espelho do Google Fonts; quando a família é
 * licenciada (ex.: Harmonia Sans), a folha responde 400 e o CSS cai no
 * fallback declarado — a troca fica visível no fallback_families, nunca muda em
 * silêncio para outra família.
 */
function googleFontsHref(fonts: Iterable<{ family: string; weight: number | string; style: string }>): string | null {
  const byFamily = new Map<string, Set<string>>();
  for (const font of fonts) {
    const weight = typeof font.weight === "number" ? font.weight : Number(font.weight) || 400;
    const bold = Math.min(1000, weight + 300);
    const variants = byFamily.get(font.family) ?? new Set<string>();
    for (const w of [weight, bold]) { variants.add(`0,${w}`); variants.add(`1,${w}`); }
    byFamily.set(font.family, variants);
  }
  if (!byFamily.size) return null;
  const families = Array.from(byFamily.entries()).map(([family, variants]) => {
    const tuples = Array.from(variants).sort((a, b) => {
      const [ai, aw] = a.split(",").map(Number);
      const [bi, bw] = b.split(",").map(Number);
      return ai - bi || aw - bw;
    });
    return `family=${family.replace(/ /g, "+")}:ital,wght@${tuples.join(";")}`;
  });
  return `https://fonts.googleapis.com/css2?${families.join("&")}&display=swap`;
}

function argPairs(args: unknown[]): Record<string, unknown> {
  const named: Record<string, unknown> = {};
  for (const arg of args) {
    if (Array.isArray(arg) && arg.length === 2 && typeof arg[0] === "string") named[arg[0]] = arg[1];
  }
  return named;
}

export async function renderThemePage({ theme, files, pageId, assetBase, cartItems, onlySections, handle, variantId }: RenderOptions): Promise<string> {
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
    const key = (typeof id === "string" && id ? id : Object.keys(schemes)[0]) ?? "scheme-1";
    const scheme = record(schemes[key]);
    /* cada cor do esquema também expõe canais — Dawn v9+ escreve
       `{{ scheme.settings.background.rgb }}` ao gerar as classes .color-* */
    const resolvedSettings: Record<string, unknown> = {};
    for (const [settingId, value] of Object.entries(record(scheme.settings))) {
      resolvedSettings[settingId] = typeof value === "string" && value ? colorDrop(value) : value;
    }
    return { id: key, settings: resolvedSettings, toString: () => key };
  };
  /* `settings.color_schemes` precisa ser iterável (`{% for scheme in ... %}`)
     E indexável por id — um array com propriedades nomeadas atende os dois. */
  const schemeList = Object.keys(schemes).map((key) => schemeFor(key));
  const schemeCollection = schemeList as unknown as Record<string, unknown> & unknown[];
  for (const drop of schemeList) schemeCollection[(drop as { id: string }).id] = drop;

  const fontsUsed = new Map<string, ShopifyFontDrop>();
  const registerFont = (font: ShopifyFontDrop) => {
    fontsUsed.set(`${font.family}|${font.weight}|${font.style}`, font);
  };

  const allGlobalDefinitions = theme.globalGroups.flatMap((group) => group.settings);
  const settings = resolveSettingValues(theme.globalValues, allGlobalDefinitions, { imageFor, schemeFor, registerFont });
  if (schemeList.length) settings.color_schemes = schemeCollection;

  const localeFile =
    text(files, "locales/pt-BR.json") ?? text(files, "locales/pt-PT.json") ??
    text(files, Array.from(files.keys()).find((path) => /^locales\/[^.]+\.default\.json$/.test(path)) ?? "") ??
    text(files, "locales/en.default.json");
  const translations = flattenTranslations(parseJson<Record<string, unknown>>(localeFile, {}));

  const schemaByType = new Map(theme.sectionSchemas.map((schema) => [schema.type, schema]));
  /* fontes de seções/blocos de QUALQUER página entram antes do render: o
     {{ content_for_header }} sai no <head>, antes de o layout executar os
     {% sections %} de cabeçalho/rodapé. */
  for (const page of theme.pages) {
    for (const section of page.sections) {
      const schema = schemaByType.get(section.type);
      const harvest = (values: Record<string, ShopifyValue>, definitions: ShopifySettingDefinition[]) => {
        for (const definition of definitions) {
          if (definition.type !== "font_picker") continue;
          const value = values[definition.id] ?? definition.default;
          if (typeof value === "string" && value) registerFont(shopifyFontFromHandle(value));
        }
      };
      harvest(section.settings, schema?.settings ?? []);
      for (const block of section.blocks) {
        harvest(block.settings, schema?.blocks.find((item) => item.type === block.type)?.settings ?? []);
      }
    }
  }
  const resolveSection = (section: ShopifySectionInstance) => {
    const schema = schemaByType.get(section.type);
    const resolvedSettings = resolveSettingValues(section.settings, schema?.settings ?? [], { imageFor, schemeFor, registerFont });
    const blocks = section.blocks.map((block, index) => {
      const blockSchema = schema?.blocks.find((item) => item.type === block.type);
      return {
        id: block.id, type: block.type,
        settings: resolveSettingValues(block.settings, blockSchema?.settings ?? [], { imageFor, schemeFor, registerFont }),
        shopify_attributes: `data-block-id="${block.id}"`,
        index: index + 1, index0: index,
      };
    });
    return { id: section.id, settings: resolvedSettings, blocks, index: 1, index0: 0, location: "template", type: section.type, disabled: section.disabled === true };
  };

  const collectionsProxy = proxyWithFallback<unknown>({}, (handle) => demoCollection(handle));
  const productsProxy = proxyWithFallback<unknown>({}, (handle) => demoProduct(handle, 2));
  const linklistsProxy = proxyWithFallback<unknown>({}, (handle) => ({ title: "Menu", handle, links: DEMO_LINKS, levels: 1 }));
  const pagesProxy = proxyWithFallback<unknown>({}, (handle) => ({ title: handle, handle, content: "", url: `/pages/${handle}` }));
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
    /* caminhos REAIS (como na Shopify): é o que permite ao editor traduzir um
       clique em link do tema para a página correspondente do preview */
    routes: {
      root_url: "/", cart_url: "/cart", cart_add_url: "/cart/add", cart_change_url: "/cart/change", cart_update_url: "/cart/update", cart_clear_url: "/cart/clear",
      search_url: "/search", predictive_search_url: "/search/suggest", collections_url: "/collections", all_products_collection_url: "/collections/all",
      account_url: "/account", account_login_url: "/account/login", account_logout_url: "/account/logout", account_register_url: "/account/register",
      account_addresses_url: "/account/addresses", account_recover_url: "/account/recover", product_recommendations_url: "/recommendations/products",
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
    cart: buildCart(cartItems),
    customer: null,
    template: { name: pageBase, suffix: pageId.includes(".") ? pageId.split(".").slice(1).join(".") : null, directory: null, toString: () => pageBase },
    /* getter: quando o layout imprime {{ content_for_header }} (sempre por
       último, depois das seções), fontsUsed já tem todas as fontes do tema —
       o link do Google Fonts é o que faz o preview usar a fonte REAL. */
    get content_for_header() {
      const href = googleFontsHref(fontsUsed.values());
      const fonts = href
        ? `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${href}">`
        : "";
      /* o editor da Shopify injeta window.Shopify no storefront; o JS dos
         temas depende dele (designMode, locale, routes) para inicializar
         sliders, carrosséis e menus. Sem o shim, ReferenceError e seção morta. */
      const themeName = JSON.stringify(theme.themeName);
      const runtime = `<script>window.Shopify=window.Shopify||{};Object.assign(window.Shopify,{designMode:true,shop:"minha-loja.exemplo",locale:"pt-BR",currency:{active:"BRL",rate:"1.0"},country:"BR",theme:{name:${themeName},role:"development"},routes:{root:"/"},cdnHost:"cdn.shopify.com",PaymentButton:{init:function(){}}});</script>`;
      return `<meta name="orbis-preview" content="1">${runtime}${fonts}`;
    },
    linklists: linklistsProxy,
    collections: collectionsProxy,
    all_products: productsProxy,
    pages: pagesProxy,
    images: imagesProxy,
    blogs: proxyWithFallback<unknown>({}, (handle) => ({ title: "Blog", handle, url: `/blogs/${handle}`, articles: [], articles_count: 0, all_tags: [] })),
    articles: proxyWithFallback<unknown>({}, () => null),
    /* o handle da rota escolhe o produto/coleção: é o que faz cada cartão
       clicado abrir o SEU produto, e o quick-add mostrar o certo */
    product: comVarianteSelecionada(demoProduct(pageId.startsWith("product") ? handle ?? "" : ""), variantId),
    collection: demoCollection(pageId.startsWith("collection") ? handle ?? "" : "colecao-demo"),
    article: { title: "Artigo de demonstração", content: "<p>Conteúdo do artigo aparecerá aqui.</p>", excerpt: "", author: "Equipe", published_at: new Date().toISOString(), image: null, url: "/blogs/news/artigo-demo", tags: [], comments: [], comments_count: 0, comments_enabled: false },
    blog: { title: "Blog", url: "/blogs/news", articles: [], articles_count: 0, all_tags: [] },
    page: { title: "Página", content: "<p>Conteúdo da página.</p>", url: "/pages/pagina" },
    search: { performed: false, terms: "", results: [], results_count: 0, types: ["product"], filters: [], sort_by: "relevance", default_sort_by: "relevance" },
    recommendations: { performed: true, products_count: 4, products: DEMO_PRODUCTS.slice(1, 5), intent: "related" },
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
  /* o @font-face real vem da folha do Google Fonts injetada no
     content_for_header; aqui só não pode sair lixo dentro do <style> */
  engine.registerFilter("font_face", () => "");
  /* preload apontando para a própria página seria o efeito de devolver "";
     um woff2 vazio embutido é inofensivo */
  engine.registerFilter("font_url", () => "data:font/woff2;base64,");
  engine.registerFilter("font_modify", (font, property, value) => {
    const base = record(font);
    let next: unknown = value;
    if (String(property) === "weight") {
      const keyword: Record<string, number> = { bold: 700, bolder: 900, lighter: 300, normal: 400 };
      const current = typeof base.weight === "number" ? base.weight : Number(base.weight) || 400;
      next = keyword[String(value)] ?? (/^[+-]\d+$/.test(String(value)) ? Math.min(1000, Math.max(1, current + Number(value))) : Number(value) || value);
    }
    const family = typeof base.family === "string" ? base.family : "sans-serif";
    return { ...base, [String(property)]: next, family, toString() { return family; } };
  });
  engine.registerFilter("color_to_rgb", (value) => { const c = colorParse(String(value)); return c ? rgbString(c) : String(value ?? ""); });
  engine.registerFilter("color_to_hex", (value) => {
    const c = colorParse(String(value));
    return c ? `#${[c[0], c[1], c[2]].map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}` : String(value ?? "");
  });
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
  /**
   * `{% form %}` fiel ao que a Shopify gera. Não é detalhe: o JS dos temas
   * acha o formulário de compra por `form[data-type="add-to-cart-form"]` e os
   * campos `form_type`/`utf8`. Com um `<form action="#">` genérico, o botão
   * "Adicionar ao carrinho" simplesmente não fazia nada.
   */
  const formAttrs = (args: string) => {
    const tipo = args.match(/^\s*['"]?([\w-]+)['"]?/)?.[1] ?? "form";
    const acoes: Record<string, string> = {
      product: "/cart/add", cart: "/cart", contact: "/contact#contact_form",
      customer_login: "/account/login", create_customer: "/account", recover_customer_password: "/account/recover",
      activate_customer_password: "/account/activate", customer_address: "/account/addresses",
      new_comment: "#comments", localization: "/localization", customer: "/contact#contact_form",
    };
    const extra = tipo === "product" ? ` data-type="add-to-cart-form" enctype="multipart/form-data" novalidate="novalidate"` : "";
    const id = `${tipo}_form_${Math.random().toString(36).slice(2, 10)}`;
    return { tipo, abertura: `<form method="post" action="${acoes[tipo] ?? "#"}" id="${id}" accept-charset="UTF-8" class="${tipo}-form"${extra}><input type="hidden" name="form_type" value="${tipo}"><input type="hidden" name="utf8" value="✓">` };
  };

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
    * render(this: { templates: unknown[]; liquid: Liquid; args: string }, ctx: Context, emitter: Emitter) {
      emitter.write(formAttrs(this.args ?? "").abertura);
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
      /* `section` precisa estar entre os GLOBAIS enquanto a seção renderiza:
         o `{% render %}` isola o escopo, e temas que delegam o corpo a um
         snippet (`{% render 'cart-drawer' %}` usando `section.blocks`)
         perdiam os blocos e renderizavam vazio. Por isso o render de seções é
         sequencial: um `section` global de cada vez. */
      const anterior = globals.section;
      globals.section = drop;
      try {
        inner = await engine.parseAndRender(stripSchema(source), { ...globals, section: drop });
      } catch (error) {
        inner = `<!-- seção ${section.type}: ${error instanceof Error ? error.message.slice(0, 200) : "erro"} -->`;
      } finally {
        if (anterior === undefined) delete globals.section; else globals.section = anterior;
      }
    } else {
      inner = `<!-- seção ${section.type} sem arquivo .liquid -->`;
    }
    return `<div id="shopify-section-${section.id}" class="shopify-section section-${section.type}" data-orbis-section="${section.id}">${inner}</div>`;
  };

  const renderGroup = async (groupId: string): Promise<string> => {
    const group = theme.pages.find((item) => item.id === groupId || item.id.startsWith(groupId));
    if (!group) return "";
    const parts: string[] = [];
    for (const section of group.sections) parts.push(await renderSectionInstance(section));
    return parts.join("\n");
  };

  const sectionByType = (type: string): ShopifySectionInstance => {
    /* grupos primeiro (qualquer nome de grupo), depois qualquer página */
    for (const candidate of theme.pages) {
      const found = candidate.sections.find((section) => section.type === type);
      if (found && candidate.id.includes("-group")) return found;
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

  /* Section Rendering API: o tema pede o HTML de seções soltas (a gaveta do
     carrinho, o contador do ícone) depois de mexer no carrinho. Devolvemos o
     mesmo mapa que a Shopify devolve, renderizado pelo mesmo motor. */
  if (onlySections?.length) {
    const mapa: Record<string, string> = {};
    for (const id of onlySections.slice(0, 8)) {
      const tipo = id.replace(/^shopify-section-/, "");
      mapa[id] = await renderSectionInstance(sectionByType(tipo));
    }
    return JSON.stringify(mapa);
  }

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
    /* sequencial pelo mesmo motivo do grupo: `section` é global durante o
       render de cada seção */
    const rendered: string[] = [];
    for (const section of page.sections.filter((item) => !item.disabled)) rendered.push(await renderSectionInstance(section));
    contentForLayout = rendered.join("\n");
  }

  const layoutSource = text(files, "layout/theme.liquid");
  let html: string;
  if (layoutSource) {
    html = await engine.parseAndRender(stripSchema(layoutSource), { ...globals, content_for_layout: contentForLayout });
  } else {
    html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body>${contentForLayout}</body></html>`;
  }

  /* Ponte com o editor (Fase 8 do inspetor): três modos.
     - "selecionar": todo clique é capturado — nada navega, nada compra, nada
       envia; o alvo (bloco via data-block-id do shopify_attributes, senão a
       seção) vai para o editor, com contorno de hover.
     - "interagir": o JS do tema funciona (menus, accordions); links viram
       navegação de página do preview; formulários continuam bloqueados.
     - "previa": como interagir, sem contornos de seleção. */
  /* Carrinho simulado dentro do preview: intercepta a Ajax Cart API da
     Shopify (/cart/add.js, /cart.js, /cart/change.js…), guarda o estado aqui
     e pede ao editor o HTML novo das seções — é assim que a gaveta abre com
     item, quantidade e total de verdade, sem backend de loja. */
  const carrinhoPonte = `<script>window.__ORBIS_CART_INICIAL__=${JSON.stringify(cartItems ?? [])};(function(){
/* catálogo real indexado por id de variante: o item do carrinho nasce com
   título, preço e imagem do produto, sem depender de raspar o DOM do tema */
var catalogo=${JSON.stringify(catalogoPorVariante())};
var itens=[];var pedidos={};var seq=0;
function moeda(c){return "R$ "+(c/100).toFixed(2).replace(".",",");}
function estado(){var total=0,contagem=0;for(var i=0;i<itens.length;i++){total+=itens[i].price*itens[i].quantity;contagem+=itens[i].quantity;}
return {token:"orbis-preview-cart",item_count:contagem,total_price:total,original_total_price:total,items_subtotal_price:total,total_discount:0,currency:"BRL",requires_shipping:itens.length>0,note:null,attributes:{},items:itens.map(function(it,idx){return {id:it.id,key:it.id+":"+idx,quantity:it.quantity,title:it.title,product_title:it.product_title||it.title,variant_title:it.variant_title||null,price:it.price,final_price:it.price,line_price:it.price*it.quantity,final_line_price:it.price*it.quantity,original_line_price:it.price*it.quantity,url:it.url,image:it.image,featured_image:{url:it.image,alt:it.title},product_id:it.product_id,variant_id:it.id,handle:it.handle,quantity_rule:{min:1,max:null,increment:1},properties:{}};})};}
function dadosDoBotao(alvo){var form=alvo&&alvo.closest?alvo.closest("form"):null;var card=alvo&&alvo.closest?alvo.closest("[data-product-id],.card-wrapper,.grid__item,product-card,.card"):null;
var id=null;if(form){var input=form.querySelector('[name="id"]');if(input&&input.value)id=parseInt(input.value,10);}
var titulo=(card&&(card.querySelector(".card__heading,.card-information__text,h3,h2")||{}).textContent||"").replace(/\\s+/g," ").trim();
var img=card?card.querySelector("img"):null;var preco=null;var precoEl=card?card.querySelector(".price-item--regular,.price__regular .price-item,.price-item"):null;
if(precoEl){var n=precoEl.textContent.replace(/[^0-9,]/g,"").replace(",",".");if(n)preco=Math.round(parseFloat(n)*100);}
return {id:id||Date.now()%100000,title:titulo||"Produto",price:preco||0,image:img?img.currentSrc||img.src:null,handle:(titulo||"produto").toLowerCase().replace(/[^a-z0-9]+/g,"-"),product_id:id||0,url:"/products/"+((titulo||"produto").toLowerCase().replace(/[^a-z0-9]+/g,"-"))};}
var ultimoAlvo=null;document.addEventListener("click",function(e){ultimoAlvo=e.target;},true);
function adicionar(payload){var doDom=dadosDoBotao(ultimoAlvo);var id=payload&&payload.id?parseInt(payload.id,10):doDom.id;var qtd=payload&&payload.quantity?parseInt(payload.quantity,10):1;
var base=catalogo[String(id)]||doDom;
var existente=null;for(var i=0;i<itens.length;i++){if(itens[i].id===id)existente=itens[i];}
if(existente){existente.quantity+=qtd;return existente;}
var novo={id:id,title:base.title,product_title:base.product_title||base.title,variant_title:base.variant_title||null,price:base.price,image:base.image,handle:base.handle,product_id:base.product_id,url:base.url,quantity:qtd};itens.push(novo);return novo;}
function mudar(payload){var chave=payload.id||payload.line;var qtd=parseInt(payload.quantity,10);
if(payload.line){var idx=parseInt(payload.line,10)-1;if(itens[idx]){if(qtd<=0)itens.splice(idx,1);else itens[idx].quantity=qtd;}}
else {for(var i=itens.length-1;i>=0;i--){if(String(itens[i].id)===String(chave)||itens[i].id+":"+i===String(chave)){if(qtd<=0)itens.splice(i,1);else itens[i].quantity=qtd;}}}
return estado();}
function pedirSecoes(lista){return new Promise(function(resolve){if(!lista||!lista.length||window.parent===window){resolve({});return;}
var id=++seq;pedidos[id]=resolve;window.parent.postMessage({orbisCartSections:lista,orbisCartItems:itens.map(function(i){return {variantId:i.id,quantity:i.quantity};}),orbisPedido:id},"*");
setTimeout(function(){if(pedidos[id]){pedidos[id]({});delete pedidos[id];}},4000);});}
/* Páginas que o tema busca por fetch (quick-add "Escolher opções", filtros,
   busca preditiva) vêm do MESMO renderizador, via editor — sem isso o tema
   pedia a URL para o servidor do app e recebia HTML que não é da loja. */
function pedirPagina(href){return new Promise(function(resolve){if(window.parent===window){resolve("");return;}
var id=++seq;pedidos[id]=resolve;window.parent.postMessage({orbisPaginaHref:href,orbisCartItems:itens.map(function(i){return {variantId:i.id,quantity:i.quantity};}),orbisPedido:id},"*");
setTimeout(function(){if(pedidos[id]){pedidos[id]("");delete pedidos[id];}},8000);});}
window.addEventListener("message",function(e){var d=e&&e.data;if(d&&d.orbisPedido&&pedidos[d.orbisPedido]){pedidos[d.orbisPedido](typeof d.orbisHtml==="string"?d.orbisHtml:(d.orbisSecoes||{}));delete pedidos[d.orbisPedido];}});
function listaDeSecoes(url,corpo){var s=null;try{var u=new URL(url,location.origin);s=u.searchParams.get("sections");}catch(err){}
if(!s&&corpo&&corpo.sections)s=Array.isArray(corpo.sections)?corpo.sections.join(","):corpo.sections;
return s?String(s).split(",").map(function(x){return x.trim();}).filter(Boolean):[];}
function corpoDe(init){try{if(!init||!init.body)return {};
if(typeof init.body==="string"){try{return JSON.parse(init.body);}catch(e){var o={};init.body.split("&").forEach(function(p){var kv=p.split("=");o[decodeURIComponent(kv[0])]=decodeURIComponent(kv[1]||"");});return o;}}
if(init.body instanceof FormData){var o2={};init.body.forEach(function(v,k){o2[k]=v;});return o2;}}catch(e){}return {};}
function resposta(dados){return new Response(JSON.stringify(dados),{status:200,headers:{"Content-Type":"application/json"}});}
var fetchOriginal=window.fetch.bind(window);
window.fetch=function(entrada,init){var url=typeof entrada==="string"?entrada:(entrada&&entrada.url)||"";
if(/\\/cart(\\/(add|change|update|clear))?\\.js/.test(url)||/\\/cart\\/(add|change|update|clear)(\\?|$)/.test(url)){
var corpo=corpoDe(init);var secoes=listaDeSecoes(url,corpo);var resultado;
if(/add/.test(url)){resultado=adicionar(corpo);}
else if(/change|update/.test(url)){resultado=mudar(corpo);}
else if(/clear/.test(url)){itens=[];resultado=estado();}
else {resultado=estado();}
return pedirSecoes(secoes).then(function(html){var saida=/add/.test(url)?resultado:estado();
if(secoes.length){saida=Object.assign({},saida,{sections:html});}
if(/add/.test(url)){saida=Object.assign({},saida,{items:[resultado],sections:secoes.length?html:undefined});}
/* avisa o tema que o carrinho mudou, como a Shopify faz */
document.dispatchEvent(new CustomEvent("cart:refresh",{bubbles:true}));
return resposta(saida);});}
var caminho="";try{caminho=new URL(url,location.origin).pathname;}catch(err){caminho=String(url).split("?")[0];}
if(/^\\/(products|collections|pages|blogs|search)(\\/|\\?|$)/.test(caminho)||/[?&]section_id=/.test(String(url))){
return pedirPagina(String(url)).then(function(h){return new Response(h||"",{status:h?200:404,headers:{"Content-Type":"text/html"}});});}
return fetchOriginal(entrada,init);};
/* Compra tratada AQUI, não pelo JS do tema: cada tema liga o botão de um
   jeito (e muitos vêm ofuscados). Interceptar o envio do formulário de
   compra faz "Adicionar ao carrinho" funcionar em qualquer tema. */
/* toda seção do tema cujo TIPO fale de carrinho: mini-cart, cart-drawer,
   cart-notification, cart-icon-bubble… o nome muda de tema para tema */
function secoesDaGaveta(){var tipos=[];document.querySelectorAll("[id^='shopify-section-']").forEach(function(s){var m=(s.className||"").toString().match(/section-([\\w-]+)/);var t=m&&m[1];if(t&&/cart/i.test(t)&&tipos.indexOf(t)<0)tipos.push(t);});return tipos;}
function aplicarSecoes(html){Object.keys(html||{}).forEach(function(tipo){if(!html[tipo])return;
var alvo=document.querySelector("[id^='shopify-section-'].section-"+tipo)||document.getElementById("shopify-section-"+tipo);
if(!alvo)return;var novo=document.createElement("div");novo.innerHTML=html[tipo];
var conteudo=novo.querySelector("[id^='shopify-section-']")||novo;alvo.innerHTML=conteudo.innerHTML;});}
/* Elementos que formam a gaveta: o custom element (cart-drawer/mini-cart) e o
   contêiner interno. Aplicar em todos evita depender do nome que cada tema
   escolheu — pegar só o primeiro do seletor acertava uma div interna e a
   gaveta não abria. */
function alvosDaGaveta(){var lista=[];
document.querySelectorAll("cart-drawer, mini-cart, #CartDrawer, #mini-cart, .cart-drawer, .mini-cart, [id*='cart-drawer' i]").forEach(function(el){
  if(el.closest&&el.closest("[id^='shopify-section-']")&&lista.indexOf(el)<0)lista.push(el);});
return lista;}
function abrirGaveta(){var alvos=alvosDaGaveta();if(!alvos.length)return false;
alvos.forEach(function(el){["active","is-open","open","drawer--active"].forEach(function(c){el.classList.add(c);});
el.removeAttribute("hidden");if(el.hasAttribute("aria-hidden"))el.setAttribute("aria-hidden","false");
var det=el.closest("details");if(det)det.open=true;});
document.body.classList.add("overflow-hidden");return true;}
/* Redesenha o que mostra o carrinho (gaveta ou página) com o estado novo e
   avisa o editor. É o passo comum de comprar, mudar quantidade e remover. */
function sincronizarCarrinho(abrindo){
if(window.parent!==window){window.parent.postMessage({orbisCartEstado:itens.map(function(i){return {variantId:i.id,quantity:i.quantity};})},"*");}
return pedirSecoes(secoesDaGaveta()).then(function(html){aplicarSecoes(html);
var abriu=abrirGaveta();
if(abrindo&&!abriu&&window.parent!==window){/* tema sem gaveta: mostra a página do carrinho, para o item aparecer */window.parent.postMessage({orbisNavigate:"/cart"},"*");}
document.dispatchEvent(new CustomEvent("cart:refresh",{bubbles:true}));});}
function comprar(form){var idInput=form.querySelector('[name="id"]');var qtdInput=form.querySelector('[name="quantity"]');
adicionar({id:idInput&&idInput.value,quantity:qtdInput&&qtdInput.value?qtdInput.value:1});
sincronizarCarrinho(true);}
/* Mais/menos e remover: cada tema liga esses controles ao próprio JS. Aqui a
   linha é achada pelo campo de quantidade em volta do botão (data-index e
   data-quantity-variant-id, que os temas Dawn e derivados escrevem). */
function campoDaLinha(el){var no=el;while(no&&no!==document){if(no.querySelector){
var campo=no.querySelector('input[name="updates[]"],input[data-index],input[name="quantity"][data-index]');if(campo)return campo;}
no=no.parentElement;}return null;}
function chaveDaLinha(campo){return {vid:campo.getAttribute("data-quantity-variant-id")||campo.getAttribute("data-variant-id")||"",linha:parseInt(campo.getAttribute("data-index")||"0",10)||0};}
function quantidadeDaLinha(chave){for(var i=0;i<itens.length;i++){if(chave.vid&&String(itens[i].id)===String(chave.vid))return itens[i].quantity;}
return chave.linha&&itens[chave.linha-1]?itens[chave.linha-1].quantity:0;}
function definirQuantidade(chave,qtd){if(qtd<0)qtd=0;
if(chave.vid)mudar({id:chave.vid,quantity:qtd});
else if(chave.linha)mudar({line:chave.linha,quantity:qtd});
else return;
sincronizarCarrinho(false);}
document.addEventListener("click",function(e){var alvo=e.target.closest&&e.target.closest("button,a");if(!alvo)return;
var nome=alvo.getAttribute("name")||"";var classe=String(alvo.className||"");
var rotulo=((alvo.getAttribute("aria-label")||"")+" "+classe).toLowerCase();
var menos=nome==="minus"||/minus|decrease|diminuir/i.test(classe+" "+rotulo);
var mais=nome==="plus"||/plus|increase|aumentar/i.test(classe+" "+rotulo);
var remover=!!(alvo.closest&&alvo.closest("cart-remove-button"))||/remover|remove|excluir|delete|trash|lixeira/.test(rotulo)||String(alvo.getAttribute("href")||"").indexOf("quantity=0")>=0;
if(!menos&&!mais&&!remover)return;
var campo=campoDaLinha(alvo);if(!campo)return;
e.preventDefault();e.stopPropagation();
var chave=chaveDaLinha(campo);var atual=quantidadeDaLinha(chave);
definirQuantidade(chave,remover?0:(mais?atual+1:atual-1));},true);
/* quantidade digitada direto no campo da linha */
document.addEventListener("change",function(e){var campo=e.target;
if(!campo||campo.tagName!=="INPUT")return;
if(campo.name!=="updates[]"&&!campo.hasAttribute("data-index"))return;
var n=parseInt(campo.value,10);if(isNaN(n))return;
e.stopPropagation();definirQuantidade(chaveDaLinha(campo),n);},true);
document.addEventListener("submit",function(e){var form=e.target;if(form&&form.matches&&form.matches('form[data-type="add-to-cart-form"]')){e.preventDefault();comprar(form);}},true);
/* O botão de compra nem sempre está DENTRO do formulário: muitos temas põem
   um botão no cartão e ligam por JS próprio (que aqui não tem loja atrás).
   Então procuramos o formulário de compra do cartão em volta do botão. */
function formDoBotao(botao){var dentro=botao.closest('form[data-type="add-to-cart-form"]');if(dentro)return dentro;
var cartao=botao.closest('[class*="card" i],[class*="product-item" i],[class*="product-card" i],[class*="grid__item" i],article,li,.product');
for(var passo=0;cartao&&passo<3;passo++){var f=cartao.querySelector('form[data-type="add-to-cart-form"]');if(f)return f;cartao=cartao.parentElement&&cartao.parentElement.closest('[class*="card" i],[class*="product-item" i],[class*="grid__item" i],article,li');}
return null;}
document.addEventListener("click",function(e){
var botao=e.target.closest&&e.target.closest('button, a[role="button"], [data-add-to-cart]');
if(!botao)return;
/* controles da linha do carrinho têm handler próprio, mais abaixo */
if(botao.getAttribute("name")==="minus"||botao.getAttribute("name")==="plus"||(botao.closest&&botao.closest("cart-remove-button")))return;
var texto=((botao.textContent||"")+" "+(botao.getAttribute("aria-label")||"")).toLowerCase();
var ehCompra=botao.getAttribute("name")==="add"||botao.closest('form[data-type="add-to-cart-form"]')||/adicionar|add to cart|add to bag|sacola|carrinho|comprar/.test(texto);
if(!ehCompra)return;
var form=formDoBotao(botao);
if(!form)return;
e.preventDefault();e.stopPropagation();comprar(form);},true);
/* Troca de variante ("Escolher opções"): cada tema liga o seletor ao próprio
   JS, que aqui não tem loja atrás. Ao mudar uma opção, procuramos no catálogo
   a variante com aquelas opções e gravamos o id no formulário de compra —
   assim a cor/tamanho escolhida é a que vai para o carrinho. */
function escopoDaVariante(el){var p=el;while(p&&p.parentElement){p=p.parentElement;if(p.querySelector&&p.querySelector('[name="id"]'))return p;}return document;}
function trocarVariante(escopo){var input=escopo.querySelector('[name="id"]');if(!input)return;
var atual=catalogo[String(input.value)];if(!atual)return;
/* cada opção é um grupo de rádios com o mesmo name (nem sempre em fieldset)
   ou um select; a ordem dos grupos no DOM é a ordem das opções do produto */
var escolhidas=[];var marcado={};var ordem=[];
escopo.querySelectorAll('input[type="radio"]').forEach(function(r){var n=r.name||"";if(ordem.indexOf(n)<0)ordem.push(n);if(r.checked)marcado[n]=r.value;});
ordem.forEach(function(n){if(marcado[n]!==undefined)escolhidas.push(marcado[n]);});
escopo.querySelectorAll("select").forEach(function(s){if(!/quantidade|quantity/i.test(s.name||""))escolhidas.push(s.value);});
var quantasOpcoes=0;for(var o=0;o<3;o++){if(atual.options[o])quantasOpcoes++;}
escolhidas=escolhidas.slice(0,quantasOpcoes);
if(escolhidas.length!==quantasOpcoes)return;
var alvo=null;
Object.keys(catalogo).forEach(function(chave){var c=catalogo[chave];if(alvo||c.product_id!==atual.product_id)return;
var combina=true;for(var i=0;i<escolhidas.length;i++){if(String(c.options[i]||"")!==String(escolhidas[i]))combina=false;}
if(combina)alvo=chave;});
/* o tema costuma manter mais de um campo id (form do preço, form do botão):
   todos precisam apontar para a variante escolhida */
if(alvo)escopo.querySelectorAll('[name="id"]').forEach(function(campo){if(String(campo.value)!==alvo){campo.value=alvo;campo.dispatchEvent(new Event("change",{bubbles:true}));}});}
document.addEventListener("change",function(e){var t=e.target;if(!t||!t.closest)return;
if(t.type!=="radio"&&t.tagName!=="SELECT")return;
setTimeout(function(){trocarVariante(escopoDaVariante(t));},0);},false);
/* estado inicial vindo do editor, para o carrinho sobreviver à troca de página */
function definirItens(lista){itens=(lista||[]).map(function(i){var base=catalogo[String(i.variantId)]||dadosDoBotao(null);return {id:i.variantId,quantity:i.quantity,title:base.title,product_title:base.product_title||base.title,variant_title:base.variant_title||null,price:base.price||0,image:base.image||null,handle:base.handle||"produto",product_id:base.product_id||i.variantId,url:base.url||"/cart"};});}
try{if(window.__ORBIS_CART_INICIAL__&&window.__ORBIS_CART_INICIAL__.length)definirItens(window.__ORBIS_CART_INICIAL__);}catch(e){}
/* O HTML da página é montado antes do último clique chegar ao editor. Quando o
   quadro é remontado, o editor manda o carrinho que ele guarda — sem isso um
   item removido reaparecia depois de um redesenho. */
window.addEventListener("message",function(e){var d=e&&e.data;if(!d||!d.orbisCartDefinir)return;
definirItens(d.orbisCartDefinir);});
/* fechar a gaveta é responsabilidade do preview também: muitos temas ligam o
   X ao próprio JS, que aqui não tem loja atrás */
function fecharGaveta(){var alvos=alvosDaGaveta();if(!alvos.length)return false;
alvos.forEach(function(el){["active","is-open","open","drawer--active"].forEach(function(c){el.classList.remove(c);});
var det=el.closest("details");if(det)det.open=false;});
document.body.classList.remove("overflow-hidden");return true;}
document.addEventListener("click",function(e){var alvo=e.target.closest&&e.target.closest('[class*="close" i],[class*="dismiss" i],[class*="overlay" i],[aria-label*="fech" i],[aria-label*="close" i]');
if(!alvo)return;var dentro=alvo.closest("cart-drawer, #CartDrawer, #mini-cart, .cart-drawer, .drawer");if(dentro)setTimeout(fecharGaveta,0);},false);
document.addEventListener("keydown",function(e){if(e.key==="Escape")fecharGaveta();});
/* o ícone do carrinho abre a gaveta ATUALIZADA (em vez de abrir vazia) */
document.addEventListener("click",function(e){var link=e.target.closest&&e.target.closest('a[href="/cart"], a[href^="/cart?"], a[class*="cart" i]');
if(!link)return;var g=document.querySelector("cart-drawer, #CartDrawer, #mini-cart, .cart-drawer");if(!g)return;
e.preventDefault();e.stopPropagation();
pedirSecoes(secoesDaGaveta()).then(function(html){aplicarSecoes(html);abrirGaveta();});},true);
window.__orbisCarrinho={estado:estado,itens:function(){return itens;},comprar:comprar,abrir:abrirGaveta,fechar:fecharGaveta};
})();</script>`;

  const bridge = `<script>(function(){var mode="selecionar";window.__orbisModo=mode;var hoverAlvo=null;
function limparHover(){if(hoverAlvo){hoverAlvo.style.outline="";hoverAlvo.style.outlineOffset="";hoverAlvo=null;}}
document.addEventListener("submit",function(event){event.preventDefault();},true);
document.addEventListener("mouseover",function(event){if(mode!=="selecionar"){return;}var alvo=event.target.closest("[data-block-id],[data-orbis-section]");if(alvo===hoverAlvo){return;}limparHover();if(alvo){hoverAlvo=alvo;alvo.style.outline="1px dashed rgba(47,128,237,0.85)";alvo.style.outlineOffset="-1px";}},true);
/* CAPTURA (antes do tema): só o que precisa vir primeiro — nunca sair para a
   internet, e avisar a seção clicada no modo de seleção. Cliques que não são
   link ficam bloqueados no modo de seleção (nada de comprar sem querer). */
document.addEventListener("click",function(event){var anchor=event.target.closest("a");
if(anchor){var externo=anchor.getAttribute("href")||"";if(externo.indexOf("http://")===0||externo.indexOf("https://")===0||anchor.target==="_blank"){event.preventDefault();}
if(mode==="selecionar"){var s=anchor.closest("[data-orbis-section]");var b=anchor.closest("[data-block-id]");if(s&&window.parent!==window){window.parent.postMessage({orbisSection:s.getAttribute("data-orbis-section"),orbisBlock:b?b.getAttribute("data-block-id"):null},"*");}}
return;}
if(mode==="selecionar"){
/* fechar gaveta/modal continua funcionando mesmo no modo de seleção: sem
   isso, abrir o carrinho no editor prendia a pessoa com a gaveta aberta */
var saida=event.target.closest('[class*="close" i],[class*="dismiss" i],[class*="overlay" i],[aria-label*="fech" i],[aria-label*="close" i]');
if(saida)return;
/* comprar e "Escolher opções" também passam: no editor da Shopify o carrinho
   responde, e travar isso fazia o botão parecer quebrado */
var loja=event.target.closest('button[name="add"],[data-add-to-cart],[class*="quick-add" i],[class*="quick-buy" i],modal-opener,[data-product-url]');
if(loja)return;
/* dentro do carrinho tudo responde: quantidade, remover, finalizar */
var carrinho=event.target.closest('cart-drawer, mini-cart, cart-items, cart-drawer-items, #CartDrawer, #mini-cart, .cart-drawer, .mini-cart, [class*="cart-item" i]');
if(carrinho)return;
event.preventDefault();event.stopPropagation();var block=event.target.closest("[data-block-id]");var section=event.target.closest("[data-orbis-section]");if(section&&window.parent!==window){window.parent.postMessage({orbisSection:section.getAttribute("data-orbis-section"),orbisBlock:block?block.getAttribute("data-block-id"):null},"*");}return;}},true);
/* BOLHA (depois do tema): se o proprio tema tratou o clique — carrinho que
   abre a gaveta, menu, modal — ele ja chamou preventDefault e a previa NAO
   troca de pagina. So navega o link que ninguem tratou. */
document.addEventListener("click",function(event){var anchor=event.target.closest("a");if(!anchor||event.defaultPrevented){return;}
var href=anchor.getAttribute("href")||"";if(!href||href.charAt(0)==="#"){return;}
event.preventDefault();if(window.parent!==window){window.parent.postMessage({orbisNavigate:href},"*");}});
window.addEventListener("message",function(event){var data=event&&event.data;if(!data){return;}
if(data.orbisMode){mode=String(data.orbisMode);window.__orbisModo=mode;limparHover();return;}
if(!data.orbisScrollTo){return;}var target=document.getElementById("shopify-section-"+data.orbisScrollTo);if(!target){return;}target.scrollIntoView({behavior:"smooth",block:"start"});if(mode==="previa"){return;}target.style.outline="2px solid #2f80ed";target.style.outlineOffset="-2px";window.clearTimeout(target.__orbisFlash);target.__orbisFlash=window.setTimeout(function(){target.style.outline="";target.style.outlineOffset="";},1600);});})();</script>`;
  /* o carrinho entra ANTES do bridge e antes do JS do tema agir: ele precisa
     substituir o fetch cedo para interceptar a primeira adição */
  const rodape = `${carrinhoPonte}${bridge}`;
  html = html.includes("</body>") ? html.replace("</body>", `${rodape}</body>`) : html + rodape;
  return html;
}

function stripSchema(source: string): string {
  return source.replace(/{%-?\s*schema\s*-?%}[\s\S]*?{%-?\s*endschema\s*-?%}/gi, "");
}
