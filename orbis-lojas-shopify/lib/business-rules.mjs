const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ALLOWED_UPLOADS = new Set(["image/jpeg", "image/png", "image/webp"]);

export const DEFAULT_CUSTOMIZATION = Object.freeze({
  global: {
    font: "Inter",
    buttonRadius: 10,
    sectionSpacing: 40,
    contentWidth: 1200,
    language: "pt-BR",
  },
  announcement: {
    enabled: true,
    text: "FRETE GRÁTIS EM PEDIDOS SELECIONADOS",
    background: "#008060",
    textColor: "#ffffff",
  },
  header: {
    brand: "CACTUS",
    background: "#f4f7f5",
    textColor: "#10231c",
    accentColor: "#008060",
    menuItems: ["Novidades", "Mais vendidos", "Sobre"],
    searchEnabled: true,
    cartEnabled: true,
    sticky: true,
  },
  hero: {
    eyebrow: "NOVA COLEÇÃO · 2026",
    headline: "CACTUS 12",
    body: "Produtos essenciais, selecionados com cuidado e enviados para todo o Brasil.",
    buttonLabel: "Comprar agora",
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
    items: [
      { title: "Entrega rápida", text: "Para todo o Brasil" },
      { title: "Compra protegida", text: "Pagamento seguro" },
      { title: "Troca sem atrito", text: "Em até 30 dias" },
    ],
  },
  products: {
    eyebrow: "SELEÇÃO DA SEMANA",
    title: "Mais vendidos",
    linkLabel: "Ver todos",
    background: "#a8d6b8",
    textColor: "#3700ff",
    accentColor: "#05acff",
    cardBackground: "#eff6f4",
    items: [
      { name: "Balance", price: "R$ 149", badge: "BEST SELLER" },
      { name: "Daily Ritual", price: "R$ 129", badge: "ESSENCIAL" },
      { name: "Pure Form", price: "R$ 179", badge: "ESSENCIAL" },
    ],
  },
  bundle: {
    enabled: true,
    eyebrow: "COMPRE JUNTO",
    title: "Seu ritual completo",
    body: "Combine os favoritos e economize no conjunto.",
    buttonLabel: "Adicionar conjunto",
    background: "#f4f7f5",
    textColor: "#10231c",
    accentColor: "#008060",
  },
  comparison: {
    enabled: true,
    eyebrow: "POR QUE ESCOLHER",
    title: "Feito para a sua rotina",
    background: "#10231c",
    textColor: "#ffffff",
    accentColor: "#22d49b",
    items: ["Fórmula selecionada", "Uso simples", "Compra protegida"],
  },
  testimonials: {
    enabled: true,
    eyebrow: "QUEM USA, RECOMENDA",
    title: "Experiências da comunidade",
    quote: "Conteúdo demonstrativo. Substitua por um depoimento real antes de publicar.",
    author: "Cliente de demonstração",
    background: "#edf5f0",
    textColor: "#10231c",
    accentColor: "#008060",
  },
  faq: {
    enabled: true,
    eyebrow: "DÚVIDAS",
    title: "Perguntas frequentes",
    background: "#f4f7f5",
    textColor: "#10231c",
    borderColor: "#c5d8ce",
    items: [
      { question: "Qual é o prazo de envio?", answer: "O prazo é calculado no checkout conforme o CEP." },
      { question: "Posso trocar meu pedido?", answer: "Sim. Solicite a troca dentro do período informado pela loja." },
      { question: "Quais formas de pagamento?", answer: "Configure as formas disponíveis na sua plataforma de pagamento." },
    ],
  },
  newsletter: {
    enabled: true,
    title: "Novidades direto na sua caixa de entrada",
    body: "Cadastre seu e-mail para receber lançamentos e conteúdos da marca.",
    placeholder: "Seu melhor e-mail",
    buttonLabel: "Quero receber",
    background: "#008060",
    textColor: "#ffffff",
    buttonBackground: "#10231c",
    buttonTextColor: "#ffffff",
  },
  footer: {
    brand: "CACTUS",
    description: "Produtos essenciais para uma rotina mais simples.",
    copyright: "© 2026 CACTUS. Todos os direitos reservados.",
    background: "#07100c",
    textColor: "#edf7f1",
    mutedColor: "#87978f",
    instagram: "",
    whatsapp: "",
    storeLinks: ["Novidades", "Mais vendidos", "Sobre"],
    helpLinks: ["Contato", "Trocas", "Políticas"],
  },
  search: {
    title: "Pesquisa",
    placeholder: "O que você procura?",
    emptyMessage: "Digite para buscar produtos, coleções e conteúdos.",
    popularTitle: "Buscas populares",
    popularTerms: ["Mais vendidos", "Novidades", "Kits"],
    background: "#f4f7f5",
    textColor: "#10231c",
    accentColor: "#008060",
  },
  productPage: {
    eyebrow: "BEST SELLER",
    title: "Balance",
    price: "R$ 149",
    description: "Uma fórmula essencial criada para acompanhar sua rotina.",
    buttonLabel: "Adicionar ao carrinho",
    background: "#f4f7f5",
    textColor: "#10231c",
    accentColor: "#008060",
    cardBackground: "#d8e9e0",
  },
  collection: {
    eyebrow: "COLEÇÃO",
    title: "Mais vendidos",
    description: "Os favoritos escolhidos pela comunidade.",
    background: "#f4f7f5",
    textColor: "#10231c",
    accentColor: "#008060",
  },
  cart: {
    title: "Seu carrinho",
    emptyText: "Seu carrinho está vazio.",
    progressText: "Adicione mais produtos para ganhar frete grátis.",
    checkoutLabel: "Finalizar compra",
    background: "#f4f7f5",
    textColor: "#10231c",
    accentColor: "#008060",
  },
  blog: {
    eyebrow: "CONTEÚDO",
    title: "Diário CACTUS",
    description: "Guias, novidades e histórias da marca.",
    background: "#f4f7f5",
    textColor: "#10231c",
    accentColor: "#008060",
    articles: ["Rituais para começar bem", "Como escolher seus essenciais", "Por dentro da CACTUS"],
  },
});

