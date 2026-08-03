"use client";
/* eslint-disable @next/next/no-img-element -- private user uploads are served by an authenticated media route */

import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  CircleAlert,
  Copy,
  Eye,
  FileArchive,
  FolderKanban,
  Globe2,
  Heart,
  Home,
  Layers3,
  LayoutTemplate,
  Menu,
  Monitor,
  PackageOpen,
  Palette,
  PanelRight,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Smartphone,
  Tablet,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BootstrapData, Project, Theme, Viewer } from "@/lib/types";
import { normalizeCustomization } from "@/lib/business-rules.mjs";
import { enderecoDoPortal } from "@/app/portal";
import type { ShopifyPage, ShopifySectionInstance, ShopifySectionSchema, ShopifySettingDefinition, ShopifyThemeImport, ShopifyValue } from "@/lib/shopify-theme";
import { ShopifyLiveRender, ShopifyStorePreview } from "@/app/ShopifyStorePreview";
import { Orbis as OrbisNucleo } from "@/app/Orbis";
import { EntryGate } from "@/app/EntryGate";
import { ClientFlow } from "@/app/ClientFlow";

type Identity = Omit<Viewer, "role"> | null;

/**
 * Orbis — o mascote-sentinela do estúdio, com o desenho oficial em PNG.
 * As classes antigas (orbis-mini, orbis-sm, orbis-hero, orbis-loading) viram
 * tamanhos; `girando` é trabalho, `esmaecido` é tela vazia. Nunca parado.
 */
function Orbis({ className = "", girando = false, esmaecido = false }: { className?: string; girando?: boolean; esmaecido?: boolean }) {
  const tamanho = className.includes("orbis-mini") ? 26
    : className.includes("orbis-sm") ? 84
    : className.includes("orbis-hero") ? 200
    : className.includes("orbis-loading") ? 96
    : 150;
  return (
    <span className={`orbis-figure ${className}`} aria-hidden="true">
      <OrbisNucleo tamanho={tamanho} girando={girando || className.includes("orbis-loading")} esmaecido={esmaecido} />
    </span>
  );
}

function OrbisSays({ children }: { children: React.ReactNode }) {
  return (
    <div className="orbis-says">
      <span className="orbis-says-label"><i /> ORBIS · CANAL DIRETO</span>
      <p>{children}</p>
    </div>
  );
}
type Tab = "home" | "extract" | "themes" | "projects" | "editor";
type Device = "desktop" | "tablet" | "mobile";
type Customization = ReturnType<typeof normalizeCustomization>;

const navItems = [
  { id: "home" as const, label: "Início", icon: Home, index: "01" },
  { id: "extract" as const, label: "Importar temas", icon: FileArchive, index: "02" },
  { id: "themes" as const, label: "Temas", icon: LayoutTemplate, index: "03" },
  { id: "projects" as const, label: "Projetos", icon: FolderKanban, index: "04" },
  { id: "editor" as const, label: "Editor", icon: SlidersHorizontal, index: "05" },
];

