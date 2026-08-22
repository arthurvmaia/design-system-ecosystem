const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ALLOWED_UPLOADS = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * A MAIOR imagem que o app aceita: 20 MB, o mesmo que a Shopify.
 *
 * Era 5 MB aqui, 20 MB no asset de tema e 20 MB ao salvar o que o gerador
 * devolve — três tetos para a mesma coisa. O de 5 MB recusava foto que a
 * Shopify aceita sem reclamar, e o motivo dele nunca foi escrito em lugar
 * nenhum: um número inventado barrando material bom.
 *
 * 20 MB não é palpite: é o limite da Shopify por arquivo de imagem, tanto em
 * Content > Files quanto em asset de tema. Acima disso ela recusaria de
 * qualquer jeito, e recusar aqui é dizer a mesma coisa mais cedo.
 *
 * Uma constante só, exportada, porque teto duplicado é como esta discordância
 * nasceu: alguém sobe um e esquece o outro, e o app passa a discordar de si
 * mesmo sem nenhum erro na tela.
 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const MAX_UPLOAD_MB = MAX_UPLOAD_BYTES / (1024 * 1024);

/**
 * O teto da arte que o APP gerou, que é outra conversa.
 *
 * Recusar o arquivo que o cliente escolheu é barato: ele escolhe outro. Recusar
 * o arquivo que o app acabou de MANDAR GERAR e PAGAR é jogar fora trabalho já
 * comprado, e a pessoa não tem outro para pôr no lugar: ela fica sem a peça.
 *
 * E o app pede 4k, de propósito, porque em banner de largura inteira o 2k sai
 * esticado. Medido numa geração real deste computador: 3,5 / 12,4 / 17,9 /
 * 19,8 MB. Com o teto em 20 MB, metade das peças passa raspando e a outra
 * metade cai fora por centímetros. Foi assim que uma rodada de seis terminou
 * com quatro.
 *
 * Os 20 MB continuam valendo onde eles são verdade: é o limite da Shopify para
 * o arquivo que a pessoa sobe em Conteúdo → Arquivos. Passar disso vira AVISO
 * na entrega, não recusa na captura. Aqui o número só existe como barreira
 * contra resposta desgovernada.
 */
export const MAX_ARTE_GERADA_BYTES = 40 * 1024 * 1024;
export const MAX_ARTE_GERADA_MB = MAX_ARTE_GERADA_BYTES / (1024 * 1024);

import { IDIOMA_PADRAO, formatarDinheiro, idiomaDe } from "./idiomas.mjs";
import { textosDoIdioma } from "./textos.mjs";

/** A marca do modelo de demonstracao: nome proprio, e por isso nao traduz. */
const MARCA_DO_MODELO = "CACTUS";
/* o ano do rodape do MODELO. Fixo de proposito: `new Date()` faria a mesma loja
   sair diferente em janeiro, e o determinismo e o que deixa a previa honesta. */
const ANO_DO_MODELO = 2026;

/**
 * O MODELO da loja, no idioma dela.
 *
 * Era um objeto congelado com o português escrito dentro. Virou função porque a
 * loja passou a poder nascer em três idiomas, e um modelo fixo em português
 * significava que TODO campo que o cliente não preencheu voltava em português —
 * a faixa de anúncio, os benefícios, o FAQ, o rodapé — no meio de uma loja em
 * inglês. O que muda com o idioma é só o texto: cor, medida e liga/desliga não
 * têm idioma, e continuam aqui.
 *
 * As frases moram em `textos.mjs`, inclusive as portuguesas: uma tradução que
 * vive em dois arquivos diverge no primeiro conserto que alguém faz num só.
 */
