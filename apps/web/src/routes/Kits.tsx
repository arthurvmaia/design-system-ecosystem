import { ConfirmPop } from '@/components/ConfirmPop';
import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import {
  type KitDesignSystem,
  type KitEmUso,
  type KitRecord,
  type LibraryComponentRecord,
  api,
  previewComponentUrl,
} from '@/lib/api';
import { cn } from '@/lib/cn';
import { ROTULO_TOKEN } from '@/lib/marca-rotulos';
import { TRABALHANDO, TRATAMENTO, VAZIO, conta } from '@/lib/orbis';
import { usePreferencias } from '@/lib/preferencias';
import { isAllSelected, prune, toggleAllVisible, toggle as toggleSel } from '@/lib/selection';
import { toast } from '@/lib/toast';
import { useReveal } from '@/lib/use-reveal';
import { CONFIANCA_MINIMA_PARA_RECOLORIR, rotuloDaCategoria } from '@ds/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Layers,
  Package,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

/** O rótulo da categoria vem da taxonomia única do `@ds/shared`. A cópia que
    morava aqui conhecia 15 das 25 categorias. */
const CAT_LABEL = (c: string): string => rotuloDaCategoria(c);

// ── Design system consolidado do kit ─────────────────────────────────────────

type OrigemDoKit = KitDesignSystem['origens'][number];
type ClusterDoKit = OrigemDoKit['clusters'][number];

/** Rótulos pt-BR; a UI não mostra id técnico (mesma regra do marca-rotulos). */
const ROTULO_TEMA: Record<KitDesignSystem['tema'], string> = {
  claro: 'tema claro',
  escuro: 'tema escuro',
  misto: 'tema misto',
};
const ROTULO_PAPEL_FONTE: Record<'display' | 'body' | 'mono', string> = {
  display: 'títulos',
  body: 'texto',
  mono: 'mono',
};

/** O mesmo limiar do composer, em %; o painel promete só o que a geração faz. */
const LIMIAR_RECOLORIR_PCT = Math.round(CONFIANCA_MINIMA_PARA_RECOLORIR * 100);

/**
 * As cores que resumem o kit num relance (faixa do card): clusters com papel
 * primeiro, por confiança, porque são os que dialogam com a marca; depois os
 * demais. Sem repetir hex e no máximo 6, senão a faixa vira ruído.
 */
const coresDoResumo = (item: KitDesignSystem | null): string[] => {
  if (item === null) return [];
  const clusters = item.origens.flatMap((o) => o.clusters);
  const ordenados = [
    ...clusters.filter((c) => c.papel !== null).sort((a, b) => b.confianca - a.confianca),
    ...clusters.filter((c) => c.papel === null),
  ];
  const unicas: string[] = [];
  for (const c of ordenados) {
    if (!unicas.includes(c.corCanonica)) unicas.push(c.corCanonica);
    if (unicas.length >= 6) break;
  }
  return unicas;
};