export function AppShell({ identity }: { identity: Identity }) {
  const [flow, setFlow] = useState<"client" | "admin" | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [data, setData] = useState<BootstrapData | null>(null);
  const [loading, setLoading] = useState(Boolean(identity));
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<Theme | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível carregar os dados.");
      setData(payload);
      setError(null);
      setSelectedProjectId((current) => current ?? payload.projects[0]?.id ?? null);
    } catch (requestError) {
      setError(humanError(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!identity) return;
    const timeout = window.setTimeout(() => void loadData(), 0);
    return () => window.clearTimeout(timeout);
  }, [identity, loadData]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  async function action(payload: Record<string, unknown>) {
    const response = await fetch("/api/actions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "A ação não pôde ser concluída.");
    if (result.data?.themes) setData(result.data);
    return result;
  }

  function navigate(next: Tab) {
    setTab(next);
    setMenuOpen(false);
  }

  async function openTheme(theme: Theme) {
    setBusy("use-theme");
    try {
      const result = await action({
        action: "unlockTheme",
        themeId: theme.id,
        idempotencyKey: `${theme.id}-${Date.now()}`,
      });
      setData(result.data);
      setSelectedProjectId(result.projectId);
      setTab("editor");
      setToast(`Como ordenou, senhor: ${theme.name} está pronto para editar.`);
    } catch (requestError) {
      setError(humanError(requestError));
    } finally {
      setBusy(null);
    }
  }

  if (!identity) return <SignedOutLanding />;
  if (flow === null) return <EntryGate onChoose={setFlow} />;
  if (flow === "client") return <ClientFlow onExit={() => setFlow(null)} />;

  const selectedProject = data?.projects.find((project) => project.id === selectedProjectId) ?? data?.projects[0] ?? null;

  return (
    <div className="app-shell">
      <div className="orbis-atmosphere" aria-hidden="true" />
      <div className="crt-scanlines" aria-hidden="true" />
      <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
      <aside className={`sidebar ${menuOpen ? "sidebar-open" : ""}`} aria-label="Navegação principal">
        <div className="brand-lockup">
          <Orbis className="orbis-mini" />
          <div><strong>ORBIS</strong><small>CRIAÇÃO DE LOJAS SHOPIFY</small></div>
          <button className="icon-button mobile-close" onClick={() => setMenuOpen(false)} aria-label="Fechar menu"><X size={18} /></button>
        </div>

        <div className="nav-group-label">FLUXO</div>
        <nav className="main-nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const count = item.id === "projects" ? data?.projects.length : undefined;
            return (
              <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => navigate(item.id)}>
                <span className="nav-index">{item.index}</span><Icon size={16} strokeWidth={1.7} /><span>{item.label}</span>
                {typeof count === "number" && <span className="nav-count">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-spacer" />
        <div className="nav-group-label">SENTINELA</div>
        <div className="utility-link local-only-status"><Monitor size={15} /> Orbis guarda tudo somente neste computador</div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Abrir menu"><Menu size={20} /></button>
          <span className="ready-label"><span className="pulse-dot" /> ORBIS ONLINE</span>
          <strong>{tabTitle(tab)}</strong>
          {/* A saída para o portal fica ao lado de "Trocar de fluxo" porque as
              duas respondem à mesma pergunta — "quero ir para outro lugar" —
              e no modo --app do Chrome não há botão de voltar para socorrer. */}
          <div className="topbar-status"><a className="text-button portal-switch" href={enderecoDoPortal()} title="Voltar ao portal da suíte Orbis" aria-label="Trocar de app: voltar ao portal"><ArrowLeft size={13} /><span>Trocar de app</span></a><button className="text-button flow-switch" onClick={() => setFlow(null)}>Trocar de fluxo</button><span><span className="online-dot" /> LOCAL</span></div>
        </header>

        <main id="main-content" className={tab === "editor" ? "main editor-main" : "main"}>
          {error && (
            <div className="error-banner" role="alert"><CircleAlert size={17} /><span>{error}</span><button onClick={() => { setError(null); void loadData(); }}>Tentar novamente</button></div>
          )}
          {loading && !data ? <LoadingPanel /> : data && (
            <>
              {tab === "home" && <Dashboard data={data} onNavigate={navigate} onEdit={(id) => { setSelectedProjectId(id); setTab("editor"); }} />}
              {tab === "extract" && <ExtractThemeView onImported={(payload) => {
                setData(payload.data);
                setTab("themes");
                const loadedTheme = payload.data.themes.find((theme) => theme.id === payload.themeId);
                if (loadedTheme) setPreviewTheme(loadedTheme);
                setToast(`${payload.compatibility.architecture} carregado, senhor. A prévia aguarda suas ordens.`);
              }} />}
              {tab === "themes" && <ThemesView data={data} onPreview={setPreviewTheme} onUse={(theme) => void openTheme(theme)} onFavorite={async (themeId, favorite) => {
                try { await action({ action: "toggleFavorite", themeId, favorite }); } catch (requestError) { setError(humanError(requestError)); }
              }} onDelete={async (themeId) => {
                setBusy("deleteTheme");
                try { await action({ action: "deleteTheme", themeId }); setToast("Tema removido deste computador, como ordenou."); } catch (requestError) { setError(humanError(requestError)); } finally { setBusy(null); }
              }} busy={busy} />}
              {tab === "projects" && <ProjectsView data={data} onCreate={() => setTab("themes")} onEdit={(id) => { setSelectedProjectId(id); setTab("editor"); }} onAction={async (payload, message) => {
                setBusy(String(payload.action));
                try { await action(payload); setToast(message); } catch (requestError) { setError(humanError(requestError)); } finally { setBusy(null); }
              }} busy={busy} />}
              {tab === "editor" && <EditorView key={selectedProject?.id ?? "no-project"} project={selectedProject} onChooseProject={() => setTab("projects")} onDataChange={loadData} onMessage={setToast} />}
            </>
          )}
        </main>
      </div>

      {previewTheme && <Modal title={`Prévia: ${previewTheme.name}`} onClose={() => setPreviewTheme(null)} wide>
        <div className="modal-preview"><ThemeModalPreview theme={previewTheme} /></div>
        <div className="modal-actions"><button className="secondary-button" onClick={() => setPreviewTheme(null)}>Voltar</button><button className="primary-button" disabled={busy === "use-theme"} onClick={() => { const theme = previewTheme; setPreviewTheme(null); void openTheme(theme); }}>{busy === "use-theme" ? "Criando projeto…" : "Editar este tema"} <ArrowRight size={16} /></button></div>
      </Modal>}

      {toast && <div className="toast" role="status"><Orbis className="orbis-mini" /> {toast}</div>}
    </div>
  );
}

function SignedOutLanding() {
  return (
    <main className="signed-out-shell">
      <div className="signed-out-grid" />
      <div className="crt-scanlines" aria-hidden="true" />
      <header className="public-header">
        <div className="brand-lockup"><Orbis className="orbis-mini" /><div><strong>ORBIS</strong><small>CRIAÇÃO DE LOJAS SHOPIFY</small></div></div>
        <a className="primary-button" href="/signin-with-chatgpt?return_to=%2F">Entrar <ArrowUpRight size={16} /></a>
      </header>
      <section className="public-hero">
        <Orbis />
        <span className="eyebrow">ORBIS · GUARDIÃO DE TEMAS</span>
        <h1>Seu próximo storefront começa com uma boa base.</h1>
        <OrbisSays>Sou Orbis, senhor. Escolha um tema, dite a identidade da sua marca e eu publico uma experiência pronta para vender.</OrbisSays>
        <a className="primary-button large" href="/signin-with-chatgpt?return_to=%2F">Começar agora <ArrowRight size={17} /></a>
      </section>
      <div className="public-feature-row">
        <div><span>01</span><strong>Escolha</strong><p>Abra o ShrinePro livremente; eu acompanho cada passo, senhor.</p></div>
        <div><span>02</span><strong>Personalize</strong><p>Cores, texto, fontes e espaçamento obedecem no mesmo instante.</p></div>
        <div><span>03</span><strong>Publique</strong><p>Guardo versões e compartilho seu projeto com segurança.</p></div>
      </div>
    </main>
  );
}

function ExtractThemeView({ onImported }: { onImported: (payload: { data: BootstrapData; themeId: string; summary: ShopifyThemeImport["summary"]; compatibility: ShopifyThemeImport["compatibility"] }) => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importing) return;
    const interval = window.setInterval(() => setProgressStep((current) => Math.min(3, current + 1)), 850);
    return () => window.clearInterval(interval);
  }, [importing]);

  function choose(next: File | undefined) {
    setError(null);
    if (!next) return;
    if (!next.name.toLowerCase().endsWith(".zip")) { setFile(null); setError("Senhor, entregue-me um arquivo ZIP exportado pela Shopify."); return; }
    if (next.size > 100 * 1024 * 1024) { setFile(null); setError("O ZIP pode ter no máximo 100 MB, senhor."); return; }
    setFile(next);
    void loadTheme(next);
  }

  async function loadTheme(selectedFile: File | null = file) {
    if (!selectedFile || importing) return;
    setProgressStep(0);
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      let response: Response;
      try {
        response = await fetch("/api/theme-import", { method: "POST", body: formData });
      } catch {
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        const retryFormData = new FormData();
        retryFormData.append("file", selectedFile);
        response = await fetch("/api/theme-import", { method: "POST", body: retryFormData });
      }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "SHOPIFY_IMPORT_FAILED");
      onImported(payload);
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "SHOPIFY_IMPORT_FAILED";
      setError(shopifyImportError(message));
    } finally {
      setImporting(false);
    }
  }

  return <div className="content-wrap page-view extract-view">
    <PageIntro eyebrow="IMPORTAR · 02" title="Entregue-me o tema, senhor." body="Escolha o ZIP uma única vez. Eu encontro o tema dentro do pacote, instalo banners, imagens e todos os recursos, e abro a prévia da loja pronta para o senhor editar." />
    <div className={`theme-dropzone ${dragging ? "dragging" : ""} ${file ? "has-file" : ""} ${importing ? "loading-theme" : ""}`} onDragEnter={(event) => { event.preventDefault(); if (!importing) setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (!importing) choose(event.dataTransfer.files[0]); }}>
      <Orbis className="orbis-sm" girando={importing} />
      <span className="eyebrow">ORBIS · CARREGAMENTO AUTOMÁTICO</span>
      <h2>{file ? file.name : "Deposite o tema aqui, senhor"}</h2>
      <p>{importing ? ["Recebendo o pacote, senhor…", "Localizando o tema verdadeiro…", "Instalando banners, imagens e recursos…", "Erguendo a prévia da loja…"][progressStep] : file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · selecione novamente para reinstalar` : "Aceito qualquer ZIP válido de tema Shopify — inclusive pacotes com outros ZIPs dentro."}</p>
      <label className={`secondary-button ${importing ? "disabled" : ""}`}><Upload size={16} /> {importing ? "Carregando…" : file ? "Trocar arquivo" : "Selecionar ZIP"}<input disabled={importing} type="file" accept=".zip,application/zip" onChange={(event) => choose(event.target.files?.[0])} /></label>
      {importing && <div className="theme-load-progress" role="status" aria-live="polite">{["Pacote", "Tema", "Instalação", "Prévia"].map((label, index) => <span key={label} className={index < progressStep ? "done" : index === progressStep ? "active" : ""}><i>{index < progressStep ? <Check size={10} /> : String(index + 1).padStart(2, "0")}</i>{label}</span>)}</div>}
      {error && <div className="extract-error" role="alert"><CircleAlert size={15} /><span>{error}</span><button onClick={() => void loadTheme()}>Tentar novamente</button></div>}
    </div>
    <div className="extract-details">
      <div><span>01</span><b>Faro apurado</b><p>Abro pacotes aninhados e encontro sozinho o ZIP instalável do tema, senhor.</p></div>
      <div><span>02</span><b>Instalação completa</b><p>Instalo banners, imagens, logo e recursos do tema, e ergo todas as páginas da loja com eles.</p></div>
      <div><span>03</span><b>Editor como na Shopify</b><p>Páginas e seções à esquerda, loja no centro e ajustes à direita, como o senhor merece.</p></div>
    </div>
    <div className="extract-actions"><span>O carregamento começa no instante em que o senhor escolher o ZIP.</span></div>
  </div>;
}

function Dashboard({ data, onNavigate, onEdit }: { data: BootstrapData; onNavigate: (tab: Tab) => void; onEdit: (id: string) => void }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const recentProject = data.projects[0];
  return (
    <div className="content-wrap dashboard-view">
      <section className="hero-panel grid-surface">
        <Orbis className="orbis-hero" />
        <div className="hero-copy">
          <span className="eyebrow">ORBIS · SYS.ONLINE</span>
          <h1>{greeting}, meu senhor.<br />O que colocaremos no ar?</h1>
          <OrbisSays>Às suas ordens. Escolha um tema pronto, dite a identidade da sua marca e eu cuidarei de cada versão para o senhor — tudo em um só lugar.</OrbisSays>
          <div className="hero-actions"><button className="primary-button large" onClick={() => onNavigate("themes")}>Explorar temas <ArrowRight size={17} /></button>{recentProject && <button className="text-button" onClick={() => onEdit(recentProject.id)}>Continuar edição <ArrowUpRight size={16} /></button>}</div>
        </div>
      </section>

      <section className="metric-row" aria-label="Resumo da conta">
        <Metric index="01" label="ACESSO" value="LIVRE" detail="Sob minha vigília, sem bloqueio" icon={Monitor} />
        <Metric index="02" label="PROJETOS" value={String(data.projects.length).padStart(2, "0")} detail={`${data.projects.filter((project) => project.status === "published").length} publicados`} icon={FolderKanban} />
        <Metric index="03" label="TEMAS" value={String(data.themes.length).padStart(2, "0")} detail="Incluindo ShrinePro" icon={LayoutTemplate} />
      </section>

      <section className="section-block">
        <div className="section-heading"><div><span className="eyebrow">PRÓXIMOS PASSOS</span><h2>Permita-me guiá-lo.</h2></div><button className="text-button" onClick={() => onNavigate("themes")}>Ver galeria <ArrowRight size={15} /></button></div>
        <div className="flow-grid">
          <FlowCard index="01" icon={Eye} title="Teste o tema" body="Abra a prévia, alterne o dispositivo e contemple o visual completo, senhor." onClick={() => onNavigate("themes")} />
          <FlowCard index="02" icon={Palette} title="Dê a sua cara" body="Cores, tipografia, textos e espaçamentos: atualizo tudo no mesmo instante." onClick={() => recentProject ? onEdit(recentProject.id) : onNavigate("themes")} />
          <FlowCard index="03" icon={Globe2} title="Publique" body="Guardo versões e disponibilizo um link quando o senhor ordenar." onClick={() => onNavigate("projects")} />
        </div>
      </section>

      {recentProject && <section className="section-block recent-section">
        <div className="section-heading"><div><span className="eyebrow">ÚLTIMA EDIÇÃO</span><h2>Continue de onde paramos, senhor.</h2></div></div>
        <ProjectRow project={recentProject} onEdit={() => onEdit(recentProject.id)} />
      </section>}
    </div>
  );
}

function Metric({ index, label, value, detail, icon: Icon }: { index: string; label: string; value: string; detail: string; icon: typeof Home }) {
  return <article className="metric-card"><div className="metric-top"><span>{index}</span><Icon size={17} /></div><small>{label}</small><strong>{value}</strong><p>{detail}</p></article>;
}

function FlowCard({ index, icon: Icon, title, body, onClick }: { index: string; icon: typeof Home; title: string; body: string; onClick: () => void }) {
  return <button type="button" className="flow-card" onClick={onClick}><div><span>{index}</span><Icon size={17} /></div><h3>{title}</h3><p>{body}</p><ChevronRight size={17} className="flow-arrow" /></button>;
}

function ThemesView({ data, onPreview, onUse, onFavorite, onDelete, busy }: { data: BootstrapData; onPreview: (theme: Theme) => void; onUse: (theme: Theme) => void; onFavorite: (id: string, favorite: boolean) => void; onDelete: (id: string) => Promise<void>; busy: string | null }) {
  const [deleteTarget, setDeleteTarget] = useState<Theme | null>(null);
  return (
    <div className="content-wrap page-view">
      <PageIntro eyebrow="TEMAS · 03" title="Sua coleção, senhor." body="Cada tema que o senhor me confia aparece aqui com suas páginas, seções, recursos e configurações." />
      {data.themes.length ? <div className={data.themes.length === 1 ? "single-theme-grid" : "theme-grid imported-theme-grid"}>{data.themes.map((theme, index) => <ThemeCard key={theme.id} theme={theme} index={index} favorite={data.favorites.includes(theme.id)} onPreview={() => onPreview(theme)} onUse={() => onUse(theme)} onFavorite={() => onFavorite(theme.id, !data.favorites.includes(theme.id))} onDelete={() => setDeleteTarget(theme)} deleting={busy === "deleteTheme"} />)}</div> : <EmptyState icon={LayoutTemplate} title="Nenhum tema sob minha guarda" body="Senhor, entregue-me um ZIP em Importar temas e eu cuidarei do resto." />}
      {deleteTarget && <Modal title="Apagar tema?" onClose={() => busy !== "deleteTheme" && setDeleteTarget(null)}><div className="delete-summary"><div className="delete-icon"><Trash2 size={23} /></div><p>Senhor, o tema <strong>{deleteTarget.name}</strong> e todos os projetos ligados a ele serão removidos deste computador. Poderei recebê-lo novamente em <strong>Importar temas</strong>.</p></div><div className="modal-actions"><button className="secondary-button" disabled={busy === "deleteTheme"} onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="danger-button" disabled={busy === "deleteTheme"} onClick={() => { const theme = deleteTarget; void onDelete(theme.id).then(() => setDeleteTarget(null)); }}>{busy === "deleteTheme" ? "Apagando…" : "Apagar tema"}</button></div></Modal>}
    </div>
  );
}

function ThemeCard({ theme, index, favorite, onPreview, onUse, onFavorite, onDelete, deleting }: { theme: Theme; index: number; favorite: boolean; onPreview: () => void; onUse: () => void; onFavorite: () => void; onDelete: () => void; deleting: boolean }) {
  const palette = normalizeCustomization(theme.defaultSettings);
  const shopifyData = palette.shopify as ShopifyThemeImport | null;
  const photo = shopifyData?.assetPreview;
  return (
    <article className={`theme-card ${theme.featured ? "featured" : ""}`}>
      <div className={`theme-visual ${photo ? "theme-visual-photo" : ""}`} style={{ "--preview-primary": palette.hero.accentColor, "--preview-bg": palette.hero.background, "--preview-text": palette.hero.textColor } as React.CSSProperties}>
        {photo ? <img src={photo} alt={`Prévia real do tema ${theme.name}`} /> : <>
          <div className="mini-browser"><span /><span /><span /><i /></div>
          <div className="mini-store"><b>{palette.header.brand}</b><div className="mini-links"><span /><span /><span /></div><div className="mini-hero"><em /><div><strong /><small /><button /></div></div><div className="mini-products"><span /><span /><span /></div></div>
        </>}
        <button className={`favorite-button ${favorite ? "active" : ""}`} onClick={onFavorite} aria-label={favorite ? `Remover ${theme.name} dos favoritos` : `Favoritar ${theme.name}`}><Heart size={16} fill={favorite ? "currentColor" : "none"} /></button>
        {theme.badge && <span className="theme-badge">{theme.badge}</span>}
      </div>
      <div className="theme-card-body">
        <div className="theme-meta"><span>{String(index + 1).padStart(2, "0")}</span><span>{theme.category}</span><span>v{theme.version}</span></div>
        <div className="theme-title-row"><h2>{theme.name}</h2><span><Check size={14} /> LIVRE</span></div>
        <p>{theme.description}</p>
        <div className="theme-facts"><span>{theme.sectionCount} seções</span><span>{theme.languages.join(" · ")}</span></div>
        <div className="card-actions"><button className="secondary-button" onClick={onPreview}><Eye size={15} /> Visualizar</button><button className="primary-button" onClick={onUse}>Editar tema <ArrowUpRight size={15} /></button><button className="icon-button delete-theme-button" onClick={onDelete} disabled={deleting} aria-label={`Apagar ${theme.name}`} title="Apagar tema"><Trash2 size={16} /></button></div>
      </div>
    </article>
  );
}

function ThemeModalPreview({ theme }: { theme: Theme }) {
  const customization = normalizeCustomization(theme.defaultSettings);
  const shopify = customization.shopify as ShopifyThemeImport | null;
  const [pageId, setPageId] = useState("index");
  const page = shopify?.pages.find((item) => item.id === pageId) ?? shopify?.pages.find((item) => item.id === "index") ?? shopify?.pages[0];
  return shopify && page ? <ShopifyLiveRender shopify={shopify} pageId={page.id} fallback={<ShopifyStorePreview theme={shopify} page={page} device="desktop" selectedSectionId="" onSelectSection={() => undefined} onNavigatePage={setPageId} />} /> : <StorefrontPreview customization={customization} device="desktop" />;
}

function ProjectsView({ data, onCreate, onEdit, onAction, busy }: { data: BootstrapData; onCreate: () => void; onEdit: (id: string) => void; onAction: (payload: Record<string, unknown>, message: string) => Promise<void>; busy: string | null }) {
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  return (
    <div className="content-wrap page-view">
      <div className="page-intro-row"><PageIntro eyebrow="PROJETOS · 04" title="Sob minha guarda, senhor." body="Cada projeto mantém suas personalizações e pode ganhar novas versões sem afetar os demais. Eu vigio todos." /><button className="primary-button" onClick={onCreate}><Plus size={16} /> Novo projeto</button></div>
      {data.projects.length ? <div className="projects-list">{data.projects.map((project) => (
        <ProjectRow key={project.id} project={project} onEdit={() => onEdit(project.id)} onDelete={() => setDeleteTarget(project)} onDuplicate={() => void onAction({ action: "duplicateProject", projectId: project.id }, "Projeto duplicado, senhor.")} onPublish={() => void onAction({ action: "publishProject", projectId: project.id }, "Publicado, senhor. Como ordenou.")} busy={busy} />
      ))}</div> : <EmptyState icon={PackageOpen} title="Nenhum projeto ainda" body="Escolha um tema na galeria, senhor, e eu prepararei seu primeiro projeto." />}
      {deleteTarget && <Modal title="Apagar projeto?" onClose={() => busy !== "deleteProject" && setDeleteTarget(null)}><div className="delete-summary"><div className="delete-icon"><Trash2 size={23} /></div><p>Senhor, o projeto <strong>{deleteTarget.name}</strong> e suas versões serão removidos deste computador.</p></div><div className="modal-actions"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>Cancelar</button><button className="danger-button" disabled={busy === "deleteProject"} onClick={() => { const project = deleteTarget; setDeleteTarget(null); void onAction({ action: "deleteProject", projectId: project.id }, "Projeto apagado, senhor."); }}>{busy === "deleteProject" ? "Apagando…" : "Apagar projeto"}</button></div></Modal>}
    </div>
  );
}

function ProjectRow({ project, onEdit, onDelete, onDuplicate, onPublish, busy }: { project: Project; onEdit: () => void; onDelete?: () => void; onDuplicate?: () => void; onPublish?: () => void; busy?: string | null }) {
  const palette = normalizeCustomization(project.customization);
  return (
    <article className="project-row">
      <div className="project-thumb" style={{ "--project-color": palette.hero.accentColor, "--project-bg": palette.hero.background } as React.CSSProperties}><span /><span /><span /></div>
      <div className="project-info"><div><span className={`status status-${project.status}`}>{statusLabel(project.status)}</span><span>{project.themeName}</span></div><h3>{project.name}</h3><p>Atualizado {formatRelative(project.updatedAt)}</p></div>
      <div className="project-actions"><button className="primary-button" onClick={onEdit}>Editar <ArrowRight size={15} /></button>{onDelete && <button className="icon-button delete-project-button" onClick={onDelete} aria-label={`Apagar ${project.name}`} title="Apagar projeto"><Trash2 size={16} /></button>}{onDuplicate && <button className="icon-button" onClick={onDuplicate} disabled={busy === "duplicateProject"} aria-label={`Duplicar ${project.name}`}><Copy size={16} /></button>}{onPublish && project.status !== "published" && <button className="icon-button" onClick={onPublish} disabled={busy === "publishProject"} aria-label={`Publicar ${project.name}`}><Globe2 size={16} /></button>}</div>
    </article>
  );
}

type StorePage = "home" | "product" | "collection" | "search" | "cart" | "blog";
type SectionKey = Exclude<keyof Customization, "shopify">;
type EditableValue = unknown;

const EDITOR_PAGES: Array<{ id: StorePage; label: string; sections: SectionKey[] }> = [
  { id: "home", label: "Página inicial", sections: ["announcement", "header", "hero", "benefits", "products", "bundle", "comparison", "testimonials", "faq", "newsletter", "footer"] },
  { id: "product", label: "Produto", sections: ["announcement", "header", "productPage", "bundle", "benefits", "testimonials", "faq", "footer"] },
  { id: "collection", label: "Coleção", sections: ["announcement", "header", "collection", "products", "newsletter", "footer"] },
  { id: "search", label: "Pesquisa", sections: ["header", "search", "footer"] },
  { id: "cart", label: "Carrinho", sections: ["announcement", "header", "cart", "footer"] },
  { id: "blog", label: "Blog", sections: ["announcement", "header", "blog", "newsletter", "footer"] },
];

const SECTION_LABELS: Record<SectionKey, string> = {
  global: "Design global",
  announcement: "Anúncio",
  header: "Cabeçalho",
  hero: "Hero",
  benefits: "Benefícios",
  products: "Mais vendidos",
  bundle: "Compre junto",
  comparison: "Comparação",
  testimonials: "Depoimentos",
  faq: "FAQ",
  newsletter: "Newsletter",
  footer: "Rodapé",
  search: "Pesquisa",
  productPage: "Produto principal",
  collection: "Cabeçalho da coleção",
  cart: "Carrinho",
  blog: "Cabeçalho do blog",
};

const PAGE_PRIMARY_SECTION: Record<StorePage, SectionKey> = {
  home: "hero", product: "productPage", collection: "collection", search: "search", cart: "cart", blog: "blog",
};

function EditorView({ project, onChooseProject, onDataChange, onMessage }: { project: Project | null; onChooseProject: () => void; onDataChange: () => Promise<void>; onMessage: (message: string) => void }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [page, setPage] = useState<StorePage>("home");
  const [selectedSection, setSelectedSection] = useState<SectionKey>("hero");
  const [shopifyPageId, setShopifyPageId] = useState("index");
  const [shopifySectionId, setShopifySectionId] = useState("__global__");
  const [draft, setDraft] = useState<Customization>(() => normalizeCustomization(project?.customization));
  const draftRef = useRef(draft);
  const [past, setPast] = useState<Customization[]>([]);
  const [future, setFuture] = useState<Customization[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [exporting, setExporting] = useState(false);
  const [zoom, setZoom] = useState(1);
  /**
   * Qual painel o celular mostra.
   *
   * No desktop os três convivem lado a lado; numa tela de 390px não cabem, e a
   * saída antiga era esconder a árvore de seções — ou seja, tirar do telefone
   * justamente a peça que escolhe o que editar. Aqui eles viram abas: tudo
   * continua alcançável, um de cada vez. Acima de 860px a classe é ignorada.
   */
  const [painelMobile, setPainelMobile] = useState<"estrutura" | "previa" | "ajustes">("previa");
  const lastSaved = useRef(JSON.stringify(normalizeCustomization(project?.customization)));

  useEffect(() => {
    if (!project || JSON.stringify(draft) === lastSaved.current) return;
    setSaveState("saving");
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "saveProject", projectId: project.id, customization: draft }) });
        if (!response.ok) throw new Error("SAVE_FAILED");
        lastSaved.current = JSON.stringify(draft);
        setSaveState("saved");
      } catch { setSaveState("error"); }
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [draft, project]);

  if (!project) return <div className="editor-empty"><EmptyState icon={SlidersHorizontal} title="Crie seu projeto, senhor" body="Abra o ShrinePro na área Temas e eu montarei tudo para o senhor." /><button className="primary-button" onClick={onChooseProject}>Ver projetos</button></div>;

  function update(path: string[], value: EditableValue) {
    const current = draftRef.current;
    const previousValue = getValueAtPath(current, path);
    if (sameEditableValue(previousValue, value)) return;
    const next = setValueAtPath(current, path, value);
    draftRef.current = next;
    setPast((items) => [...items.slice(-29), current]);
    setFuture([]);
    setDraft(next);
  }

  function undo() {
    const previous = past[past.length - 1];
    if (!previous) return;
    setFuture((items) => [draftRef.current, ...items]);
    setPast((items) => items.slice(0, -1));
    draftRef.current = previous;
    setDraft(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setPast((items) => [...items, draftRef.current]);
    setFuture((items) => items.slice(1));
    draftRef.current = next;
    setDraft(next);
  }

  async function createVersionSnapshot() {
    if (!project) return;
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "createVersion", projectId: project.id, label: `Versão de ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` }) });
    if (response.ok) onMessage("Versão registrada, senhor.");
  }

  async function publish() {
    if (!project) return;
    const response = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publishProject", projectId: project.id }) });
    if (response.ok) { onMessage("Publicado, senhor. Como ordenou."); await onDataChange(); }
  }

  const currentPage = EDITOR_PAGES.find((item) => item.id === page) ?? EDITOR_PAGES[0];
  const shopify = draft.shopify as ShopifyThemeImport | null;
  const shopifyPageIndex = shopify?.pages.findIndex((item) => item.id === shopifyPageId) ?? -1;
  const activeShopifyPage = shopify?.pages[shopifyPageIndex >= 0 ? shopifyPageIndex : 0];
  const activeShopifyPageIndex = shopifyPageIndex >= 0 ? shopifyPageIndex : 0;
  /* A seção selecionada pode estar no template atual OU nos grupos globais (cabeçalho/rodapé/overlay). */
  const locatedSection = (() => {
    if (!shopify) return null;
    for (const [pageIdx, candidate] of shopify.pages.entries()) {
      const sectionIdx = candidate.sections.findIndex((item) => item.id === shopifySectionId);
      if (sectionIdx >= 0) return { pageIndex: pageIdx, sectionIndex: sectionIdx, section: candidate.sections[sectionIdx], pageId: candidate.id };
    }
    return null;
  })();
  const activeShopifySectionIndex = locatedSection?.sectionIndex ?? -1;
  const activeShopifySection = locatedSection?.section;
  const activeSectionPageIndex = locatedSection?.pageIndex ?? activeShopifyPageIndex;


  function pageBundle(pageId: string) {
    const pageIdx = shopify?.pages.findIndex((item) => item.id === pageId) ?? -1;
    const bundle = pageIdx >= 0 ? shopify?.pages[pageIdx] : undefined;
    return { pageIdx, sections: bundle?.sections ?? [], path: ["shopify", "pages", String(pageIdx), "sections"] };
  }
  function moveShopifySection(pageId: string, index: number, direction: -1 | 1) {
    const { pageIdx, sections: current, path } = pageBundle(pageId);
    if (pageIdx < 0) return;
    const sections = [...current];
    const target = index + direction;
    if (target < 0 || target >= sections.length) return;
    [sections[index], sections[target]] = [sections[target], sections[index]];
    update(path, sections);
  }
  function duplicateShopifySection(pageId: string, index: number) {
    const { pageIdx, sections: current, path } = pageBundle(pageId);
    const source = current[index];
    if (pageIdx < 0 || !source) return;
    const id = `section-${crypto.randomUUID()}`;
    const clone: ShopifySectionInstance = structuredClone({ ...source, id, blocks: source.blocks.map((block, blockIndex) => ({ ...block, id: `block-${crypto.randomUUID()}-${blockIndex}` })) });
    const sections = [...current];
    sections.splice(index + 1, 0, clone);
    update(path, sections);
    setShopifySectionId(id);
  }
  function removeShopifySection(pageId: string, index: number) {
    const { pageIdx, sections: current, path } = pageBundle(pageId);
    const target = current[index];
    if (pageIdx < 0 || !target || !window.confirm(`Remover a seção "${target.name}", senhor? O original no ZIP permanece intacto até a exportação.`)) return;
    const sections = current.filter((_, itemIndex) => itemIndex !== index);
    update(path, sections);
    setShopifySectionId(sections[Math.max(0, index - 1)]?.id ?? "__global__");
  }
  function toggleShopifySection(pageId: string, index: number) {
    const { pageIdx, sections: current, path } = pageBundle(pageId);
    if (pageIdx < 0) return;
    update([...path, String(index), "disabled"], !current[index]?.disabled);
  }
  function addShopifySectionTo(pageId: string, type: string) {
    const { pageIdx, sections: current, path } = pageBundle(pageId);
    if (!shopify || pageIdx < 0) return;
    const schema = shopify.sectionSchemas.find((item) => item.type === type);
    if (!schema) return;
    const id = `section-${crypto.randomUUID()}`;
    const preset = schema.presets?.[0];
    const settings = { ...Object.fromEntries(schema.settings.filter((setting) => setting.default !== undefined).map((setting) => [setting.id, setting.default])), ...(preset?.settings ?? {}) } as Record<string, ShopifyValue>;
    const blocks = (preset?.blocks ?? []).map((block, index) => ({ id: `block-${crypto.randomUUID()}-${index}`, type: block.type, settings: block.settings }));
    update(path, [...current, { id, type, name: schema.name, settings, blocks }]);
    setShopifySectionId(id);
  }
  const sectionsPath = ["shopify", "pages", String(activeSectionPageIndex), "sections"];
  function addShopifyBlock(type: string) {
    if (!shopify || !activeShopifyPage || activeShopifySectionIndex < 0 || !activeShopifySection) return;
    const schema = shopify.sectionSchemas.find((item) => item.type === activeShopifySection.type);
    const blockSchema = schema?.blocks.find((item) => item.type === type);
    if (!blockSchema) return;
    if (schema?.maxBlocks && activeShopifySection.blocks.length >= schema.maxBlocks) { onMessage(`Limite de ${schema.maxBlocks} blocos atingido nesta seção, senhor.`); return; }
    const settings = Object.fromEntries(blockSchema.settings.filter((setting) => setting.default !== undefined).map((setting) => [setting.id, setting.default])) as Record<string, ShopifyValue>;
    update([...sectionsPath, String(activeShopifySectionIndex), "blocks"], [...activeShopifySection.blocks, { id: `block-${crypto.randomUUID()}`, type, settings }]);
  }
  function moveShopifyBlock(blockIndex: number, direction: -1 | 1) {
    if (!activeShopifySection || activeShopifySectionIndex < 0) return;
    const blocks = [...activeShopifySection.blocks];
    const target = blockIndex + direction;
    if (target < 0 || target >= blocks.length) return;
    [blocks[blockIndex], blocks[target]] = [blocks[target], blocks[blockIndex]];
    update([...sectionsPath, String(activeShopifySectionIndex), "blocks"], blocks);
  }
  function duplicateShopifyBlock(blockIndex: number) {
    if (!shopify || !activeShopifySection || activeShopifySectionIndex < 0) return;
    const schema = shopify.sectionSchemas.find((item) => item.type === activeShopifySection.type);
    if (schema?.maxBlocks && activeShopifySection.blocks.length >= schema.maxBlocks) { onMessage(`Limite de ${schema.maxBlocks} blocos atingido nesta seção, senhor.`); return; }
    const source = activeShopifySection.blocks[blockIndex];
    if (!source) return;
    const blocks = [...activeShopifySection.blocks];
    blocks.splice(blockIndex + 1, 0, structuredClone({ ...source, id: `block-${crypto.randomUUID()}` }));
    update([...sectionsPath, String(activeShopifySectionIndex), "blocks"], blocks);
  }
  function removeShopifyBlock(blockIndex: number) {
    if (!activeShopifySection || activeShopifySectionIndex < 0) return;
    const target = activeShopifySection.blocks[blockIndex];
    if (!target || !window.confirm(`Remover o bloco "${humanizeShopify(target.type)}", senhor?`)) return;
    update([...sectionsPath, String(activeShopifySectionIndex), "blocks"], activeShopifySection.blocks.filter((_, itemIndex) => itemIndex !== blockIndex));
  }

  async function exportThemeZipFile() {
    if (!shopify || exporting) return;
    setExporting(true);
    try {
      const response = await fetch("/api/theme-export", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ shopify: draftRef.current.shopify, filename: project?.name }) });
      if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error((payload as { error?: string }).error ?? "EXPORT_FAILED"); }
      const header = (name: string) => JSON.parse(decodeURIComponent(response.headers.get(name) ?? "%5B%5D")) as string[];
      const modified = header("x-modified-files");
      const warnings = header("x-export-warnings");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(project?.name ?? "tema").replace(/[^\w.-]+/g, "-")}-orbis.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      const imagens = modified.filter((path) => path.startsWith("assets/")).length;
      const nota = imagens
        ? ` ${imagens} imagem(ns) que o senhor enviou viajaram como arquivo em assets/. Na Shopify elas precisam ser reenviadas em Arquivos ou reescolhidas no editor.`
        : "";
      const alerta = warnings.length ? ` Atenção: ${warnings.slice(0, 2).join("; ")}.` : "";
      onMessage(`ZIP exportado, senhor: ${modified.length} arquivo(s) atualizado(s), o restante preservado byte a byte.${nota}${alerta}`);
    } catch {
      onMessage("Perdoe-me, senhor. Não consegui exportar. O ZIP original do tema precisa estar preservado no armazenamento.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="editor-shell">
      <div className="editor-toolbar">
        <div className="editor-project"><span className="status status-editing">EM EDIÇÃO</span><strong>{project.name}</strong></div>
        <div className="device-switch" aria-label="Largura da prévia">{([{ id: "desktop", icon: Monitor, label: "Desktop" }, { id: "tablet", icon: Tablet, label: "Tablet" }, { id: "mobile", icon: Smartphone, label: "Celular" }] as const).map(({ id, icon: Icon, label }) => <button key={id} className={device === id ? "active" : ""} onClick={() => setDevice(id)} aria-label={label} title={label}><Icon size={16} /></button>)}</div>
        <div className="editor-controls"><button className="icon-button" onClick={undo} disabled={!past.length} aria-label="Desfazer"><Undo2 size={16} /></button><button className="icon-button" onClick={redo} disabled={!future.length} aria-label="Refazer"><Redo2 size={16} /></button><span className={`save-state ${saveState}`}><span />{saveState === "saving" ? "Guardando, senhor…" : saveState === "error" ? "Falhei ao guardar, senhor" : "Guardado, senhor"}</span>{shopify && <>
          <select className="zoom-select" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} aria-label="Zoom da prévia"><option value={0.5}>50%</option><option value={0.75}>75%</option><option value={1}>100%</option></select>
          <button className="icon-button" onClick={() => window.open(`/api/theme-render?themeId=${project.themeId}&page=${shopifyPageId}`, "_blank", "noopener")} aria-label="Abrir prévia em nova aba" title="Abrir prévia em nova aba (versão salva do tema)"><ArrowUpRight size={16} /></button>
          <button className="secondary-button" onClick={() => void exportThemeZipFile()} disabled={exporting || !shopify.compatibility?.preservedSource} title={shopify.compatibility?.preservedSource ? "Exportar ZIP instalável com suas edições" : "Indisponível: o ZIP original não foi preservado"}><FileArchive size={15} /> {exporting ? "Exportando…" : "Exportar ZIP"}</button>
        </>}<button className="secondary-button" onClick={createVersionSnapshot}><Save size={15} /> Criar versão</button><button className="primary-button" onClick={publish}><Globe2 size={15} /> Publicar</button></div>
      </div>
      <div className="editor-tabs" role="tablist" aria-label="Painéis do editor">
        {([["estrutura", "Seções"], ["previa", "Prévia"], ["ajustes", "Ajustes"]] as const).map(([id, label]) => (
          <button key={id} role="tab" aria-selected={painelMobile === id} className={painelMobile === id ? "active" : ""} onClick={() => setPainelMobile(id)}>{label}</button>
        ))}
      </div>
      <div className={`editor-body mobile-${painelMobile}`}>
        {shopify && activeShopifyPage ? <>
          <ShopifyStructurePanel theme={shopify} page={activeShopifyPage} selectedSectionId={shopifySectionId} onPageChange={(nextId) => { setShopifyPageId(nextId); const nextPage = shopify.pages.find((item) => item.id === nextId); setShopifySectionId(nextPage?.sections[0]?.id ?? "__global__"); }} onSelectSection={(nextSectionId) => { setShopifySectionId(nextSectionId); setPainelMobile("ajustes"); }} onAddSection={addShopifySectionTo} onMoveSection={moveShopifySection} onDuplicateSection={duplicateShopifySection} onRemoveSection={removeShopifySection} onToggleSection={toggleShopifySection} onAddBlock={addShopifyBlock} onMoveBlock={moveShopifyBlock} onDuplicateBlock={duplicateShopifyBlock} onRemoveBlock={removeShopifyBlock} />
          <div className="preview-stage"><div className={`preview-frame preview-${device}`} style={{ zoom }}><ShopifyLiveRender shopify={shopify} pageId={shopifyPageId} onSelectSection={setShopifySectionId} fallback={<ShopifyStorePreview theme={shopify} page={activeShopifyPage} device={device} selectedSectionId={shopifySectionId} onSelectSection={(nextSectionId, ownerPageId) => { if (ownerPageId && ownerPageId !== shopifyPageId) setShopifyPageId(ownerPageId); setShopifySectionId(nextSectionId); }} onNavigatePage={(nextPageId) => { setShopifyPageId(nextPageId); const nextPage = shopify.pages.find((item) => item.id === nextPageId); setShopifySectionId(nextPage?.sections[0]?.id ?? "__global__"); }} />} /></div></div>
          <aside className="properties-panel">
            <div className="panel-heading"><span>{shopifySectionId === "__global__" ? "CONFIGURAÇÕES DO TEMA" : (activeShopifySection?.name ?? "SEÇÃO").toUpperCase()}</span><PanelRight size={15} /></div>
            <ShopifyProperties theme={shopify} pageIndex={activeSectionPageIndex} section={activeShopifySection} sectionIndex={activeShopifySectionIndex} global={shopifySectionId === "__global__"} update={update} />
          </aside>
        </> : <>
          <aside className="structure-panel">
            <div className="panel-heading"><span>PÁGINAS E SEÇÕES</span><Layers3 size={15} /></div>
            <label className="editor-page-select"><span>Página do tema</span><select value={page} onChange={(event) => { const next = event.target.value as StorePage; setPage(next); setSelectedSection(PAGE_PRIMARY_SECTION[next]); }}>{EDITOR_PAGES.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <button className={`global-settings-button ${selectedSection === "global" ? "selected" : ""}`} onClick={() => setSelectedSection("global")}><Settings2 size={14} /><b>Design global</b><ChevronRight size={13} /></button>
            <div className="section-list">{currentPage.sections.map((section, index) => <button className={selectedSection === section ? "selected" : ""} key={section} onClick={() => { setSelectedSection(section); setPainelMobile("ajustes"); }}><span>{String(index + 1).padStart(2, "0")}</span><Layers3 size={14} /><b>{SECTION_LABELS[section]}</b><Eye size={13} /></button>)}</div>
            <p className="structure-hint">Cada item controla somente a sua seção original no ShrinePro.</p>
          </aside>
          <div className="preview-stage"><div className={`preview-frame preview-${device}`}><StorefrontPreview customization={draft} device={device} page={page} selectedSection={selectedSection} onSelectSection={setSelectedSection} onNavigatePage={(next) => { setPage(next); setSelectedSection(PAGE_PRIMARY_SECTION[next]); }} /></div></div>
          <aside className="properties-panel">
            <div className="panel-heading"><span>{SECTION_LABELS[selectedSection].toUpperCase()}</span><PanelRight size={15} /></div>
            <SectionProperties customization={draft} section={selectedSection} update={update} />
          </aside>
        </>}
      </div>
    </div>
  );
}

/** A seção pode ser adicionada nesta página, segundo enabled_on/disabled_on do schema? */
function sectionAllowedOnPage(schema: ShopifySectionSchema, page: ShopifyPage) {
  const base = page.id.split(".")[0];
  const isGroup = page.id.includes("-group");
  const groupKind = page.id.startsWith("header") ? "header" : page.id.startsWith("footer") ? "footer" : base;
  if (schema.enabledOn) {
    if (isGroup) return schema.enabledOn.groups?.includes(groupKind) ?? false;
    return schema.enabledOn.templates ? schema.enabledOn.templates.includes(base) || schema.enabledOn.templates.includes("*") : true;
  }
  if (schema.disabledOn) {
    if (isGroup && (schema.disabledOn.groups?.includes(groupKind) || schema.disabledOn.groups?.includes("*"))) return false;
    if (!isGroup && (schema.disabledOn.templates?.includes(base) || schema.disabledOn.templates?.includes("*"))) return false;
  }
  return true;
}

function ShopifyStructurePanel({ theme, page, selectedSectionId, onPageChange, onSelectSection, onAddSection, onMoveSection, onDuplicateSection, onRemoveSection, onToggleSection, onAddBlock, onMoveBlock, onDuplicateBlock, onRemoveBlock }: { theme: ShopifyThemeImport; page: ShopifyPage; selectedSectionId: string; onPageChange: (id: string) => void; onSelectSection: (id: string) => void; onAddSection: (pageId: string, type: string) => void; onMoveSection: (pageId: string, index: number, direction: -1 | 1) => void; onDuplicateSection: (pageId: string, index: number) => void; onRemoveSection: (pageId: string, index: number) => void; onToggleSection: (pageId: string, index: number) => void; onAddBlock: (type: string) => void; onMoveBlock: (blockIndex: number, direction: -1 | 1) => void; onDuplicateBlock: (blockIndex: number) => void; onRemoveBlock: (blockIndex: number) => void }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newSectionType, setNewSectionType] = useState("");
  const [newBlockType, setNewBlockType] = useState("");
  const isGroupPage = (id: string) => id.includes("-group");
  const headerPage = theme.pages.find((item) => item.id.startsWith("header-group"));
  const overlayPage = theme.pages.find((item) => item.id.startsWith("overlay-group"));
  const footerPage = theme.pages.find((item) => item.id.startsWith("footer-group"));
  const templatePage = isGroupPage(page.id) ? theme.pages.find((item) => item.id === "index") ?? page : page;
  const groups = [
    headerPage ? { label: "Cabeçalho", page: headerPage } : null,
    { label: "Modelo", page: templatePage },
    overlayPage ? { label: "Seções globais", page: overlayPage } : null,
    footerPage ? { label: "Rodapé", page: footerPage } : null,
  ].filter((group): group is { label: string; page: ShopifyPage } => Boolean(group));
  const templateOptions = theme.pages.filter((item) => !isGroupPage(item.id));

  function sectionRow(ownerPage: ShopifyPage, section: ShopifySectionInstance, index: number) {
    const schema = theme.sectionSchemas.find((item) => item.type === section.type);
    const isSelected = selectedSectionId === section.id;
    const hasBlocks = section.blocks.length > 0 || (schema?.blocks.length ?? 0) > 0;
    const isExpanded = expanded[section.id] || isSelected;
    const blockLimitReached = Boolean(schema?.maxBlocks && section.blocks.length >= schema.maxBlocks);
    return <div key={section.id} className="section-row">
      <div className="section-row-line">
        {hasBlocks ? <button className={`tree-chevron ${isExpanded ? "open" : ""}`} onClick={() => setExpanded((current) => ({ ...current, [section.id]: !isExpanded }))} aria-label={isExpanded ? `Recolher ${section.name}` : `Expandir ${section.name}`}><ChevronRight size={12} /></button> : <span className="tree-chevron-spacer" />}
        <button className={`section-select ${isSelected ? "selected" : ""} ${section.disabled ? "section-disabled" : ""}`} onClick={() => onSelectSection(section.id)}><Layers3 size={13} /><b>{section.name}</b>{section.disabled && <span className="hidden-flag" title="Seção oculta">✕</span>}</button>
        <button className="row-eye" onClick={() => onToggleSection(ownerPage.id, index)} aria-label={section.disabled ? `Reexibir ${section.name}` : `Ocultar ${section.name}`} title={section.disabled ? "Reexibir" : "Ocultar"}><Eye size={12} /></button>
      </div>
      {isSelected && <div className="section-ops" role="toolbar" aria-label={`Ações da seção ${section.name}`}>
        <button onClick={() => onMoveSection(ownerPage.id, index, -1)} disabled={index === 0} aria-label="Mover seção para cima" title="Mover para cima"><ChevronRight size={12} style={{ transform: "rotate(-90deg)" }} /></button>
        <button onClick={() => onMoveSection(ownerPage.id, index, 1)} disabled={index === ownerPage.sections.length - 1} aria-label="Mover seção para baixo" title="Mover para baixo"><ChevronRight size={12} style={{ transform: "rotate(90deg)" }} /></button>
        <button onClick={() => onDuplicateSection(ownerPage.id, index)} aria-label="Duplicar seção" title="Duplicar"><Copy size={12} /></button>
        <button className="op-danger" onClick={() => onRemoveSection(ownerPage.id, index)} aria-label="Remover seção" title="Remover"><Trash2 size={12} /></button>
      </div>}
      {isExpanded && hasBlocks && <div className="block-list">
        {section.blocks.map((block, blockIndex) => <div key={block.id} className="block-row">
          <span><Layers3 size={11} /> {schema?.blocks.find((item) => item.type === block.type)?.name ?? humanizeShopify(block.type)}</span>
          {isSelected && <span className="block-ops">
            <button onClick={() => onMoveBlock(blockIndex, -1)} disabled={blockIndex === 0} aria-label="Mover bloco para cima" title="Mover para cima">↑</button>
            <button onClick={() => onMoveBlock(blockIndex, 1)} disabled={blockIndex === section.blocks.length - 1} aria-label="Mover bloco para baixo" title="Mover para baixo">↓</button>
            <button onClick={() => onDuplicateBlock(blockIndex)} disabled={blockLimitReached} aria-label="Duplicar bloco" title="Duplicar"><Copy size={11} /></button>
            <button className="op-danger" onClick={() => onRemoveBlock(blockIndex)} aria-label="Remover bloco" title="Remover"><Trash2 size={11} /></button>
          </span>}
        </div>)}
        {isSelected && (schema?.blocks.length ?? 0) > 0 && <div className="block-add">
          <select value={newBlockType} onChange={(event) => setNewBlockType(event.target.value)} aria-label="Tipo de bloco"><option value="">Adicionar bloco…</option>{schema?.blocks.map((block) => <option key={block.type} value={block.type}>{block.name}</option>)}</select>
          <button disabled={!newBlockType || blockLimitReached} onClick={() => { onAddBlock(newBlockType); setNewBlockType(""); }} aria-label="Adicionar bloco" title={blockLimitReached ? `Limite de ${schema?.maxBlocks} blocos` : "Adicionar"}><Plus size={12} /></button>
        </div>}
        {isSelected && blockLimitReached && <small className="block-limit">Limite do schema: {schema?.maxBlocks} blocos.</small>}
      </div>}
    </div>;
  }

  function addSectionRow(ownerPage: ShopifyPage) {
    const allowed = theme.sectionSchemas.filter((schema) => sectionAllowedOnPage(schema, ownerPage));
    if (!allowed.length) return null;
    if (addingTo !== ownerPage.id) return <button className="add-section-link" onClick={() => { setAddingTo(ownerPage.id); setNewSectionType(allowed[0]?.type ?? ""); }}><Plus size={13} /> Adicionar seção</button>;
    return <div className="block-add add-section-inline">
      <select value={allowed.some((schema) => schema.type === newSectionType) ? newSectionType : allowed[0]?.type ?? ""} onChange={(event) => setNewSectionType(event.target.value)} aria-label="Tipo de seção">{allowed.map((schema) => <option key={schema.type} value={schema.type}>{schema.name}</option>)}</select>
      <button onClick={() => { onAddSection(ownerPage.id, allowed.some((schema) => schema.type === newSectionType) ? newSectionType : allowed[0]?.type ?? ""); setAddingTo(null); }} aria-label="Confirmar adição de seção"><Plus size={12} /></button>
      <button onClick={() => setAddingTo(null)} aria-label="Cancelar adição">✕</button>
    </div>;
  }

  return <aside className="structure-panel">
    <div className="panel-heading"><span>ESTRUTURA DO TEMA</span><Layers3 size={15} /></div>
    <label className="editor-page-select"><span>Página do tema</span><select value={templatePage.id} onChange={(event) => onPageChange(event.target.value)}>{templateOptions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    <button className={`global-settings-button ${selectedSectionId === "__global__" ? "selected" : ""}`} onClick={() => onSelectSection("__global__")}><Settings2 size={14} /><b>Configurações do tema</b><ChevronRight size={13} /></button>
    <div className="section-list shopify-section-list">
      {groups.map((group) => <div key={group.page.id} className="tree-group">
        <div className="tree-group-label">{group.label}</div>
        {group.page.sections.map((section, index) => sectionRow(group.page, section, index))}
        {addSectionRow(group.page)}
      </div>)}
    </div>
    <p className="structure-hint">{theme.compatibility?.architecture ?? "Tema Shopify"}: {theme.summary.fileCount} arquivos preservados, {theme.summary.templateCount} páginas, {theme.summary.sectionDefinitionCount} seções e {theme.summary.editableSettingCount} ajustes.</p>
  </aside>;
}

/** Coleta handles de coleções/produtos/menus referenciados no tema para sugerir nos pickers. */
function collectResourceHandles(theme: ShopifyThemeImport) {
  const handles = new Set<string>(["colecao-demo", "produto-demo", "main-menu"]);
  const harvest = (settings: Record<string, ShopifyValue>) => {
    for (const [id, value] of Object.entries(settings)) {
      if (typeof value === "string" && /^[a-z0-9][a-z0-9-_]{1,60}$/.test(value) && /collection|product|menu|blog|page|article|link/i.test(id)) handles.add(value);
    }
  };
  for (const page of theme.pages) for (const section of page.sections) { harvest(section.settings); for (const block of section.blocks) harvest(block.settings); }
  harvest(theme.globalValues);
  return Array.from(handles).slice(0, 80);
}

function ShopifyProperties({ theme, pageIndex, section, sectionIndex, global, update }: { theme: ShopifyThemeImport; pageIndex: number; section?: ShopifySectionInstance; sectionIndex: number; global: boolean; update: (path: string[], value: EditableValue) => void }) {
  const handleSuggestions = collectResourceHandles(theme);
  if (global) return <div className="shopify-properties"><div className="shopify-import-summary"><FileArchive size={18} /><div><b>{theme.themeName}</b><span>{theme.compatibility?.architecture ?? "Tema Shopify"} · {theme.summary.fileCount} arquivos · {theme.summary.editableSettingCount} ajustes · {theme.compatibility?.preservedSource ? "ZIP preservado" : "estrutura preservada"}</span></div></div>{theme.globalGroups.map((group, index) => <PropertyGroup key={`${group.name}-${index}`} icon={Settings2} title={group.name} open={index === 0}>{group.settings.map((setting) => <ShopifySettingControl key={setting.id} setting={setting} value={theme.globalValues[setting.id] ?? setting.default ?? defaultShopifyValue(setting.type)} onChange={(value) => update(["shopify", "globalValues", setting.id], value)} context={theme.globalValues} suggestions={handleSuggestions} assetUrls={theme.assetUrls} />)}</PropertyGroup>)}</div>;
  if (!section || sectionIndex < 0) return <div className="property-empty">Selecione uma seção da página.</div>;
  const schema = theme.sectionSchemas.find((item) => item.type === section.type);
  const sectionDefinitions = mergeShopifyDefinitions(schema?.settings ?? [], section.settings);
  return <div className="shopify-properties">
    <div className="shopify-import-summary"><Layers3 size={18} /><div><b>{section.name}</b><span>{section.type} · {section.blocks.length} blocos</span></div></div>
    <div className="shopify-section-visibility"><ToggleField label="Exibir esta seção na loja" checked={!section.disabled} onChange={(visible) => update(["shopify", "pages", String(pageIndex), "sections", String(sectionIndex), "disabled"], !visible)} /></div>
    <PropertyGroup icon={Type} title="Configurações da seção" open>{sectionDefinitions.length ? sectionDefinitions.map((setting) => <ShopifySettingControl key={setting.id} setting={setting} value={section.settings[setting.id] ?? setting.default ?? defaultShopifyValue(setting.type)} onChange={(value) => update(["shopify", "pages", String(pageIndex), "sections", String(sectionIndex), "settings", setting.id], value)} context={section.settings} suggestions={handleSuggestions} assetUrls={theme.assetUrls} />) : <p className="property-note">Esta seção não possui campos próprios; use os blocos abaixo.</p>}</PropertyGroup>
    {section.blocks.map((block, blockIndex) => { const blockSchema = schema?.blocks.find((item) => item.type === block.type); const definitions = mergeShopifyDefinitions(blockSchema?.settings ?? [], block.settings); return <PropertyGroup key={block.id} icon={Layers3} title={`Bloco · ${blockSchema?.name ?? humanizeShopify(block.type)}`} open={blockIndex === 0}>{definitions.length ? definitions.map((setting) => <ShopifySettingControl key={setting.id} setting={setting} value={block.settings[setting.id] ?? setting.default ?? defaultShopifyValue(setting.type)} onChange={(value) => update(["shopify", "pages", String(pageIndex), "sections", String(sectionIndex), "blocks", String(blockIndex), "settings", setting.id], value)} context={block.settings} suggestions={handleSuggestions} assetUrls={theme.assetUrls} />) : <p className="property-note">Bloco sem configurações editáveis.</p>}</PropertyGroup>; })}
  </div>;
}

/** Avalia expressões visible_if do schema (subset seguro: ==, !=, and, or, referência booleana). */
function visibleIfSatisfied(expression: string | undefined, context: Record<string, ShopifyValue>) {
  if (!expression) return true;
  const resolve = (path: string): ShopifyValue | undefined => context[path.split(".").at(-1) ?? path];
  const comparison = (part: string): boolean => {
    const match = part.match(/([\w.]+)\s*(==|!=)\s*(.+)/);
    if (!match) { const trimmed = part.trim(); if (!trimmed) return true; return Boolean(resolve(trimmed.replace(/^!/, ""))) !== trimmed.startsWith("!"); }
    const left = resolve(match[1].trim());
    const rightRaw = match[3].trim().replace(/^['"]|['"]$/g, "");
    const right: ShopifyValue = rightRaw === "true" ? true : rightRaw === "false" ? false : rightRaw !== "" && !Number.isNaN(Number(rightRaw)) ? Number(rightRaw) : rightRaw;
    const equal = left === right || String(left ?? "") === String(right);
    return match[2] === "==" ? equal : !equal;
  };
  try {
    return expression.replace(/{{|}}/g, " ").split(/\s+or\s+/).some((orPart) => orPart.split(/\s+and\s+/).every(comparison));
  } catch { return true; }
}

const RESOURCE_SETTING_TYPES = ["collection", "product", "page", "blog", "article", "link_list", "menu", "metaobject"];

function ShopifySettingControl({ setting, value, onChange, context = {}, suggestions = [], assetUrls }: { setting: ShopifySettingDefinition; value: ShopifyValue | undefined; onChange: (value: EditableValue) => void; context?: Record<string, ShopifyValue>; suggestions?: string[]; assetUrls?: Record<string, string> }) {
  const type = setting.type;
  if (!visibleIfSatisfied(setting.visibleIf, context)) return null;
  if (type === "header") return <div className="setting-header"><span>{setting.label}</span>{setting.info && <small>{setting.info}</small>}</div>;
  if (type === "paragraph") return <p className="property-note">{setting.label}</p>;
  if (type === "color_scheme_group") return <ShopifyColorSchemeControl setting={setting} value={value} onChange={onChange} />;
  const stringValue = value == null ? "" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
  if (RESOURCE_SETTING_TYPES.includes(type)) {
    const listId = `resource-${setting.id}`;
    return <div className="shopify-setting"><Field label={setting.label}>
      <input list={suggestions.length ? listId : undefined} value={stringValue} placeholder={setting.placeholder ?? "handle-do-recurso"} onChange={(event) => onChange(event.target.value)} />
      {suggestions.length > 0 && <datalist id={listId}>{suggestions.map((handle) => <option key={handle} value={handle} />)}</datalist>}
      <small>Recurso da loja ({type}). A prévia usa dados de demonstração; o handle é preservado na exportação.</small>
      {setting.info && <small>{setting.info}</small>}
    </Field></div>;
  }
  if (type === "checkbox") return <div className="shopify-setting"><ToggleField label={setting.label} checked={Boolean(value)} onChange={onChange} />{setting.info && <small>{setting.info}</small>}</div>;
  if (type === "range") return <div className="shopify-setting"><RangeField label={setting.label} value={typeof value === "number" ? value : Number(setting.default ?? setting.min ?? 0)} min={setting.min ?? 0} max={setting.max ?? 100} step={setting.step} suffix={setting.unit ?? ""} onChange={onChange} />{setting.info && <small>{setting.info}</small>}</div>;
  if (type === "color" && normalizeHexColor(stringValue)) return <div className="shopify-setting"><ColorField label={setting.label} value={normalizeHexColor(stringValue) ?? "#000000"} onChange={onChange} />{setting.info && <small>{setting.info}</small>}</div>;
  if (["select", "radio"].includes(type) && setting.options?.length) return <Field label={setting.label}><select value={stringValue} onChange={(event) => onChange(event.target.value)}>{setting.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>{setting.info && <small>{setting.info}</small>}</Field>;
  if (type === "image_picker") return <div className="shopify-setting"><MediaField label={setting.label} value={stringValue} assetUrls={assetUrls} onUploaded={onChange} />{setting.info && <small>{setting.info}</small>}</div>;
  if (["textarea", "richtext", "html", "liquid", "inline_richtext"].includes(type) || (value && typeof value === "object")) return <Field label={setting.label}><textarea value={stringValue} rows={4} onChange={(event) => { if (value && typeof value === "object") { try { onChange(JSON.parse(event.target.value)); } catch { /* mantém o último JSON válido */ } } else onChange(event.target.value); }} />{setting.info && <small>{setting.info}</small>}</Field>;
  return <Field label={setting.label}><input type={type === "number" ? "number" : "text"} value={stringValue} onChange={(event) => onChange(type === "number" ? Number(event.target.value) : event.target.value)} />{setting.info && <small>{setting.info}</small>}</Field>;
}

function ShopifyColorSchemeControl({ setting, value, onChange }: { setting: ShopifySettingDefinition; value: ShopifyValue | undefined; onChange: (value: EditableValue) => void }) {
  const schemes = shopifyObject(value);
  const colors = (setting.children ?? []).filter((child) => child.type === "color");
  if (!Object.keys(schemes).length || !colors.length) return <p className="property-note">Os esquemas de cores deste tema estão preservados no ZIP e serão exibidos quando houver valores configurados.</p>;
  return <div className="shopify-color-schemes">{Object.entries(schemes).map(([schemeId, schemeValue]) => { const scheme = shopifyObject(schemeValue); const settings = shopifyObject(scheme.settings); return <div key={schemeId}><b>{humanizeShopify(schemeId)}</b>{colors.map((colorSetting) => { const current = settings[colorSetting.id]; const colorValue = typeof current === "string" ? normalizeHexColor(current) ?? "#000000" : typeof colorSetting.default === "string" ? normalizeHexColor(colorSetting.default) ?? "#000000" : "#000000"; return <ColorField key={colorSetting.id} label={colorSetting.label} value={colorValue} onChange={(nextColor) => { const next = structuredClone(schemes); const nextScheme = shopifyObject(next[schemeId]); nextScheme.settings = { ...shopifyObject(nextScheme.settings), [colorSetting.id]: nextColor }; next[schemeId] = nextScheme; onChange(next); }} />; })}</div>; })}</div>;
}

function mergeShopifyDefinitions(definitions: ShopifySettingDefinition[], values: Record<string, ShopifyValue>) {
  const ids = new Set(definitions.map((setting) => setting.id));
  const inferred = Object.entries(values).filter(([id]) => !ids.has(id)).map(([id, value]) => inferShopifyDefinition(id, value));
  return [...definitions, ...inferred];
}

function inferShopifyDefinition(id: string, value: ShopifyValue): ShopifySettingDefinition {
  const type = typeof value === "boolean" ? "checkbox" : typeof value === "number" ? "number" : typeof value === "string" && Boolean(normalizeHexColor(value)) ? "color" : typeof value === "object" || typeof value === "string" && value.length > 100 ? "textarea" : "text";
  return { id, type, label: humanizeShopify(id), default: value };
}

function defaultShopifyValue(type: string): ShopifyValue { return type === "checkbox" ? false : ["range", "number"].includes(type) ? 0 : ""; }
function normalizeHexColor(value: string) { if (/^#[0-9a-f]{6}$/i.test(value)) return value; if (/^#[0-9a-f]{3}$/i.test(value)) return `#${value.slice(1).split("").map((character) => character.repeat(2)).join("")}`; return null; }
function humanizeShopify(value: string) { return value.replace(/^t:/, "").split(".").at(-1)?.replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) ?? value; }
function shopifyObject(value: ShopifyValue | undefined): Record<string, ShopifyValue> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, ShopifyValue> : {}; }

