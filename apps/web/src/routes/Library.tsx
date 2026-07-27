import { ConfirmPop } from '@/components/ConfirmPop';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import { Select } from '@/components/seletores';
import { type LibraryComponentRecord, api, previewComponentUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { HeartOff, Loader2, Sun, Tag, X } from 'lucide-react';
import { type KeyboardEvent, useMemo, useState } from 'react';

const CATEGORIES = [
  'all',
  'typography',
  'button',
  'card',
  'interaction',
  'hero',
  'header',
  'nav',
  'footer',
  'feature',
  'pricing',
  'testimonial',
  'faq',
  'cta',
  'form',
  'other',
];
const LABEL: Record<string, string> = {
  all: 'Todos',
  typography: 'Tipografia',
  button: 'Botões',
  card: 'Cards',
  interaction: 'Animações',
  hero: 'Hero',
  header: 'Cabeçalho',
  nav: 'Nav',
  footer: 'Rodapé',
  feature: 'Features',
  pricing: 'Pricing',
  testimonial: 'Depoimentos',
  faq: 'FAQ',
  cta: 'CTA',
  form: 'Forms',
  other: 'Outros',
};

/** Categorias editáveis (sem "all"), para o select do editor. */
const EDIT_CATEGORIES = CATEGORIES.filter((c) => c !== 'all');

export function LibraryPage() {
  const lib = useQuery({ queryKey: ['library'], queryFn: api.listLibrary });
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [detalhe, setDetalhe] = useState<LibraryComponentRecord | null>(null);

  const filtered = useMemo(() => {
    let items = lib.data?.items ?? [];
    if (category !== 'all') items = items.filter((i) => i.category === category);
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) => i.name.toLowerCase().includes(q) || i.tags.some((t) => t.includes(q)),
      );
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
        style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(6, 6, 6, 0.4)' }}
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
            placeholder="buscar por nome ou tag..."
            className="ds-data w-[240px] rounded-full border px-3.5 py-2 text-[12px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]"
            style={{
              borderColor: 'var(--color-border)',
              backgroundColor: 'rgba(0, 0, 0, 0.35)',
              color: 'var(--color-fg)',
            }}
          />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-8 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c, i) => (
            <LibraryCard key={c.id} component={c} index={i} onOpen={setDetalhe} />
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

      {detalhe && (
        <LibraryDetail key={detalhe.id} component={detalhe} onClose={() => setDetalhe(null)} />
      )}
    </div>
  );
}

