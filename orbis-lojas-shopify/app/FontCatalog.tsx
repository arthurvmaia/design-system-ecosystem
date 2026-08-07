"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CATALOG_FALLBACK, type CatalogFont } from "@/lib/google-fonts";

/**
 * Catálogo do Google Fonts no editor (Fase 6): busca, categorias, paginação
 * progressiva e o nome de cada família desenhado NA PRÓPRIA fonte — carregada
 * sob demanda, por página visível, com subset só das letras do nome
 * (parâmetro text= do css2). Nunca o catálogo inteiro.
 */

const PAGE_SIZE = 30;
const RECENT_KEY = "orbis-fontes-recentes";
const CATEGORY_LABELS: Array<{ id: CatalogFont["category"] | "todas"; label: string }> = [
  { id: "todas", label: "Todas" },
  { id: "sans-serif", label: "Sans-serif" },
  { id: "serif", label: "Serif" },
  { id: "display", label: "Display" },
  { id: "handwriting", label: "Manuscrita" },
  { id: "monospace", label: "Mono" },
];

/* uma folha por família, deduplicada no módulo — trocar de página não recarrega */
const loadedPreviews = new Set<string>();
function ensurePreviewFont(family: string) {
  if (loadedPreviews.has(family) || typeof document === "undefined") return;
  loadedPreviews.add(family);
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@400&text=${encodeURIComponent(family)}&display=swap`;
  document.head.appendChild(link);
}

export function readRecentFonts(): string[] {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[]; } catch { return []; }
}
export function rememberRecentFont(family: string) {
  try {
    const next = [family, ...readRecentFonts().filter((item) => item !== family)].slice(0, 8);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* localStorage indisponível não é erro */ }
}

let catalogCache: CatalogFont[] | null = null;
let catalogSource: "live" | "cache" | "stale" | "reserva" | null = null;

export function FontCatalog({ currentFamily, onPick }: { currentFamily: string; onPick: (font: CatalogFont) => void }) {
  const [fonts, setFonts] = useState<CatalogFont[] | null>(catalogCache);
  const [source, setSource] = useState<typeof catalogSource>(catalogSource);
  const [status, setStatus] = useState<"loading" | "ok" | "reserva">(catalogCache ? "ok" : "loading");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CatalogFont["category"] | "todas">("todas");
  const [page, setPage] = useState(1);
  const recents = useMemo(() => readRecentFonts(), []);

  useEffect(() => {
    if (catalogCache) return;
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/google-fonts");
        const payload = await response.json() as { fonts?: CatalogFont[]; source?: string; error?: string };
        if (!response.ok || !payload.fonts?.length) throw new Error(payload.error ?? "CATALOG_UNAVAILABLE");
        catalogCache = payload.fonts;
        catalogSource = (payload.source as typeof catalogSource) ?? "live";
        if (!cancelled) { setFonts(catalogCache); setSource(catalogSource); setStatus("ok"); }
      } catch {
        catalogCache = CATALOG_FALLBACK;
        catalogSource = "reserva";
        if (!cancelled) { setFonts(CATALOG_FALLBACK); setSource("reserva"); setStatus("reserva"); }
      }
    }, 0);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, []);

  const filtered = useMemo(() => {
    if (!fonts) return [];
    const term = query.trim().toLowerCase();
    const byCategory = category === "todas" ? fonts : fonts.filter((font) => font.category === category);
    const byQuery = term ? byCategory.filter((font) => font.family.toLowerCase().includes(term)) : byCategory;
    if (!term && category === "todas" && recents.length) {
      const recentSet = new Set(recents);
      return [...byQuery.filter((font) => recentSet.has(font.family)), ...byQuery.filter((font) => !recentSet.has(font.family))];
    }
    return byQuery;
  }, [fonts, query, category, recents]);

  const visible = filtered.slice(0, page * PAGE_SIZE);
  useEffect(() => { for (const font of visible) ensurePreviewFont(font.family); }, [visible]);

  if (status === "loading") return <div className="font-catalog-state" role="status">Carregando o catálogo do Google Fonts…</div>;

  return <div className="font-catalog">
    {status === "reserva" && <p className="font-catalog-warning" role="alert">Catálogo do Google Fonts indisponível agora; mostrando a lista de reserva do editor.</p>}
    <div className="font-catalog-tools">
      <label className="font-catalog-search"><Search size={14} /><input value={query} placeholder="Buscar fonte pelo nome…" onChange={(event) => { setQuery(event.target.value); setPage(1); }} aria-label="Buscar fonte" /></label>
      <div className="font-catalog-categories" role="radiogroup" aria-label="Categoria">
        {CATEGORY_LABELS.map((item) => <button key={item.id} type="button" role="radio" aria-checked={category === item.id} className={category === item.id ? "selected" : ""} onClick={() => { setCategory(item.id); setPage(1); }}>{item.label}</button>)}
      </div>
      <small>{filtered.length} fontes{source && source !== "live" ? ` · fonte do catálogo: ${source}` : ""}</small>
    </div>
    {filtered.length === 0 ? <div className="font-catalog-state">Nenhuma fonte encontrada para esta busca.</div> : <>
      <ul className="font-catalog-list">
        {visible.map((font) => <li key={font.family}>
          <button type="button" className={font.family === currentFamily ? "selected" : ""} onClick={() => { rememberRecentFont(font.family); onPick(font); }}>
            <span className="font-catalog-name" style={{ fontFamily: `'${font.family}', ${font.category === "monospace" ? "monospace" : font.category === "serif" ? "serif" : "sans-serif"}` }}>{font.family}</span>
            <span className="font-catalog-info">{font.category}{recents.includes(font.family) ? " · recente" : ""}</span>
            <span className="font-catalog-weights">{font.weights.join(" ")}{font.italic ? " · itálico" : ""}</span>
          </button>
        </li>)}
      </ul>
      {visible.length < filtered.length && <button type="button" className="secondary-button font-catalog-more" onClick={() => setPage(page + 1)}>Carregar mais ({filtered.length - visible.length} restantes)</button>}
    </>}
  </div>;
}