export function modeloPadrao(idioma = IDIOMA_PADRAO) {
  const codigo = idiomaDe(idioma);
  const textos = textosDoIdioma(codigo);
  const m = textos.modelo;
  const preco = (centavos) => formatarDinheiro(centavos, codigo);
  return {
    global: {
      font: "Inter",
      buttonRadius: 10,
      sectionSpacing: 40,
      contentWidth: 1200,
      language: codigo,
    },
    announcement: {
      enabled: true,
      text: m.announcement.text,
      background: "#008060",
      textColor: "#ffffff",
    },
    header: {
      brand: MARCA_DO_MODELO,
      background: "#f4f7f5",
      textColor: "#10231c",
      accentColor: "#008060",
      menuItems: [...m.header.menuItems],
      searchEnabled: true,
      cartEnabled: true,
      sticky: true,
    },
    hero: {
      eyebrow: m.hero.eyebrow,
      headline: `${MARCA_DO_MODELO} 12`,
      body: m.hero.body,
      buttonLabel: m.hero.buttonLabel,
      background: "#a8d6b8",
      textColor: "#3700ff",
      accentColor: "#05acff",
      buttonTextColor: "#ffffff",
      image: "",
    },
    benefits: {
      background: "#a8d6b8",
      textColor: "#3700ff",
      borderColor: "#7dbf9c",
      items: m.benefits.items.map((item) => ({ ...item })),
    },
    products: {
      eyebrow: m.products.eyebrow,
      title: m.products.title,
      linkLabel: m.products.linkLabel,
      background: "#a8d6b8",
      textColor: "#3700ff",
      accentColor: "#05acff",
      cardBackground: "#eff6f4",
      /* nome de produto de demonstração não traduz: são nomes próprios, e é o
         que o cliente troca pelo catálogo dele no primeiro dia */
      items: [
        { name: "Balance", price: preco(14900), badge: m.products.badges[0] },
        { name: "Daily Ritual", price: preco(12900), badge: m.products.badges[1] },
        { name: "Pure Form", price: preco(17900), badge: m.products.badges[2] },
      ],
    },
    bundle: {
      enabled: true,
      eyebrow: m.bundle.eyebrow,
      title: m.bundle.title,
      body: m.bundle.body,
      buttonLabel: m.bundle.buttonLabel,
      background: "#f4f7f5",
      textColor: "#10231c",
      accentColor: "#008060",
    },
    comparison: {
      enabled: true,
      eyebrow: m.comparison.eyebrow,
      title: m.comparison.title,
      background: "#10231c",
      textColor: "#ffffff",
      accentColor: "#22d49b",
      items: [...m.comparison.items],
    },
    testimonials: {
      enabled: true,
      eyebrow: m.testimonials.eyebrow,
      title: m.testimonials.title,
      quote: m.testimonials.quote,
      author: m.testimonials.author,
      background: "#edf5f0",
      textColor: "#10231c",
      accentColor: "#008060",
    },
    faq: {
      enabled: true,
      eyebrow: m.faq.eyebrow,
      title: m.faq.title,
      background: "#f4f7f5",
      textColor: "#10231c",
      borderColor: "#c5d8ce",
      items: m.faq.items.map((item) => ({ ...item })),
    },
    newsletter: {
      enabled: true,
      title: m.newsletter.title,
      body: m.newsletter.body,
      placeholder: m.newsletter.placeholder,
      buttonLabel: m.newsletter.buttonLabel,
      background: "#008060",
      textColor: "#ffffff",
      buttonBackground: "#10231c",
      buttonTextColor: "#ffffff",
    },
    footer: {
      brand: MARCA_DO_MODELO,
      description: m.footer.description,
      copyright: textos.marca.copyright(MARCA_DO_MODELO, ANO_DO_MODELO),
      background: "#07100c",
      textColor: "#edf7f1",
      mutedColor: "#87978f",
      instagram: "",
      whatsapp: "",
      storeLinks: [...m.footer.storeLinks],
      helpLinks: [...m.footer.helpLinks],
    },
    search: {
      title: m.search.title,
      placeholder: m.search.placeholder,
      emptyMessage: m.search.emptyMessage,
      popularTitle: m.search.popularTitle,
      popularTerms: [...m.search.popularTerms],
      background: "#f4f7f5",
      textColor: "#10231c",
      accentColor: "#008060",
    },
    productPage: {
      eyebrow: m.productPage.eyebrow,
      title: "Balance",
      price: preco(14900),
      description: m.productPage.description,
      buttonLabel: m.productPage.buttonLabel,
      background: "#f4f7f5",
      textColor: "#10231c",
      accentColor: "#008060",
      cardBackground: "#d8e9e0",
    },
    collection: {
      eyebrow: m.collection.eyebrow,
      title: m.collection.title,
      description: m.collection.description,
      background: "#f4f7f5",
      textColor: "#10231c",
      accentColor: "#008060",
    },
    cart: {
      title: m.cart.title,
      emptyText: m.cart.emptyText,
      progressText: m.cart.progressText,
      checkoutLabel: m.cart.checkoutLabel,
      background: "#f4f7f5",
      textColor: "#10231c",
      accentColor: "#008060",
    },
    blog: {
      eyebrow: m.blog.eyebrow,
      title: textos.marca.diarioDaMarca(MARCA_DO_MODELO),
      description: m.blog.description,
      background: "#f4f7f5",
      textColor: "#10231c",
      accentColor: "#008060",
      articles: [...m.blog.articles],
    },
  };
}