function LibraryCard({
  component,
  index,
  onOpen,
}: {
  component: LibraryComponentRecord;
  index: number;
  onOpen: (c: LibraryComponentRecord) => void;
}) {
  const delay = index < 6 ? `ds-d${index + 1}` : '';

  return (
    <div className={`ds-scale-in ${delay}`}>
      <div className="ds-card ds-glass-static group relative rounded-xl">
        <div className="ds-card-content overflow-hidden rounded-xl">
          <button
            type="button"
            onClick={() => onOpen(component)}
            aria-label={`Editar ${component.name}`}
            className="block w-full"
          >
            <div className="transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.06]">
              <PreviewFrame src={previewComponentUrl(component.id)} title={component.name} />
            </div>
          </button>
          <div
            className="ds-gradient-glow border-t p-3.5"
            style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}
          >
            <div
              className="truncate text-[13px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-body)' }}
            >
              {component.name}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 truncate">
              <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {LABEL[component.category] ?? 'Outros'}
              </span>
              {component.tags.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded-full px-1.5 py-px text-[9px]"
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.05)',
                    color: 'var(--color-fg-muted)',
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Modal de detalhe + edição: prévia grande à esquerda, campos à direita. */
function LibraryDetail({
  component,
  onClose,
}: {
  component: LibraryComponentRecord;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(component.name);
  const [category, setCategory] = useState(component.category);
  const [notes, setNotes] = useState(component.notes ?? '');
  const [tags, setTags] = useState<string[]>(component.tags);
  const [tagInput, setTagInput] = useState('');
  const [bg, setBg] = useState<'claro' | 'escuro' | undefined>(undefined);
  const [confirmDel, setConfirmDel] = useState(false);

  const impacto = useQuery({
    queryKey: ['lib-impacto', component.id],
    queryFn: () => api.libraryImpact(component.id),
    enabled: confirmDel,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['library'] });
    qc.invalidateQueries({ queryKey: ['kits'] });
  };

  const save = useMutation({
    mutationFn: () =>
      api.patchComponent(component.id, {
        name: name.trim(),
        category,
        notes: notes.trim() === '' ? null : notes.trim(),
        tags,
      }),
    onSuccess: () => {
      invalidate();
      toast.ok('Componente atualizado.');
      onClose();
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao salvar.'),
  });

  const remove = useMutation({
    mutationFn: () => api.removeFromLibrary(component.id),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['segments'] });
      toast.ok('Componente removido da Biblioteca.');
      onClose();
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao remover.'),
  });

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t) && tags.length < 12) setTags([...tags, t]);
    setTagInput('');
  };
  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && tagInput === '' && tags.length > 0) {
      setTags(tags.slice(0, -1));
    }
  };

  const dirty =
    name.trim() !== component.name ||
    category !== component.category ||
    (notes.trim() === '' ? null : notes.trim()) !== component.notes ||
    tags.join(',') !== component.tags.join(',');

  return (
    <Modal open onClose={onClose} size="xl" title={component.name}>
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <div
          className="border-b p-4 lg:border-r lg:border-b-0"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div
              className="text-[10px] uppercase tracking-[0.24em]"
              style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
            >
              Prévia
            </div>
            <BgToggle bg={bg} onChange={setBg} />
          </div>
          <PreviewFrame
            key={bg ?? 'auto'}
            src={previewComponentUrl(component.id, bg)}
            title={component.name}
            aspect={16 / 12}
            interactive
            className="rounded-lg"
          />
        </div>

        <div className="flex flex-col gap-4 p-6">
          <Field label="Nome">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border px-3 py-2 text-[13px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]"
              style={inputStyle}
            />
          </Field>
          <Field label="Categoria">
            <Select
              rotulo="Categoria do componente"
              opcoes={EDIT_CATEGORIES.map((c) => ({ valor: c, rotulo: LABEL[c] ?? c }))}
              valor={category}
              aoMudar={setCategory}
            />
          </Field>
          <Field label="Tags">
            <div
              className="flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-2"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(0,0,0,0.35)' }}
            >
              {tags.map((t) => (
                <span
                  key={t}
                  className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--color-fg)' }}
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                    aria-label={`Remover ${t}`}
                  >
                    <X size={10} />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKey}
                onBlur={addTag}
                placeholder={tags.length < 12 ? 'adicionar tag…' : 'máx. 12'}
                disabled={tags.length >= 12}
                className="ds-data min-w-[80px] flex-1 bg-transparent text-[12px] outline-none"
                style={{ color: 'var(--color-fg)' }}
              />
            </div>
          </Field>
          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border px-3 py-2 text-[13px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)] resize-none"
              style={inputStyle}
              placeholder="anotações internas sobre este componente"
            />
          </Field>

          <div className="mt-auto flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              className="flex items-center gap-1.5 text-[12px] transition-colors"
              style={{ color: 'var(--color-crimson-3)' }}
            >
              <HeartOff size={13} />
              Remover
            </button>
            <button
              type="button"
              onClick={() => save.mutate()}
              disabled={!dirty || name.trim() === '' || save.isPending}
              className="ds-btn ds-glow flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              {save.isPending && <Loader2 size={12} className="animate-spin" />}
              Salvar
            </button>
          </div>
        </div>
      </div>

      <ConfirmPop
        open={confirmDel}
        title={`Remover "${component.name}"?`}
        busy={remove.isPending}
        confirmLabel="Remover da Biblioteca"
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDel(false)}
        description={
          (impacto.data?.usadoEmKits.length ?? 0) > 0 ? (
            <>
              Este componente está em <strong>{impacto.data?.usadoEmKits.length} kit(s)</strong> (
              {impacto.data?.usadoEmKits.map((k) => k.name).join(', ')}). Removê-lo o tira desses
              kits também. Os arquivos em disco são apagados.
            </>
          ) : (
            'Apaga o bundle do disco e desfaz o vínculo com o segmento de origem. Não afeta nenhum kit.'
          )
        }
      />
    </Modal>
  );
}

function BgToggle({
  bg,
  onChange,
}: {
  bg: 'claro' | 'escuro' | undefined;
  onChange: (b: 'claro' | 'escuro' | undefined) => void;
}) {
  const next = bg === undefined ? 'claro' : bg === 'claro' ? 'escuro' : undefined;
  const label = bg === undefined ? 'auto' : bg;
  return (
    <button
      type="button"
      onClick={() => onChange(next)}
      className="ds-tag flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
      title="Alternar o fundo da prévia (auto / claro / escuro)"
    >
      <Sun size={11} />
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o controle vem por children; o <label> o envolve e a associação implícita vale em runtime.
    <label className="block">
      <span
        className="mb-1.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em]"
        style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
      >
        {label === 'Tags' && <Tag size={10} />}
        {label}
      </span>
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
  color: 'var(--color-fg)',
  fontFamily: 'var(--font-body)',
};
