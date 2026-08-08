"use client";
/* eslint-disable @next/next/no-img-element -- as imagens do tema importado são servidas por uma rota local autenticada */

import { ArrowRight, Check, Plus, Search, ShieldCheck, ShoppingBag, X, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type SyntheticEvent } from "react";
import type { ShopifyPage, ShopifySectionInstance, ShopifyThemeImport, ShopifyValue } from "@/lib/shopify-theme";
import { CATALOGO_LOJA } from "../lib/catalogo-loja";

/**
 * Prévia ao vivo: renderiza o Liquid REAL do tema no servidor (igual à Shopify)
 * e exibe o HTML em um iframe. Cai para a simulação (children) se o render falhar.
 */
/**
 * Traduz o href de um link do tema (rotas reais: /cart, /collections/…,
 * /products/…) para a página correspondente do preview — o mesmo gesto do
 * editor da Shopify, onde clicar num link navega a prévia.
 */
/** Handle do recurso na rota: /products/<handle>, /collections/<handle>. */
export function handleFromHref(href: string): string {
  const caminho = href.split("?")[0].split("#")[0];
  const partes = caminho.split("/").filter(Boolean);
  const indice = partes.findIndex((parte) => parte === "products" || parte === "collections");
  return indice >= 0 ? partes[indice + 1] ?? "" : "";
}

/** Variante pedida na rota (?variant=), como o seletor de opções do tema faz. */
export function variantFromHref(href: string): number {
  const consulta = href.split("?")[1] ?? "";
  const bruto = new URLSearchParams(consulta).get("variant") ?? "";
  return Number.parseInt(bruto, 10) || 0;
}

export function resolvePreviewPageId(theme: ShopifyThemeImport, href: string): string | null {
  let path: string;
  try { path = new URL(href, "https://preview.local").pathname; } catch { return null; }
  const pageExists = (id: string) => theme.pages.some((page) => page.id === id);
  const firstExisting = (...ids: string[]) => ids.find(pageExists) ?? null;
  if (path === "/" || path === "") return firstExisting("index");
  if (path.startsWith("/cart")) return firstExisting("cart");
  if (path.startsWith("/search")) return firstExisting("search");
  if (path.startsWith("/collections")) {
    const rest = path.split("/").filter(Boolean);
    if (rest.length <= 1) return firstExisting("list-collections", "collection");
    return firstExisting("collection");
  }
  if (path.startsWith("/products")) return firstExisting("product");
  if (path.startsWith("/blogs")) {
    const rest = path.split("/").filter(Boolean);
    return rest.length >= 3 ? firstExisting("article", "blog") : firstExisting("blog");
  }
  if (path.startsWith("/pages/")) {
    const handle = path.split("/").filter(Boolean)[1] ?? "";
    return firstExisting(`page.${handle}`, "page");
  }
  if (path.startsWith("/account")) {
    /* cada rota de conta tem a SUA página: mandar tudo para o login fazia
       "Criar conta" e "Esqueci a senha" abrirem a tela errada */
    const trecho = path.replace(/^\/account\/?/, "").split("/")[0];
    const porRota: Record<string, string[]> = {
      "": ["customers/account", "customers/login"],
      login: ["customers/login"],
      register: ["customers/register", "customers/login"],
      addresses: ["customers/addresses", "customers/account"],
      orders: ["customers/order", "customers/account"],
      recover: ["customers/reset_password", "customers/login"],
      reset: ["customers/reset_password", "customers/login"],
      activate: ["customers/activate_account", "customers/login"],
      logout: ["index"],
    };
    return firstExisting(...(porRota[trecho] ?? ["customers/login", "customers/account"]));
  }
  return null;
}

export type PreviewMode = "selecionar" | "interagir" | "previa";