/**
 * O modelo em português, congelado, para quem não pergunta idioma.
 *
 * Continua sendo o padrão do banco e o chão de `normalizeCustomization` quando
 * o valor recebido não declara idioma — que é o caso de toda loja gravada antes
 * desta tela existir.
 */
export const DEFAULT_CUSTOMIZATION = Object.freeze(modeloPadrao(IDIOMA_PADRAO));

export function normalizeCustomization(input = {}) {
  const source = isRecord(input) ? input : {};
  const global = section(source.global);
  /**
   * O CHAO desta normalizacao e o modelo NO IDIOMA da loja.
   *
   * Era o modelo em portugues, sempre. Entao todo campo que o cliente nao
   * preencheu voltava em portugues — a faixa de anuncio, os beneficios, o FAQ,
   * o rodape — no meio de uma loja em ingles. O idioma vem do proprio valor
   * recebido; loja gravada antes desta tela nao o declara, e cai no portugues,
   * que era o unico idioma que havia.
   */
  const D = modeloPadrao(global.language ?? source.language);
  const announcement = section(source.announcement);
  const header = section(source.header);
  const hero = section(source.hero);
  const benefits = section(source.benefits);
  const products = section(source.products);
  const bundle = section(source.bundle);
  const comparison = section(source.comparison);
  const testimonials = section(source.testimonials);
  const faq = section(source.faq);
  const newsletter = section(source.newsletter);
  const footer = section(source.footer);
  const search = section(source.search);
  const productPage = section(source.productPage);
  const collection = section(source.collection);
  const cart = section(source.cart);
  const blog = section(source.blog);

  return {
    global: {
      font: choice(global.font ?? source.font, ["Inter", "Manrope", "Poppins", "Georgia"], D.global.font),
      buttonRadius: clampNumber(global.buttonRadius ?? source.buttonRadius, 0, 28, D.global.buttonRadius),
      sectionSpacing: clampNumber(global.sectionSpacing ?? source.spacing, 20, 80, D.global.sectionSpacing),
      contentWidth: clampNumber(global.contentWidth, 900, 1600, D.global.contentWidth),
      language: choice(global.language ?? source.language, ["pt-BR", "en", "es"], D.global.language),
    },
    announcement: {
      enabled: cleanBoolean(announcement.enabled, D.announcement.enabled),
      text: cleanText(announcement.text ?? (typeof source.announcement === "string" ? source.announcement : undefined), D.announcement.text, 120),
      background: cleanColor(announcement.background ?? source.primaryColor, D.announcement.background),
      textColor: cleanColor(announcement.textColor, D.announcement.textColor),
    },
    header: {
      brand: cleanText(header.brand ?? source.brand, D.header.brand, 48),
      background: cleanColor(header.background ?? source.backgroundColor, D.header.background),
      textColor: cleanColor(header.textColor ?? source.textColor, D.header.textColor),
      accentColor: cleanColor(header.accentColor ?? source.primaryColor, D.header.accentColor),
      menuItems: cleanStringList(header.menuItems, D.header.menuItems, 5),
      searchEnabled: cleanBoolean(header.searchEnabled, D.header.searchEnabled),
      cartEnabled: cleanBoolean(header.cartEnabled, D.header.cartEnabled),
      sticky: cleanBoolean(header.sticky, D.header.sticky),
    },
    hero: {
      eyebrow: cleanText(hero.eyebrow, D.hero.eyebrow, 60),
      headline: cleanText(hero.headline ?? source.headline, D.hero.headline, 100),
      body: cleanText(hero.body ?? source.subheadline, D.hero.body, 240),
      buttonLabel: cleanText(hero.buttonLabel, D.hero.buttonLabel, 40),
      background: cleanColor(hero.background ?? source.backgroundColor, D.hero.background),
      textColor: cleanColor(hero.textColor ?? source.textColor, D.hero.textColor),
      accentColor: cleanColor(hero.accentColor ?? source.primaryColor, D.hero.accentColor),
      buttonTextColor: cleanColor(hero.buttonTextColor, D.hero.buttonTextColor),
      image: cleanMediaUrl(hero.image ?? source.heroImage),
    },
    benefits: {
      background: cleanColor(benefits.background, D.benefits.background),
      textColor: cleanColor(benefits.textColor, D.benefits.textColor),
      borderColor: cleanColor(benefits.borderColor, D.benefits.borderColor),
      items: cleanItems(benefits.items, D.benefits.items, ["title", "text"], 3),
    },
    products: {
      eyebrow: cleanText(products.eyebrow, D.products.eyebrow, 60),
      title: cleanText(products.title, D.products.title, 80),
      linkLabel: cleanText(products.linkLabel, D.products.linkLabel, 30),
      background: cleanColor(products.background, D.products.background),
      textColor: cleanColor(products.textColor, D.products.textColor),
      accentColor: cleanColor(products.accentColor, D.products.accentColor),
      cardBackground: cleanColor(products.cardBackground, D.products.cardBackground),
      items: cleanItems(products.items, D.products.items, ["name", "price", "badge"], 3),
    },
    bundle: normalizePromoSection(bundle, D.bundle),
    comparison: {
      ...normalizeSimpleSection(comparison, D.comparison),
      items: cleanStringList(comparison.items, D.comparison.items, 5),
    },
    testimonials: {
      ...normalizeSimpleSection(testimonials, D.testimonials),
      quote: cleanText(testimonials.quote, D.testimonials.quote, 240),
      author: cleanText(testimonials.author, D.testimonials.author, 80),
    },
    faq: {
      enabled: cleanBoolean(faq.enabled, D.faq.enabled),
      eyebrow: cleanText(faq.eyebrow, D.faq.eyebrow, 60),
      title: cleanText(faq.title, D.faq.title, 80),
      background: cleanColor(faq.background, D.faq.background),
      textColor: cleanColor(faq.textColor, D.faq.textColor),
      borderColor: cleanColor(faq.borderColor, D.faq.borderColor),
      items: cleanItems(faq.items, D.faq.items, ["question", "answer"], 3),
    },
    newsletter: {
      enabled: cleanBoolean(newsletter.enabled, D.newsletter.enabled),
      title: cleanText(newsletter.title, D.newsletter.title, 100),
      body: cleanText(newsletter.body, D.newsletter.body, 220),
      placeholder: cleanText(newsletter.placeholder, D.newsletter.placeholder, 60),
      buttonLabel: cleanText(newsletter.buttonLabel, D.newsletter.buttonLabel, 40),
      background: cleanColor(newsletter.background, D.newsletter.background),
      textColor: cleanColor(newsletter.textColor, D.newsletter.textColor),
      buttonBackground: cleanColor(newsletter.buttonBackground, D.newsletter.buttonBackground),
      buttonTextColor: cleanColor(newsletter.buttonTextColor, D.newsletter.buttonTextColor),
    },
    footer: {
      brand: cleanText(footer.brand ?? header.brand ?? source.brand, D.footer.brand, 48),
      description: cleanText(footer.description, D.footer.description, 180),
      copyright: cleanText(footer.copyright, D.footer.copyright, 120),
      background: cleanColor(footer.background, D.footer.background),
      textColor: cleanColor(footer.textColor, D.footer.textColor),
      mutedColor: cleanColor(footer.mutedColor, D.footer.mutedColor),
      instagram: cleanSocial(footer.instagram),
      whatsapp: cleanSocial(footer.whatsapp),
      storeLinks: cleanStringList(footer.storeLinks, D.footer.storeLinks, 6),
      helpLinks: cleanStringList(footer.helpLinks, D.footer.helpLinks, 6),
    },
    search: normalizeUtilityPage(search, D.search, { popularTitle: 60 }),
    productPage: normalizeProductPage(productPage, D.productPage),
    collection: normalizeUtilityPage(collection, D.collection, {}),
    cart: normalizeCart(cart, D.cart),
    blog: {
      ...normalizeUtilityPage(blog, D.blog, {}),
      articles: cleanStringList(blog.articles, D.blog.articles, 6),
    },
    shopify: cleanShopifyData(source.shopify),
  };
}