export function normalizeCustomization(input = {}) {
  const source = isRecord(input) ? input : {};
  const global = section(source.global);
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
      font: choice(global.font ?? source.font, ["Inter", "Manrope", "Poppins", "Georgia"], DEFAULT_CUSTOMIZATION.global.font),
      buttonRadius: clampNumber(global.buttonRadius ?? source.buttonRadius, 0, 28, DEFAULT_CUSTOMIZATION.global.buttonRadius),
      sectionSpacing: clampNumber(global.sectionSpacing ?? source.spacing, 20, 80, DEFAULT_CUSTOMIZATION.global.sectionSpacing),
      contentWidth: clampNumber(global.contentWidth, 900, 1600, DEFAULT_CUSTOMIZATION.global.contentWidth),
      language: choice(global.language ?? source.language, ["pt-BR", "en", "es"], DEFAULT_CUSTOMIZATION.global.language),
    },
    announcement: {
      enabled: cleanBoolean(announcement.enabled, DEFAULT_CUSTOMIZATION.announcement.enabled),
      text: cleanText(announcement.text ?? (typeof source.announcement === "string" ? source.announcement : undefined), DEFAULT_CUSTOMIZATION.announcement.text, 120),
      background: cleanColor(announcement.background ?? source.primaryColor, DEFAULT_CUSTOMIZATION.announcement.background),
      textColor: cleanColor(announcement.textColor, DEFAULT_CUSTOMIZATION.announcement.textColor),
    },
    header: {
      brand: cleanText(header.brand ?? source.brand, DEFAULT_CUSTOMIZATION.header.brand, 48),
      background: cleanColor(header.background ?? source.backgroundColor, DEFAULT_CUSTOMIZATION.header.background),
      textColor: cleanColor(header.textColor ?? source.textColor, DEFAULT_CUSTOMIZATION.header.textColor),
      accentColor: cleanColor(header.accentColor ?? source.primaryColor, DEFAULT_CUSTOMIZATION.header.accentColor),
      menuItems: cleanStringList(header.menuItems, DEFAULT_CUSTOMIZATION.header.menuItems, 5),
      searchEnabled: cleanBoolean(header.searchEnabled, DEFAULT_CUSTOMIZATION.header.searchEnabled),
      cartEnabled: cleanBoolean(header.cartEnabled, DEFAULT_CUSTOMIZATION.header.cartEnabled),
      sticky: cleanBoolean(header.sticky, DEFAULT_CUSTOMIZATION.header.sticky),
    },
    hero: {
      eyebrow: cleanText(hero.eyebrow, DEFAULT_CUSTOMIZATION.hero.eyebrow, 60),
      headline: cleanText(hero.headline ?? source.headline, DEFAULT_CUSTOMIZATION.hero.headline, 100),
      body: cleanText(hero.body ?? source.subheadline, DEFAULT_CUSTOMIZATION.hero.body, 240),
      buttonLabel: cleanText(hero.buttonLabel, DEFAULT_CUSTOMIZATION.hero.buttonLabel, 40),
      background: cleanColor(hero.background ?? source.backgroundColor, DEFAULT_CUSTOMIZATION.hero.background),
      textColor: cleanColor(hero.textColor ?? source.textColor, DEFAULT_CUSTOMIZATION.hero.textColor),
      accentColor: cleanColor(hero.accentColor ?? source.primaryColor, DEFAULT_CUSTOMIZATION.hero.accentColor),
      buttonTextColor: cleanColor(hero.buttonTextColor, DEFAULT_CUSTOMIZATION.hero.buttonTextColor),
      image: cleanMediaUrl(hero.image ?? source.heroImage),
    },
    benefits: {
      background: cleanColor(benefits.background, DEFAULT_CUSTOMIZATION.benefits.background),
      textColor: cleanColor(benefits.textColor, DEFAULT_CUSTOMIZATION.benefits.textColor),
      borderColor: cleanColor(benefits.borderColor, DEFAULT_CUSTOMIZATION.benefits.borderColor),
      items: cleanItems(benefits.items, DEFAULT_CUSTOMIZATION.benefits.items, ["title", "text"], 3),
    },
    products: {
      eyebrow: cleanText(products.eyebrow, DEFAULT_CUSTOMIZATION.products.eyebrow, 60),
      title: cleanText(products.title, DEFAULT_CUSTOMIZATION.products.title, 80),
      linkLabel: cleanText(products.linkLabel, DEFAULT_CUSTOMIZATION.products.linkLabel, 30),
      background: cleanColor(products.background, DEFAULT_CUSTOMIZATION.products.background),
      textColor: cleanColor(products.textColor, DEFAULT_CUSTOMIZATION.products.textColor),
      accentColor: cleanColor(products.accentColor, DEFAULT_CUSTOMIZATION.products.accentColor),
      cardBackground: cleanColor(products.cardBackground, DEFAULT_CUSTOMIZATION.products.cardBackground),
      items: cleanItems(products.items, DEFAULT_CUSTOMIZATION.products.items, ["name", "price", "badge"], 3),
    },
    bundle: normalizePromoSection(bundle, DEFAULT_CUSTOMIZATION.bundle),
    comparison: {
      ...normalizeSimpleSection(comparison, DEFAULT_CUSTOMIZATION.comparison),
      items: cleanStringList(comparison.items, DEFAULT_CUSTOMIZATION.comparison.items, 5),
    },
    testimonials: {
      ...normalizeSimpleSection(testimonials, DEFAULT_CUSTOMIZATION.testimonials),
      quote: cleanText(testimonials.quote, DEFAULT_CUSTOMIZATION.testimonials.quote, 240),
      author: cleanText(testimonials.author, DEFAULT_CUSTOMIZATION.testimonials.author, 80),
    },
    faq: {
      enabled: cleanBoolean(faq.enabled, DEFAULT_CUSTOMIZATION.faq.enabled),
      eyebrow: cleanText(faq.eyebrow, DEFAULT_CUSTOMIZATION.faq.eyebrow, 60),
      title: cleanText(faq.title, DEFAULT_CUSTOMIZATION.faq.title, 80),
      background: cleanColor(faq.background, DEFAULT_CUSTOMIZATION.faq.background),
      textColor: cleanColor(faq.textColor, DEFAULT_CUSTOMIZATION.faq.textColor),
      borderColor: cleanColor(faq.borderColor, DEFAULT_CUSTOMIZATION.faq.borderColor),
      items: cleanItems(faq.items, DEFAULT_CUSTOMIZATION.faq.items, ["question", "answer"], 3),
    },
    newsletter: {
      enabled: cleanBoolean(newsletter.enabled, DEFAULT_CUSTOMIZATION.newsletter.enabled),
      title: cleanText(newsletter.title, DEFAULT_CUSTOMIZATION.newsletter.title, 100),
      body: cleanText(newsletter.body, DEFAULT_CUSTOMIZATION.newsletter.body, 220),
      placeholder: cleanText(newsletter.placeholder, DEFAULT_CUSTOMIZATION.newsletter.placeholder, 60),
      buttonLabel: cleanText(newsletter.buttonLabel, DEFAULT_CUSTOMIZATION.newsletter.buttonLabel, 40),
      background: cleanColor(newsletter.background, DEFAULT_CUSTOMIZATION.newsletter.background),
      textColor: cleanColor(newsletter.textColor, DEFAULT_CUSTOMIZATION.newsletter.textColor),
      buttonBackground: cleanColor(newsletter.buttonBackground, DEFAULT_CUSTOMIZATION.newsletter.buttonBackground),
      buttonTextColor: cleanColor(newsletter.buttonTextColor, DEFAULT_CUSTOMIZATION.newsletter.buttonTextColor),
    },
    footer: {
      brand: cleanText(footer.brand ?? header.brand ?? source.brand, DEFAULT_CUSTOMIZATION.footer.brand, 48),
      description: cleanText(footer.description, DEFAULT_CUSTOMIZATION.footer.description, 180),
      copyright: cleanText(footer.copyright, DEFAULT_CUSTOMIZATION.footer.copyright, 120),
      background: cleanColor(footer.background, DEFAULT_CUSTOMIZATION.footer.background),
      textColor: cleanColor(footer.textColor, DEFAULT_CUSTOMIZATION.footer.textColor),
      mutedColor: cleanColor(footer.mutedColor, DEFAULT_CUSTOMIZATION.footer.mutedColor),
      instagram: cleanSocial(footer.instagram),
      whatsapp: cleanSocial(footer.whatsapp),
      storeLinks: cleanStringList(footer.storeLinks, DEFAULT_CUSTOMIZATION.footer.storeLinks, 6),
      helpLinks: cleanStringList(footer.helpLinks, DEFAULT_CUSTOMIZATION.footer.helpLinks, 6),
    },
    search: normalizeUtilityPage(search, DEFAULT_CUSTOMIZATION.search, { popularTitle: 60 }),
    productPage: normalizeProductPage(productPage, DEFAULT_CUSTOMIZATION.productPage),
    collection: normalizeUtilityPage(collection, DEFAULT_CUSTOMIZATION.collection, {}),
    cart: normalizeCart(cart, DEFAULT_CUSTOMIZATION.cart),
    blog: {
      ...normalizeUtilityPage(blog, DEFAULT_CUSTOMIZATION.blog, {}),
      articles: cleanStringList(blog.articles, DEFAULT_CUSTOMIZATION.blog.articles, 6),
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
  if (!Number.isFinite(size) || size <= 0 || size > 5 * 1024 * 1024) throw new Error("INVALID_FILE_SIZE");
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