export function ShopifyLiveRender({ shopify, pageId, onSelectSection, onSelectBlock, onNavigatePage, selectedSectionId, mode = "selecionar", fallback }: { shopify: ShopifyThemeImport; pageId: string; onSelectSection?: (id: string) => void; onSelectBlock?: (sectionId: string, blockId: string | null) => void; onNavigatePage?: (id: string) => void; selectedSectionId?: string; mode?: PreviewMode; fallback: ReactNode }) {
  const [html, setHtml] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "live" | "fallback">("loading");
  const requestRef = useRef(0);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  /* o carrinho do preview mora aqui: assim ele sobrevive à troca de página
     (o iframe é recriado) sem provocar re-render a cada item adicionado */
  const cartRef = useRef<Array<{ variantId: number; quantity: number }>>([]);
  /* handle da última rota navegada: /products/<handle> abre esse produto */
  const handleRef = useRef("");
  const canRender = Boolean(shopify.compatibility?.preservedSource);

  /* árvore → preview: seleção rola o iframe até a seção e a destaca */
  useEffect(() => {
    if (!selectedSectionId || selectedSectionId === "__global__" || status !== "live" || !html) return;
    const timeout = window.setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage({ orbisScrollTo: selectedSectionId }, "*");
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [selectedSectionId, status, html]);

  /* o modo (selecionar/interagir/previa) governa o comportamento da ponte */
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
    if (status !== "live" || !html) return;
    const timeout = window.setTimeout(() => {
      frameRef.current?.contentWindow?.postMessage({ orbisMode: mode }, "*");
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [mode, status, html]);
  /* cada troca de página monta um iframe NOVO, que nasce em "selecionar":
     sem reenviar o modo no load, o editor dizia "Interagir" e o preview
     continuava bloqueando cliques (o carrinho não recebia o produto) */
  const enviarModo = useCallback(() => {
    frameRef.current?.contentWindow?.postMessage({ orbisMode: modeRef.current }, "*");
  }, []);

  useEffect(() => {
    if (!canRender) return;
    const requestId = ++requestRef.current;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/theme-render", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ shopify, page: pageId, handle: handleRef.current, cartItems: cartRef.current }),
        });
        if (requestId !== requestRef.current) return;
        if (!response.ok) { setStatus("fallback"); return; }
        setHtml(await response.text());
        setStatus("live");
      } catch {
        if (requestId === requestRef.current) setStatus("fallback");
      }
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [shopify, pageId, canRender]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as { orbisSection?: string; orbisBlock?: string | null; orbisNavigate?: string; orbisCartSections?: string[]; orbisCartItems?: unknown; orbisPedido?: number; orbisPaginaHref?: string; orbisCartEstado?: Array<{ variantId: number; quantity: number }> } | null;
      /* o carrinho mudou dentro do preview: guardamos para a próxima página */
      if (Array.isArray(data?.orbisCartEstado)) { cartRef.current = data.orbisCartEstado; return; }
      /* o tema buscou uma página por fetch (quick-add "Escolher opções",
         filtros de coleção): devolvemos o HTML do MESMO renderizador */
      if (data?.orbisPedido && typeof data.orbisPaginaHref === "string") {
        const pedido = data.orbisPedido;
        const href = data.orbisPaginaHref;
        const alvo = (event.source as Window | null) ?? frameRef.current?.contentWindow ?? null;
        void (async () => {
          let htmlPagina = "";
          try {
            const response = await fetch("/api/theme-render", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ shopify, page: resolvePreviewPageId(shopify, href) ?? pageId, handle: handleFromHref(href), variantId: variantFromHref(href), cartItems: data.orbisCartItems }),
            });
            if (response.ok) htmlPagina = await response.text();
          } catch { /* sem HTML o tema segue com o próprio fallback */ }
          alvo?.postMessage({ orbisPedido: pedido, orbisHtml: htmlPagina }, "*");
        })();
        return;
      }
      /* o carrinho do preview pede o HTML novo das seções (gaveta, contador):
         renderizamos pelo MESMO motor, com o carrinho que o iframe mantém */
      if (data?.orbisPedido && Array.isArray(data.orbisCartSections)) {
        const pedido = data.orbisPedido;
        const alvo = (event.source as Window | null) ?? frameRef.current?.contentWindow ?? null;
        void (async () => {
          let secoes: Record<string, string> = {};
          try {
            const response = await fetch("/api/theme-render", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ shopify, page: pageId, sections: data.orbisCartSections, cartItems: data.orbisCartItems }),
            });
            if (response.ok) secoes = await response.json() as Record<string, string>;
          } catch { /* sem seções o tema ainda atualiza o próprio estado */ }
          alvo?.postMessage({ orbisPedido: pedido, orbisSecoes: secoes }, "*");
        })();
        return;
      }
      if (data?.orbisSection) {
        onSelectSection?.(data.orbisSection);
        onSelectBlock?.(data.orbisSection, data.orbisBlock ?? null);
      }
      if (data?.orbisNavigate) {
        const nextPageId = resolvePreviewPageId(shopify, data.orbisNavigate);
        /* guardamos o handle da rota para a página abrir o produto clicado */
        if (nextPageId) { handleRef.current = handleFromHref(data.orbisNavigate); onNavigatePage?.(nextPageId); }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [onSelectSection, onSelectBlock, onNavigatePage, shopify, pageId]);

  if (!canRender || status === "fallback") return <>{fallback}</>;
  return (
    <div className="live-render-wrap">
      {status === "loading" && !html && <div className="live-render-loading"><span>ORBIS · RENDERIZANDO O TEMA REAL…</span></div>}
      {html && <iframe ref={frameRef} className="live-render-frame" title="Prévia real do tema" sandbox="allow-scripts allow-same-origin allow-forms" srcDoc={html} onLoad={enviarModo} />}
      {html && <span className="live-render-badge">RENDER REAL · LIQUID</span>}
    </div>
  );
}

type Device = "desktop" | "tablet" | "mobile";
type DemoProduct = { id: string; name: string; category: string; price: number; compareAt?: number; image: string; description: string };
type Runtime = {
  products: DemoProduct[];
  product: DemoProduct;
  productQuantity: number;
  cart: Record<string, number>;
  searchQuery: string;
  newsletterSent: boolean;
  addToCart: (id: string, quantity?: number) => void;
  changeCart: (id: string, delta: number) => void;
  openProduct: (id: string) => void;
  goTo: (base: string) => void;
  openCart: () => void;
  setSearchQuery: (value: string) => void;
  setProductQuantity: (value: number) => void;
  sendNewsletter: () => void;
  checkout: () => void;
};

/** Descrição do catálogo vem em HTML; aqui vira texto curto para o cartão. */
function textoSimples(html: string, limite: number) {
  const puro = html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (puro.length <= limite) return puro;
  const corte = puro.slice(0, limite);
  return `${corte.slice(0, corte.lastIndexOf(" ")) || corte}…`;
}

