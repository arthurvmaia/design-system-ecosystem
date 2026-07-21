import { ConfirmPop } from '@/components/ConfirmPop';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import { type DesignSystemRecord, type SegmentRecord, api, previewSegmentUrl } from '@/lib/api';
import { cn } from '@/lib/cn';
import { toast } from '@/lib/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Heart, Loader2, Sparkles, Sun, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * A ordem não é alfabética nem casual: os sistemas vêm primeiro.
 *
 * Tipografia, botões, cards e interações são o que atravessa o site inteiro e
 * o que mais se reaproveita — é raro querer o rodapé de alguém, e comum querer
 * o jeito que os botões dele são. Deixá-los no fim, atrás de `Pricing` e `FAQ`,
 * escondia justamente o que a Galeria existe para oferecer.
 */
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
] as const;

const CATEGORY_LABEL: Record<string, string> = {
  all: 'Todos',
  typography: 'Tipografia',
  button: 'Botões',
  card: 'Cards',
  interaction: 'Animações',
  hero: 'Hero',
  header: 'Cabeçalho',
  nav: 'Navegação',
  footer: 'Rodapé',
  feature: 'Features',
  pricing: 'Pricing',
  testimonial: 'Depoimentos',
  faq: 'FAQ',
  cta: 'CTA',
  form: 'Forms',
  other: 'Outros',
};

/**
 * Quais categorias são leitura transversal do site, e não uma fatia dele.
 * A Galeria marca essas para deixar claro que ali não está um pedaço da
 * página — está o sistema por trás dela.
 */
const CATEGORIAS_DE_SISTEMA = new Set(['typography', 'button', 'card', 'interaction']);

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
  const [confirming, setConfirming] = useState<DesignSystemRecord | null>(null);

  const impacto = useQuery({
    queryKey: ['ds-impacto', confirming?.id],
    queryFn: () => {
      if (!confirming) throw new Error('sem extração');
      return api.designSystemImpact(confirming.id);
    },
    enabled: confirming !== null,
  });

  const del = useMutation({
    mutationFn: (id: string) => api.deleteDesignSystem(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['design-systems'] });
      qc.invalidateQueries({ queryKey: ['library'] });
      toast.ok('Extração removida da Galeria.');
      setConfirming(null);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao remover.'),
  });

  return (
    <aside
      className="ds-backdrop flex w-[260px] shrink-0 flex-col border-r"
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
        Extrações
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="p-4 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            carregando...
          </div>
        ) : list.length === 0 ? (
          <div className="p-4 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            nenhuma extração ainda. vá em Extrair.
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
                onClick={() => setConfirming(ds)}
                className="mr-2 hidden rounded-full p-1.5 transition-all duration-300 hover:bg-[rgba(198,40,40,0.16)] group-hover:block"
                title="Excluir extração"
              >
                <Trash2 size={12} style={{ color: 'var(--color-crimson-3)' }} />
              </button>
            </div>
          ))
        )}
      </div>

      <ConfirmPop
        open={confirming !== null}
        title={`Excluir "${confirming?.name}"?`}
        busy={del.isPending}
        confirmLabel="Excluir extração"
        onConfirm={() => confirming && del.mutate(confirming.id)}
        onClose={() => setConfirming(null)}
        description={
          <>
            Remove esta extração e seus <strong>{impacto.data?.segmentos ?? '…'} segmentos</strong>{' '}
            da Galeria.
            {(impacto.data?.componentesDaBiblioteca.length ?? 0) > 0 ? (
              <>
                {' '}
                Os <strong>{impacto.data?.componentesDaBiblioteca.length} componentes</strong> já
                curados na Biblioteca sobrevivem (são cópias), mas as prévias deles podem perder
                fontes e runtime da origem.
              </>
            ) : (
              ' Nada da Biblioteca depende dela.'
            )}
          </>
        }
      />
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
  const dsInfo = useQuery({ queryKey: ['ds', dsId], queryFn: () => api.getDesignSystem(dsId) });
  const navigate = useNavigate();
  const rejeitados = useQuery({ queryKey: ['rejeitados'], queryFn: api.listRejeitados });
  const rejDoDs = rejeitados.data?.grupos.find((g) => g.designSystemId === dsId)?.itens.length ?? 0;

  const qc = useQueryClient();
  const classify = useMutation({
    mutationFn: () => api.classify(dsId),
    onSuccess: () => {
      toast.info('Classificação enviada. Os nomes e categorias atualizam ao terminar.');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['segments', dsId] }), 3000);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao classificar.'),
  });

  const [detalhe, setDetalhe] = useState<SegmentRecord | null>(null);

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
              Esta extração está incompleta: o HTML aponta para {dsInfo.data?.assetsFaltando.length}{' '}
              arquivo(s) que não existem em disco (
              <span className="ds-data">{dsInfo.data?.assetsFaltando.slice(0, 3).join(', ')}</span>
              ). Sem eles as prévias aparecem sem estilo. Extraia este site de novo.
            </div>
          )}
          {rejDoDs > 0 && (
            <button
              type="button"
              onClick={() => navigate('/revisao')}
              className="ds-tag mt-2 flex items-center gap-2 rounded-md border px-3 py-2 text-left text-[11px] leading-relaxed"
              style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
            >
              <AlertTriangle
                size={13}
                className="shrink-0"
                style={{ color: 'var(--color-signal)' }}
              />
              <span>
                <strong style={{ color: 'var(--color-fg)' }}>{rejDoDs}</strong> bloco(s) o algoritmo
                não conseguiu interpretar e ficaram de fora da Galeria. Ver na Revisão →
              </span>
            </button>
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
          <SegmentCard key={seg.id} segment={seg} dsId={dsId} index={i} onOpen={setDetalhe} />
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

      {detalhe && <SegmentDetail segment={detalhe} dsId={dsId} onClose={() => setDetalhe(null)} />}
    </div>
  );
}