function StorefrontPreview({ customization, device, page = "home", selectedSection, onSelectSection, onNavigatePage }: { customization: Customization; device: Device; page?: StorePage; selectedSection?: SectionKey; onSelectSection?: (section: SectionKey) => void; onNavigatePage?: (page: StorePage) => void }) {
  const g = customization.global;
  const style = { "--store-radius": `${g.buttonRadius}px`, "--store-space": `${g.sectionSpacing}px`, "--store-font": g.font === "Georgia" ? "Georgia, serif" : `var(--font-geist-sans)`, "--store-width": `${g.contentWidth}px` } as React.CSSProperties;
  const sectionClass = (section: SectionKey) => `preview-section ${selectedSection === section ? "preview-section-selected" : ""}`;
  const select = (section: SectionKey) => () => onSelectSection?.(section);

  return (
    <div className={`storefront storefront-${device}`} style={style}>
      {customization.announcement.enabled && page !== "search" && <div className={`${sectionClass("announcement")} store-announcement`} style={{ background: customization.announcement.background, color: customization.announcement.textColor }} onClick={select("announcement")}>{customization.announcement.text}</div>}
      <header className={sectionClass("header")} style={{ background: customization.header.background, color: customization.header.textColor }} onClick={select("header")}><button className="store-brand" onClick={(event) => { event.stopPropagation(); onNavigatePage?.("home"); }}>{customization.header.brand}</button><nav>{customization.header.menuItems.map((item) => <button key={item} style={{ color: customization.header.textColor }} onClick={(event) => { event.stopPropagation(); if (item.toLowerCase().includes("vendidos")) { onNavigatePage?.("collection"); } }}>{item}</button>)}</nav><div>{customization.header.searchEnabled && <button aria-label="Abrir pesquisa" style={{ color: customization.header.accentColor }} onClick={(event) => { event.stopPropagation(); onNavigatePage?.("search"); }}><Search size={14} /></button>}{customization.header.cartEnabled && <button aria-label="Abrir carrinho" style={{ color: customization.header.accentColor }} onClick={(event) => { event.stopPropagation(); onNavigatePage?.("cart"); }}><ShoppingBag size={14} /></button>}</div></header>
      {page === "home" && <HomePreview customization={customization} selectedSection={selectedSection} onSelect={onSelectSection} />}
      {page === "product" && <ProductPagePreview customization={customization} selectedSection={selectedSection} onSelect={onSelectSection} />}
      {page === "collection" && <CollectionPreview customization={customization} selectedSection={selectedSection} onSelect={onSelectSection} />}
      {page === "search" && <SearchPreview customization={customization} selectedSection={selectedSection} onSelect={onSelectSection} />}
      {page === "cart" && <CartPreview customization={customization} selectedSection={selectedSection} onSelect={onSelectSection} />}
      {page === "blog" && <BlogPreview customization={customization} selectedSection={selectedSection} onSelect={onSelectSection} />}
      <FooterPreview customization={customization} selected={selectedSection === "footer"} onSelect={() => onSelectSection?.("footer")} />
    </div>
  );
}