/** Mesmos 10 produtos reais que o motor de render usa (lib/catalogo-loja.ts). */
const PRODUCTS: DemoProduct[] = CATALOGO_LOJA.map((produto) => {
  const variante = produto.variants[0];
  return {
    id: produto.handle,
    name: produto.title,
    category: produto.type || produto.tags[0] || produto.vendor,
    price: variante.price / 100,
    compareAt: variante.compareAtPrice ? variante.compareAtPrice / 100 : undefined,
    image: produto.images[0]?.src ?? "",
    description: textoSimples(produto.descriptionHtml, 150),
  };
});

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function ShopifyStorePreview({ theme, page, device, selectedSectionId, onSelectSection, onNavigatePage }: { theme: ShopifyThemeImport; page: ShopifyPage; device: Device; selectedSectionId: string; onSelectSection: (id: string, ownerPageId?: string) => void; onNavigatePage?: (id: string) => void }) {
  const palette = themePalette(theme.globalValues);
  const background = palette.background;
  const textColor = palette.text;
  const accent = palette.accent;
  const radius = typeof theme.globalValues.buttons_radius === "number" ? theme.globalValues.buttons_radius : 6;
  const [cart, setCart] = useState<Record<string, number>>({});
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeProductId, setActiveProductId] = useState(PRODUCTS[0].id);
  const [productQuantity, setProductQuantity] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [newsletterSent, setNewsletterSent] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState("");
  const product = PRODUCTS.find((item) => item.id === activeProductId) ?? PRODUCTS[0];
  const cartCount = Object.values(cart).reduce((total, quantity) => total + quantity, 0);
  const cartTotal = PRODUCTS.reduce((total, item) => total + item.price * (cart[item.id] ?? 0), 0);
  const style = { "--shopify-bg": background, "--shopify-text": textColor, "--shopify-accent": accent, "--store-radius": `${radius}px` } as CSSProperties;

  function goTo(base: string) { const target = findPage(theme, base); if (target) onNavigatePage?.(target.id); }
  function addToCart(id: string, quantity = 1) { setCart((current) => ({ ...current, [id]: (current[id] ?? 0) + Math.max(1, quantity) })); setDrawerOpen(true); }
  function changeCart(id: string, delta: number) { setCart((current) => { const next = { ...current }; const quantity = (next[id] ?? 0) + delta; if (quantity <= 0) delete next[id]; else next[id] = quantity; return next; }); }
  function openProduct(id: string) { setActiveProductId(id); setProductQuantity(1); goTo("product"); }
  function checkout() { setCheckoutMessage("Checkout de demonstração aberto com sucesso."); setDrawerOpen(false); }

  const runtime: Runtime = {
    products: PRODUCTS, product, productQuantity, cart, searchQuery, newsletterSent, addToCart, changeCart, openProduct, goTo,
    openCart: () => setDrawerOpen(true), setSearchQuery, setProductQuantity: (value) => setProductQuantity(Math.max(1, Math.min(10, value))),
    sendNewsletter: () => setNewsletterSent(true), checkout,
  };
  const headerPage = theme.pages.find((item) => item.id === "header-group");
  const footerPage = theme.pages.find((item) => item.id === "footer-group");
  const isGroup = page.id.startsWith("header-group") || page.id.startsWith("footer-group");
  const renderSections = (owner: ShopifyPage) => owner.sections.filter((section) => !section.disabled).map((section) => (
    <SectionPreview key={`${owner.id}-${section.id}`} theme={theme} pageId={owner.id} section={section} accent={accent} background={background} textColor={textColor} selected={selectedSectionId === section.id} onSelect={() => onSelectSection(section.id, owner.id)} runtime={runtime} />
  ));
  const previewPages = ["index", "collection", "product", "search", "cart", "blog"].map((base) => findPage(theme, base)).filter((item): item is ShopifyPage => Boolean(item));

  return <div className={`storefront storefront-${device} shopify-storefront shopify-live-store`} style={style}>
    <div className="shopify-preview-label"><span><i /> LOJA CARREGADA</span><div>{previewPages.map((item) => <button key={item.id} className={item.id === page.id ? "active" : ""} onClick={() => onNavigatePage?.(item.id)}>{item.name}</button>)}</div><b>{page.name}</b></div>
    {!isGroup && headerPage && renderSections(headerPage)}
    {renderSections(page)}
    {!isGroup && footerPage && renderSections(footerPage)}
    <CartDrawer open={drawerOpen} cart={cart} total={cartTotal} accent={accent} freeShippingGoal={freeShippingGoalFrom(theme)} onClose={() => setDrawerOpen(false)} onChange={changeCart} onViewCart={() => { setDrawerOpen(false); goTo("cart"); }} onCheckout={checkout} />
    {checkoutMessage && <div className="shopify-store-toast"><Check size={14} /> {checkoutMessage}<button onClick={() => setCheckoutMessage("")} aria-label="Fechar aviso"><X size={12} /></button></div>}
    <button className="shopify-floating-cart" onClick={() => setDrawerOpen(true)} aria-label={`Abrir carrinho com ${cartCount} itens`}><ShoppingBag size={15} /><span>{cartCount}</span></button>
  </div>;
}

