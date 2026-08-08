/**
 * Gerador do site do cliente (Fluxo Cliente).
 *
 * Puro e testável com `node --test`, como o resto das regras. Recebe a marca e
 * o template escolhido, aplica a marca sobre o modelo do ShrinePro
 * (DEFAULT_CUSTOMIZATION via normalizeCustomization, que já sanitiza tudo) e
 * devolve páginas HTML com CSS inline e nenhuma requisição externa; a logo vira
 * arquivo real em `assets/` dentro do pacote (referência relativa — o site
 * continua abrindo com um clique na pasta entregue).
 *
 * Sem Orbis e sem a nossa marca aqui: o site é do cliente, não nosso.
 */
import { normalizeCustomization } from "./business-rules.mjs";

export const SECTION_LABELS = Object.freeze({
  announcement: "Barra de avisos",
  header: "Cabeçalho",
  hero: "Vitrine principal",
  benefits: "Benefícios",
  products: "Produtos",
  bundle: "Compre junto",
  comparison: "Comparação",
  testimonials: "Depoimentos",
  faq: "Perguntas frequentes",
  newsletter: "Newsletter",
  footer: "Rodapé",
});

export const SITE_TEMPLATES = Object.freeze([
  {
    id: "essencial",
    name: "Essencial",
    tagline: "Confiança primeiro: benefícios, depoimentos e respostas às dúvidas.",
    sections: ["announcement", "header", "hero", "benefits", "products", "testimonials", "faq", "newsletter", "footer"],
  },
  {
    id: "vitrine",
    name: "Vitrine",
    tagline: "Venda primeiro: produtos em destaque, conjunto promocional e comparação.",
    sections: ["announcement", "header", "hero", "products", "bundle", "comparison", "testimonials", "newsletter", "footer"],
  },
]);

const MAX_LOGO_DATA_URI = 2_000_000;
const DATA_URI_IMAGE = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
/* A logo gerada pelo Orbis Criativos é SVG e vem percent-encoded, não base64.
   SVG carrega script, e o site entregue abre no navegador da pessoa — então o
   conteúdo é DECODIFICADO e conferido contra a lista de tags que o nosso
   desenho usa. Casar só o prefixo do data URI não serviria: o percent-encoding
   esconde qualquer `<script>` de uma regex feita no texto codificado. */
const PREFIXO_SVG = "data:image/svg+xml;charset=utf-8,";
const TAGS_DA_LOGO = new Set(["svg", "title", "circle", "rect", "path", "text", "g", "polygon"]);