/**
 * O card da galeria: inclina em 3D sob o cursor, a prévia aproxima devagar. A
 * área de prévia é um botão — clicar abre o detalhe. Curtir e excluir ficam no
 * rodapé e não disparam o detalhe.
 */
function SegmentCard({
  segment,
  dsId,
  index,
  onOpen,
}: {
  segment: SegmentRecord;
  dsId: string;
  index: number;
  onOpen: (s: SegmentRecord) => void;
}) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);

  const add = useMutation({
    mutationFn: () => api.addToLibrary(segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      qc.invalidateQueries({ queryKey: ['library'] });
      toast.ok(`"${segment.name}" foi para a Biblioteca.`);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao curtir.'),
  });

  const del = useMutation({
    mutationFn: () => api.deleteSegment(dsId, segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      toast.ok('Segmento removido da triagem.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao excluir.'),
  });

  const delay = index < 6 ? `ds-d${index + 1}` : '';

  return (
    <div className={`ds-scale-in ${delay}`}>
      <div className="ds-card ds-glass-static group relative rounded-xl">
        <div className="ds-card-content overflow-hidden rounded-xl">
          <button
            type="button"
            onClick={() => onOpen(segment)}
            aria-label={`Ver ${segment.name} em detalhe`}
            className="block w-full"
          >
            <div className="transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.06]">
              <PreviewFrame src={previewSegmentUrl(segment.id)} title={segment.name} />
            </div>
          </button>
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
                className="ds-data mt-0.5 flex items-center gap-1.5 truncate text-[10px]"
                style={{ color: 'var(--color-fg-subtle)' }}
              >
                {CATEGORIAS_DE_SISTEMA.has(segment.category) && (
                  <span
                    className="rounded-full px-1.5 py-px text-[9px] uppercase tracking-[0.12em]"
                    style={{
                      backgroundColor: 'var(--color-crimson-8)',
                      color: 'var(--color-bone-1)',
                    }}
                  >
                    sistema
                  </span>
                )}
                <span className="truncate">
                  {CATEGORY_LABEL[segment.category] ?? segment.category}
                </span>
              </div>
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-all duration-300 hover:bg-[rgba(198,40,40,0.16)] group-hover:opacity-100"
                title="Excluir da triagem"
              >
                <Trash2 size={12} style={{ color: 'var(--color-crimson-3)' }} />
              </button>
              <button
                type="button"
                onClick={() => add.mutate()}
                disabled={segment.inLibrary || add.isPending}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300 disabled:cursor-not-allowed',
                  segment.inLibrary ? 'ds-glow' : 'hover:scale-110',
                )}
                style={{
                  backgroundColor: segment.inLibrary
                    ? 'var(--color-primary)'
                    : 'rgba(255, 255, 255, 0.06)',
                }}
                title={segment.inLibrary ? 'Já na biblioteca' : 'Adicionar à biblioteca'}
              >
                {add.isPending ? (
                  <Loader2
                    size={13}
                    className="animate-spin"
                    style={{ color: 'var(--color-fg-muted)' }}
                  />
                ) : (
                  <Heart
                    size={13}
                    style={{
                      color: segment.inLibrary ? 'var(--color-bone-1)' : 'var(--color-fg-muted)',
                      fill: segment.inLibrary ? 'var(--color-bone-1)' : 'none',
                    }}
                  />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmPop
        open={confirmDel}
        title={`Excluir "${segment.name}" da triagem?`}
        busy={del.isPending}
        confirmLabel="Excluir"
        onConfirm={() => del.mutate()}
        onClose={() => setConfirmDel(false)}
        description="A Galeria é material de trabalho. Re-segmentar a extração recria a lista completa — o que você curou na Biblioteca não é afetado."
      />
    </div>
  );
}

/** Modal de detalhe: prévia grande e interativa, metadados, toggle de fundo, ações. */
function SegmentDetail({
  segment,
  dsId,
  onClose,
}: {
  segment: SegmentRecord;
  dsId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [bg, setBg] = useState<'claro' | 'escuro' | undefined>(undefined);

  const add = useMutation({
    mutationFn: () => api.addToLibrary(segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      qc.invalidateQueries({ queryKey: ['library'] });
      toast.ok(`"${segment.name}" foi para a Biblioteca.`);
      onClose();
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao curtir.'),
  });

  return (
    <Modal open onClose={onClose} size="xl" title={segment.name}>
      <div className="flex flex-col">
        <div
          className="flex items-center justify-between gap-4 border-b px-6 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="min-w-0">
            <div className="truncate text-[16px] font-medium" style={{ color: 'var(--color-fg)' }}>
              {segment.name}
            </div>
            <div
              className="ds-data mt-0.5 flex items-center gap-2 text-[11px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              {CATEGORIAS_DE_SISTEMA.has(segment.category) && (
                <span
                  className="rounded-full px-1.5 py-px text-[9px] uppercase tracking-[0.12em]"
                  style={{
                    backgroundColor: 'var(--color-crimson-8)',
                    color: 'var(--color-bone-1)',
                  }}
                >
                  sistema
                </span>
              )}
              {CATEGORY_LABEL[segment.category] ?? segment.category} · {segment.kind}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <BgToggle bg={bg} onChange={setBg} />
            <button
              type="button"
              onClick={() => add.mutate()}
              disabled={segment.inLibrary || add.isPending}
              className="ds-btn flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              {add.isPending ? <Loader2 size={12} className="animate-spin" /> : <Heart size={12} />}
              {segment.inLibrary ? 'Na Biblioteca' : 'Curtir'}
            </button>
          </div>
        </div>
        <div className="p-4">
          <PreviewFrame
            key={bg ?? 'auto'}
            src={previewSegmentUrl(segment.id, bg)}
            title={segment.name}
            aspect={16 / 11}
            interactive
            className="rounded-lg"
          />
        </div>
      </div>
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
      className="ds-tag flex items-center gap-2 rounded-full border px-3 py-2 text-[11px]"
      style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
      title="Alternar o fundo da prévia (auto / claro / escuro)"
    >
      <Sun size={12} />
      fundo: {label}
    </button>
  );
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
          Nenhuma extração ainda
        </h2>
        <p className="mt-3 text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
          Vá em Extrair e traga o primeiro site pro ecossistema.
        </p>
      </div>
    </div>
  );
}