function SectionPreview({ theme, pageId, section: source, accent: themeAccent, background: themeBackground, textColor: themeTextColor, selected, onSelect, runtime }: { theme: ShopifyThemeImport; pageId: string; section: ShopifySectionInstance; accent: string; background: string; textColor: string; selected: boolean; onSelect: () => void; runtime: Runtime }) {
  const section = resolveSection(theme, source);
  const themeFallback: PreviewPalette = { accent: themeAccent, background: themeBackground, text: themeTextColor };
  /* como na Shopify: o color_scheme escolhido na seção dá a base; cores
     explícitas da própria seção sobrescrevem canal a canal */
  const schemeId = typeof section.settings.color_scheme === "string" ? section.settings.color_scheme : undefined;
  const schemeBase = schemePalette(theme.globalValues, schemeId);
  const sectionPalette = paletteFromSettings(section.settings, { ...themeFallback, ...(schemeBase ?? {}) });
  const accent = sectionPalette.accent;
  const background = sectionPalette.background;
  const textColor = sectionPalette.text;
  const type = section.type.toLowerCase().replace(/_/g, "-");
  const media = sectionImages(theme, section);
  const strings = sectionStrings(section);
  /* conteúdo SEMPRE do tema: settings da instância + defaults do schema (já
     mesclados em resolveSection). Sem dado, o rótulo neutro é o nome da seção
     — nunca uma frase inventada pelo app. */
  const heading = findSectionText(section, ["heading", "title", "label", "headline"]) ?? strings[0] ?? section.name;
  const body = findSectionText(section, ["text", "description", "subheading", "subtext", "caption"]) ?? strings.find((value) => value !== heading) ?? "";
  const buttonLabel = findSectionText(section, ["button_label", "atc_button_label", "button_text", "button"]) ?? "";
  const className = `shopify-extracted-section ${selected ? "preview-section-selected" : ""}`;
  const stop = (event: SyntheticEvent) => event.stopPropagation();

  if (type.includes("announcement") || type.includes("ticker")) {
    const items = section.blocks.map((block) => findText(block.settings, ["text", "title", "heading"]) ?? "").filter(Boolean);
    return <section className={`${className} extracted-announcement`} style={{ background: accent, color: "#fff" }} onClick={onSelect}><small>{items.join("   •   ") || heading}</small></section>;
  }
  if (type === "header" || type.startsWith("header-") || type.endsWith("-header")) {
    const brandName = theme.themeName.replace(/\s*\(.*\)$/, "");
    const logoUrl = sectionImageByKey(theme, section, /logo/i) ?? themeLogo(theme);
    /* itens do menu vêm dos blocos/settings da seção do TEMA; o link_list real
       (handle de menu da loja) não existe no ZIP, então sem rótulos no tema o
       menu mostra páginas do próprio tema — nada de texto inventado */
    const menuLabels = Array.from(new Set(section.blocks.map((block) => findText(block.settings, ["title", "heading", "label", "text"])).filter((value): value is string => Boolean(value)))).slice(0, 4);
    const navTargets: Array<[string, string]> = menuLabels.length
      ? menuLabels.map((label, index) => [label, ["index", "collection", "blog", "page"][Math.min(index, 3)]] as [string, string])
      : [["Página inicial", "index"], ["Catálogo", "collection"]];
    return <section className={`${className} extracted-header shopify-live-header`} style={{ background, color: textColor }} onClick={onSelect}><button className="shopify-live-brand" onClick={(event) => { stop(event); runtime.goTo("index"); }}>{logoUrl ? <img className="shopify-logo-img" src={logoUrl} alt={brandName} /> : brandName}</button><nav>{navTargets.map(([label, target]) => <button key={label} onClick={(event) => { stop(event); runtime.goTo(target); }}>{label}</button>)}</nav><div><button aria-label="Pesquisar" onClick={(event) => { stop(event); runtime.goTo("search"); }}><Search size={15} /></button><button aria-label="Abrir carrinho" onClick={(event) => { stop(event); runtime.openCart(); }}><ShoppingBag size={15} /><span>{Object.values(runtime.cart).reduce((total, quantity) => total + quantity, 0)}</span></button></div></section>;
  }
  if (type === "footer" || type.startsWith("footer-") || type.endsWith("-footer")) {
    /* colunas do rodapé = blocos da seção do tema (heading + textos do bloco) */
    const columns = section.blocks.map((block) => {
      const columnHeading = findText(block.settings, ["heading", "title"]);
      const items = Object.values(block.settings)
        .filter((value): value is string => typeof value === "string")
        .map(stripHtml)
        .filter((value) => isUseful(value) && value !== columnHeading)
        .slice(0, 4);
      return { id: block.id, heading: columnHeading, items };
    }).filter((column) => column.heading || column.items.length).slice(0, 3);
    const footerText = findSectionText(section, ["text", "description", "subtext"]) ?? "";
    return <section className={`${className} extracted-footer`} style={{ background: textColor, color: background }} onClick={onSelect}><div><strong>{theme.themeName}</strong>{footerText && <p>{footerText}</p>}</div>{columns.map((column) => <div key={column.id}><b>{column.heading ?? section.name}</b>{column.items.map((item) => <span key={item}>{item}</span>)}</div>)}</section>;
  }
  if (type === "main-cart-items") return <section className={`${className} shopify-cart-page`} style={{ background, color: textColor }} onClick={onSelect}><SectionTitle eyebrow="CARRINHO" title="Seu carrinho" /><CartItems cart={runtime.cart} onChange={runtime.changeCart} emptyAction={() => runtime.goTo("collection")} /></section>;
  if (type === "main-cart-footer") { const total = runtime.products.reduce((sum, item) => sum + item.price * (runtime.cart[item.id] ?? 0), 0); return <section className={`${className} shopify-cart-summary`} style={{ background, color: textColor }} onClick={onSelect}><div><span>Subtotal</span><strong>{BRL.format(total)}</strong></div><p>Frete e descontos calculados no checkout.</p><button style={{ background: accent }} disabled={!total} onClick={(event) => { stop(event); runtime.checkout(); }}>Finalizar compra com segurança</button></section>; }
  if (type === "main-product" || type === "featured-product") return <section className={`${className} shopify-product-page`} style={{ background, color: textColor }} onClick={onSelect}>{media[0] ? <img className="shopify-product-photo" src={media[0]} alt={runtime.product.name} /> : <ProductArt product={runtime.product} large />}<div className="shopify-product-info"><small>{runtime.product.category}</small><h1>{runtime.product.name}</h1><div className="shopify-price"><strong>{BRL.format(runtime.product.price)}</strong>{runtime.product.compareAt && <del>{BRL.format(runtime.product.compareAt)}</del>}</div><p>{runtime.product.description}</p><VariantRow handle={runtime.product.id} /><div className="shopify-buy-row"><div><button onClick={(event) => { stop(event); runtime.setProductQuantity(runtime.productQuantity - 1); }}>−</button><span>{runtime.productQuantity}</span><button onClick={(event) => { stop(event); runtime.setProductQuantity(runtime.productQuantity + 1); }}>+</button></div><button style={{ background: accent }} onClick={(event) => { stop(event); runtime.addToCart(runtime.product.id, runtime.productQuantity); }}>Adicionar ao carrinho</button></div><ul><li><Check size={11} /> Compra protegida</li><li><Zap size={11} /> Envio rápido</li><li><ShieldCheck size={11} /> Garantia de 30 dias</li></ul></div></section>;
  if (type === "main-search" || type.includes("predictive-search")) {
    const results = runtime.products.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(runtime.searchQuery.toLowerCase()));
    return <section className={`${className} shopify-search-page`} style={{ background, color: textColor }} onClick={onSelect}><SectionTitle eyebrow={section.name} title={heading} /><label><Search size={16} /><input value={runtime.searchQuery} onClick={stop} onChange={(event) => runtime.setSearchQuery(event.target.value)} placeholder="Buscar produtos" /></label><p>{runtime.searchQuery ? `${results.length} resultado(s) para “${runtime.searchQuery}”` : "Produtos populares"}</p>{results.length || !runtime.searchQuery ? <ProductGrid products={results} onProduct={runtime.openProduct} onAdd={runtime.addToCart} /> : <div className="shopify-no-results"><Search size={23} /><b>Nenhum resultado encontrado</b><span>Tente buscar por outro nome ou categoria.</span></div>}</section>;
  }
  if (type === "main-collection-banner") { if (media.length) return <section className={`${className} shopify-collection-banner shopify-image-hero shopify-image-banner-short`} onClick={onSelect}><img className="shopify-image-hero-bg" src={media[0]} alt="" /><div className="shopify-image-hero-overlay" /><div className="shopify-image-hero-copy"><small>{section.name}</small><h1>{heading}</h1>{body && <p>{body}</p>}</div></section>; return <section className={`${className} shopify-collection-banner`} style={{ background: `color-mix(in srgb, ${accent} 13%, ${background})`, color: textColor }} onClick={onSelect}><small>{section.name}</small><h1>{heading}</h1>{body && <p>{body}</p>}</section>; }
  if (type.includes("collection-product-grid") || type.startsWith("featured-collection") || type === "related-products" || type === "collection-list" || type === "collage" || type.includes("instagram") || type.includes("instafeed") || type.includes("gallery") || type.includes("lookbook")) {
    const mosaic = (type === "collage" || type.includes("instagram") || type.includes("instafeed") || type.includes("gallery") || type.includes("lookbook") || type === "collection-list") && media.length >= 2;
    return <section className={`${className} shopify-collection-section`} style={{ background, color: textColor }} onClick={onSelect}><div className="shopify-collection-head"><div><small>{section.name}</small><h2>{heading}</h2></div>{type.includes("product-grid") && <select onClick={stop} aria-label="Ordenar produtos"><option>Mais vendidos</option><option>Menor preço</option><option>Maior preço</option></select>}</div>{mosaic ? <div className="shopify-media-mosaic">{media.slice(0, 6).map((url) => <img key={url} src={url} alt="" />)}</div> : <ProductGrid products={runtime.products.slice(0, type === "collage" ? 4 : 6)} onProduct={runtime.openProduct} onAdd={runtime.addToCart} />}</section>;
  }
  if (type.includes("hero") || type.includes("slideshow") || type.includes("banner") || type.includes("image-with-text") || type.includes("parallax")) {
    if (media.length && type.includes("image-with-text")) return <section className={`${className} shopify-image-split`} style={{ background, color: textColor }} onClick={onSelect}><div className="shopify-image-split-copy"><small style={{ color: accent }}>{section.name}</small><h2>{heading}</h2>{body && <p>{body}</p>}{buttonLabel && <button style={{ background: accent }} onClick={(event) => { stop(event); runtime.goTo("collection"); }}>{buttonLabel}</button>}</div><img className="shopify-side-image" src={media[0]} alt={heading} /></section>;
    if (media.length) return <section className={`${className} shopify-image-hero`} onClick={onSelect}><img className="shopify-image-hero-bg" src={media[0]} alt="" /><div className="shopify-image-hero-overlay" /><div className="shopify-image-hero-copy"><small>{section.name}</small><h2>{heading}</h2>{body && <p>{body}</p>}{buttonLabel && <button style={{ background: accent }} onClick={(event) => { stop(event); runtime.goTo("collection"); }}>{buttonLabel}</button>}</div>{media.length > 1 && <div className="shopify-hero-dots">{media.slice(0, 5).map((url, index) => <i key={url} className={index === 0 ? "active" : ""} />)}</div>}</section>;
    return <section className={`${className} extracted-hero shopify-live-hero`} style={{ background: `color-mix(in srgb, ${accent} 14%, ${background})`, color: textColor }} onClick={onSelect}><div><small>{section.name}</small><h2>{heading}</h2>{body && <p>{body}</p>}{buttonLabel && <button style={{ background: accent }} onClick={(event) => { stop(event); runtime.goTo("collection"); }}>{buttonLabel}</button>}</div><ProductArt product={runtime.products[2]} hero /></section>;
  }
  if (type.includes("newsletter") || type.includes("email")) return <section className={`${className} extracted-newsletter`} style={{ background: accent, color: "#fff" }} onClick={onSelect}><div><h3>{heading}</h3>{body && <p>{body}</p>}</div>{runtime.newsletterSent ? <div className="shopify-newsletter-success"><Check size={17} /> E-mail cadastrado!</div> : <form onSubmit={(event) => { event.preventDefault(); stop(event); runtime.sendNewsletter(); }}><input aria-label="Seu e-mail" type="email" required placeholder="Seu melhor e-mail" onClick={stop} /><button type="submit">Inscrever</button></form>}</section>;
  if (type.includes("comparison-table") || type.includes("comparison-slider")) return <section className={`${className} shopify-comparison`} style={{ background, color: textColor }} onClick={onSelect}><SectionTitle eyebrow={section.name} title={heading} body={body || undefined} /><div><span /><b>{theme.themeName}</b><b>Outros</b>{section.blocks.slice(0, 5).flatMap((block) => { const label = findText(block.settings, ["benefit", "title", "text"]) ?? humanize(block.type); return [<span key={`${block.id}-label`}>{label}</span>, <strong key={`${block.id}-yes`}><Check size={12} /></strong>, <i key={`${block.id}-no`}>—</i>]; })}</div></section>;
  if (type === "results") return <section className={`${className} shopify-results`} style={{ background: `color-mix(in srgb, ${accent} 9%, ${background})`, color: textColor }} onClick={onSelect}><div><small>{section.name}</small><h2>{heading}</h2>{body && <p>{body}</p>}</div><div>{section.blocks.slice(0, 4).map((block) => { const rowText = findText(block.settings, ["text", "row_text"]); return <article key={block.id}><strong>{Number(block.settings.percentage ?? 0)}%</strong>{rowText && <p>{rowText}</p>}</article>; })}</div></section>;
  if (type.includes("testimonial") || type.includes("review")) return <section className={`${className} shopify-testimonials`} style={{ background, color: textColor }} onClick={onSelect}><SectionTitle eyebrow={section.name} title={heading} /><div>{section.blocks.slice(0, 4).map((block, index) => <article key={block.id}><span>★★★★★</span><p>{findText(block.settings, ["text"]) ?? `Depoimento de demonstração ${index + 1}`}</p><b>{findText(block.settings, ["author"]) ?? "Autor de demonstração"}</b></article>)}</div></section>;
  if (type === "shipping" || type.includes("icon-bar") || type.includes("icons-with-content") || type.includes("text-with-icons") || type.includes("multicolumn") || type.includes("multi-column") || type.includes("custom-columns") || type.includes("product-features")) return <section className={`${className} shopify-icon-grid`} style={{ background, color: textColor }} onClick={onSelect}><SectionTitle eyebrow={section.name} title={heading} /><div>{section.blocks.slice(0, 6).map((block, index) => { const blockImage = imagesFromSettings(theme, block.settings)[0]; const blockText = findText(block.settings, ["text", "description"]); return <article key={block.id}><span style={{ color: accent }}>{blockImage ? <img className="shopify-block-img" src={blockImage} alt="" /> : index % 3 === 0 ? <Zap size={17} /> : index % 3 === 1 ? <ShieldCheck size={17} /> : <Check size={17} />}</span><b>{findText(block.settings, ["title", "heading"]) ?? humanize(block.type)}</b>{blockText && <p>{blockText}</p>}</article>; })}</div></section>;
  if (type.includes("contact") || type.includes("track-order")) return <section className={`${className} shopify-form-section`} style={{ background, color: textColor }} onClick={onSelect}><div><small>{section.name}</small><h2>{heading}</h2>{body && <p>{body}</p>}</div><form onSubmit={(event) => event.preventDefault()} onClick={stop}><input placeholder={type.includes("track") ? "Número do pedido" : "Seu nome"} /><input placeholder={type.includes("track") ? "E-mail da compra" : "Seu e-mail"} /><textarea placeholder="Como podemos ajudar?" rows={3} /><button style={{ background: accent }}>{type.includes("track") ? "Rastrear pedido" : "Enviar mensagem"}</button></form></section>;
  if (type.includes("collapsible") || type.includes("content-tabs") || type.includes("faq")) return <section className={`${className} shopify-faq`} style={{ background, color: textColor }} onClick={onSelect}><SectionTitle eyebrow={section.name} title={heading} /><div>{section.blocks.slice(0, 6).map((block) => { const answer = findText(block.settings, ["text", "answer", "content"]); return <details key={block.id} onClick={stop}><summary>{findText(block.settings, ["heading", "title", "question"]) ?? humanize(block.type)}<Plus size={13} /></summary>{answer && <p>{answer}</p>}</details>; })}</div></section>;
  if (type.includes("section-divider")) return <section className={`${className} shopify-divider`} style={{ background, color: accent }} onClick={onSelect}><span /><span /><span /></section>;
  if (type.includes("main-article") || pageId.startsWith("article")) return <section className={`${className} shopify-article`} style={{ background, color: textColor }} onClick={onSelect}><small>{section.name} <i className="shopify-demo-flag">DEMONSTRAÇÃO</i></small><h1>{heading}</h1>{body && <p>{body}</p>}{media[0] ? <img className="shopify-article-img" src={media[0]} alt={heading} /> : <div style={{ background: `color-mix(in srgb, ${accent} 14%, white)` }} />}</section>;
  if (type.includes("blog")) { const articleTitles = section.blocks.map((block) => findText(block.settings, ["title", "heading"])).filter((value): value is string => Boolean(value)); const titles = articleTitles.length ? articleTitles.slice(0, 3) : [1, 2, 3].map((n) => `Artigo de demonstração ${n}`); return <section className={`${className} shopify-blog-section`} style={{ background, color: textColor }} onClick={onSelect}><SectionTitle eyebrow={section.name} title={heading} /><div>{titles.map((title, index) => <article key={title}>{media[index] ? <img className="shopify-blog-img" src={media[index]} alt={title} /> : <div style={{ background: `color-mix(in srgb, ${accent} ${12 + index * 7}%, white)` }} />}<small>{articleTitles.length ? section.name : "DEMONSTRAÇÃO"}</small><h3>{title}</h3><button onClick={(event) => { stop(event); runtime.goTo("article"); }}>Ler artigo <ArrowRight size={11} /></button></article>)}</div></section>; }
  return <section className={`${className} extracted-generic shopify-content-section`} style={{ background, color: textColor }} onClick={onSelect}><small>{section.type}</small><h3>{heading}</h3>{body && <p>{body}</p>}{media[0] && <img className="shopify-generic-img" src={media[0]} alt={heading} />}{section.blocks.length > 0 && <div>{section.blocks.slice(0, 8).map((block) => { const blockText = findText(block.settings, ["text", "description"]); return <article key={block.id}><b>{findText(block.settings, ["heading", "title"]) ?? humanize(block.type)}</b>{blockText && <span>{blockText}</span>}</article>; })}</div>}</section>;
}