export function svgDaLogoSeguro(dataUri) {
  if (typeof dataUri !== "string" || !dataUri.startsWith(PREFIXO_SVG)) return "";
  let svg = "";
  try { svg = decodeURIComponent(dataUri.slice(PREFIXO_SVG.length)); } catch { return ""; }
  if (!svg.startsWith("<svg") || !svg.endsWith("</svg>")) return "";
  if (/\son\w+\s*=/i.test(svg) || /(xlink:)?href|javascript:|<!--|<!\[CDATA\[/i.test(svg)) return "";
  for (const [, tag] of svg.matchAll(/<\/?([a-z0-9:-]+)/gi)) {
    if (!TAGS_DA_LOGO.has(tag.toLowerCase())) return "";
  }
  return svg;
}

export function slugify(value) {
  const base = String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "minha-marca";
}

export function sanitizeBrand(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const name = text(source.name, "Minha Marca", 48);
  return {
    name,
    slug: slugify(name),
    slogan: text(source.slogan, "", 140),
    description: text(source.description, "", 240),
    primaryColor: color(source.primaryColor, "#0e7490"),
    backgroundColor: color(source.backgroundColor, "#f6f8f7"),
    whatsapp: text(source.whatsapp, "", 40).replace(/[^\d+]/g, "").slice(0, 20),
    instagram: text(source.instagram, "", 60).replace(/^@/, ""),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(source.email ?? "")) ? String(source.email).slice(0, 120) : "",
    logoDataUri:
      typeof source.logoDataUri === "string"
      && source.logoDataUri.length <= MAX_LOGO_DATA_URI
      && (DATA_URI_IMAGE.test(source.logoDataUri) || svgDaLogoSeguro(source.logoDataUri))
        ? source.logoDataUri
        : "",
  };
}

/** A marca vira overrides do modelo; normalizeCustomization sanitiza o resto. */
export function brandCustomization(brandInput) {
  const brand = sanitizeBrand(brandInput);
  const P = brand.primaryColor;
  const B = brand.backgroundColor;
  const onP = textColorFor(P);
  const onB = textColorFor(B);
  const dark = mix(P, "#000000", 0.78);
  const tintSoft = mix(P, "#ffffff", 0.88);
  const slogan = brand.slogan || "Produtos escolhidos com cuidado, entregues para todo o Brasil.";

  return normalizeCustomization({
    announcement: { background: P, textColor: onP },
    header: { brand: brand.name, background: B, textColor: onB, accentColor: P },
    hero: {
      eyebrow: "LOJA OFICIAL",
      headline: brand.name,
      body: brand.description || slogan,
      background: B,
      textColor: onB,
      accentColor: P,
      buttonTextColor: onP,
    },
    benefits: { background: tintSoft, textColor: textColorFor(tintSoft), borderColor: mix(P, "#ffffff", 0.6) },
    products: { background: B, textColor: onB, accentColor: P, cardBackground: mix(B, onB === "#ffffff" ? "#ffffff" : "#000000", 0.94) },
    bundle: { background: tintSoft, textColor: textColorFor(tintSoft), accentColor: P },
    comparison: { background: dark, textColor: "#ffffff", accentColor: mix(P, "#ffffff", 0.45) },
    testimonials: { background: mix(B, P, 0.92), textColor: onB, accentColor: P },
    faq: { background: B, textColor: onB, borderColor: mix(B, onB === "#ffffff" ? "#ffffff" : "#000000", 0.8) },
    newsletter: { background: P, textColor: onP, buttonBackground: dark, buttonTextColor: "#ffffff" },
    footer: {
      brand: brand.name,
      description: slogan,
      copyright: `© 2026 ${brand.name}. Todos os direitos reservados.`,
      background: mix(P, "#000000", 0.86),
      textColor: "#f2f7f5",
      mutedColor: mix(P, "#ffffff", 0.55),
      instagram: brand.instagram,
      whatsapp: brand.whatsapp,
    },
    productPage: { background: B, textColor: onB, accentColor: P, cardBackground: mix(B, onB === "#ffffff" ? "#ffffff" : "#000000", 0.92) },
  });
}

/**
 * Gera as páginas do site. Devolve { brand, template, customization, files },
 * onde files mapeia caminho → conteúdo: páginas HTML como string e a logo
 * (quando existe) como Uint8Array em `assets/logo.<ext>`.
 */
export function generateClientSite({ brand: brandInput, templateId }) {
  const brand = sanitizeBrand(brandInput);
  const template = SITE_TEMPLATES.find((entry) => entry.id === templateId) ?? SITE_TEMPLATES[0];
  const c = brandCustomization(brandInput);
  const logo = logoAssetFromDataUri(brand.logoDataUri);
  const view = { ...brand, logoSrc: logo ? logo.path : "" };

  const index = page({
    brand: view,
    c,
    title: brand.name,
    description: c.hero.body,
    body: template.sections.map((sectionId) => renderSection(sectionId, c, view)).join("\n"),
  });

  const produto = page({
    brand: view,
    c,
    title: `${c.productPage.title} · ${brand.name}`,
    description: c.productPage.description,
    body: [renderSection("header", c, view), renderProductPage(c), renderSection("footer", c, view)].join("\n"),
  });

  const files = { "index.html": index, "produto.html": produto };
  if (logo) files[logo.path] = logo.data;
  return { brand, template, customization: c, files };
}

/* ---------------------------------------------------------------- render */

function page({ brand, c, title, description, body }) {
  const g = c.global;
  const whatsappFloat = brand.whatsapp
    ? `<a class="zap" href="https://wa.me/${esc(brand.whatsapp)}" target="_blank" rel="noopener" aria-label="Conversar no WhatsApp">${ZAP_ICON}</a>`
    : "";
  return `<!doctype html>
<html lang="${esc(g.language)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
${brand.logoSrc ? `<link rel="icon" href="${brand.logoSrc}" />` : ""}
<style>${css(c)}</style>
</head>
<body>
${body}
${whatsappFloat}
</body>
</html>`;
}

function css(c) {
  const g = c.global;
  return `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--radius:${g.buttonRadius}px;--gap:${g.sectionSpacing}px;--width:${g.contentWidth}px}
body{font-family:${fontStack(g.font)};line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;display:block}
a{color:inherit}
.wrap{max-width:var(--width);margin:0 auto;padding:0 22px}
section{padding:var(--gap) 0}
.eyebrow{font-size:12px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;opacity:.75}
h1{font-size:clamp(34px,6vw,58px);line-height:1.08;letter-spacing:-.01em}
h2{font-size:clamp(24px,3.6vw,36px);line-height:1.15;margin-bottom:8px}
.btn{display:inline-block;padding:14px 28px;border:0;border-radius:var(--radius);font-weight:700;font-size:15px;text-decoration:none;cursor:pointer}
.announcement{padding:9px 0;text-align:center;font-size:12.5px;font-weight:700;letter-spacing:.14em}
.header{position:sticky;top:0;z-index:10;border-bottom:1px solid rgba(0,0,0,.08)}
.header .wrap{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-top:14px;padding-bottom:14px}
.header nav{display:flex;gap:22px;font-size:14.5px;font-weight:600}
.header nav a{text-decoration:none;opacity:.85}
.header nav a:hover{opacity:1}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;font-size:19px;letter-spacing:.02em;text-decoration:none}
.brand img{width:34px;height:34px;object-fit:contain}
.hero .wrap{display:grid;gap:18px;justify-items:start;padding-top:26px;padding-bottom:10px}
.hero p{font-size:clamp(16px,2vw,19px);max-width:560px;opacity:.85}
.grid{display:grid;gap:18px}
.grid-3{grid-template-columns:repeat(3,1fr)}
.card{border-radius:calc(var(--radius) + 4px);padding:22px}
.product .thumb{aspect-ratio:1;border-radius:calc(var(--radius) + 4px);display:grid;place-items:center;font-weight:800;font-size:26px;letter-spacing:.04em;opacity:.9}
.product .meta{display:flex;justify-content:space-between;align-items:baseline;margin-top:12px;gap:10px}
.badge{font-size:10.5px;font-weight:800;letter-spacing:.12em;padding:4px 8px;border-radius:999px}
.section-head{display:flex;align-items:end;justify-content:space-between;gap:16px;margin-bottom:24px}
.benefits .grid{text-align:left}
.benefits .card{border:1px solid}
.quote{font-size:clamp(19px,2.6vw,25px);font-weight:600;line-height:1.45;max-width:760px}
.faq details{border-bottom:1px solid;padding:16px 0}
.faq summary{font-weight:700;cursor:pointer;font-size:16.5px}
.faq p{margin-top:8px;opacity:.85}
.newsletter form{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
.newsletter input{flex:1;min-width:220px;padding:14px 16px;border:0;border-radius:var(--radius);font-size:15px}
.compare ul{list-style:none;display:grid;gap:12px;margin-top:18px}
.compare li{display:flex;gap:10px;align-items:center;font-size:16.5px}
.compare li > span{font-weight:900}
.footer{padding:calc(var(--gap) + 8px) 0 26px}
.footer .grid{grid-template-columns:2fr 1fr 1fr;gap:34px}
.footer h4{font-size:12.5px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:12px}
.footer ul{list-style:none;display:grid;gap:8px;font-size:14.5px}
.footer a{text-decoration:none}
.footer .legal{margin-top:34px;padding-top:18px;border-top:1px solid rgba(255,255,255,.14);font-size:12.5px;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}
.pdp .wrap{display:grid;grid-template-columns:1fr 1fr;gap:44px;align-items:center}
.pdp .thumb{aspect-ratio:1;border-radius:calc(var(--radius) + 6px);display:grid;place-items:center;font-weight:800;font-size:34px}
.pdp .price{font-size:26px;font-weight:800;margin:12px 0 6px}
.pdp p{opacity:.85;margin-bottom:18px}
.zap{position:fixed;right:20px;bottom:20px;width:54px;height:54px;border-radius:50%;background:#22c55e;display:grid;place-items:center;box-shadow:0 10px 24px rgba(0,0,0,.25);z-index:20}
.zap svg{width:28px;height:28px;fill:#fff}
@media (max-width:860px){.grid-3{grid-template-columns:1fr}.footer .grid{grid-template-columns:1fr}.pdp .wrap{grid-template-columns:1fr}.header nav{display:none}}
`;
}

function renderSection(id, c, brand) {
  switch (id) {
    case "announcement":
      return c.announcement.enabled
        ? `<div class="announcement" style="background:${c.announcement.background};color:${c.announcement.textColor}">${esc(c.announcement.text)}</div>`
        : "";
    case "header": {
      const logo = brand.logoSrc ? `<img src="${brand.logoSrc}" alt="" />` : "";
      const menu = c.header.menuItems.map((item) => `<a href="index.html">${esc(item)}</a>`).join("");
      return `<header class="header" style="background:${c.header.background};color:${c.header.textColor}">
  <div class="wrap">
    <a class="brand" href="index.html">${logo}${esc(c.header.brand)}</a>
    <nav>${menu}</nav>
    <a class="btn" style="background:${c.header.accentColor};color:${textColorFor(c.header.accentColor)};padding:10px 18px" href="produto.html">Comprar</a>
  </div>
</header>`;
    }
    case "hero":
      return `<section class="hero" style="background:${c.hero.background};color:${c.hero.textColor}">
  <div class="wrap">
    <span class="eyebrow" style="color:${c.hero.accentColor}">${esc(c.hero.eyebrow)}</span>
    <h1>${esc(c.hero.headline)}</h1>
    <p>${esc(c.hero.body)}</p>
    <a class="btn" href="produto.html" style="background:${c.hero.accentColor};color:${c.hero.buttonTextColor}">${esc(c.hero.buttonLabel)}</a>
  </div>
</section>`;
    case "benefits":
      return `<section class="benefits" style="background:${c.benefits.background};color:${c.benefits.textColor}">
  <div class="wrap"><div class="grid grid-3">${c.benefits.items
    .map((item) => `<div class="card" style="border-color:${c.benefits.borderColor}"><h3>${esc(item.title)}</h3><p style="opacity:.8">${esc(item.text)}</p></div>`)
    .join("")}</div></div>
</section>`;
    case "products":
      return `<section class="products" style="background:${c.products.background};color:${c.products.textColor}">
  <div class="wrap">
    <div class="section-head"><div><span class="eyebrow" style="color:${c.products.accentColor}">${esc(c.products.eyebrow)}</span><h2>${esc(c.products.title)}</h2></div><a href="produto.html" style="color:${c.products.accentColor};font-weight:700;text-decoration:none">${esc(c.products.linkLabel)} →</a></div>
    <div class="grid grid-3">${c.products.items
      .map(
        (item) => `<a class="product" href="produto.html" style="text-decoration:none;color:inherit"><div class="thumb" style="background:${c.products.cardBackground}">${esc(initials(item.name))}</div><div class="meta"><strong>${esc(item.name)}</strong><span>${esc(item.price)}</span></div><span class="badge" style="background:${c.products.accentColor}1f;color:${c.products.accentColor}">${esc(item.badge)}</span></a>`,
      )
      .join("")}</div>
  </div>
</section>`;
    case "bundle":
      return c.bundle.enabled
        ? `<section style="background:${c.bundle.background};color:${c.bundle.textColor}">
  <div class="wrap" style="text-align:center;display:grid;gap:10px;justify-items:center">
    <span class="eyebrow" style="color:${c.bundle.accentColor}">${esc(c.bundle.eyebrow)}</span>
    <h2>${esc(c.bundle.title)}</h2>
    <p style="max-width:520px;opacity:.85">${esc(c.bundle.body)}</p>
    <a class="btn" href="produto.html" style="background:${c.bundle.accentColor};color:${textColorFor(c.bundle.accentColor)}">${esc(c.bundle.buttonLabel)}</a>
  </div>
</section>`
        : "";
    case "comparison":
      return c.comparison.enabled
        ? `<section class="compare" style="background:${c.comparison.background};color:${c.comparison.textColor}">
  <div class="wrap">
    <span class="eyebrow" style="color:${c.comparison.accentColor}">${esc(c.comparison.eyebrow)}</span>
    <h2>${esc(c.comparison.title)}</h2>
    <ul>${c.comparison.items.map((item) => `<li><span style="color:${c.comparison.accentColor}">✓</span>${esc(item)}</li>`).join("")}</ul>
  </div>
</section>`
        : "";
    case "testimonials":
      return c.testimonials.enabled
        ? `<section style="background:${c.testimonials.background};color:${c.testimonials.textColor}">
  <div class="wrap" style="display:grid;gap:14px">
    <span class="eyebrow" style="color:${c.testimonials.accentColor}">${esc(c.testimonials.eyebrow)}</span>
    <h2>${esc(c.testimonials.title)}</h2>
    <p class="quote">“${esc(c.testimonials.quote)}”</p>
    <strong style="opacity:.75">— ${esc(c.testimonials.author)}</strong>
  </div>
</section>`
        : "";
    case "faq":
      return c.faq.enabled
        ? `<section class="faq" style="background:${c.faq.background};color:${c.faq.textColor}">
  <div class="wrap" style="max-width:820px">
    <span class="eyebrow">${esc(c.faq.eyebrow)}</span>
    <h2>${esc(c.faq.title)}</h2>
    ${c.faq.items.map((item) => `<details style="border-color:${c.faq.borderColor}"><summary>${esc(item.question)}</summary><p>${esc(item.answer)}</p></details>`).join("")}
  </div>
</section>`
        : "";
    case "newsletter":
      return c.newsletter.enabled
        ? `<section style="background:${c.newsletter.background};color:${c.newsletter.textColor}">
  <div class="wrap" style="max-width:640px;text-align:center">
    <h2>${esc(c.newsletter.title)}</h2>
    <p style="opacity:.85">${esc(c.newsletter.body)}</p>
    <form class="newsletter" onsubmit="return false"><input type="email" placeholder="${esc(c.newsletter.placeholder)}" /><button class="btn" style="background:${c.newsletter.buttonBackground};color:${c.newsletter.buttonTextColor}">${esc(c.newsletter.buttonLabel)}</button></form>
  </div>
</section>`
        : "";
    case "footer": {
      const contact = [
        brand.whatsapp ? `<li><a href="https://wa.me/${esc(brand.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a></li>` : "",
        brand.instagram ? `<li><a href="https://instagram.com/${esc(brand.instagram)}" target="_blank" rel="noopener">@${esc(brand.instagram)}</a></li>` : "",
        brand.email ? `<li><a href="mailto:${esc(brand.email)}">${esc(brand.email)}</a></li>` : "",
      ].join("");
      return `<footer class="footer" style="background:${c.footer.background};color:${c.footer.textColor}">
  <div class="wrap">
    <div class="grid">
      <div><strong style="font-size:19px">${esc(c.footer.brand)}</strong><p style="color:${c.footer.mutedColor};margin-top:10px;max-width:340px">${esc(c.footer.description)}</p></div>
      <div><h4 style="color:${c.footer.mutedColor}">Loja</h4><ul>${c.footer.storeLinks.map((link) => `<li><a href="index.html">${esc(link)}</a></li>`).join("")}</ul></div>
      <div><h4 style="color:${c.footer.mutedColor}">Atendimento</h4><ul>${c.footer.helpLinks.map((link) => `<li><a href="index.html">${esc(link)}</a></li>`).join("")}${contact}</ul></div>
    </div>
    <div class="legal"><span>${esc(c.footer.copyright)}</span><span style="color:${c.footer.mutedColor}">Site gerado a partir do tema ShrinePro</span></div>
  </div>
</footer>`;
    }
    default:
      return "";
  }
}

function renderProductPage(c) {
  const p = c.productPage;
  return `<section class="pdp" style="background:${p.background};color:${p.textColor}">
  <div class="wrap">
    <div class="thumb" style="background:${p.cardBackground}">${esc(initials(p.title))}</div>
    <div>
      <span class="eyebrow" style="color:${p.accentColor}">${esc(p.eyebrow)}</span>
      <h1 style="font-size:clamp(28px,4vw,44px)">${esc(p.title)}</h1>
      <div class="price" style="color:${p.accentColor}">${esc(p.price)}</div>
      <p>${esc(p.description)}</p>
      <button class="btn" style="background:${p.accentColor};color:${textColorFor(p.accentColor)}">${esc(p.buttonLabel)}</button>
      <p style="margin-top:14px;font-size:13px;opacity:.6">Página demonstrativa: conecte sua plataforma de pagamento para vender de verdade.</p>
    </div>
  </div>
</section>`;
}

/* ---------------------------------------------------------------- helpers */

const ZAP_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm5.2 14.2c-.2.6-1.2 1.2-1.7 1.2-.4.1-1 .1-1.6-.1a13 13 0 0 1-5.7-5 6.6 6.6 0 0 1-1.3-3.4c0-1 .5-1.5.7-1.7.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4l.9 2.1c.1.2.1.4 0 .6l-.4.6-.2.3c-.1.2-.2.3 0 .6.2.3.8 1.3 1.7 2.1 1.2 1 2.1 1.4 2.5 1.5.3.2.5.1.7-.1l.8-1c.2-.3.4-.2.7-.1l2 1c.3.1.5.2.5.4.1 0 .1.4-.1.9Z"/></svg>`;

/** Decodifica a logo (data URI já validado pelo sanitizeBrand) em arquivo de asset. */
function logoAssetFromDataUri(dataUri) {
  const svg = svgDaLogoSeguro(dataUri);
  if (svg) return { path: "assets/logo.svg", data: new TextEncoder().encode(svg) };
  const match = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i.exec(dataUri ?? "");
  if (!match) return null;
  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  try {
    const binary = atob(match[2]);
    if (!binary.length) return null;
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) data[index] = binary.charCodeAt(index);
    return { path: `assets/logo.${extension}`, data };
  } catch {
    return null;
  }
}