export function KitsPage() {
  const qc = useQueryClient();
  const kits = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  const [editing, setEditing] = useState<KitRecord | null | 'novo'>(null);

  // ── Seleção múltipla + exclusão em lote ────────────────────────────────────
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmaLote, setConfirmaLote] = useState(false);
  const [emUsoPendente, setEmUsoPendente] = useState<KitEmUso[] | null>(null);

  const items = kits.data?.items ?? [];
  useReveal([items.length]);

  useEffect(() => {
    setSel((s) =>
      prune(
        s,
        (kits.data?.items ?? []).map((k) => k.id),
      ),
    );
  }, [kits.data]);

  const excluir = useMutation({
    mutationFn: (args: { ids: string[]; confirmar: boolean }) =>
      api.excluirKitsEmLote(args.ids, args.confirmar),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['kits'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      if (res.excluidos.length > 0) {
        toast.ok(`Excluí ${conta(res.excluidos.length, 'kit', 'kits')}.`);
      }
      setSel((s) => new Set([...s].filter((id) => !res.excluidos.includes(id))));
      // Só o que está EM USO e ainda NÃO saiu volta para a segunda confirmação;
      // sem o filtro, a resposta da chamada confirmada reabriria o aviso.
      const pendentes = res.emUso.filter((u) => !res.excluidos.includes(u.id));
      setEmUsoPendente(pendentes.length > 0 ? pendentes : null);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui excluir agora.'),
  });

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
            Aqui as peças viram um kit.
          </h1>
          <p
            className="ds-slide-up ds-d2 mt-3 max-w-[62ch] text-[14px] leading-[1.6]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Um kit não é uma pasta, {TRATAMENTO}: é o design system final. Eu gero o site usando só
            as peças que estiverem nele.
          </p>
        </div>
        <div className="ds-scale-in ds-d2">
          <button
            type="button"
            onClick={() => setEditing('novo')}
            className="ds-btn ds-gradient-ion ds-glow flex items-center gap-2 rounded-none px-5 py-2.5 text-[13px] font-medium"
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
        <>
          <div
            className="mt-8 flex items-center gap-2 text-[12px]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={isAllSelected(
                  sel,
                  items.map((k) => k.id),
                )}
                onChange={() =>
                  setSel((s) =>
                    toggleAllVisible(
                      s,
                      items.map((k) => k.id),
                    ),
                  )
                }
                className="h-4 w-4 accent-[var(--color-primary)]"
              />
              Selecionar todos os kits
            </label>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {items.map((kit) => (
              <KitCard
                key={kit.id}
                kit={kit}
                onEdit={() => setEditing(kit)}
                selected={sel.has(kit.id)}
                onToggle={() => setSel((s) => toggleSel(s, kit.id))}
              />
            ))}
          </div>
        </>
      )}

      {editing !== null && (
        <KitEditor kit={editing === 'novo' ? null : editing} onClose={() => setEditing(null)} />
      )}

      {/* Barra contextual — só existe quando há seleção. */}
      {sel.size > 0 && (
        <div
          className="ds-scale-in fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-none border px-5 py-2.5"
          style={{
            backgroundColor: 'rgba(13, 13, 14, 0.97)',
            borderColor: 'var(--color-border-strong)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        >
          <span className="text-[13px]" style={{ color: 'var(--color-fg)' }}>
            {conta(sel.size, 'kit selecionado', 'kits selecionados')}
          </span>
          <button
            type="button"
            onClick={() => setSel(new Set())}
            className="text-[12px] underline"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Limpar
          </button>
          <button
            type="button"
            disabled={excluir.isPending}
            onClick={() =>
              usePreferencias.getState().confirmarAntesDeExcluir
                ? setConfirmaLote(true)
                : excluir.mutate({ ids: [...sel], confirmar: false })
            }
            className="ds-btn flex items-center gap-1.5 rounded-none px-4 py-1.5 text-[12px] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {excluir.isPending ? <Mascote tamanho={12} girando /> : <Trash2 size={12} />}
            Excluir
          </button>
        </div>
      )}

      <ConfirmPop
        open={confirmaLote}
        title={`Excluir ${conta(sel.size, 'kit', 'kits')}?`}
        description="O kit é só uma seleção: as peças continuam na Biblioteca, do jeito que estão. Os kits que algum projeto usa eu confirmo outra vez antes de excluir."
        confirmLabel="Excluir"
        busy={excluir.isPending}
        onConfirm={() => {
          setConfirmaLote(false);
          excluir.mutate({ ids: [...sel], confirmar: false });
        }}
        onClose={() => setConfirmaLote(false)}
      />

      <ConfirmPop
        open={emUsoPendente !== null}
        title={conta(emUsoPendente?.length ?? 0, 'kit está em uso', 'kits estão em uso')}
        description={
          <div className="space-y-1.5">
            {(emUsoPendente ?? []).slice(0, 5).map((u) => (
              <div key={u.id} className="text-[12px] leading-snug">
                <strong>{u.name}</strong> é o kit de {u.projetos.join(', ')}
              </div>
            ))}
            <div className="pt-1 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
              Se excluir mesmo assim, projeto nenhum some: eles só perdem a ligação com o kit, e os
              sites que eu já gerei continuam em disco.
            </div>
          </div>
        }
        confirmLabel="Excluir mesmo assim"
        busy={excluir.isPending}
        onConfirm={() => {
          const ids = (emUsoPendente ?? []).map((u) => u.id);
          setEmUsoPendente(null);
          excluir.mutate({ ids, confirmar: true });
        }}
        onClose={() => setEmUsoPendente(null)}
      />
    </div>
  );
}