function ProductGrid({ products, onProduct, onAdd }: { products: DemoProduct[]; onProduct: (id: string) => void; onAdd: (id: string) => void }) {
  return <div className="shopify-product-grid">{products.map((product) => <article className="shopify-product-card" key={product.id}><button className="shopify-product-link" onClick={() => onProduct(product.id)}><ProductArt product={product} /><span>{product.category}</span><h3>{product.name}</h3><div><strong>{BRL.format(product.price)}</strong>{product.compareAt && <del>{BRL.format(product.compareAt)}</del>}</div></button><button className="shopify-quick-add" onClick={() => onAdd(product.id)} aria-label={`Adicionar ${product.name} ao carrinho`}><Plus size={14} /></button></article>)}</div>;
}

/** Opções e valores reais do produto do catálogo; sem opção, nada é mostrado. */
function VariantRow({ handle }: { handle: string }) {
  const produto = CATALOGO_LOJA.find((item) => item.handle === handle);
  if (!produto || !produto.options.length || produto.variants.length < 2) return null;
  return <>{produto.options.map((opcao) => <div className="shopify-variant-row" key={opcao.name}><span>{opcao.name}</span><div>{opcao.values.slice(0, 5).map((valor, indice) => <button className={indice === 0 ? "active" : ""} key={valor}>{valor}</button>)}</div></div>)}</>;
}