function HomePreview({ customization: c, selectedSection, onSelect }: { customization: Customization; selectedSection?: SectionKey; onSelect?: (section: SectionKey) => void }) {
  const cls = (key: SectionKey, extra: string) => `preview-section ${extra} ${selectedSection === key ? "preview-section-selected" : ""}`;
  return <>
    <section className={cls("hero", "store-hero")} style={{ background: c.hero.background, color: c.hero.textColor }} onClick={() => onSelect?.("hero")}><div className="store-hero-copy"><small style={{ color: c.hero.accentColor }}>{c.hero.eyebrow}</small><h2>{c.hero.headline}</h2><p>{c.hero.body}</p><button style={{ background: c.hero.accentColor, color: c.hero.buttonTextColor }}>{c.hero.buttonLabel} <ArrowRight size={13} /></button></div><div className={`product-stage ${c.hero.image ? "has-upload" : ""}`}>{c.hero.image ? <img src={c.hero.image} alt={`Imagem principal de ${c.header.brand}`} /> : <><div className="product-shadow" /><div className="product-bottle" style={{ background: c.hero.accentColor }}><span>{c.header.brand.slice(0, 1)}</span><i /></div></>}<div className="floating-card"><small>EDIÇÃO LIMITADA</small><strong>{c.products.items[0].name}</strong><span>{c.products.items[0].price}</span></div></div></section>
    <BenefitsPreview customization={c} selected={selectedSection === "benefits"} onSelect={() => onSelect?.("benefits")} />
    <ProductsPreview customization={c} selected={selectedSection === "products"} onSelect={() => onSelect?.("products")} />
    {c.bundle.enabled && <PromoPreview data={c.bundle} selected={selectedSection === "bundle"} onSelect={() => onSelect?.("bundle")} />}
    {c.comparison.enabled && <ComparisonPreview customization={c} selected={selectedSection === "comparison"} onSelect={() => onSelect?.("comparison")} />}
    {c.testimonials.enabled && <TestimonialPreview customization={c} selected={selectedSection === "testimonials"} onSelect={() => onSelect?.("testimonials")} />}
    {c.faq.enabled && <FaqPreview customization={c} selected={selectedSection === "faq"} onSelect={() => onSelect?.("faq")} />}
    {c.newsletter.enabled && <NewsletterPreview customization={c} selected={selectedSection === "newsletter"} onSelect={() => onSelect?.("newsletter")} />}
  </>;
}

