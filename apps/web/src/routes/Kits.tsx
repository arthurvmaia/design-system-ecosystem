import { ConfirmPop } from '@/components/ConfirmPop';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import { type KitRecord, type LibraryComponentRecord, api, previewComponentUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { useReveal } from '@/lib/use-reveal';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Layers,
  Loader2,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

const CAT_LABEL: Record<string, string> = {
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

export function KitsPage() {
  const kits = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  const [editing, setEditing] = useState<KitRecord | null | 'novo'>(null);

  const items = kits.data?.items ?? [];
  useReveal([items.length]);

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-12">
      <div className="flex items-end justify-between">
        <div>
          <div
            className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
          >
            Design Systems
          </div>
          <h1
            className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[36px] font-medium tracking-tight"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            Seus kits finais.
          </h1>
          <p
            className="ds-slide-up ds-d2 mt-3 max-w-[62ch] text-[14px] leading-[1.6]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Um kit é um grupo de componentes da Biblioteca que você juntou e deu nome. É a partir
            dele que o site é gerado.
          </p>
        </div>
        <div className="ds-scale-in ds-d2">
          <button
            type="button"
            onClick={() => setEditing('novo')}
            className="ds-btn ds-gradient-ion ds-glow flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium"
            style={{ color: 'var(--color-bone-1)' }}
          >
            <Plus size={14} />
            Novo kit
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <VazioState carregando={kits.isPending} onNovo={() => setEditing('novo')} />
      ) : (
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
          {items.map((kit) => (
            <KitCard key={kit.id} kit={kit} onEdit={() => setEditing(kit)} />
          ))}
        </div>
      )}

      {editing !== null && (
        <KitEditor kit={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function KitCard({ kit, onEdit }: { kit: KitRecord; onEdit: () => void }) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);
  const capa = kit.components[0];

  const duplicate = useMutation({
    mutationFn: () => api.duplicateKit(kit.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kits'] });
      toast.ok('Kit duplicado.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao duplicar.'),
  });

  const del = useMutation({
    mutationFn: () => api.deleteKit(kit.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kits'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.ok('Kit excluído.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao excluir.'),
  });

  return (
    <div className="ds-reveal ds-card ds-glass-static group rounded-xl">
      <div className="ds-card-content overflow-hidden rounded-xl">
        <div className="relative">
          {capa ? (
            <PreviewFrame src={previewComponentUrl(capa.id)} title={kit.name} aspect={16 / 7} />
          ) : (
            <div
              className="flex items-center justify-center"
              style={{ aspectRatio: '16 / 7', backgroundColor: 'var(--color-ink-2)' }}
            >
              <Layers size={22} style={{ color: 'var(--color-fg-subtle)' }} />
            </div>
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div
                className="truncate text-[16px] font-medium"
                style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
              >
                {kit.name}
              </div>
              {kit.description && (
                <div
                  className="mt-1 line-clamp-2 text-[12px] leading-snug"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {kit.description}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <IconBtn title="Editar" onClick={onEdit}>
                <Pencil size={13} />
              </IconBtn>
              <IconBtn
                title="Duplicar"
                onClick={() => duplicate.mutate()}
                busy={duplicate.isPending}
              >
                <Copy size={13} />
              </IconBtn>
              <IconBtn title="Excluir" danger onClick={() => setConfirmDel(true)}>
                <Trash2 size={13} />
              </IconBtn>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-3">
            <span
              className="ds-data flex items-center gap-1.5 text-[11px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              <Package size={12} style={{ color: 'var(--color-signal)' }} />
              {kit.components.length} componente{kit.components.length === 1 ? '' : 's'}
            </span>
            {kit.usedByProjects.length > 0 && (
              <span className="ds-data text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                · usado em {kit.usedByProjects.length} projeto
                {kit.usedByProjects.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
      </div>

      <ConfirmPop
        open={confirmDel}
        title={`Excluir o kit "${kit.name}"?`}
        busy={del.isPending}
        confirmLabel="Excluir kit"
        onConfirm={() => del.mutate()}
        onClose={() => setConfirmDel(false)}
        description={
          kit.usedByProjects.length > 0 ? (
            <>
              <strong>{kit.usedByProjects.length} projeto(s)</strong> usam este kit (
              {kit.usedByProjects.map((p) => p.name).join(', ')}). Eles não somem: só perdem a
              ligação com o kit de origem. Os sites que já foram gerados continuam lá.
            </>
          ) : (
            'O kit é só uma seleção. Os componentes continuam na Biblioteca, do jeito que estão.'
          )
        }
      />
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger = false,
  busy = false,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={busy}
      className="rounded-full p-1.5 transition-all duration-300 hover:scale-110 hover:bg-white/[0.06] disabled:opacity-50"
      style={{ color: danger ? 'var(--color-ion-3)' : 'var(--color-fg-muted)' }}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : children}
    </button>
  );
}

/** Editor de kit: metadados + picker da Biblioteca com preview, busca e ordem. */
function KitEditor({ kit, onClose }: { kit: KitRecord | null; onClose: () => void }) {
  const qc = useQueryClient();
  const lib = useQuery({ queryKey: ['library'], queryFn: api.listLibrary });

  const [name, setName] = useState(kit?.name ?? '');
  const [description, setDescription] = useState(kit?.description ?? '');
  const [selected, setSelected] = useState<string[]>(kit?.components.map((c) => c.id) ?? []);
  const [search, setSearch] = useState('');

  const porId = useMemo(() => {
    const m = new Map<string, LibraryComponentRecord>();
    for (const c of lib.data?.items ?? []) m.set(c.id, c);
    return m;
  }, [lib.data]);

  const disponiveis = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (lib.data?.items ?? []).filter((c) => {
      if (selected.includes(c.id)) return false;
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || c.category.includes(q);
    });
  }, [lib.data, selected, search]);

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() === '' ? null : description.trim(),
        componentIds: selected,
      };
      return kit ? api.updateKit(kit.id, payload) : api.createKit(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kits'] });
      toast.ok(kit ? 'Kit atualizado.' : 'Kit criado.');
      onClose();
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao salvar o kit.'),
  });

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= selected.length) return;
    const copia = [...selected];
    const tmp = copia[i];
    const outro = copia[j];
    if (tmp === undefined || outro === undefined) return;
    copia[i] = outro;
    copia[j] = tmp;
    setSelected(copia);
  };

  return (
    // Colunas com rolagem própria: o corpo do modal não deve rolar por fora.
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={kit ? 'Editar kit' : 'Novo kit'}
      bodyScroll={false}
    >
      <div className="flex max-h-[88vh] flex-col">
        <div
          className="grid grid-cols-1 gap-3 border-b px-6 py-4 md:grid-cols-[1fr_1.5fr]"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="nome do kit"
            className="rounded-md border px-3 py-2 text-[14px] outline-none transition-all focus:border-[var(--color-signal)]"
            style={fieldStyle}
          />
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="descrição (opcional)"
            className="rounded-md border px-3 py-2 text-[13px] outline-none transition-all focus:border-[var(--color-signal)]"
            style={fieldStyle}
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Selecionados, na ordem. */}
          <div
            className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0"
            style={{ borderColor: 'var(--color-border)' }}
          >
            <div
              className="flex items-center justify-between px-5 py-3 text-[10px] uppercase tracking-[0.24em]"
              style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
            >
              <span>No kit · {selected.length}</span>
            </div>
            <div className="min-h-[220px] flex-1 space-y-2 overflow-y-auto px-4 pb-4">
              {selected.length === 0 && (
                <div
                  className="px-2 py-10 text-center text-[12px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  Nenhum componente ainda. Escolha na Biblioteca, ao lado.
                </div>
              )}
              {selected.map((id, i) => {
                const c = porId.get(id);
                return (
                  <div key={id} className="ds-glass-static flex items-center gap-3 rounded-lg p-2">
                    <div
                      className="ds-data w-5 shrink-0 text-center text-[11px]"
                      style={{ color: 'var(--color-fg-subtle)' }}
                    >
                      {i + 1}
                    </div>
                    <div className="h-[44px] w-[72px] shrink-0 overflow-hidden rounded-md">
                      <PreviewFrame
                        src={previewComponentUrl(id)}
                        title={c?.name ?? 'Componente removido da Biblioteca'}
                        aspect={72 / 44}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[12px]" style={{ color: 'var(--color-fg)' }}>
                        {c?.name ?? 'Componente removido'}
                      </div>
                      <div
                        className="ds-data text-[10px]"
                        style={{ color: 'var(--color-fg-subtle)' }}
                      >
                        {CAT_LABEL[c?.category ?? ''] ?? c?.category ?? ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => mover(i, -1)}
                        disabled={i === 0}
                        className="rounded p-1 disabled:opacity-25 hover:bg-white/[0.06]"
                        title="Subir"
                      >
                        <ArrowUp size={12} style={{ color: 'var(--color-fg-muted)' }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => mover(i, 1)}
                        disabled={i === selected.length - 1}
                        className="rounded p-1 disabled:opacity-25 hover:bg-white/[0.06]"
                        title="Descer"
                      >
                        <ArrowDown size={12} style={{ color: 'var(--color-fg-muted)' }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelected(selected.filter((x) => x !== id))}
                        className="rounded p-1 hover:bg-[rgba(239,68,68,0.16)]"
                        title="Remover"
                      >
                        <X size={12} style={{ color: 'var(--color-ion-3)' }} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Disponíveis na Biblioteca. */}
          <div className="flex min-h-0 flex-col">
            <div className="px-5 py-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="buscar na Biblioteca..."
                className="ds-data w-full rounded-full border px-3.5 py-1.5 text-[12px] outline-none focus:border-[var(--color-signal)]"
                style={fieldStyle}
              />
            </div>
            <div className="grid min-h-[220px] flex-1 grid-cols-2 content-start gap-2 overflow-y-auto px-4 pb-4">
              {disponiveis.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected([...selected, c.id])}
                  className="group ds-glass overflow-hidden rounded-lg text-left"
                >
                  <PreviewFrame src={previewComponentUrl(c.id)} title={c.name} aspect={16 / 10} />
                  <div className="flex items-center justify-between gap-1 p-2">
                    <div className="min-w-0">
                      <div className="truncate text-[11px]" style={{ color: 'var(--color-fg)' }}>
                        {c.name}
                      </div>
                      <div
                        className="ds-data text-[9px]"
                        style={{ color: 'var(--color-fg-subtle)' }}
                      >
                        {CAT_LABEL[c.category] ?? c.category}
                      </div>
                    </div>
                    <Plus size={13} className="shrink-0" style={{ color: 'var(--color-signal)' }} />
                  </div>
                </button>
              ))}
              {lib.data && disponiveis.length === 0 && (
                <div
                  className="col-span-2 px-2 py-10 text-center text-[12px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {(lib.data.items.length ?? 0) === 0
                    ? 'Sua Biblioteca está vazia. Vá até a Galeria e curta alguns componentes.'
                    : 'Tudo já está no kit, ou nada aqui bate com a busca.'}
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className="flex items-center justify-end gap-2 border-t px-6 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-[12px]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => save.mutate()}
            disabled={name.trim() === '' || save.isPending}
            className="ds-btn ds-glow flex items-center gap-2 rounded-full px-5 py-2 text-[13px] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {save.isPending && <Loader2 size={12} className="animate-spin" />}
            {kit ? 'Salvar kit' : 'Criar kit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function VazioState({ carregando, onNovo }: { carregando: boolean; onNovo: () => void }) {
  return (
    <div className="ds-glass-static ds-slide-up ds-d3 mt-10 rounded-xl p-10 text-center">
      <Layers size={22} className="mx-auto" style={{ color: 'var(--color-fg-subtle)' }} />
      <div className="mt-4 text-[14px]" style={{ color: 'var(--color-fg-muted)' }}>
        {carregando ? 'Carregando...' : 'Nenhum kit ainda.'}
      </div>
      {!carregando && (
        <button
          type="button"
          onClick={onNovo}
          className={cn('ds-btn mt-4 rounded-full px-4 py-2 text-[12px] font-medium')}
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
        >
          Montar o primeiro kit
        </button>
      )}
    </div>
  );
}

const fieldStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
  color: 'var(--color-fg)',
  fontFamily: 'var(--font-body)',
};