function ProductArt({ product, large, hero }: { product: DemoProduct; large?: boolean; hero?: boolean }) { return <div className={`shopify-product-art ${large ? "large" : ""} ${hero ? "hero" : ""}`}>{product.image ? <img className="shopify-product-photo-fill" src={product.image} alt={product.name} loading="lazy" /> : <b>{product.name.slice(0, 1)}</b>}{product.compareAt && <i>OFERTA</i>}</div>; }

function CartItems({ cart, onChange, emptyAction }: { cart: Record<string, number>; onChange: (id: string, delta: number) => void; emptyAction: () => void }) {
  const items = PRODUCTS.filter((item) => cart[item.id]);
  if (!items.length) return <div className="shopify-empty-cart"><ShoppingBag size={25} /><b>Seu carrinho está vazio</b><span>Adicione seus favoritos para continuar.</span><button onClick={emptyAction}>Ver produtos</button></div>;
  return <div className="shopify-cart-items">{items.map((item) => <article key={item.id}><ProductArt product={item} /><div><b>{item.name}</b><span>{item.category}</span><strong>{BRL.format(item.price)}</strong></div><div className="shopify-cart-quantity"><button onClick={() => onChange(item.id, -1)}>−</button><span>{cart[item.id]}</span><button onClick={() => onChange(item.id, 1)}>+</button></div></article>)}</div>;
}