function ProductPagePreview({ customization: c, selectedSection, onSelect }: { customization: Customization; selectedSection?: SectionKey; onSelect?: (section: SectionKey) => void }) {
  const p = c.productPage;
  return <><section className={`preview-section store-product-main ${selectedSection === "productPage" ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={() => onSelect?.("productPage")}><div className="store-product-media" style={{ background: p.cardBackground }}><div className="product-bottle large" style={{ background: p.accentColor }}><span>{c.header.brand.slice(0, 1)}</span></div></div><div className="store-product-info"><small style={{ color: p.accentColor }}>{p.eyebrow}</small><h2>{p.title}</h2><strong>{p.price}</strong><p>{p.description}</p><button style={{ background: p.accentColor }}>{p.buttonLabel}</button></div></section>{c.bundle.enabled && <PromoPreview data={c.bundle} selected={selectedSection === "bundle"} onSelect={() => onSelect?.("bundle")} />}<BenefitsPreview customization={c} selected={selectedSection === "benefits"} onSelect={() => onSelect?.("benefits")} />{c.testimonials.enabled && <TestimonialPreview customization={c} selected={selectedSection === "testimonials"} onSelect={() => onSelect?.("testimonials")} />}{c.faq.enabled && <FaqPreview customization={c} selected={selectedSection === "faq"} onSelect={() => onSelect?.("faq")} />}</>;
}

function CollectionPreview({ customization: c, selectedSection, onSelect }: { customization: Customization; selectedSection?: SectionKey; onSelect?: (section: SectionKey) => void }) {
  const p = c.collection;
  return <><section className={`preview-section store-page-hero ${selectedSection === "collection" ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={() => onSelect?.("collection")}><small style={{ color: p.accentColor }}>{p.eyebrow}</small><h2>{p.title}</h2><p>{p.description}</p></section><ProductsPreview customization={c} selected={selectedSection === "products"} onSelect={() => onSelect?.("products")} />{c.newsletter.enabled && <NewsletterPreview customization={c} selected={selectedSection === "newsletter"} onSelect={() => onSelect?.("newsletter")} />}</>;
}

function SearchPreview({ customization: c, selectedSection, onSelect }: { customization: Customization; selectedSection?: SectionKey; onSelect?: (section: SectionKey) => void }) {
  const p = c.search;
  return <section className={`preview-section store-search-page ${selectedSection === "search" ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={() => onSelect?.("search")}><small style={{ color: p.accentColor }}>PESQUISA</small><h2>{p.title}</h2><label><Search size={16} /><input placeholder={p.placeholder} /></label><p>{p.emptyMessage}</p><div><strong>{p.popularTitle}</strong>{p.popularTerms.map((term) => <button key={term} style={{ borderColor: p.accentColor, color: p.textColor }}>{term}</button>)}</div></section>;
}

function CartPreview({ customization: c, selectedSection, onSelect }: { customization: Customization; selectedSection?: SectionKey; onSelect?: (section: SectionKey) => void }) {
  const p = c.cart;
  return <section className={`preview-section store-cart-page ${selectedSection === "cart" ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={() => onSelect?.("cart")}><small style={{ color: p.accentColor }}>CARRINHO</small><h2>{p.title}</h2><div className="cart-progress"><span style={{ background: p.accentColor }} /><p>{p.progressText}</p></div><div className="cart-empty"><ShoppingBag size={28} style={{ color: p.accentColor }} /><p>{p.emptyText}</p></div><button style={{ background: p.accentColor }}>{p.checkoutLabel}</button></section>;
}

function BlogPreview({ customization: c, selectedSection, onSelect }: { customization: Customization; selectedSection?: SectionKey; onSelect?: (section: SectionKey) => void }) {
  const p = c.blog;
  return <><section className={`preview-section store-page-hero ${selectedSection === "blog" ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={() => onSelect?.("blog")}><small style={{ color: p.accentColor }}>{p.eyebrow}</small><h2>{p.title}</h2><p>{p.description}</p></section><section className="store-blog-grid" style={{ background: p.background, color: p.textColor }} onClick={() => onSelect?.("blog")}>{p.articles.map((title, index) => <article key={`${title}-${index}`}><div style={{ background: `color-mix(in srgb, ${p.accentColor} ${18 + index * 9}%, white)` }} /><small>GUIA · {String(index + 1).padStart(2, "0")}</small><strong>{title}</strong></article>)}</section>{c.newsletter.enabled && <NewsletterPreview customization={c} selected={selectedSection === "newsletter"} onSelect={() => onSelect?.("newsletter")} />}</>;
}

function BenefitsPreview({ customization: c, selected, onSelect }: { customization: Customization; selected: boolean; onSelect: () => void }) { const b = c.benefits; const icons = [Zap, ShieldCheck, RefreshCw]; return <section className={`preview-section store-benefits ${selected ? "preview-section-selected" : ""}`} style={{ background: b.background, color: b.textColor, borderColor: b.borderColor }} onClick={onSelect}>{b.items.map((item, index) => { const Icon = icons[index]; return <div key={item.title} style={{ borderColor: b.borderColor }}><Icon size={15} /><span><b>{item.title}</b><small>{item.text}</small></span></div>; })}</section>; }

function ProductsPreview({ customization: c, selected, onSelect }: { customization: Customization; selected: boolean; onSelect: () => void }) { const p = c.products; return <section className={`preview-section store-products ${selected ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={onSelect}><div className="store-section-head"><div><small style={{ color: p.accentColor }}>{p.eyebrow}</small><h3>{p.title}</h3></div><button style={{ color: p.textColor }}>{p.linkLabel}</button></div><div className="store-product-grid">{p.items.map((item, index) => <article key={`${item.name}-${index}`}><div className={`product-art art-${index}`} style={{ background: p.cardBackground }}><span>0{index + 1}</span></div><small style={{ color: p.accentColor }}>{item.badge}</small><strong>{item.name}</strong><span>{item.price}</span></article>)}</div></section>; }

function PromoPreview({ data, selected, onSelect }: { data: Customization["bundle"]; selected: boolean; onSelect: () => void }) { return <section className={`preview-section store-promo ${selected ? "preview-section-selected" : ""}`} style={{ background: data.background, color: data.textColor }} onClick={onSelect}><div><small style={{ color: data.accentColor }}>{data.eyebrow}</small><h3>{data.title}</h3><p>{data.body}</p><button style={{ background: data.accentColor }}>{data.buttonLabel}</button></div><div className="bundle-products"><span /><b>+</b><span /></div></section>; }

function ComparisonPreview({ customization: c, selected, onSelect }: { customization: Customization; selected: boolean; onSelect: () => void }) { const p = c.comparison; return <section className={`preview-section store-comparison ${selected ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={onSelect}><small style={{ color: p.accentColor }}>{p.eyebrow}</small><h3>{p.title}</h3><div>{p.items.map((item, index) => <span key={`${item}-${index}`}><Check size={13} style={{ color: p.accentColor }} />{item}</span>)}</div></section>; }

function TestimonialPreview({ customization: c, selected, onSelect }: { customization: Customization; selected: boolean; onSelect: () => void }) { const p = c.testimonials; return <section className={`preview-section store-testimonial ${selected ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={onSelect}><small style={{ color: p.accentColor }}>{p.eyebrow}</small><h3>{p.title}</h3><blockquote>“{p.quote}”</blockquote><span>{p.author}</span></section>; }

function FaqPreview({ customization: c, selected, onSelect }: { customization: Customization; selected: boolean; onSelect: () => void }) { const p = c.faq; return <section className={`preview-section store-faq ${selected ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={onSelect}><small>{p.eyebrow}</small><h3>{p.title}</h3>{p.items.map((item) => <details key={item.question} style={{ borderColor: p.borderColor }}><summary>{item.question}<Plus size={12} /></summary><p>{item.answer}</p></details>)}</section>; }

function NewsletterPreview({ customization: c, selected, onSelect }: { customization: Customization; selected: boolean; onSelect: () => void }) { const p = c.newsletter; return <section className={`preview-section store-newsletter ${selected ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={onSelect}><div><h3>{p.title}</h3><p>{p.body}</p></div><label><input placeholder={p.placeholder} /><button style={{ background: p.buttonBackground, color: p.buttonTextColor }}>{p.buttonLabel}</button></label></section>; }

function FooterPreview({ customization: c, selected, onSelect }: { customization: Customization; selected: boolean; onSelect: () => void }) { const p = c.footer; return <footer className={`preview-section store-footer ${selected ? "preview-section-selected" : ""}`} style={{ background: p.background, color: p.textColor }} onClick={onSelect}><div><strong>{p.brand}</strong><p style={{ color: p.mutedColor }}>{p.description}</p></div><div><b>Loja</b>{p.storeLinks.map((link, index) => <span key={`${link}-${index}`}>{link}</span>)}</div><div><b>Ajuda</b>{p.helpLinks.map((link, index) => <span key={`${link}-${index}`}>{link}</span>)}</div><small style={{ color: p.mutedColor }}>{p.copyright}</small></footer>; }

function SectionProperties({ customization: c, section, update }: { customization: Customization; section: SectionKey; update: (path: string[], value: EditableValue) => void }) {
  if (section === "global") return <><PropertyGroup icon={Type} title="Tipografia e idioma" open><Field label="Tipografia"><select value={c.global.font} onChange={(e) => update(["global", "font"], e.target.value)}><option>Inter</option><option>Manrope</option><option>Poppins</option><option>Georgia</option></select></Field><Field label="Idioma principal"><select value={c.global.language} onChange={(e) => update(["global", "language"], e.target.value)}><option value="pt-BR">Português</option><option value="en">English</option><option value="es">Español</option></select></Field></PropertyGroup><PropertyGroup icon={Settings2} title="Layout global" open><RangeField label="Arredondamento" value={c.global.buttonRadius} min={0} max={28} suffix="px" onChange={(v) => update(["global", "buttonRadius"], v)} /><RangeField label="Espaço entre seções" value={c.global.sectionSpacing} min={20} max={80} suffix="px" onChange={(v) => update(["global", "sectionSpacing"], v)} /><RangeField label="Largura do conteúdo" value={c.global.contentWidth} min={900} max={1600} suffix="px" onChange={(v) => update(["global", "contentWidth"], v)} /></PropertyGroup></>;

  if (section === "announcement") return <><PropertyGroup icon={Type} title="Anúncio" open><ToggleField label="Exibir faixa de anúncio" checked={c.announcement.enabled} onChange={(v) => update(["announcement", "enabled"], v)} /><Field label="Texto do anúncio"><input value={c.announcement.text} onChange={(e) => update(["announcement", "text"], e.target.value)} /></Field></PropertyGroup><SectionColors fields={[{ label: "Fundo", value: c.announcement.background, path: ["announcement", "background"] }, { label: "Texto", value: c.announcement.textColor, path: ["announcement", "textColor"] }]} update={update} /></>;

  if (section === "header") return <><PropertyGroup icon={Type} title="Cabeçalho" open><Field label="Nome da marca"><input value={c.header.brand} onChange={(e) => update(["header", "brand"], e.target.value)} /></Field><Field label="Itens do menu — separados por vírgula"><input value={c.header.menuItems.join(", ")} onChange={(e) => update(["header", "menuItems"], e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></Field><ToggleField label="Exibir pesquisa" checked={c.header.searchEnabled} onChange={(v) => update(["header", "searchEnabled"], v)} /><ToggleField label="Exibir carrinho" checked={c.header.cartEnabled} onChange={(v) => update(["header", "cartEnabled"], v)} /><ToggleField label="Cabeçalho fixo" checked={c.header.sticky} onChange={(v) => update(["header", "sticky"], v)} /></PropertyGroup><SectionColors fields={[{ label: "Fundo", value: c.header.background, path: ["header", "background"] }, { label: "Texto e menu", value: c.header.textColor, path: ["header", "textColor"] }, { label: "Ícones e destaque", value: c.header.accentColor, path: ["header", "accentColor"] }]} update={update} /></>;

  if (section === "hero") return <><PropertyGroup icon={Type} title="Conteúdo do Hero" open><Field label="Etiqueta"><input value={c.hero.eyebrow} onChange={(e) => update(["hero", "eyebrow"], e.target.value)} /></Field><Field label="Título principal"><textarea value={c.hero.headline} onChange={(e) => update(["hero", "headline"], e.target.value)} rows={3} /></Field><Field label="Texto de apoio"><textarea value={c.hero.body} onChange={(e) => update(["hero", "body"], e.target.value)} rows={4} /></Field><Field label="Texto do botão"><input value={c.hero.buttonLabel} onChange={(e) => update(["hero", "buttonLabel"], e.target.value)} /></Field><MediaField label="Imagem do Hero" value={c.hero.image} onUploaded={(url) => update(["hero", "image"], url)} /></PropertyGroup><SectionColors fields={[{ label: "Fundo", value: c.hero.background, path: ["hero", "background"] }, { label: "Texto", value: c.hero.textColor, path: ["hero", "textColor"] }, { label: "Botão e destaque", value: c.hero.accentColor, path: ["hero", "accentColor"] }, { label: "Texto do botão", value: c.hero.buttonTextColor, path: ["hero", "buttonTextColor"] }]} update={update} /></>;

  if (section === "benefits") return <><PropertyGroup icon={Type} title="Benefícios" open>{c.benefits.items.map((item, index) => <div className="repeater-card" key={index}><b>Benefício {index + 1}</b><Field label="Título"><input value={item.title} onChange={(e) => update(["benefits", "items", String(index), "title"], e.target.value)} /></Field><Field label="Descrição"><input value={item.text} onChange={(e) => update(["benefits", "items", String(index), "text"], e.target.value)} /></Field></div>)}</PropertyGroup><SectionColors fields={[{ label: "Fundo", value: c.benefits.background, path: ["benefits", "background"] }, { label: "Texto e ícones", value: c.benefits.textColor, path: ["benefits", "textColor"] }, { label: "Divisórias", value: c.benefits.borderColor, path: ["benefits", "borderColor"] }]} update={update} /></>;

  if (section === "products") return <><PropertyGroup icon={Type} title="Mais vendidos" open><Field label="Etiqueta"><input value={c.products.eyebrow} onChange={(e) => update(["products", "eyebrow"], e.target.value)} /></Field><Field label="Título"><input value={c.products.title} onChange={(e) => update(["products", "title"], e.target.value)} /></Field><Field label="Link"><input value={c.products.linkLabel} onChange={(e) => update(["products", "linkLabel"], e.target.value)} /></Field>{c.products.items.map((item, index) => <div className="repeater-card" key={index}><b>Produto {index + 1}</b><Field label="Nome"><input value={item.name} onChange={(e) => update(["products", "items", String(index), "name"], e.target.value)} /></Field><Field label="Preço"><input value={item.price} onChange={(e) => update(["products", "items", String(index), "price"], e.target.value)} /></Field><Field label="Selo"><input value={item.badge} onChange={(e) => update(["products", "items", String(index), "badge"], e.target.value)} /></Field></div>)}</PropertyGroup><SectionColors fields={[{ label: "Fundo da seção", value: c.products.background, path: ["products", "background"] }, { label: "Texto", value: c.products.textColor, path: ["products", "textColor"] }, { label: "Destaques", value: c.products.accentColor, path: ["products", "accentColor"] }, { label: "Fundo dos cards", value: c.products.cardBackground, path: ["products", "cardBackground"] }]} update={update} /></>;

  if (section === "bundle") return <PromoProperties section="bundle" data={c.bundle} update={update} />;
  if (section === "comparison") return <><SimpleSectionProperties section="comparison" data={c.comparison} update={update} /><PropertyGroup icon={Check} title="Pontos da comparação" open><Field label="Itens — separados por vírgula"><textarea value={c.comparison.items.join(", ")} onChange={(e) => update(["comparison", "items"], e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} rows={4} /></Field></PropertyGroup></>;
  if (section === "testimonials") return <><SimpleSectionProperties section="testimonials" data={c.testimonials} update={update} /><PropertyGroup icon={Type} title="Depoimento" open><Field label="Texto"><textarea value={c.testimonials.quote} onChange={(e) => update(["testimonials", "quote"], e.target.value)} rows={4} /></Field><Field label="Autor"><input value={c.testimonials.author} onChange={(e) => update(["testimonials", "author"], e.target.value)} /></Field></PropertyGroup></>;

  if (section === "faq") return <><PropertyGroup icon={Type} title="Perguntas frequentes" open><ToggleField label="Exibir seção" checked={c.faq.enabled} onChange={(v) => update(["faq", "enabled"], v)} /><Field label="Etiqueta"><input value={c.faq.eyebrow} onChange={(e) => update(["faq", "eyebrow"], e.target.value)} /></Field><Field label="Título"><input value={c.faq.title} onChange={(e) => update(["faq", "title"], e.target.value)} /></Field>{c.faq.items.map((item, index) => <div className="repeater-card" key={index}><b>Pergunta {index + 1}</b><Field label="Pergunta"><input value={item.question} onChange={(e) => update(["faq", "items", String(index), "question"], e.target.value)} /></Field><Field label="Resposta"><textarea value={item.answer} onChange={(e) => update(["faq", "items", String(index), "answer"], e.target.value)} rows={3} /></Field></div>)}</PropertyGroup><SectionColors fields={[{ label: "Fundo", value: c.faq.background, path: ["faq", "background"] }, { label: "Texto", value: c.faq.textColor, path: ["faq", "textColor"] }, { label: "Bordas", value: c.faq.borderColor, path: ["faq", "borderColor"] }]} update={update} /></>;

  if (section === "newsletter") return <><PropertyGroup icon={Type} title="Newsletter" open><ToggleField label="Exibir seção" checked={c.newsletter.enabled} onChange={(v) => update(["newsletter", "enabled"], v)} /><Field label="Título"><textarea value={c.newsletter.title} onChange={(e) => update(["newsletter", "title"], e.target.value)} rows={2} /></Field><Field label="Texto"><textarea value={c.newsletter.body} onChange={(e) => update(["newsletter", "body"], e.target.value)} rows={3} /></Field><Field label="Placeholder do e-mail"><input value={c.newsletter.placeholder} onChange={(e) => update(["newsletter", "placeholder"], e.target.value)} /></Field><Field label="Texto do botão"><input value={c.newsletter.buttonLabel} onChange={(e) => update(["newsletter", "buttonLabel"], e.target.value)} /></Field></PropertyGroup><SectionColors fields={[{ label: "Fundo", value: c.newsletter.background, path: ["newsletter", "background"] }, { label: "Texto", value: c.newsletter.textColor, path: ["newsletter", "textColor"] }, { label: "Fundo do botão", value: c.newsletter.buttonBackground, path: ["newsletter", "buttonBackground"] }, { label: "Texto do botão", value: c.newsletter.buttonTextColor, path: ["newsletter", "buttonTextColor"] }]} update={update} /></>;

  if (section === "footer") return <><PropertyGroup icon={Type} title="Rodapé" open><Field label="Nome da marca"><input value={c.footer.brand} onChange={(e) => update(["footer", "brand"], e.target.value)} /></Field><Field label="Descrição"><textarea value={c.footer.description} onChange={(e) => update(["footer", "description"], e.target.value)} rows={3} /></Field><Field label="Links da loja — separados por vírgula"><textarea value={c.footer.storeLinks.join(", ")} onChange={(e) => update(["footer", "storeLinks"], e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} rows={2} /></Field><Field label="Links de ajuda — separados por vírgula"><textarea value={c.footer.helpLinks.join(", ")} onChange={(e) => update(["footer", "helpLinks"], e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} rows={2} /></Field><Field label="Direitos autorais"><input value={c.footer.copyright} onChange={(e) => update(["footer", "copyright"], e.target.value)} /></Field><Field label="Instagram"><input value={c.footer.instagram} onChange={(e) => update(["footer", "instagram"], e.target.value)} placeholder="@sua_marca" /></Field><Field label="WhatsApp"><input value={c.footer.whatsapp} onChange={(e) => update(["footer", "whatsapp"], e.target.value)} placeholder="(00) 00000-0000" /></Field></PropertyGroup><SectionColors fields={[{ label: "Fundo", value: c.footer.background, path: ["footer", "background"] }, { label: "Texto", value: c.footer.textColor, path: ["footer", "textColor"] }, { label: "Texto secundário", value: c.footer.mutedColor, path: ["footer", "mutedColor"] }]} update={update} /></>;

  if (section === "search") return <><PropertyGroup icon={Search} title="Página de pesquisa" open><Field label="Título"><input value={c.search.title} onChange={(e) => update(["search", "title"], e.target.value)} /></Field><Field label="Placeholder"><input value={c.search.placeholder} onChange={(e) => update(["search", "placeholder"], e.target.value)} /></Field><Field label="Mensagem inicial"><textarea value={c.search.emptyMessage} onChange={(e) => update(["search", "emptyMessage"], e.target.value)} rows={3} /></Field><Field label="Título das sugestões"><input value={c.search.popularTitle} onChange={(e) => update(["search", "popularTitle"], e.target.value)} /></Field><Field label="Buscas populares — separadas por vírgula"><input value={c.search.popularTerms.join(", ")} onChange={(e) => update(["search", "popularTerms"], e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></Field></PropertyGroup><SectionColors fields={utilityColors("search", c.search)} update={update} /></>;
  if (section === "productPage") return <ProductProperties data={c.productPage} update={update} />;
  if (section === "collection") return <UtilityPageProperties section="collection" data={c.collection} update={update} />;
  if (section === "blog") return <><UtilityPageProperties section="blog" data={c.blog} update={update} /><PropertyGroup icon={Type} title="Artigos" open><Field label="Títulos — separados por vírgula"><textarea value={c.blog.articles.join(", ")} onChange={(e) => update(["blog", "articles"], e.target.value.split(",").map((item) => item.trim()).filter(Boolean))} rows={4} /></Field></PropertyGroup></>;
  if (section === "cart") return <CartProperties data={c.cart} update={update} />;
  return null;
}

function PromoProperties({ section, data, update }: { section: "bundle"; data: Customization["bundle"]; update: (path: string[], value: EditableValue) => void }) { return <><PropertyGroup icon={Type} title="Conteúdo" open><ToggleField label="Exibir seção" checked={data.enabled} onChange={(v) => update([section, "enabled"], v)} /><Field label="Etiqueta"><input value={data.eyebrow} onChange={(e) => update([section, "eyebrow"], e.target.value)} /></Field><Field label="Título"><input value={data.title} onChange={(e) => update([section, "title"], e.target.value)} /></Field><Field label="Texto"><textarea value={data.body} onChange={(e) => update([section, "body"], e.target.value)} rows={3} /></Field><Field label="Botão"><input value={data.buttonLabel} onChange={(e) => update([section, "buttonLabel"], e.target.value)} /></Field></PropertyGroup><SectionColors fields={[{ label: "Fundo", value: data.background, path: [section, "background"] }, { label: "Texto", value: data.textColor, path: [section, "textColor"] }, { label: "Destaque", value: data.accentColor, path: [section, "accentColor"] }]} update={update} /></>; }

function SimpleSectionProperties({ section, data, update }: { section: "comparison" | "testimonials"; data: Customization["comparison"] | Customization["testimonials"]; update: (path: string[], value: EditableValue) => void }) { return <><PropertyGroup icon={Type} title="Conteúdo" open><ToggleField label="Exibir seção" checked={data.enabled} onChange={(v) => update([section, "enabled"], v)} /><Field label="Etiqueta"><input value={data.eyebrow} onChange={(e) => update([section, "eyebrow"], e.target.value)} /></Field><Field label="Título"><input value={data.title} onChange={(e) => update([section, "title"], e.target.value)} /></Field></PropertyGroup><SectionColors fields={[{ label: "Fundo", value: data.background, path: [section, "background"] }, { label: "Texto", value: data.textColor, path: [section, "textColor"] }, { label: "Destaque", value: data.accentColor, path: [section, "accentColor"] }]} update={update} /></>; }

function UtilityPageProperties({ section, data, update }: { section: "collection" | "blog"; data: Customization["collection"] | Customization["blog"]; update: (path: string[], value: EditableValue) => void }) { return <><PropertyGroup icon={Type} title="Conteúdo da página" open><Field label="Etiqueta"><input value={data.eyebrow} onChange={(e) => update([section, "eyebrow"], e.target.value)} /></Field><Field label="Título"><input value={data.title} onChange={(e) => update([section, "title"], e.target.value)} /></Field><Field label="Descrição"><textarea value={data.description} onChange={(e) => update([section, "description"], e.target.value)} rows={4} /></Field></PropertyGroup><SectionColors fields={utilityColors(section, data)} update={update} /></>; }

function ProductProperties({ data, update }: { data: Customization["productPage"]; update: (path: string[], value: EditableValue) => void }) { return <><PropertyGroup icon={Type} title="Produto principal" open><Field label="Etiqueta"><input value={data.eyebrow} onChange={(e) => update(["productPage", "eyebrow"], e.target.value)} /></Field><Field label="Nome do produto"><input value={data.title} onChange={(e) => update(["productPage", "title"], e.target.value)} /></Field><Field label="Preço"><input value={data.price} onChange={(e) => update(["productPage", "price"], e.target.value)} /></Field><Field label="Descrição"><textarea value={data.description} onChange={(e) => update(["productPage", "description"], e.target.value)} rows={4} /></Field><Field label="Botão"><input value={data.buttonLabel} onChange={(e) => update(["productPage", "buttonLabel"], e.target.value)} /></Field></PropertyGroup><SectionColors fields={[...utilityColors("productPage", data), { label: "Fundo da mídia", value: data.cardBackground, path: ["productPage", "cardBackground"] }]} update={update} /></>; }

function CartProperties({ data, update }: { data: Customization["cart"]; update: (path: string[], value: EditableValue) => void }) { return <><PropertyGroup icon={ShoppingBag} title="Carrinho" open><Field label="Título"><input value={data.title} onChange={(e) => update(["cart", "title"], e.target.value)} /></Field><Field label="Mensagem de carrinho vazio"><textarea value={data.emptyText} onChange={(e) => update(["cart", "emptyText"], e.target.value)} rows={3} /></Field><Field label="Mensagem do frete"><textarea value={data.progressText} onChange={(e) => update(["cart", "progressText"], e.target.value)} rows={3} /></Field><Field label="Botão de checkout"><input value={data.checkoutLabel} onChange={(e) => update(["cart", "checkoutLabel"], e.target.value)} /></Field></PropertyGroup><SectionColors fields={utilityColors("cart", data)} update={update} /></>; }

function SectionColors({ fields, update }: { fields: Array<{ label: string; value: string; path: string[] }>; update: (path: string[], value: EditableValue) => void }) { return <PropertyGroup icon={Palette} title="Cores desta seção" open><div className="color-fields">{fields.map((field) => <ColorField key={field.path.join(".")} label={field.label} value={field.value} onChange={(value) => update(field.path, value)} />)}</div></PropertyGroup>; }
function utilityColors(section: string, data: { background: string; textColor: string; accentColor: string }) { return [{ label: "Fundo", value: data.background, path: [section, "background"] }, { label: "Texto", value: data.textColor, path: [section, "textColor"] }, { label: "Destaque", value: data.accentColor, path: [section, "accentColor"] }]; }

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="toggle-field"><span>{label}</span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i /></label>; }

function setValueAtPath(source: Customization, path: string[], value: EditableValue): Customization {
  const clone = structuredClone(source) as unknown as Record<string, unknown>;
  let cursor: Record<string, unknown> | unknown[] = clone;
  for (let index = 0; index < path.length - 1; index += 1) {
    const segment = path[index];
    cursor = Array.isArray(cursor) ? cursor[Number(segment)] as Record<string, unknown> : cursor[segment] as Record<string, unknown>;
  }
  const last = path[path.length - 1];
  if (Array.isArray(cursor)) cursor[Number(last)] = value;
  else cursor[last] = value;
  return clone as unknown as Customization;
}

function getValueAtPath(source: Customization, path: string[]): unknown {
  let cursor: unknown = source;
  for (const segment of path) {
    if (!cursor || typeof cursor !== "object") return undefined;
    cursor = Array.isArray(cursor)
      ? cursor[Number(segment)]
      : (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function sameEditableValue(current: unknown, next: EditableValue) {
  if (Array.isArray(current) && Array.isArray(next)) {
    return current.length === next.length && current.every((item, index) => item === next[index]);
  }
  if (typeof current === "string" && typeof next === "string" && /^#[0-9a-f]{6}$/i.test(current) && /^#[0-9a-f]{6}$/i.test(next)) {
    return current.toLowerCase() === next.toLowerCase();
  }
  return current === next;
}

function PropertyGroup({ icon: Icon, title, open, children }: { icon: typeof Home; title: string; open?: boolean; children: React.ReactNode }) {
  return <details className="property-group" open={open}><summary><span><Icon size={14} /> {title}</span><ChevronRight size={14} /></summary><div className="property-content">{children}</div></details>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const validColor = normalizeHexColor(value) ?? "#000000";
  const changeFrame = useRef<number | null>(null);
  useEffect(() => () => { if (changeFrame.current !== null) window.cancelAnimationFrame(changeFrame.current); }, []);
  function scheduleChange(next: string) {
    if (next.toLowerCase() === validColor.toLowerCase()) return;
    if (changeFrame.current !== null) window.cancelAnimationFrame(changeFrame.current);
    changeFrame.current = window.requestAnimationFrame(() => {
      changeFrame.current = null;
      onChange(next);
    });
  }
  function commitHex(input: HTMLInputElement) {
    const next = input.value.trim();
    if (/^#[0-9a-f]{6}$/i.test(next)) scheduleChange(next);
    else input.value = value;
  }
  /* As chaves remontam os campos quando o valor muda por fora (eles são
     não-controlados, com defaultValue). Precisam de prefixo: sem ele, os dois
     irmãos ficam com a MESMA chave sempre que o hexadecimal digitado já estiver
     normalizado — e aí o React avisa de chave duplicada e pode descartar um dos
     dois campos. */
  return <label className="color-field"><span>{label}</span><div><input key={`cor-${validColor}`} type="color" defaultValue={validColor} onChange={(event) => scheduleChange(event.currentTarget.value)} /><input key={`hex-${value}`} aria-label={`${label} hexadecimal`} defaultValue={value} maxLength={7} onBlur={(event) => commitHex(event.currentTarget)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></div></label>;
}
function RangeField({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix: string; onChange: (value: number) => void }) { return <label className="range-field"><span>{label}<b>{value}{suffix}</b></span><input type="range" value={value} min={min} max={max} step={step ?? 1} onChange={(event) => onChange(Number(event.target.value))} /></label>; }

/**
 * Onde a miniatura vai buscar a imagem. Além do upload do editor e de URLs,
 * resolve nomes de asset do tema — inclusive o `shopify://shop_images/x.png`
 * que a exportação grava e a reimportação traz de volta.
 */
function mediaPreviewSource(value: string, assetUrls?: Record<string, string>) {
  if (!value) return "";
  if (value.startsWith("/api/media/") || value.startsWith("data:image/") || /^https?:\/\//.test(value)) return value;
  const name = value.split("?")[0].split("/").at(-1)?.toLowerCase() ?? "";
  return assetUrls?.[name] ?? "";
}

function MediaField({ label = "Imagem principal", value, assetUrls, onUploaded }: { label?: string; value: string; assetUrls?: Record<string, string>; onUploaded: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      onUploaded(payload.url);
    } catch {
      setError("Use PNG, JPG ou WebP de até 5 MB.");
    } finally {
      setUploading(false);
    }
  }
  const previewSource = mediaPreviewSource(value, assetUrls);
  return <div className="media-field"><span>{label}</span>{previewSource && <img className="media-thumb" src={previewSource} alt={`Pré-visualização de ${label}`} />}<label className="media-upload">{value ? <><Check size={14} /> Trocar imagem</> : <><Plus size={14} /> {uploading ? "Enviando…" : "Enviar imagem"}</>}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} /></label>{value && <button type="button" onClick={() => onUploaded("")}>Remover imagem</button>}{error && <small>{error}</small>}</div>;
}

function PageIntro({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) { return <div className="page-intro"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{body}</p></div>; }
function EmptyState({ title, body }: { icon?: typeof Home; title: string; body: string }) { return <div className="empty-state"><Orbis className="orbis-sm" esmaecido /><h3>{title}</h3><p>{body}</p></div>; }
function LoadingPanel() { return <div className="loading-panel" role="status"><Orbis className="orbis-loading" /><span>ORBIS INICIALIZANDO</span><p>Um instante, senhor. Estou organizando seus temas e projetos…</p></div>; }

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeRef.current?.focus(); const handler = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, [onClose]);
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><div><span className="eyebrow">ORBIS · PRÉVIA</span><h2 id="modal-title">{title}</h2></div><button ref={closeRef} className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>{children}</div></div>;
}

function tabTitle(tab: Tab) { return ({ home: "Início", extract: "Importar temas", themes: "Temas Shopify", projects: "Meus projetos", editor: "Editor visual" })[tab]; }
function statusLabel(status: Project["status"]) { return ({ draft: "RASCUNHO", editing: "EM EDIÇÃO", published: "PUBLICADO", archived: "ARQUIVADO" })[status]; }
function formatRelative(value: string) { const date = new Date(`${value.replace(" ", "T")}Z`); const minutes = Math.max(1, Math.round((Date.now() - date.getTime()) / 60000)); return minutes < 60 ? `há ${minutes} min` : minutes < 1440 ? `há ${Math.round(minutes / 60)} h` : `em ${new Intl.DateTimeFormat("pt-BR").format(date)}`; }
function humanError(error: unknown) { const message = error instanceof Error ? error.message : "UNEXPECTED_ERROR"; if (message.includes("DATABASE_UNAVAILABLE")) return "Perdoe-me, senhor — o banco de dados ainda não está disponível neste ambiente."; if (message.includes("AUTHENTICATION_REQUIRED")) return "Senhor, abra o aplicativo pelo modo local para que eu possa servi-lo."; return "Perdoe-me, senhor. Algo não saiu como esperado — permita-me tentar novamente."; }
function shopifyImportError(message: string) { if (message.includes("SHOPIFY_ZIP_SIZE")) return "O ZIP precisa ter até 100 MB, senhor."; if (message.includes("SHOPIFY_ZIP_INVALID")) return "Senhor, este arquivo está corrompido ou não é um ZIP válido."; if (message.includes("SHOPIFY_THEME_STRUCTURE") || message.includes("SHOPIFY_SETTINGS_SCHEMA")) return "Vasculhei até os ZIPs internos, senhor, e não encontrei um tema Shopify válido."; if (message.includes("SHOPIFY_THEME_CONTENT")) return "O ZIP não contém seções ou templates válidos para eu carregar, senhor."; if (message.includes("SHOPIFY_ZIP_FILES") || message.includes("SHOPIFY_ZIP_EXPANDED_SIZE")) return "Este ZIP é grande ou complexo demais para eu carregar com segurança, senhor."; if (message.includes("Failed to fetch") || message.includes("NetworkError")) return "Meu carregador local ficou indisponível, senhor. Já tentei novamente; mantenha o aplicativo aberto e ordene Tentar novamente."; return "Não consegui carregar este tema, senhor. O arquivo pode estar incompleto ou não ser um tema Shopify."; }