export function assertUnlock(balance, price) {
  if (!Number.isInteger(balance) || !Number.isInteger(price) || price < 0) throw new Error("INVALID_TOKEN_AMOUNT");
  if (balance < price) throw new Error("INSUFFICIENT_TOKENS");
  return balance - price;
}

export function canAccessProject(ownerId, viewerId, isAdmin = false) {
  return Boolean(viewerId && (ownerId === viewerId || isAdmin));
}

export function validateUpload(contentType, size) {
  if (!ALLOWED_UPLOADS.has(contentType)) throw new Error("INVALID_FILE_TYPE");
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) throw new Error("INVALID_FILE_SIZE");
  return true;
}

function normalizePromoSection(value, fallback) {
  return {
    enabled: cleanBoolean(value.enabled, fallback.enabled),
    eyebrow: cleanText(value.eyebrow, fallback.eyebrow, 60),
    title: cleanText(value.title, fallback.title, 100),
    body: cleanText(value.body, fallback.body, 220),
    buttonLabel: cleanText(value.buttonLabel, fallback.buttonLabel, 40),
    background: cleanColor(value.background, fallback.background),
    textColor: cleanColor(value.textColor, fallback.textColor),
    accentColor: cleanColor(value.accentColor, fallback.accentColor),
  };
}

