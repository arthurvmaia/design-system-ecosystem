import { type DesignSystemRecord, type SegmentRecord, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

const CATEGORIES = [
  'all',
  'hero',
  'header',
  'nav',
  'footer',
  'card',
  'feature',
  'pricing',
  'testimonial',
  'faq',
  'cta',
  'form',
  'button',
  'other',
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  all: 'Todos',
  hero: 'Hero',
  header: 'Cabeçalho',
  nav: 'Navegação',
  footer: 'Rodapé',
  card: 'Cards',
  feature: 'Features',
  pricing: 'Pricing',
  testimonial: 'Depoimentos',
  faq: 'FAQ',
  cta: 'CTA',
  form: 'Forms',
  button: 'Botões',
  other: 'Outros',
};

export function GalleryPage() {
  const dsList = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems });
  const [selectedDs, setSelectedDs] = useState<string | null>(null);
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('all');
  const [search, setSearch] = useState('');

  const effectiveDs = selectedDs ?? dsList.data?.items[0]?.id ?? null;

  return (
    <div className="flex h-full">
      <DsSidebar
        list={dsList.data?.items ?? []}
        loading={dsList.isLoading}
        selected={effectiveDs}
        onSelect={setSelectedDs}
      />
      <div className="min-w-0 flex-1 overflow-y-auto">
        {effectiveDs ? (
          <SegmentsView
            dsId={effectiveDs}
            category={category}
            onCategoryChange={setCategory}
            search={search}
            onSearchChange={setSearch}
          />
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}

function DsSidebar({
  list,
  loading,
  selected,
  onSelect,
}: {
  list: DesignSystemRecord[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: (id: string) => api.deleteDesignSystem(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['design-systems'] }),
  });

  return (
    <aside
      className="ds-backdrop flex w-[260px] shrink-0 flex-col border-r"
      style={{
        borderColor: 'var(--color-border)',
        backgroundColor: 'rgba(6, 6, 6, 0.4)',
      }}
    >
      <div
        className="border-b px-5 py-4 text-[10px] uppercase tracking-[0.28em]"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-fg-subtle)',
          fontFamily: 'var(--font-display)',
        }}
      >
        Design Systems
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="p-4 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            carregando...
          </div>
        ) : list.length === 0 ? (
          <div className="p-4 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            nenhum design system ainda. vá em Extrair.
          </div>
        ) : (
          list.map((ds) => (
            <div
              key={ds.id}
              className={cn(
                'group relative flex items-center rounded-md transition-all duration-300',
                selected === ds.id
                  ? 'ds-glass-static'
                  : 'hover:translate-x-[2px] hover:bg-white/[0.04]',
              )}
            >
              <button
                type="button"
                onClick={() => onSelect(ds.id)}
                className={cn(
                  'min-w-0 flex-1 truncate px-3 py-2.5 text-left text-[13px] transition-colors',
                  selected === ds.id
                    ? 'text-[var(--color-fg)]'
                    : 'text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
                )}
              >
                {selected === ds.id && <span className="ds-active-bar" aria-hidden />}
                <div className="truncate" style={{ fontFamily: 'var(--font-body)' }}>
                  {ds.name}
                </div>
                <div
                  className="ds-data mt-0.5 truncate text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {ds.status}
                </div>
              </button>
              <button
                type="button"
                onClick={() => del.mutate(ds.id)}
                className="mr-2 hidden rounded-full p-1.5 transition-all duration-300 hover:bg-[rgba(198,40,40,0.16)] group-hover:block"
                title="Deletar"
              >
                <Trash2 size={12} style={{ color: 'var(--color-crimson-3)' }} />
              </button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

function SegmentsView({
  dsId,
  category,
  onCategoryChange,
  search,
  onSearchChange,
}: {
  dsId: string;
  category: (typeof CATEGORIES)[number];
  onCategoryChange: (c: (typeof CATEGORIES)[number]) => void;
  search: string;
  onSearchChange: (s: string) => void;
}) {
  const segments = useQuery({
    queryKey: ['segments', dsId],
    queryFn: () => api.listSegments(dsId),
  });
  const dsInfo = useQuery({
    queryKey: ['ds', dsId],
    queryFn: () => api.getDesignSystem(dsId),
  });

  const qc = useQueryClient();
  const classify = useMutation({
    mutationFn: () => api.classify(dsId),
    onSuccess: () => {
      // Poll pra invalidar segmentos quando classificar terminar
      setTimeout(() => qc.invalidateQueries({ queryKey: ['segments', dsId] }), 3000);
    },
  });

  const filtered = useMemo(() => {
    let items = segments.data?.items ?? [];
    if (category !== 'all') items = items.filter((s) => s.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((s) => s.name.toLowerCase().includes(q));
    }
    return items;
  }, [segments.data, category, search]);

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center justify-between border-b px-8 py-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            Galeria
          </div>
          <h1
            className="ds-interactive-text ds-text-glow mt-1 text-[24px] font-medium"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            {dsInfo.data?.item.name ?? '...'}
          </h1>
          <div className="ds-data mt-1 text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>
            {filtered.length} de {segments.data?.items.length ?? 0} segmentos
          </div>
          {(dsInfo.data?.assetsFaltando.length ?? 0) > 0 && (
            <div
              className="mt-2 rounded-md px-3 py-2 text-[11px] leading-relaxed"
              style={{ backgroundColor: 'rgba(107, 20, 20, 0.2)', color: 'var(--color-fg)' }}
            >
              Esta extração está incompleta: o HTML aponta para{' '}
              {dsInfo.data?.assetsFaltando.length} arquivo(s) que não existem em disco (
              <span className="ds-data">{dsInfo.data?.assetsFaltando.slice(0, 3).join(', ')}</span>
              ). Sem eles as prévias aparecem sem estilo. Extraia este site de novo.
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => classify.mutate()}
          disabled={classify.isPending}
          className="ds-btn ds-glow-border ds-backdrop flex items-center gap-2 rounded-full px-4 py-2 text-[12px] disabled:opacity-50"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            color: 'var(--color-fg)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {classify.isPending ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          Classificar via LLM
        </button>
      </div>

      <div
        className="flex items-center gap-2 border-b px-8 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => onCategoryChange(c)}
              className={cn(
                'ds-tag rounded-full border px-3 py-1 text-[11px]',
                category === c
                  ? 'ds-glass-static text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              )}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {CATEGORY_LABEL[c] ?? c}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="buscar..."
          className="ds-data ml-auto w-[200px] rounded-full border px-3.5 py-1.5 text-[12px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            color: 'var(--color-fg)',
          }}
        />
      </div>

      <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-8 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((seg, i) => (
          <SegmentCard key={seg.id} segment={seg} dsId={dsId} index={i} />
        ))}
        {filtered.length === 0 && !segments.isLoading && (
          <div
            className="col-span-full py-16 text-center text-[13px]"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            Nenhum segmento nessa combinação de filtros.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * O card da galeria é onde a referência aparece inteira: inclina em 3D sob o
 * cursor, o conteúdo descola da borda e a prévia aproxima devagar.
 *
 * O `overflow-hidden` fica no filho, não no card. Overflow diferente de
 * `visible` força `transform-style: flat` — no card, ele mataria justamente o
 * relevo que o `translateZ` do conteúdo cria.
 */
function SegmentCard({
  segment,
  dsId,
  index,
}: {
  segment: SegmentRecord;
  dsId: string;
  index: number;
}) {
  const qc = useQueryClient();

  const add = useMutation({
    mutationFn: () => api.addToLibrary(segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      qc.invalidateQueries({ queryKey: ['library'] });
    },
  });

  // O <head> real do design system. Buscado uma vez e compartilhado por todos
  // os cards — a queryKey é a mesma, então o React Query faz uma requisição só.
  const head = useDesignSystemHead(dsId);
  const srcDoc = useMemo(
    () => buildPreviewSrcDoc(segment.htmlSnippet, dsId, head.data ?? ''),
    [segment.htmlSnippet, dsId, head.data],
  );

  // A entrada vai no invólucro porque `ds-scale-in` guarda o transform final e
  // venceria o hover do card. Escalonada só nos primeiros, senão a última
  // fileira de uma galeria grande demora demais para aparecer.
  const delay = index < 6 ? `ds-d${index + 1}` : '';

  return (
    <div className={`ds-scale-in ${delay}`}>
      <div className="ds-card ds-glass-static group relative rounded-xl">
        <div className="ds-card-content overflow-hidden rounded-xl">
          <div
            className="aspect-[16/10] overflow-hidden"
            style={{ backgroundColor: 'var(--color-obsidian-0)' }}
          >
            <div className="h-full w-full transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.06]">
              {/* Só monta depois que o head chegou. Montar antes mostraria o
                  segmento sem estilo por um instante, e é exatamente essa a
                  aparência de prévia quebrada que queremos evitar. */}
              {head.isPending ? null : (
                <iframe
                  title={segment.name}
                  srcDoc={srcDoc}
                  className="pointer-events-none h-[500px] w-[800px] origin-top-left"
                  style={{ transform: 'scale(0.35)' }}
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>
          <div
            className="ds-gradient-glow flex items-center justify-between border-t p-3.5"
            style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}
          >
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-[13px] font-medium"
                style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-body)' }}
              >
                {segment.name}
              </div>
              <div
                className="ds-data mt-0.5 truncate text-[10px]"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                {CATEGORY_LABEL[segment.category] ?? segment.category} ·{' '}
                {segment.htmlSnippet.length}b
              </div>
            </div>
            <button
              type="button"
              onClick={() => add.mutate()}
              disabled={segment.inLibrary || add.isPending}
              className={cn(
                'ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-300 disabled:cursor-not-allowed',
                segment.inLibrary ? 'ds-glow' : 'hover:scale-110',
              )}
              style={{
                backgroundColor: segment.inLibrary
                  ? 'var(--color-primary)'
                  : 'rgba(255, 255, 255, 0.06)',
              }}
              title={segment.inLibrary ? 'Já na biblioteca' : 'Adicionar à biblioteca'}
            >
              <Heart
                size={13}
                style={{
                  color: segment.inLibrary ? 'var(--color-bone-1)' : 'var(--color-fg-muted)',
                  fill: segment.inLibrary ? 'var(--color-bone-1)' : 'none',
                }}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * O `<head>` do design-system.html extraído, sem os `<script>`.
 *
 * A busca acontece aqui no pai, e não dentro do iframe, por uma razão de
 * segurança. O conteúdo do segmento é HTML de terceiros, raspado de um site
 * qualquer, então o iframe fica com o sandbox fechado. Sem `allow-scripts`
 * nenhum script roda lá dentro — e era justamente um script interno que
 * carregava o CSS, por isso a prévia saía crua: fundo branco, texto preto,
 * link azul.
 *
 * Liberar `allow-scripts` resolveria o estilo, mas combinado com
 * `allow-same-origin` daria ao site extraído acesso à origem do app. Trazer o
 * CSS pronto de fora resolve os dois lados: a prévia fica fiel e o sandbox
 * continua fechado.
 */
function useDesignSystemHead(dsId: string) {
  return useQuery({
    queryKey: ['ds-head', dsId],
    queryFn: async () => {
      const res = await fetch(`/vault/${dsId}/design-system.html`);
      if (!res.ok) return '';
      const html = await res.text();
      const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] ?? '';
      // <script> não roda no sandbox e <base> brigaria com o nosso.
      return head.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<base[^>]*>/gi, '');
    },
    staleTime: Number.POSITIVE_INFINITY,
  });
}

function buildPreviewSrcDoc(snippet: string, dsId: string, head: string): string {
  // O <base> faz as URLs relativas do segmento (imagens, fontes, css)
  // resolverem contra o vault em vez da origem do app.
  //
  // O <style> de fallback vem ANTES do head do design system: se o CSS real
  // chegar, ele vence; se não chegar, ainda sobra algo legível.
  return `<!doctype html>
<html>
<head>
<base href="/vault/${dsId}/"/>
<meta charset="utf-8"/>
<meta name="viewport" content="width=800"/>
<style>body{margin:0;background:#fff;color:#000;font-family:system-ui}</style>
${head}
</head>
<body>
${snippet}
</body>
</html>`;
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="ds-slide-up max-w-[400px] text-center">
        <div
          className="text-[11px] uppercase tracking-[0.24em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Galeria vazia
        </div>
        <h2
          className="ds-text-glow mt-2 text-[24px]"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
        >
          Nenhum design system extraído
        </h2>
        <p className="mt-3 text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
          Vá em Extrair e traga o primeiro site pro ecossistema.
        </p>
      </div>
    </div>
  );
}
