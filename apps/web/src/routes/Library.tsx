import { type LibraryComponentRecord, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, HeartOff, Pencil, X } from 'lucide-react';
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
];
const LABEL: Record<string, string> = {
  all: 'Todos',
  hero: 'Hero',
  header: 'Cabeçalho',
  nav: 'Nav',
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

export function LibraryPage() {
  const lib = useQuery({ queryKey: ['library'], queryFn: api.listLibrary });
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    let items = lib.data?.items ?? [];
    if (category !== 'all') items = items.filter((i) => i.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [lib.data, category, search]);

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const i of lib.data?.items ?? []) map.set(i.category, (map.get(i.category) ?? 0) + 1);
    map.set('all', lib.data?.items.length ?? 0);
    return map;
  }, [lib.data]);

  return (
    <div className="flex h-full">
      <aside
        className="ds-backdrop flex w-[240px] shrink-0 flex-col border-r"
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
          Categorias
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {CATEGORIES.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                'flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[13px]',
                'transition-all duration-300',
                category === c
                  ? 'ds-glass-static text-[var(--color-fg)]'
                  : 'text-[var(--color-fg-muted)] hover:translate-x-[2px] hover:bg-white/[0.04] hover:text-[var(--color-fg)]',
              )}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              <span>{LABEL[c] ?? c}</span>
              <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {counts.get(c) ?? 0}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div
          className="flex items-center justify-between border-b px-8 py-5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div>
            <div
              className="text-[10px] uppercase tracking-[0.24em]"
              style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
            >
              Biblioteca
            </div>
            <h1
              className="ds-interactive-text ds-text-glow mt-1 text-[24px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              {LABEL[category]}
            </h1>
            <div className="ds-data mt-1 text-[11px]" style={{ color: 'var(--color-fg-muted)' }}>
              {filtered.length} componente{filtered.length === 1 ? '' : 's'}
            </div>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="buscar..."
            className="ds-data w-[220px] rounded-full border px-3.5 py-2 text-[12px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              color: 'var(--color-fg)',
            }}
          />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-8 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <LibraryCard key={c.id} component={c} index={i} />
          ))}
          {filtered.length === 0 && (
            <div
              className="col-span-full py-16 text-center text-[13px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              Nenhum componente aqui ainda. Vá na galeria e curte alguns.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Mesmo card da galeria: inclina em 3D, o conteúdo descola e a prévia aproxima.
 * O `overflow-hidden` fica no filho — no card ele forçaria `transform-style:
 * flat` e mataria o relevo.
 */
function LibraryCard({
  component,
  index,
}: {
  component: LibraryComponentRecord;
  index: number;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(component.name);

  const remove = useMutation({
    mutationFn: () => api.removeFromLibrary(component.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
      qc.invalidateQueries({ queryKey: ['segments'] });
    },
  });
  const rename = useMutation({
    mutationFn: () => api.renameComponent(component.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['library'] });
      setEditing(false);
    },
  });

  const srcDoc = useMemo(() => {
    if (!component.designSystemId) return '<p>preview indisponível</p>';
    return `<!doctype html><html><head><base href="/vault/${component.designSystemId}/"/><meta charset="utf-8"/><style>body{margin:0;background:#fff;color:#000;font-family:system-ui}</style><script>fetch('/vault/${component.designSystemId}/design-system.html').then(r=>r.text()).then(h=>{const m=h.match(/<head[^>]*>([\\s\\S]*?)<\\/head>/i);if(m){const d=document.createElement('div');d.innerHTML=m[1];for(const n of [...d.childNodes]){if(n.tagName==='BASE')continue;document.head.appendChild(n);}}}).catch(()=>{});</script></head><body>${'<!-- render vem do metadata -->'}</body></html>`;
  }, [component.designSystemId]);

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
              <iframe
                title={component.name}
                srcDoc={srcDoc}
                className="pointer-events-none h-[500px] w-[800px] origin-top-left"
                style={{ transform: 'scale(0.35)' }}
                sandbox="allow-same-origin"
              />
            </div>
          </div>
          <div
            className="ds-gradient-glow flex items-center justify-between border-t p-3.5"
            style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}
          >
            <div className="min-w-0 flex-1">
              {editing ? (
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-md border px-2.5 py-1 text-[12px] outline-none transition-colors focus:border-[var(--color-signal)]"
                    style={{
                      borderColor: 'var(--color-border)',
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      color: 'var(--color-fg)',
                      fontFamily: 'var(--font-body)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => rename.mutate()}
                    className="rounded-full p-1.5 transition-all duration-300 hover:scale-110 hover:bg-white/[0.06]"
                  >
                    <Check size={12} style={{ color: 'var(--color-signal)' }} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setName(component.name);
                    }}
                    className="rounded-full p-1.5 transition-all duration-300 hover:scale-110 hover:bg-white/[0.06]"
                  >
                    <X size={12} style={{ color: 'var(--color-fg-subtle)' }} />
                  </button>
                </div>
              ) : (
                <>
                  <div
                    className="truncate text-[13px] font-medium"
                    style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-body)' }}
                  >
                    {component.name}
                  </div>
                  <div
                    className="ds-data mt-0.5 text-[10px]"
                    style={{ color: 'var(--color-fg-subtle)' }}
                  >
                    {LABEL[component.category] ?? component.category}
                  </div>
                </>
              )}
            </div>
            {!editing && (
              <div className="ml-2 hidden gap-1 group-hover:flex">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-full p-1.5 transition-all duration-300 hover:scale-110 hover:bg-white/[0.06]"
                  title="Renomear"
                >
                  <Pencil size={12} style={{ color: 'var(--color-fg-muted)' }} />
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate()}
                  className="rounded-full p-1.5 transition-all duration-300 hover:scale-110 hover:bg-[rgba(198,40,40,0.16)]"
                  title="Remover"
                >
                  <HeartOff size={12} style={{ color: 'var(--color-crimson-3)' }} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