function normalizeSimpleSection(value, fallback) {
  return {
    enabled: cleanBoolean(value.enabled, fallback.enabled),
    eyebrow: cleanText(value.eyebrow, fallback.eyebrow, 60),
    title: cleanText(value.title, fallback.title, 100),
    background: cleanColor(value.background, fallback.background),
    textColor: cleanColor(value.textColor, fallback.textColor),
    accentColor: cleanColor(value.accentColor, fallback.accentColor),
  };
}

function normalizeUtilityPage(value, fallback, extraTextFields) {
  const normalized = {
    eyebrow: cleanText(value.eyebrow, fallback.eyebrow ?? "PÁGINA", 60),
    title: cleanText(value.title, fallback.title, 100),
    description: cleanText(value.description, fallback.description ?? fallback.emptyMessage ?? "", 220),
    background: cleanColor(value.background, fallback.background),
    textColor: cleanColor(value.textColor, fallback.textColor),
    accentColor: cleanColor(value.accentColor, fallback.accentColor),
  };
  if (fallback.placeholder) normalized.placeholder = cleanText(value.placeholder, fallback.placeholder, 80);
  if (fallback.emptyMessage) normalized.emptyMessage = cleanText(value.emptyMessage, fallback.emptyMessage, 180);
  if (fallback.popularTerms) normalized.popularTerms = cleanStringList(value.popularTerms, fallback.popularTerms, 6);
  for (const [key, max] of Object.entries(extraTextFields)) normalized[key] = cleanText(value[key], fallback[key], max);
  return normalized;
}