function KitCard({
  kit,
  onEdit,
  selected,
  onToggle,
}: {
  kit: KitRecord;
  onEdit: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);
  const capa = kit.components[0];

  // O design system consolidado vira uma faixa de cores no card. `staleTime`
  // alto de propósito: a primeira leitura pode consolidar no servidor, e a
  // resposta só muda quando o kit troca de peças (aí a invalidação cobre).
  const ds = useQuery({
    queryKey: ['kit-design-system', kit.id],
    queryFn: () => api.getKitDesignSystem(kit.id),
    staleTime: 5 * 60_000,
  });
  const cores = useMemo(() => coresDoResumo(ds.data?.item ?? null), [ds.data]);

  const duplicate = useMutation({
    mutationFn: () => api.duplicateKit(kit.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kits'] });
      toast.ok('Dupliquei o kit.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui duplicar o kit.'),
  });

  const del = useMutation({
    mutationFn: () => api.deleteKit(kit.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kits'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.ok('Excluí o kit.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui excluir o kit.'),
  });

  return (
    <div
      className="ds-reveal ds-card ds-glass-static group relative rounded-xl"
      style={selected ? { outline: '2px solid var(--color-ion-5)' } : undefined}
    >
      {/* o checkbox fica FORA dos botões de ação — marcar não edita nem exclui */}
      <label
        className={cn(
          'absolute top-2.5 left-2.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-opacity',
          selected ? 'opacity-100' : 'opacity-40 group-hover:opacity-100',
        )}
        style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Selecionar ${kit.name}`}
          className="h-4 w-4 accent-[var(--color-primary)]"
        />
      </label>
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
              {conta(kit.components.length, 'peça', 'peças')}
            </span>
            {kit.usedByProjects.length > 0 && (
              <span className="ds-data text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                · usado em {conta(kit.usedByProjects.length, 'projeto', 'projetos')}
              </span>
            )}
          </div>

          {/* A cara do kit num relance. Sem consolidado, a faixa não aparece. */}
          {cores.length > 0 && (
            <div className="mt-2.5 flex items-center gap-1">
              {cores.map((hex) => (
                <span
                  key={hex}
                  className="h-3.5 w-3.5 rounded border"
                  style={{ backgroundColor: hex, borderColor: 'rgba(255,255,255,0.14)' }}
                  title={hex}
                />
              ))}
              {ds.data?.item?.tema === 'misto' && (
                <span
                  className="ds-data ml-1.5 text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  tema misto
                </span>
              )}
            </div>
          )}
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
              Este kit está em{' '}
              <strong>{conta(kit.usedByProjects.length, 'projeto', 'projetos')}</strong> (
              {kit.usedByProjects.map((p) => p.name).join(', ')}). Eles não somem: perdem só a
              ligação com o kit de origem, e os sites que eu já gerei continuam em disco.
            </>
          ) : (
            'O kit é só uma seleção: as peças continuam na Biblioteca, do jeito que estão.'
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
      className="rounded-none p-1.5 transition-all duration-300 hover:scale-110 hover:bg-white/[0.06] disabled:opacity-50"
      style={{ color: danger ? 'var(--color-ion-3)' : 'var(--color-fg-muted)' }}
    >
      {busy ? <Mascote tamanho={13} girando /> : children}
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
      // O PATCH/POST reconsolida o design system no servidor; sem invalidar,
      // o painel e a faixa do card mostrariam a paleta das peças antigas.
      qc.invalidateQueries({ queryKey: ['kit-design-system'] });
      toast.ok(kit ? 'Salvei o kit.' : 'Criei o kit.');
      onClose();
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui salvar o kit.'),
  });

  // O consolidado reflete o kit SALVO; com a seleção mexida, o painel avisa
  // que só reconsolido depois de salvar, em vez de fingir que já acompanhou.
  const selecaoMudou =
    kit !== null && selected.join('\n') !== kit.components.map((c) => c.id).join('\n');

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
                  Kit vazio. Escolha as peças na Biblioteca, ao lado.
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
                        {CAT_LABEL(c?.category ?? '')}
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
                className="ds-data w-full rounded-none border px-3.5 py-1.5 text-[12px] outline-none focus:border-[var(--color-signal)]"
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
                        {CAT_LABEL(c.category)}
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
                    ? 'A Biblioteca está vazia. Guarde peças na Galeria e elas aparecem aqui.'
                    : 'Ou já está tudo no kit, ou nada aqui bate com a busca.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* O design system consolidado: o que o kit afirma de cor e de fonte.
            Kit novo ainda não tem id nem consolidação, então nem mostra. */}
        {kit && <KitDesignSystemPanel kitId={kit.id} desatualizado={selecaoMudou} />}

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
            className="ds-btn ds-glow flex items-center gap-2 rounded-none px-5 py-2 text-[13px] font-medium disabled:opacity-40"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {save.isPending && <Mascote tamanho={12} girando />}
            {kit ? 'Salvar kit' : 'Criar kit'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * O painel do design system consolidado do kit.
 *
 * Mostra o que a consolidação afirmou (cluster com papel, confiança em número)
 * e o que ela não conseguiu afirmar (clusters sem papel, limitações por
 * extenso). O limiar vem do shared, o MESMO número que o composer usa na
 * geração: o que o painel diz que recolore é exatamente o que sai recolorido.
 */
function KitDesignSystemPanel({
  kitId,
  desatualizado,
}: {
  kitId: string;
  desatualizado: boolean;
}) {
  // Fechado por padrão: é conferência, não tarefa. Quem abre o editor de kit
  // veio escolher peças; este painel serve para tirar uma dúvida específica
  // ("o que vai acontecer com as cores?"), e ocupar a tela o tempo todo com a
  // resposta de uma pergunta que ainda não foi feita é o que deixa a tela suja.
  const [aberto, setAberto] = useState(false);
  const ds = useQuery({
    queryKey: ['kit-design-system', kitId],
    queryFn: () => api.getKitDesignSystem(kitId),
  });
  // Só para dar nome humano às origens; sem isso o painel segue funcionando.
  const sistemas = useQuery({ queryKey: ['design-systems'], queryFn: api.listDesignSystems });
  const nomeDaOrigem = (id: string): string =>
    sistemas.data?.items.find((s) => s.id === id)?.name ?? 'origem que não reconheci';

  const item = ds.data?.item ?? null;

  return (
    <div className="border-t" style={{ borderColor: 'var(--color-border)' }}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        className="flex w-full items-center gap-2 px-5 py-3 text-left"
      >
        <span
          className="text-[10px] uppercase tracking-[0.24em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Design System
        </span>
        {item !== null && (
          <span
            className="ds-data rounded-none border px-2 py-0.5 text-[10px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            {ROTULO_TEMA[item.tema]}
          </span>
        )}
        <ChevronDown
          size={13}
          className={cn('ml-auto shrink-0 transition-transform', aberto && 'rotate-180')}
          style={{ color: 'var(--color-fg-subtle)' }}
        />
      </button>

      {aberto && (
        <div className="max-h-[230px] space-y-4 overflow-y-auto px-5 pb-4">
          {ds.isError ? (
            <div className="text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
              Não consegui ler o design system deste kit agora.
            </div>
          ) : ds.isPending ? (
            <div
              className="flex items-center gap-2 text-[12px]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <Mascote tamanho={12} girando />
              Consolidando as cores e as fontes das peças.
            </div>
          ) : item === null ? (
            <div className="text-[12px] leading-[1.6]" style={{ color: 'var(--color-fg-muted)' }}>
              Ainda não consolidei este kit. Enquanto isso, eu gero o site com as cores de origem de
              cada peça.
            </div>
          ) : (
            <>
              {desatualizado && (
                <div className="text-[11px] leading-snug" style={{ color: 'var(--color-signal)' }}>
                  Este painel reflete a última versão salva. Salvando, eu reconsolido com as peças
                  novas.
                </div>
              )}
              {/* A explicação vem ANTES dos swatches, e não depois.
                  Ela ficava no rodapé do painel, e o efeito foi medido em uso
                  real: quem lê de cima para baixo encontra primeiro uma fila de
                  quadradinhos com percentagens sem rótulo, e a pergunta que
                  aparece é "para que serve isto?". A resposta chegava tarde
                  demais para ser lida. */}
              <div
                className="text-[12px] leading-[1.55]"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                Estas são as cores que as peças deste kit usam hoje, e o papel que eu dei a cada
                uma. Quando eu gerar um site, cada cor com {LIMIAR_RECOLORIR_PCT}% ou mais de
                confiança vira a cor equivalente da paleta do projeto; abaixo disso eu mantenho a
                cor original, porque errar a troca é pior que não trocar.
              </div>
              {item.tema === 'misto' && (
                <div
                  className="text-[12px] leading-snug"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  As origens deste kit divergem de tema. Eu não misturo as paletas: cada origem
                  mantém a sua.
                </div>
              )}
              {item.origens.map((origem) => (
                <OrigemDoPainel
                  key={origem.designSystemId}
                  origem={origem}
                  nome={nomeDaOrigem(origem.designSystemId)}
                />
              ))}
              {item.limitacoes.length > 0 && (
                <div
                  className="rounded-lg border px-3.5 py-3"
                  style={{
                    borderColor: 'var(--color-border)',
                    backgroundColor: 'rgba(0,0,0,0.25)',
                  }}
                >
                  <div className="ds-label">O que eu não consegui afirmar</div>
                  <ul className="mt-1.5 space-y-1">
                    {item.limitacoes.map((l) => (
                      <li
                        key={l}
                        className="text-[11px] leading-snug"
                        style={{ color: 'var(--color-fg-muted)' }}
                      >
                        {l}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Uma origem consolidada: paleta com papel, as sem papel, e as fontes. */
function OrigemDoPainel({ origem, nome }: { origem: OrigemDoKit; nome: string }) {
  const comPapel = origem.clusters.filter((c) => c.papel !== null);
  const semPapel = origem.clusters.filter((c) => c.papel === null);

  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="truncate text-[12px]" style={{ color: 'var(--color-fg)' }}>
          {nome}
        </span>
        <span className="ds-data shrink-0 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {ROTULO_TEMA[origem.tema]}
        </span>
      </div>

      {comPapel.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-2">
          {comPapel.map((cl) => (
            <SwatchComPapel key={`${cl.corCanonica}-${cl.papel}`} cluster={cl} />
          ))}
        </div>
      )}

      {semPapel.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
            mantêm a cor original:
          </span>
          {semPapel.map((cl) => (
            <span
              key={cl.corCanonica}
              className="h-4 w-4 rounded border"
              style={{ backgroundColor: cl.corCanonica, borderColor: 'rgba(255,255,255,0.14)' }}
              title={`${cl.corCanonica} · não deu para afirmar um papel com confiança`}
            />
          ))}
        </div>
      )}

      {origem.fontes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {origem.fontes.map((f) => (
            <span
              key={`${f.familia}-${f.papelSugerido}`}
              className="rounded-none border px-2 py-0.5 text-[10px]"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
            >
              {f.familia}
              {f.papelSugerido !== null ? ` · ${ROTULO_PAPEL_FONTE[f.papelSugerido]}` : ''}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Swatch de um cluster com papel. A confiança aparece de dois jeitos de
 * propósito: em número (nunca adjetivo) e como opacidade do rótulo. O destaque
 * em signal marca só quem cruza o limiar, porque só esses serão recoloridos.
 */
function SwatchComPapel({ cluster }: { cluster: ClusterDoKit }) {
  const papel = cluster.papel;
  if (papel === null) return null;
  const recolore = cluster.confianca >= CONFIANCA_MINIMA_PARA_RECOLORIR;
  const pct = Math.round(cluster.confianca * 100);

  return (
    <div
      className="flex w-[72px] flex-col items-center gap-1"
      title={
        recolore
          ? `${cluster.corCanonica} · ${ROTULO_TOKEN[papel]} · na geração eu troco pela cor da marca`
          : `${cluster.corCanonica} · ${ROTULO_TOKEN[papel]} · confiança de ${pct}%, mantenho a cor original`
      }
    >
      <span
        className="h-8 w-full rounded-md border"
        style={{ backgroundColor: cluster.corCanonica, borderColor: 'rgba(255,255,255,0.14)' }}
      />
      <span
        className="w-full truncate text-center text-[9px] leading-tight"
        style={{ color: 'var(--color-fg-muted)', opacity: 0.55 + cluster.confianca * 0.45 }}
      >
        {ROTULO_TOKEN[papel]}
      </span>
      <span
        className="ds-data text-[9px]"
        style={{ color: recolore ? 'var(--color-signal)' : 'var(--color-fg-subtle)' }}
      >
        {pct}%
      </span>
    </div>
  );
}

function VazioState({ carregando, onNovo }: { carregando: boolean; onNovo: () => void }) {
  return (
    <div className="ds-glass-static ds-slide-up ds-d3 mt-10 rounded-xl p-10 text-center">
      <Mascote
        tamanho={96}
        esmaecido
        girando={carregando}
        alt={carregando ? 'Conferindo os kits' : 'O Orbis, em repouso: nenhum kit ainda'}
        className="mx-auto"
      />
      <div className="mt-5 text-[14px]" style={{ color: 'var(--color-fg-muted)' }}>
        {carregando ? TRABALHANDO.carregandoKits : VAZIO.kits.titulo}
      </div>
      {!carregando && (
        <div
          className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-[1.6]"
          style={{ color: 'var(--color-fg-subtle)' }}
        >
          {VAZIO.kits.corpo}
        </div>
      )}
      {!carregando && (
        <button
          type="button"
          onClick={onNovo}
          className={cn('ds-btn mt-4 rounded-none px-4 py-2 text-[12px] font-medium')}
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