function CartDrawer({ open, cart, total, accent, freeShippingGoal, onClose, onChange, onViewCart, onCheckout }: { open: boolean; cart: Record<string, number>; total: number; accent: string; freeShippingGoal?: number; onClose: () => void; onChange: (id: string, delta: number) => void; onViewCart: () => void; onCheckout: () => void }) {
  if (!open) return null;
  const count = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0);
  /* a barra de frete grátis só aparece se o tema configurar uma meta */
  const goal = typeof freeShippingGoal === "number" && freeShippingGoal > 0 ? freeShippingGoal : undefined;
  return <div className="shopify-cart-overlay" onClick={onClose}><aside className="shopify-cart-drawer" onClick={(event) => event.stopPropagation()}><header><div><small>SEU CARRINHO</small><h3>{count} item(ns)</h3></div><button onClick={onClose} aria-label="Fechar carrinho"><X size={16} /></button></header>{goal !== undefined && <div className="shopify-shipping-progress"><span style={{ width: `${Math.min(100, (total / goal) * 100)}%`, background: accent }} />{total >= goal ? <b><Check size={11} /> Você ganhou frete grátis!</b> : <b>Faltam {BRL.format(Math.max(0, goal - total))} para o frete grátis</b>}</div>}<CartItems cart={cart} onChange={onChange} emptyAction={onClose} /><footer><div><span>Subtotal</span><strong>{BRL.format(total)}</strong></div><button style={{ background: accent }} disabled={!total} onClick={onCheckout}>Finalizar compra</button><button onClick={onViewCart}>Ver carrinho completo</button></footer></aside></div>;
}

function SectionTitle({ eyebrow, title, body }: { eyebrow: string; title: string; body?: string }) { return <div className="shopify-section-title"><small>{eyebrow}</small><h2>{title}</h2>{body && <p>{body}</p>}</div>; }

function findPage(theme: ShopifyThemeImport, base: string) { return theme.pages.find((item) => item.id === base) ?? theme.pages.find((item) => item.id.startsWith(`${base}.`) && !item.id.includes(".context.")); }
function color(value: ShopifyValue | undefined, fallback: string) { return parseCssColor(value) ?? fallback; }
/** Aceita hex (3/6/8) e rgb()/rgba() — os formatos que os schemes dos temas usam. */
function parseCssColor(value: ShopifyValue | undefined): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(raw)) return raw;
  if (/^rgba?\([^)]+\)$/i.test(raw)) return raw;
  return null;
}
function valueRecord(value: ShopifyValue | undefined) { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, ShopifyValue> : {}; }

export type PreviewPalette = { background: string; text: string; accent: string };

/**
 * Paleta de um color scheme REAL do tema (settings_data → color_schemes).
 * É a mesma fonte que o editor da Shopify usa; as listas de nomes de chave
 * abaixo são só o último recurso para temas sem schemes.
 */
export function schemePalette(values: Record<string, ShopifyValue>, schemeId: string | undefined): Partial<PreviewPalette> | null {
  const schemes = valueRecord(values.color_schemes);
  const key = schemeId && schemeId in schemes ? schemeId : undefined;
  if (!key) return null;
  const settings = valueRecord(valueRecord(schemes[key]).settings);
  const background = parseCssColor(settings.background) ?? parseCssColor(settings.background_color);
  const text = parseCssColor(settings.text) ?? parseCssColor(settings.text_color) ?? parseCssColor(settings.foreground);
  const accent = parseCssColor(settings.button) ?? parseCssColor(settings.accent) ?? parseCssColor(settings.button_background) ?? parseCssColor(settings.secondary_button);
  if (!background && !text && !accent) return null;
  return { ...(background ? { background } : {}), ...(text ? { text } : {}), ...(accent ? { accent } : {}) };
}

export function themePalette(values: Record<string, ShopifyValue>): PreviewPalette {
  /* 1º: o primeiro color scheme do tema; 2º: chaves globais conhecidas; 3º: neutro */
  const firstSchemeId = Object.keys(valueRecord(values.color_schemes))[0];
  const scheme = schemePalette(values, firstSchemeId) ?? {};
  const background = scheme.background ?? firstNamedColor(values, ["colors_background_1", "background", "body_bg", "color_body_background", "checkout_body_background_color"], "#ffffff");
  const text = scheme.text ?? firstNamedColor(values, ["colors_text", "text_color", "color_body_text", "heading_color", "cl_bd_text", "clnav"], "#121212");
  const accent = scheme.accent ?? firstNamedColor(values, ["colors_accent_1", "primary_button_background", "color_primary", "accent_color", "color_btn_add", "bgatc_pg"], text);
  return { background, text, accent };
}