function normalizeProductPage(value, fallback) {
  return {
    eyebrow: cleanText(value.eyebrow, fallback.eyebrow, 60),
    title: cleanText(value.title, fallback.title, 100),
    price: cleanText(value.price, fallback.price, 30),
    description: cleanText(value.description, fallback.description, 240),
    buttonLabel: cleanText(value.buttonLabel, fallback.buttonLabel, 50),
    background: cleanColor(value.background, fallback.background),
    textColor: cleanColor(value.textColor, fallback.textColor),
    accentColor: cleanColor(value.accentColor, fallback.accentColor),
    cardBackground: cleanColor(value.cardBackground, fallback.cardBackground),
  };
}

function normalizeCart(value, fallback) {
  return {
    title: cleanText(value.title, fallback.title, 100),
    emptyText: cleanText(value.emptyText, fallback.emptyText, 140),
    progressText: cleanText(value.progressText, fallback.progressText, 140),
    checkoutLabel: cleanText(value.checkoutLabel, fallback.checkoutLabel, 50),
    background: cleanColor(value.background, fallback.background),
    textColor: cleanColor(value.textColor, fallback.textColor),
    accentColor: cleanColor(value.accentColor, fallback.accentColor),
  };
}

function section(value) { return isRecord(value) ? value : {}; }
function isRecord(value) { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function cleanBoolean(value, fallback) { return typeof value === "boolean" ? value : fallback; }
function cleanColor(value, fallback) { return HEX_COLOR.test(value ?? "") ? value : fallback; }
function choice(value, allowed, fallback) { return allowed.includes(value) ? value : fallback; }

function cleanText(value, fallback, max) {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[<>]/g, "").trim().slice(0, max);
  return clean || fallback;
}

function cleanStringList(value, fallback, maxItems) {
  if (!Array.isArray(value)) return [...fallback];
  const items = value.slice(0, maxItems).map((item, index) => cleanText(item, fallback[index] ?? "Item", 50));
  return items.length ? items : [...fallback];
}

function cleanItems(value, fallback, fields, maxItems) {
  if (!Array.isArray(value) || value.length === 0) return fallback.map((item) => ({ ...item }));
  return value.slice(0, maxItems).map((item, index) => {
    const record = section(item);
    const fallbackItem = fallback[index] ?? fallback[0];
    return Object.fromEntries(fields.map((field) => [field, cleanText(record[field], fallbackItem[field], field === "answer" ? 180 : 80)]));
  });
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback;
}

function cleanMediaUrl(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return /^\/api\/media\/[a-f0-9-]{36}$/i.test(trimmed) ? trimmed : "";
}

function cleanSocial(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[<>]/g, "").trim().slice(0, 120);
}

// Acima disso, a lista de auditoria (sourceFiles) é enxugada antes de desistir.
const SHOPIFY_DATA_SOFT_LIMIT = 3_000_000;
// Teto absoluto: proteger o worker, não punir temas grandes.
const SHOPIFY_DATA_HARD_LIMIT = 24_000_000;

function cleanShopifyData(value) {
  if (!isRecord(value)) return null;
  try {
    let data = JSON.parse(JSON.stringify(value));
    let size = JSON.stringify(data).length;
    if (size > SHOPIFY_DATA_SOFT_LIMIT && Array.isArray(data.sourceFiles) && data.sourceFiles.length > 60) {
      /* o inventário de arquivos é o único campo dispensável de tamanho
         ilimitado; o schema e os valores do tema nunca são cortados */
      data = { ...data, sourceFiles: data.sourceFiles.slice(0, 60) };
      size = JSON.stringify(data).length;
    }
    if (size > SHOPIFY_DATA_HARD_LIMIT) {
      /* descartar em silêncio fazia o editor cair na simulação genérica sem
         explicação; o aviso dá o rastro do porquê */
      console.warn(`cleanShopifyData: tema com ${size} bytes excede o teto de ${SHOPIFY_DATA_HARD_LIMIT}; dados descartados`);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