function text(value, fallback, max) {
  if (typeof value !== "string") return fallback;
  const clean = value.replace(/[<>]/g, "").trim().slice(0, max);
  return clean || fallback;
}

function color(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? String(value).toLowerCase() : fallback;
}

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function initials(name) {
  return String(name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function fontStack(font) {
  const named = { Inter: "'Inter'", Manrope: "'Manrope'", Poppins: "'Poppins'", Georgia: "Georgia, 'Times New Roman', serif" };
  if (font === "Georgia") return named.Georgia;
  return `${named[font] ?? "'Inter'"}, system-ui, -apple-system, 'Segoe UI', sans-serif`;
}

function hexToRgb(hex) {
  return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
}

function textColorFor(background) {
  const [r, g, b] = hexToRgb(color(background, "#ffffff"));
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#101d1a" : "#ffffff";
}

/** Mistura `hex` com `into`: weight 1 devolve `hex`, 0 devolve `into`. */
function mix(hex, into, weight) {
  const a = hexToRgb(color(hex, "#000000"));
  const b = hexToRgb(color(into, "#000000"));
  const channel = (index) => Math.round(a[index] * weight + b[index] * (1 - weight));
  return `#${[0, 1, 2].map((index) => channel(index).toString(16).padStart(2, "0")).join("")}`;
}