function paletteFromSettings(values: Record<string, ShopifyValue>, fallback: PreviewPalette) {
  return {
    background: firstNamedColor(values, ["background", "background_color", "color_background", "color_bg", "cl_bg", "bg_color"], fallback.background),
    text: firstNamedColor(values, ["text_color", "color_text", "heading_color", "title_color", "cl_txt", "cl_tit"], fallback.text),
    accent: firstNamedColor(values, ["accent_color", "button_background", "button_color", "primary_color", "cl_ic", "cl_btn"], fallback.accent),
  };
}
function firstNamedColor(values: Record<string, ShopifyValue>, keys: string[], fallback: string) {
  for (const key of keys) {
    const found = Object.entries(values).find(([id]) => id.toLowerCase() === key);
    if (found) {
      const parsed = color(found[1], "");
      if (parsed) return parsed;
    }
  }
  return fallback;
}
function resolveSection(theme: ShopifyThemeImport, section: ShopifySectionInstance): ShopifySectionInstance {
  const schema = theme.sectionSchemas.find((item) => item.type === section.type);
  const settings = Object.fromEntries((schema?.settings ?? []).filter((setting) => setting.default !== undefined).map((setting) => [setting.id, setting.default])) as Record<string, ShopifyValue>;
  return { ...section, settings: { ...settings, ...section.settings }, blocks: section.blocks.map((block) => { const blockSchema = schema?.blocks.find((item) => item.type === block.type); const defaults = Object.fromEntries((blockSchema?.settings ?? []).filter((setting) => setting.default !== undefined).map((setting) => [setting.id, setting.default])) as Record<string, ShopifyValue>; return { ...block, settings: { ...defaults, ...block.settings } }; }) };
}
const IMAGE_VALUE = /\.(png|jpe?g|webp|gif|svg|avif)(\?.*)?$/i;

/** Resolve um valor de configuração para a URL de imagem instalada a partir do ZIP do tema. */
function assetUrlFor(theme: ShopifyThemeImport, value: ShopifyValue | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "object" && !Array.isArray(value)) {
    const source = value as Record<string, ShopifyValue>;
    return assetUrlFor(theme, source.src ?? source.url ?? source.image);
  }
  if (typeof value !== "string") return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  if (raw.startsWith("data:image/") || raw.startsWith("/api/media/")) return raw;
  if (!IMAGE_VALUE.test(raw)) return undefined;
  const name = raw.split("?")[0].split("/").at(-1)?.toLowerCase() ?? "";
  const installed = theme.assetUrls?.[name];
  if (installed) return installed;
  if (/^https:\/\//.test(raw)) return raw;
  return undefined;
}

function imagesFromSettings(theme: ShopifyThemeImport, settings: Record<string, ShopifyValue>) {
  const found: string[] = [];
  for (const value of Object.values(settings)) {
    const url = assetUrlFor(theme, value);
    if (url) found.push(url);
  }
  return found;
}

function sectionImages(theme: ShopifyThemeImport, section: ShopifySectionInstance) {
  return Array.from(new Set([
    ...imagesFromSettings(theme, section.settings),
    ...section.blocks.flatMap((block) => imagesFromSettings(theme, block.settings)),
  ]));
}

function sectionImageByKey(theme: ShopifyThemeImport, section: ShopifySectionInstance, key: RegExp) {
  for (const [id, value] of Object.entries(section.settings)) {
    if (!key.test(id)) continue;
    const url = assetUrlFor(theme, value);
    if (url) return url;
  }
  return undefined;
}

function themeLogo(theme: ShopifyThemeImport) {
  for (const [id, value] of Object.entries(theme.globalValues)) {
    if (!/logo/i.test(id) || /width|height|size/i.test(id)) continue;
    const url = assetUrlFor(theme, value);
    if (url) return url;
  }
  const named = Object.entries(theme.assetUrls ?? {}).find(([name]) => /(^|[^a-z])logo/.test(name) && !/favicon/.test(name));
  return named?.[1];
}

function stripHtml(value: string) { return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(); }
function isUseful(value: string) { return value.length > 1 && !value.startsWith("shopify://") && !IMAGE_VALUE.test(value) && !/^#[0-9a-f]{6}$/i.test(value) && !/^(always-display|full_bleed|background-\d|accent-\d|scheme-\d+|inverse|h[0-6]|left|right|center|true|false)$/i.test(value); }

/** Meta de frete grátis: só existe se o TEMA declarar (cart drawer ou global). */
function freeShippingGoalFrom(theme: ShopifyThemeImport): number | undefined {
  const KEY = /free.?ship|ship(?:ping)?_(?:goal|threshold|minimum|amount)|cart_goal/i;
  const harvest = (settings: Record<string, ShopifyValue>) => {
    for (const [id, value] of Object.entries(settings)) {
      if (!KEY.test(id)) continue;
      const amount = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
      if (Number.isFinite(amount) && amount > 0) return amount;
    }
    return undefined;
  };
  for (const page of theme.pages) {
    for (const section of page.sections) {
      if (!/cart|drawer/i.test(section.type)) continue;
      const found = harvest(section.settings);
      if (found !== undefined) return found;
    }
  }
  return harvest(theme.globalValues);
}
function sectionStrings(section: ShopifySectionInstance) { return [...Object.values(section.settings), ...section.blocks.flatMap((block) => Object.values(block.settings))].filter((value): value is string => typeof value === "string").map(stripHtml).filter(isUseful); }
function findText(settings: Record<string, ShopifyValue>, keys: string[]) { for (const [id, value] of Object.entries(settings)) { if (typeof value === "string" && keys.some((key) => id.toLowerCase().includes(key)) && isUseful(stripHtml(value))) return stripHtml(value); } return undefined; }
function findSectionText(section: ShopifySectionInstance, keys: string[]) { return findText(section.settings, keys) ?? section.blocks.map((block) => findText(block.settings, keys)).find(Boolean); }
function humanize(value: string) { return value.replace(/^t:/, "").split(".").at(-1)?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? value; }
