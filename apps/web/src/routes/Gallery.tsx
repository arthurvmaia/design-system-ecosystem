import { ConfirmPop } from '@/components/ConfirmPop';
import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import {
  type ConferenciaDePixel,
  type DesignSystemRecord,
  type SegmentFidelity,
  type SegmentRecord,
  api,
  frameUrl,
  previewSegmentHoverUrl,
  previewSegmentReplayUrl,
  previewSegmentScrollUrl,
  previewSegmentUrl,
} from '@/lib/api';
import { oQueFaltou } from '@/lib/captura-parcial';
import { cn } from '@/lib/cn';
import { TRABALHANDO, VAZIO, conta } from '@/lib/orbis';
import { usePreferencias } from '@/lib/preferencias';
import {
  isAllSelected,
  isIndeterminate,
  prune,
  toggleAllVisible,
  toggle as toggleSel,
} from '@/lib/selection';
import { toast } from '@/lib/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  Columns2,
  Heart,
  Layers,
  MousePointer2,
  MoveVertical,
  Play,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  'badge',
  'input',
  'accordion',
  'interaction',
  'background',
  'overlay',
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
  badge: 'Selos',
  input: 'Campos',
  accordion: 'Acordeões',
  interaction: 'Animações',
  background: 'Fundos',
  overlay: 'Overlays',
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

/** Selo de fidelidade: só aparece quando o componente NÃO saiu completo. */
const SUPORTE_LABEL: Record<string, string> = {
  completo: 'Completo',
  parcial: 'Parcial',
  visual: 'Visual',
  externo: 'Dep. externa',
  'nao-suportado': 'Não suportado',
};

/** Só o domínio, sem esquema/caminho — origem legível para gente. */
const hostDe = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/** Estado da extração em linguagem de gente — o enum interno nunca vaza. */
const STATUS_DA_EXTRACAO: Record<string, string> = {
  pending: 'Na fila',
  extracting: 'Capturando…',
  extracted: 'Capturada',
  segmenting: 'Separando as seções…',
  segmented: 'Pronta',
  classifying: 'Organizando…',
  ready: 'Pronta',
  failed: 'Não terminei',
};
const SUPORTE_COR: Record<string, string> = {
  completo: '#16a34a',
  parcial: '#d97706',
  visual: '#2563eb',
  externo: '#ea580c',
  'nao-suportado': '#dc2626',
};

/** Estado de uma interação no pipeline — rótulo e cor honestos para a UI. */
const STATUS_LABEL: Record<string, string> = {
  detected: 'detectada',
  captured: 'capturada',
  associated: 'associada',
  replayable: 'reproduzível',
  validated: 'validada',
  unsupported: 'não suportada',
  'external-runtime': 'runtime externo',
};
const STATUS_COR: Record<string, string> = {
  detected: '#78716c',
  captured: '#2563eb',
  associated: '#d97706',
  replayable: '#16a34a',
  validated: '#16a34a',
  unsupported: '#dc2626',
  'external-runtime': '#ea580c',
};
const CONFIANCA_LABEL: Record<string, string> = {
  alta: 'alta',
  media: 'média',
  baixa: 'baixa',
  nenhuma: 'sem associação',
};

/** Fração 0..1 como percentual pt-BR: 0.032 vira "3,2%"; 0.08 vira "8%". */
const pct = (v: number): string =>
  `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

/**
 * Selo de fidelidade do card, em 4 estados:
 * - medido e completo → sem selo (silêncio é a promessa honesta);
 * - medido com ressalva → o selo do nível de suporte, como sempre;
 * - medido e REPROVADO na conferência de pixel → selo vermelho;
 * - NUNCA medido → selo cinza. Antes as duas pontas devolviam null, e a
 *   ausência de medição usava a mesma linguagem visual da aprovação.
 */
function FidelityBadge({
  fidelity,
  comparacao,
}: {
  fidelity?: SegmentFidelity | null;
  comparacao?: ConferenciaDePixel;
}) {
  if (comparacao !== undefined && !comparacao.passou) {
    const cor = '#dc2626';
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
        style={{ backgroundColor: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
        title={`A conferência de pixel mediu ${pct(comparacao.delta)} de diferença (limiar ${pct(comparacao.limiar)})`}
      >
        <X size={9} />
        Reprovado
      </span>
    );
  }
  if (!fidelity) {
    const cor = '#78716c';
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
        style={{ backgroundColor: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
        title="Ninguém conferiu esta peça: a captura não gerou medição de fidelidade para ela"
      >
        Não medido
      </span>
    );
  }
  if (fidelity.support === 'completo') return null;
  const cor = SUPORTE_COR[fidelity.support] ?? '#78716c';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
      style={{ backgroundColor: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
      title={fidelity.warnings.join(' · ')}
    >
      <AlertTriangle size={9} />
      {SUPORTE_LABEL[fidelity.support] ?? fidelity.support}
    </span>
  );
}

/**
 * Painel de fidelidade no detalhe: diz o nível de suporte, os avisos e as
 * interações conhecidas. É a promessa de "não esconder a falha" cumprida na UI —
 * a pessoa vê o que o componente reproduz e o que não reproduz antes de curtir.
 * A conferência de pixel entra aqui: a captura abriu o bundle sozinho e mediu a
 * diferença contra o print da dobra — mostrar essa medição é o que separa "eu
 * conferi" de "eu acho que ficou igual".
 */
function FidelityPanel({
  fidelity,
  comparacao,
  limitacoes,
}: {
  fidelity?: SegmentFidelity | null;
  comparacao?: ConferenciaDePixel;
  limitacoes?: string[];
}) {
  if (!fidelity) return null;
  const temPipeline = (fidelity.pipeline?.length ?? 0) > 0;
  // `limitacoes` presente (mesmo vazia) = o segmento tem bundle, então a
  // conferência de pixel se aplica; ausente = peça antiga ou subcomponente.
  const temBundle = limitacoes !== undefined;
  // O que o compilador declarou e os avisos acima ainda não disseram — repetir
  // a mesma frase em duas listas só ensinaria a pessoa a não ler nenhuma.
  const declaracoes = (limitacoes ?? []).filter((l) => !fidelity.warnings.includes(l));
  const semRessalva =
    fidelity.support === 'completo' &&
    fidelity.warnings.length === 0 &&
    fidelity.interactions.length === 0 &&
    !temPipeline &&
    !temBundle &&
    comparacao === undefined;
  if (semRessalva) return null;
  const cor = SUPORTE_COR[fidelity.support] ?? '#78716c';

  return (
    <div className="border-b px-6 py-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.1em]"
          style={{ backgroundColor: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
        >
          {SUPORTE_LABEL[fidelity.support] ?? fidelity.support}
        </span>
        {fidelity.interactions.map((it) => (
          <span
            key={`${it.kind}-${it.support}`}
            className="ds-tag rounded-full border px-2 py-0.5 text-[10px]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
            title={it.description}
          >
            {it.kind} · {SUPORTE_LABEL[it.support] ?? it.support}
          </span>
        ))}
      </div>
      {temPipeline && fidelity.pipeline && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
            interações:
          </span>
          {fidelity.pipeline.map((it) => {
            const c = STATUS_COR[it.status] ?? '#78716c';
            return (
              <span
                key={`${it.kind}-${it.status}`}
                className="ds-tag rounded-full px-2 py-0.5 text-[10px]"
                style={{ backgroundColor: `${c}18`, color: c, border: `1px solid ${c}44` }}
                title={it.note ?? (it.runtime ? `depende de ${it.runtime}` : undefined)}
              >
                {it.kind} · {STATUS_LABEL[it.status] ?? it.status}
              </span>
            );
          })}
          {fidelity.confidence && fidelity.confidence !== 'nenhuma' && (
            <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
              confiança: {CONFIANCA_LABEL[fidelity.confidence] ?? fidelity.confidence}
            </span>
          )}
        </div>
      )}
      {comparacao !== undefined ? (
        <div
          className="ds-data mt-2 text-[11px]"
          style={{ color: comparacao.passou ? 'var(--color-ok)' : 'var(--color-warn)' }}
        >
          conferência de pixel: delta {pct(comparacao.delta)} (limiar {pct(comparacao.limiar)})
        </div>
      ) : temBundle ? (
        <div className="mt-2 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
          esta peça não passou pela conferência de pixel
        </div>
      ) : null}
      {fidelity.warnings.length > 0 && (
        <ul className="mt-2 space-y-1">
          {fidelity.warnings.map((w) => (
            <li
              key={w}
              className="flex items-start gap-1.5 text-[11px] leading-relaxed"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <AlertTriangle
                size={11}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--color-signal)' }}
              />
              <span>{w}</span>
            </li>
          ))}
        </ul>
      )}
      {declaracoes.length > 0 && (
        <div className="mt-2">
          <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
            o que esta captura declarou:
          </span>
          <ul className="mt-1 space-y-1">
            {declaracoes.map((l) => (
              <li
                key={l}
                className="text-[11px] leading-relaxed"
                style={{ color: 'var(--color-fg-muted)' }}
              >
                {l}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

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
            key={effectiveDs}
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
      // Apagar uma extração remove os rejeitados dela — o contador de Pendências muda.
      qc.invalidateQueries({ queryKey: ['rejeitados'] });
      toast.ok('Removi a extração da Galeria.');
      setConfirming(null);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui remover a extração.'),
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
            {TRABALHANDO.carregandoAcervo}
          </div>
        ) : list.length === 0 ? (
          <div className="p-4 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Ainda não trouxe nenhum site. Vá em Extrair.
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
                  className="mt-0.5 truncate text-[11px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {STATUS_DA_EXTRACAO[ds.status] ?? 'Em preparo'}
                </div>
              </button>
              <button
                type="button"
                onClick={() => setConfirming(ds)}
                className="mr-2 hidden rounded-full p-1.5 transition-all duration-300 hover:bg-[rgba(239,68,68,0.16)] group-hover:block"
                title="Excluir extração"
              >
                <Trash2 size={12} style={{ color: 'var(--color-ion-3)' }} />
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
            Tiro esta extração e os <strong>{impacto.data?.segmentos ?? '…'} segmentos</strong> que
            separei dela da Galeria.
            {(impacto.data?.componentesDaBiblioteca.length ?? 0) > 0 ? (
              <>
                {' '}
                Os <strong>{impacto.data?.componentesDaBiblioteca.length} componentes</strong> que
                já foram para a Biblioteca continuam lá (são cópias), mas as prévias deles podem
                perder as fontes e o runtime da origem.
              </>
            ) : (
              ' Nada na Biblioteca depende dela.'
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
    onSuccess: (res) => {
      // Modo fila: nada rodou ainda — o pedido só foi registrado em disco.
      // Dizer "estou classificando" aqui era prometer trabalho que não ia
      // acontecer; o refetch em 3s reforçava a promessa.
      if ('queued' in res) {
        toast.info(
          'Guardei o pedido na fila. Eu só classifico quando você rodar o PROCESSAR e escolher este job.',
        );
        qc.invalidateQueries({ queryKey: ['queue'] });
        return;
      }
      toast.info('Estou classificando. Os nomes e as categorias mudam quando eu terminar.');
      setTimeout(() => qc.invalidateQueries({ queryKey: ['segments', dsId] }), 3000);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui classificar.'),
  });

  const [detalhe, setDetalhe] = useState<SegmentRecord | null>(null);
  const [comparando, setComparando] = useState<SegmentRecord[] | null>(null);

  // Qualidade como filtro de curadoria, em 4 estados: "prontos" EXIGE medição
  // completa; "ressalvas" = medido com selo de atenção; "não medidos" = a
  // captura não conferiu. Antes "prontos" aceitava `!s.fidelity`, e a ausência
  // de medição era promovida como se fosse aprovação.
  const [qualidade, setQualidade] = useState<'todos' | 'prontos' | 'ressalvas' | 'nao-medidos'>(
    'todos',
  );

  const filtered = useMemo(() => {
    const todos = segments.data?.items ?? [];
    // A grade é das seções (raízes). Os filhos da subdivisão vivem na expansão
    // do card da seção — e só sobem para o primeiro nível quando o filtro de
    // categoria os alcança, que é o caminho de "quero só os botões deste site".
    let items =
      category === 'all'
        ? todos.filter((s) => s.parentId === null)
        : todos.filter((s) => s.category === category);
    // Reprovar na conferência de pixel conta como ressalva mesmo quando a
    // análise estática disse "completo": as duas medidas existem porque uma
    // pega o que a outra não vê. Sem isto a peça aparecia em "Prontos para
    // usar" exibindo o selo vermelho de reprovada, e sumia das outras abas.
    const reprovadaNoPixel = (s: SegmentRecord): boolean => s.comparacaoVisual?.passou === false;
    if (qualidade === 'prontos') {
      items = items.filter((s) => s.fidelity?.support === 'completo' && !reprovadaNoPixel(s));
    } else if (qualidade === 'ressalvas') {
      items = items.filter(
        (s) =>
          s.fidelity !== null &&
          s.fidelity !== undefined &&
          (s.fidelity.support !== 'completo' || reprovadaNoPixel(s)),
      );
    } else if (qualidade === 'nao-medidos') {
      items = items.filter((s) => !s.fidelity);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter((s) => s.name.toLowerCase().includes(q));
    }
    return items;
  }, [segments.data, category, qualidade, search]);

  // A população da grade ANTES de qualidade e busca: o cabeçalho mostra
  // numerador e denominador do MESMO conjunto. Antes o numerador contava só
  // raízes e o denominador contava raízes + filhos, e a tela lia "10 /22" sem
  // filtro nenhum ligado.
  const populacao = useMemo(() => {
    const todos = segments.data?.items ?? [];
    return category === 'all'
      ? todos.filter((s) => s.parentId === null).length
      : todos.filter((s) => s.category === category).length;
  }, [segments.data, category]);

  // Chips derivados do acervo: categoria sem item algum não vira botão morto.
  // A categoria selecionada continua visível mesmo que esvazie (excluir o
  // último item não pode sumir com o chip que desliga o filtro).
  const categoriasComItem = useMemo(() => {
    const presentes = new Set((segments.data?.items ?? []).map((s) => s.category));
    return CATEGORIES.filter((c) => c === 'all' || c === category || presentes.has(c));
  }, [segments.data, category]);

  // Subcomponentes agrupados pela seção de origem + nomes para o selo "de:".
  const filhosPorPai = useMemo(() => {
    const mapa = new Map<string, SegmentRecord[]>();
    for (const s of segments.data?.items ?? []) {
      if (s.parentId === null) continue;
      const lista = mapa.get(s.parentId);
      if (lista) lista.push(s);
      else mapa.set(s.parentId, [s]);
    }
    return mapa;
  }, [segments.data]);
  const nomePorId = useMemo(
    () => new Map((segments.data?.items ?? []).map((s) => [s.id, s.name])),
    [segments.data],
  );
  const totalFilhos = useMemo(
    () => (segments.data?.items ?? []).filter((s) => s.parentId !== null).length,
    [segments.data],
  );

  // A dobra cujas peças estão abertas no painel dedicado. Fora da grade de
  // propósito: peça e dobra são coisas diferentes e misturá-las na mesma grade
  // fazia a triagem perder o fio.
  const [pecasDe, setPecasDe] = useState<SegmentRecord | null>(null);

  // ── Seleção em massa ───────────────────────────────────────────────────────
  // Só as seções entram na seleção: o filho tem curtir/excluir próprios no card.
  const visiveis = useMemo(
    () => filtered.filter((s) => s.parentId === null).map((s) => s.id),
    [filtered],
  );
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [confirmExcluir, setConfirmExcluir] = useState(false);
  const selTodosRef = useRef<HTMLInputElement>(null);

  // Poda da seleção o que deixou de existir (após excluir ou re-segmentar).
  useEffect(() => {
    setSel((s) =>
      prune(
        s,
        (segments.data?.items ?? []).map((x) => x.id),
      ),
    );
  }, [segments.data]);

  // O estado indeterminado do checkbox "todos" só existe via DOM.
  useEffect(() => {
    if (selTodosRef.current) selTodosRef.current.indeterminate = isIndeterminate(sel, visiveis);
  }, [sel, visiveis]);

  const curtirLote = useMutation({
    mutationFn: () => api.addToLibraryBatch([...sel]),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      qc.invalidateQueries({ queryKey: ['library'] });
      const partes: string[] = [];
      if (r.added.length > 0)
        partes.push(`Levei ${conta(r.added.length, 'item', 'itens')} para a Biblioteca`);
      if (r.already.length > 0)
        partes.push(`${conta(r.already.length, 'já estava lá', 'já estavam lá')}`);
      // O servidor recusa o que a captura não reproduz. Isso precisa chegar à
      // pessoa: antes o campo era descartado e o lote parecia inteiro.
      if (r.recusados.length > 0)
        partes.push(
          `recusei ${conta(r.recusados.length, 'peça', 'peças')} que a captura não reproduz`,
        );
      const texto = partes.join(' · ') || 'Não havia nada novo para levar.';
      if (r.recusados.length > 0) toast.info(texto);
      else toast.ok(texto);
      setSel(new Set());
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui curtir a seleção.'),
  });

  const excluirLote = useMutation({
    mutationFn: () => api.deleteSegmentsBatch(dsId, [...sel]),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      toast.ok(`Tirei ${conta(r.deleted, 'item', 'itens')} da Galeria.`);
      setSel(new Set());
      setConfirmExcluir(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui excluir a seleção.'),
  });

  const selCount = sel.size;

  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-center justify-between border-b px-8 py-5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span className="ds-label" style={{ color: 'var(--color-ion-4)' }}>
              galeria · 02
            </span>
            {dsInfo.data?.item.sourceUrl && (
              <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
                {hostDe(dsInfo.data.item.sourceUrl)}
              </span>
            )}
          </div>
          <h1
            className="ds-interactive-text ds-text-glow mt-1.5 truncate text-[24px] font-medium"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            {dsInfo.data?.item.name ?? '...'}
          </h1>
          {/* Leitura de instrumento: os números em mono, com o denominador à
              vista. "12 de 35" diz muito mais que "12 componentes" quando um
              filtro está ligado. */}
          <div className="mt-1.5 flex items-center gap-4">
            <span className="flex items-baseline gap-1.5">
              <span className="ds-data text-[13px]" style={{ color: 'var(--color-ion-3)' }}>
                {filtered.length}
              </span>
              <span className="ds-data text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                /{populacao}
              </span>
              <span className="ds-label">{populacao === 1 ? 'componente' : 'componentes'}</span>
            </span>
            {totalFilhos > 0 && (
              <span className="flex items-baseline gap-1.5">
                <span className="ds-data text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
                  {totalFilhos}
                </span>
                <span className="ds-label">
                  {totalFilhos === 1 ? 'subcomponente' : 'subcomponentes'}
                </span>
              </span>
            )}
          </div>
          {segments.data?.capturaParcial && (
            <div
              className="mt-2 flex items-start gap-2 rounded-md px-3 py-2 text-[11px] leading-relaxed"
              style={{ backgroundColor: 'rgba(245,158,11,0.14)', color: 'var(--color-fg)' }}
            >
              <AlertTriangle
                size={13}
                className="mt-0.5 shrink-0"
                style={{ color: 'var(--color-warn)' }}
              />
              <span>
                <strong>Não terminei esta captura dentro do tempo</strong>, senhor.{' '}
                {oQueFaltou(segments.data.capturaParcial.fase)} Extraia o site de novo para eu
                completar.
              </span>
            </div>
          )}
          {(dsInfo.data?.assetsFaltando.length ?? 0) > 0 && (
            <div
              className="mt-2 rounded-md px-3 py-2 text-[11px] leading-relaxed"
              style={{ backgroundColor: 'rgba(245,158,11,0.14)', color: 'var(--color-fg)' }}
            >
              Não consegui baixar{' '}
              {conta(dsInfo.data?.assetsFaltando.length ?? 0, 'arquivo', 'arquivos')} deste site
              (imagens, fontes), então algumas prévias aparecem sem estilo. Extraia este site de
              novo para eu buscar o que faltou.
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
                Não consegui interpretar{' '}
                <strong style={{ color: 'var(--color-fg)' }}>{rejDoDs}</strong>{' '}
                {rejDoDs === 1 ? 'bloco' : 'blocos'}, então mandei para Pendências. Ver pendências →
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
          {classify.isPending ? <Mascote tamanho={12} girando /> : <Sparkles size={12} />}
          Classificar com IA
        </button>
      </div>

      <div
        className="flex items-center gap-2 border-b px-8 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px]"
          style={{ color: 'var(--color-fg-muted)' }}
          title="Selecionar todos os segmentos visíveis"
        >
          <input
            ref={selTodosRef}
            type="checkbox"
            checked={isAllSelected(sel, visiveis)}
            onChange={() => setSel((s) => toggleAllVisible(s, visiveis))}
            aria-label={`Selecionar todos os ${visiveis.length} segmentos visíveis`}
            className="h-4 w-4 accent-[var(--color-ion-4)]"
          />
          Todos
        </label>
        <span
          className="mr-1 h-4 w-px shrink-0"
          style={{ backgroundColor: 'var(--color-border)' }}
        />
        <div className="flex flex-wrap gap-1.5">
          {categoriasComItem.map((c) => (
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
        <span
          className="mx-1 h-4 w-px shrink-0"
          style={{ backgroundColor: 'var(--color-border)' }}
        />
        <div className="flex shrink-0 gap-1.5">
          {(
            [
              ['todos', 'Tudo'],
              ['prontos', 'Prontos para usar'],
              ['ressalvas', 'Com ressalvas'],
              ['nao-medidos', 'Não medidos'],
            ] as const
          ).map(([v, r]) => (
            <button
              type="button"
              key={v}
              onClick={() => setQualidade(v)}
              className={cn(
                'ds-tag rounded-full border px-3 py-1 text-[11px]',
                qualidade === v
                  ? 'ds-glass-static text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              )}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {r}
            </button>
          ))}
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="buscar..."
          className="ds-data ml-auto w-[200px] rounded-full border px-3.5 py-1.5 text-[12px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(56,189,248,0.25)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            color: 'var(--color-fg)',
          }}
        />
      </div>

      {selCount > 0 && (
        <section
          aria-label="Ações em massa"
          className="ds-backdrop flex flex-wrap items-center gap-3 border-b px-8 py-2.5"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(14,165,233,0.14)' }}
        >
          <span className="ds-data text-[12px]" style={{ color: 'var(--color-fg)' }}>
            {selCount} selecionado{selCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => curtirLote.mutate()}
            disabled={curtirLote.isPending}
            className="ds-btn flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {curtirLote.isPending ? <Mascote tamanho={12} girando /> : <Heart size={12} />}
            Curtir selecionados
          </button>
          <button
            type="button"
            onClick={() => {
              const escolhidos = (segments.data?.items ?? []).filter((s) => sel.has(s.id));
              setComparando(escolhidos.slice(0, 3));
            }}
            disabled={selCount < 2}
            title={
              selCount < 2
                ? 'Marque 2 ou 3 componentes e eu mostro lado a lado'
                : 'Ver lado a lado, com interação'
            }
            className="ds-tag flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] disabled:opacity-40"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg)' }}
          >
            <Columns2 size={12} />
            Comparar{selCount >= 2 ? ` (${Math.min(selCount, 3)})` : ''}
          </button>
          <button
            type="button"
            onClick={() =>
              usePreferencias.getState().confirmarAntesDeExcluir
                ? setConfirmExcluir(true)
                : excluirLote.mutate()
            }
            disabled={excluirLote.isPending}
            className="ds-tag flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] disabled:opacity-50"
            style={{ borderColor: 'rgba(239,68,68,0.45)', color: 'var(--color-ion-3)' }}
          >
            <Trash2 size={12} />
            Excluir selecionados
          </button>
          <button
            type="button"
            onClick={() => setSel(new Set())}
            className="ds-tag ml-auto flex items-center gap-1.5 rounded-full border border-transparent px-3 py-1.5 text-[12px]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <X size={12} />
            Limpar seleção
          </button>
        </section>
      )}

      {/* Sem `items-start`: o alinhamento padrão do grid estica os cards da
          linha até a altura do mais alto, e o rodapé de cada um encosta embaixo
          (`mt-auto`). É o que deixa a grade regular. */}
      <div className="grid flex-1 grid-cols-1 content-start gap-5 overflow-y-auto p-8 md:grid-cols-2 lg:grid-cols-3">
        {filtered.map((seg, i) => {
          // Filho que casou com o filtro de categoria: card compacto de
          // primeiro nível, com o selo "de:" dizendo a seção de origem.
          if (seg.parentId !== null) {
            return (
              <SegmentCardFilho
                key={seg.id}
                segment={seg}
                dsId={dsId}
                nomeDoPai={nomePorId.get(seg.parentId)}
                onOpen={setDetalhe}
              />
            );
          }
          const filhos = filhosPorPai.get(seg.id) ?? [];
          return (
            <SegmentCard
              key={seg.id}
              segment={seg}
              dsId={dsId}
              index={i}
              onOpen={setDetalhe}
              selected={sel.has(seg.id)}
              onToggle={() => setSel((s) => toggleSel(s, seg.id))}
              subcomponentes={filhos.length}
              // No filtro de peça o filho já sobe para a grade; abrir o painel
              // ali mostraria os mesmos cards duas vezes.
              onAbrirPecas={category === 'all' ? () => setPecasDe(seg) : undefined}
            />
          );
        })}
        {filtered.length === 0 && !segments.isLoading && (
          <div
            className="col-span-full py-16 text-center text-[13px]"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            Não tenho nada que caiba nesses filtros.
          </div>
        )}
      </div>

      {/* Peças de UMA dobra, num painel só delas: a triagem da dobra e a das
          peças são decisões diferentes e não disputam a mesma grade. */}
      {pecasDe !== null && (
        <PainelDePecas
          secao={pecasDe}
          pecas={filhosPorPai.get(pecasDe.id) ?? []}
          dsId={dsId}
          onAbrirPeca={setDetalhe}
          onClose={() => setPecasDe(null)}
        />
      )}

      {detalhe && <SegmentDetail segment={detalhe} dsId={dsId} onClose={() => setDetalhe(null)} />}

      {/* Comparação lado a lado: prévias VIVAS, para decidir entre parecidos. */}
      {comparando !== null && (
        <Modal
          open
          onClose={() => setComparando(null)}
          size="xl"
          title={`Comparando ${comparando.length} componentes`}
        >
          <div className="p-6">
            <div
              className="text-[15px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              Lado a lado
            </div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
              Deixei as prévias vivas: passe o mouse e interaja para sentir a diferença.
            </p>
            <div
              className={cn(
                'mt-4 grid gap-4',
                comparando.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
              )}
            >
              {comparando.map((s) => (
                <div
                  key={s.id}
                  className="overflow-hidden rounded-lg border"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <PreviewFrame
                    src={previewSegmentUrl(s.id)}
                    title={s.name}
                    aspect={4 / 3}
                    interactive
                  />
                  <div className="border-t p-3" style={{ borderColor: 'var(--color-border)' }}>
                    <div
                      className="truncate text-[13px] font-medium"
                      style={{ color: 'var(--color-fg)' }}
                    >
                      {s.name}
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <span className="text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                        {CATEGORY_LABEL[s.category] ?? 'Outros'}
                      </span>
                      <FidelityBadge fidelity={s.fidelity} comparacao={s.comparacaoVisual} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Modal>
      )}

      <ConfirmPop
        open={confirmExcluir}
        title={`Excluir ${conta(selCount, 'item', 'itens')} da Galeria?`}
        busy={excluirLote.isPending}
        confirmLabel={`Excluir ${selCount}`}
        onConfirm={() => excluirLote.mutate()}
        onClose={() => setConfirmExcluir(false)}
        description="A Galeria é material de trabalho: some só da triagem, e o que já foi para a Biblioteca continua lá. Se eu segmentar a extração de novo, a lista completa volta."
      />
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
  selected,
  onToggle,
  subcomponentes = 0,
  onAbrirPecas,
}: {
  segment: SegmentRecord;
  dsId: string;
  index: number;
  onOpen: (s: SegmentRecord) => void;
  selected: boolean;
  onToggle: () => void;
  /** Quantas peças a subdivisão extraiu de dentro desta seção. */
  subcomponentes?: number;
  /** Presente quando a vista atual permite abrir o painel de peças. */
  onAbrirPecas?: () => void;
}) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);
  const printDaDobra = segment.fidelity?.framePath;
  // Camada que cobre a página inteira e referência visual não se explicam
  // sozinhas num card: a primeira vira uma tira, a segunda vira um vazio. As
  // duas mostram o RETRATO, que é o que a captura viu.
  const mostraRetrato =
    printDaDobra !== undefined &&
    (segment.category === 'background' || segment.fidelity?.support === 'visual');

  const add = useMutation({
    mutationFn: () => api.addToLibrary(segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      qc.invalidateQueries({ queryKey: ['library'] });
      toast.ok(`Levei "${segment.name}" para a Biblioteca.`);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui curtir esta peça.'),
  });

  const del = useMutation({
    mutationFn: () => api.deleteSegment(dsId, segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      toast.ok('Tirei este segmento da triagem.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui excluir.'),
  });

  const delay = index < 6 ? `ds-d${index + 1}` : '';

  return (
    // `h-full` + coluna: todos os cards da linha terminam na mesma altura, e o
    // rodapé encosta embaixo mesmo quando um tem a linha de peças e o outro não.
    <div className={`ds-scale-in h-full ${delay}`}>
      <div
        className="ds-card ds-glass-static group relative flex h-full flex-col rounded-xl"
        style={
          selected ? { outline: '2px solid var(--color-signal)', outlineOffset: '2px' } : undefined
        }
      >
        <label
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          title={selected ? 'Desmarcar' : 'Selecionar'}
          className={cn(
            'absolute top-2.5 left-2.5 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-opacity duration-200 focus-within:opacity-100',
            // Sutil sempre (para ser tocável no mobile, sem hover) e pleno ao passar/selecionar.
            selected ? 'opacity-100' : 'opacity-70 group-hover:opacity-100',
          )}
          style={{ backgroundColor: selected ? 'var(--color-primary)' : 'rgba(0,0,0,0.55)' }}
        >
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Selecionar "${segment.name}"`}
            className="h-4 w-4 accent-[var(--color-ion-4)]"
          />
        </label>
        <div className="ds-card-content flex h-full flex-col overflow-hidden rounded-xl">
          <button
            type="button"
            onClick={() => onOpen(segment)}
            aria-label={`Ver ${segment.name} em detalhe`}
            className="block w-full"
          >
            <div className="transition-transform duration-[600ms] ease-[cubic-bezier(0.4,0,0.2,1)] group-hover:scale-[1.06]">
              {/* Referência visual mostra o RETRATO, não o HTML: uma camada que
                  cobre a página inteira, renderizada solta num card, vira uma
                  tira sem sentido. O retrato é o que a captura viu.
                  As demais mostram o componente inteiro, centralizado, com a
                  mesma altura em todos os cards da linha. */}
              {mostraRetrato && printDaDobra !== undefined ? (
                <div
                  className="w-full"
                  style={{ aspectRatio: '16 / 10', backgroundColor: 'var(--color-ink-0)' }}
                >
                  <img
                    src={frameUrl(dsId, printDaDobra)}
                    alt={`Retrato de ${segment.name}`}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <PreviewFrame
                  src={previewSegmentUrl(segment.id)}
                  title={segment.name}
                  ajuste="conter"
                />
              )}
            </div>
          </button>
          {/* Altura reservada: a linha de peças é opcional, e sem reservar o
              espaço os títulos de uma mesma linha da grade ficavam em alturas
              diferentes. */}
          <div
            className="ds-gradient-glow mt-auto flex min-h-[92px] items-start justify-between border-t p-3.5"
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
                      backgroundColor: 'var(--color-ion-8)',
                      color: 'var(--color-bone-1)',
                    }}
                  >
                    sistema
                  </span>
                )}
                <span className="truncate">{CATEGORY_LABEL[segment.category] ?? 'Outros'}</span>
                <FidelityBadge fidelity={segment.fidelity} comparacao={segment.comparacaoVisual} />
              </div>
              {subcomponentes > 0 && onAbrirPecas !== undefined && (
                <button
                  type="button"
                  onClick={onAbrirPecas}
                  className="ds-tag mt-1.5 flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px]"
                  style={{
                    borderColor: 'var(--color-border)',
                    color: 'var(--color-fg-muted)',
                  }}
                  title="Abrir as peças extraídas de dentro desta seção"
                >
                  <Layers size={10} />
                  {subcomponentes} peça{subcomponentes === 1 ? '' : 's'}
                </button>
              )}
            </div>
            <div className="ml-3 flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                className="flex h-8 w-8 items-center justify-center rounded-full opacity-0 transition-all duration-300 hover:bg-[rgba(239,68,68,0.16)] group-hover:opacity-100"
                title="Excluir da triagem"
              >
                <Trash2 size={12} style={{ color: 'var(--color-ion-3)' }} />
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
                  <Mascote tamanho={13} girando esmaecido />
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
        description={
          subcomponentes > 0
            ? `${
                subcomponentes === 1
                  ? 'A peça que tirei de dentro dela sai junto'
                  : `As ${subcomponentes} peças que tirei de dentro dela saem junto`
              }. A Galeria é material de trabalho: se eu segmentar a extração de novo, a lista completa volta. O que já foi para a Biblioteca continua lá.`
            : 'A Galeria é material de trabalho. Se eu segmentar a extração de novo, a lista completa volta. O que já foi para a Biblioteca continua lá.'
        }
      />
    </div>
  );
}

/**
 * As peças de UMA dobra, numa tela só delas.
 *
 * Antes elas abriam em linha no meio da grade, e o resultado era a triagem
 * perdendo o fio: dobra e peça são decisões diferentes — "quero esta seção
 * inteira" não é "quero este botão". Aqui a dobra fica no cabeçalho, como
 * contexto, e a grade abaixo é só das peças.
 */
function PainelDePecas({
  secao,
  pecas,
  dsId,
  onAbrirPeca,
  onClose,
}: {
  secao: SegmentRecord;
  pecas: SegmentRecord[];
  dsId: string;
  onAbrirPeca: (s: SegmentRecord) => void;
  onClose: () => void;
}) {
  const porCategoria = useMemo(() => {
    const mapa = new Map<string, SegmentRecord[]>();
    for (const p of pecas) {
      const lista = mapa.get(p.category);
      if (lista) lista.push(p);
      else mapa.set(p.category, [p]);
    }
    return [...mapa.entries()];
  }, [pecas]);

  return (
    <Modal open onClose={onClose} size="xl" title={`Peças de ${secao.name}`}>
      <div className="flex flex-col">
        <div
          className="flex items-start justify-between gap-4 border-b px-6 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="min-w-0">
            <div
              className="text-[10px] uppercase tracking-[0.24em]"
              style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
            >
              Peças desta dobra
            </div>
            <div
              className="mt-1 truncate text-[17px] font-medium"
              style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
            >
              {secao.name}
            </div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
              Tirei {conta(pecas.length, 'peça', 'peças')} de dentro desta seção. Curtir uma peça
              não leva a dobra junto, nem o contrário.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onAbrirPeca(secao)}
            className="ds-tag flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-[12px]"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg)' }}
            title="Ver a dobra inteira, com os estados e o scroll"
          >
            <Play size={11} />
            Ver a dobra inteira
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-6">
          {porCategoria.map(([categoria, itens]) => (
            <div key={categoria} className="mb-7 last:mb-0">
              <div
                className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em]"
                style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
              >
                {CATEGORY_LABEL[categoria] ?? categoria}
                <span
                  className="rounded-full px-1.5 py-px text-[9px]"
                  style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
                >
                  {itens.length}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {itens.map((p) => (
                  <SegmentCardFilho
                    key={p.id}
                    segment={p}
                    dsId={dsId}
                    nomeDoPai={undefined}
                    onOpen={onAbrirPeca}
                  />
                ))}
              </div>
            </div>
          ))}
          {pecas.length === 0 && (
            <div
              className="py-14 text-center text-[13px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              Não tirei nenhuma peça desta dobra.
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * Card compacto de um subcomponente — a peça que a subdivisão extraiu de
 * dentro de uma seção. Mesma prévia viva do caminho clássico
 * (`previewSegmentUrl`); curtir e excluir são independentes do pai. O selo
 * "de:" diz a origem, porque no filtro de peças o filho aparece na grade sem o
 * card da seção por perto.
 */
function SegmentCardFilho({
  segment,
  dsId,
  nomeDoPai,
  onOpen,
}: {
  segment: SegmentRecord;
  dsId: string;
  nomeDoPai: string | undefined;
  onOpen: (s: SegmentRecord) => void;
}) {
  const qc = useQueryClient();
  const [confirmDel, setConfirmDel] = useState(false);

  const add = useMutation({
    mutationFn: () => api.addToLibrary(segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      qc.invalidateQueries({ queryKey: ['library'] });
      toast.ok(`Levei "${segment.name}" para a Biblioteca.`);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui curtir esta peça.'),
  });

  const del = useMutation({
    mutationFn: () => api.deleteSegment(dsId, segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      toast.ok('Tirei este subcomponente da triagem.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui excluir.'),
  });

  return (
    <div className="ds-glass-static group relative overflow-hidden rounded-lg">
      <button
        type="button"
        onClick={() => onOpen(segment)}
        aria-label={`Ver ${segment.name} em detalhe`}
        className="block w-full"
      >
        <PreviewFrame
          src={previewSegmentUrl(segment.id)}
          title={segment.name}
          aspect={4 / 3}
          ajuste="conter"
        />
      </button>
      <div
        className="flex items-center justify-between border-t p-2.5"
        style={{ borderColor: 'rgba(255, 255, 255, 0.06)' }}
      >
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-[12px] font-medium"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-body)' }}
          >
            {segment.name}
          </div>
          <div
            className="ds-data mt-0.5 flex items-center gap-1.5 text-[9px]"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            <span className="shrink-0">{CATEGORY_LABEL[segment.category] ?? 'Outros'}</span>
            <FidelityBadge fidelity={segment.fidelity} comparacao={segment.comparacaoVisual} />
            {nomeDoPai !== undefined && (
              <span
                className="truncate rounded-full border px-1.5 py-px"
                style={{ borderColor: 'var(--color-border)' }}
                title={`Extraído da seção "${nomeDoPai}"`}
              >
                de: {nomeDoPai}
              </span>
            )}
          </div>
        </div>
        <div className="ml-2 flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setConfirmDel(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full opacity-0 transition-all duration-300 hover:bg-[rgba(239,68,68,0.16)] group-hover:opacity-100"
            title="Excluir da triagem"
          >
            <Trash2 size={11} style={{ color: 'var(--color-ion-3)' }} />
          </button>
          <button
            type="button"
            onClick={() => add.mutate()}
            disabled={segment.inLibrary || add.isPending}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full transition-all duration-300 disabled:cursor-not-allowed',
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
              <Mascote tamanho={11} girando esmaecido />
            ) : (
              <Heart
                size={11}
                style={{
                  color: segment.inLibrary ? 'var(--color-bone-1)' : 'var(--color-fg-muted)',
                  fill: segment.inLibrary ? 'var(--color-bone-1)' : 'none',
                }}
              />
            )}
          </button>
        </div>
      </div>

      <ConfirmPop
        open={confirmDel}
        title={`Excluir "${segment.name}" da triagem?`}
        busy={del.isPending}
        confirmLabel="Excluir"
        onConfirm={() => del.mutate()}
        onClose={() => setConfirmDel(false)}
        description="Sai só este subcomponente: a seção de origem continua na Galeria. Se eu segmentar a extração de novo, a lista completa volta."
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
  const print = segment.fidelity?.framePath;
  // Camada que atravessa a página (o fundo) e referência visual não têm o que
  // mostrar sozinhas: o preview abriria um retângulo vazio. Quando existe
  // retrato, é ele que abre. O retrato do fundo sai com o conteúdo esmaecido,
  // então dá para ver o fundo sem perder a noção de onde ele fica.
  const abreNoPrint =
    print !== undefined &&
    (segment.fidelity?.support === 'visual' || segment.category === 'background');
  const [modo, setModo] = useState<'plano' | 'estados' | 'scroll' | 'print' | 'hover'>(
    abreNoPrint ? 'print' : 'plano',
  );
  const temEstados = (segment.fidelity?.states?.length ?? 0) > 0;
  // Hover medido na captura: é o que justifica oferecer a demonstração.
  const temHover =
    segment.fidelity?.interactions?.some((i) => i.kind === 'hover') === true ||
    segment.fidelity?.pipeline?.some((p) => p.kind === 'hover') === true;
  // Referência visual (selo "visual"): o modal abre direto o movimento gravado
  // (loop das amostras) — a miniatura limpa fica só para o card da grade.
  const ehReferenciaVisual = segment.fidelity?.support === 'visual';
  const temScroll = !ehReferenciaVisual && (segment.fidelity?.scroll?.length ?? 0) > 0;

  const add = useMutation({
    mutationFn: () => api.addToLibrary(segment.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['segments', dsId] });
      qc.invalidateQueries({ queryKey: ['library'] });
      toast.ok(`Levei "${segment.name}" para a Biblioteca.`);
      onClose();
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui curtir esta peça.'),
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
              {CATEGORIAS_DE_SISTEMA.has(segment.category) && segment.parentId === null && (
                <span
                  className="rounded-full px-1.5 py-px text-[9px] uppercase tracking-[0.12em]"
                  style={{
                    backgroundColor: 'var(--color-ion-8)',
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
            {temEstados && (
              <button
                type="button"
                onClick={() => setModo((m) => (m === 'estados' ? 'plano' : 'estados'))}
                aria-pressed={modo === 'estados'}
                title="Mostro aqui os estados que capturei: hover, clique, modal"
                className="ds-tag flex items-center gap-2 rounded-full border px-3 py-2 text-[11px]"
                style={{
                  borderColor: modo === 'estados' ? 'var(--color-primary)' : 'var(--color-border)',
                  color: modo === 'estados' ? 'var(--color-primary)' : 'var(--color-fg-muted)',
                }}
              >
                <Play size={11} />
                {modo === 'estados' ? 'Reproduzindo' : 'Reproduzir estados'}
              </button>
            )}
            {temScroll && (
              <button
                type="button"
                onClick={() => setModo((m) => (m === 'scroll' ? 'plano' : 'scroll'))}
                aria-pressed={modo === 'scroll'}
                title="Rolo a prévia de verdade para mostrar o que capturei: revelar, parallax, barra fixa"
                className="ds-tag flex items-center gap-2 rounded-full border px-3 py-2 text-[11px]"
                style={{
                  borderColor: modo === 'scroll' ? 'var(--color-primary)' : 'var(--color-border)',
                  color: modo === 'scroll' ? 'var(--color-primary)' : 'var(--color-fg-muted)',
                }}
              >
                <MoveVertical size={11} />
                {modo === 'scroll' ? 'Rolando' : 'Ver ao rolar'}
              </button>
            )}
            {temHover && (
              <button
                type="button"
                onClick={() => setModo((m) => (m === 'hover' ? 'plano' : 'hover'))}
                aria-pressed={modo === 'hover'}
                title="Passo o mouse sozinho em cada elemento que reage, um de cada vez"
                className="ds-tag flex items-center gap-2 rounded-full border px-3 py-2 text-[11px]"
                style={{
                  borderColor: modo === 'hover' ? 'var(--color-primary)' : 'var(--color-border)',
                  color: modo === 'hover' ? 'var(--color-primary)' : 'var(--color-fg-muted)',
                }}
              >
                <MousePointer2 size={11} />
                {modo === 'hover' ? 'Mostrando hover' : 'Ver hover'}
              </button>
            )}
            {print !== undefined && (
              <button
                type="button"
                onClick={() => setModo((m) => (m === 'print' ? 'plano' : 'print'))}
                aria-pressed={modo === 'print'}
                title="A dobra como eu vi no site, para comparar o componente com o original"
                className="ds-tag flex items-center gap-2 rounded-full border px-3 py-2 text-[11px]"
                style={{
                  borderColor: modo === 'print' ? 'var(--color-primary)' : 'var(--color-border)',
                  color: modo === 'print' ? 'var(--color-primary)' : 'var(--color-fg-muted)',
                }}
              >
                <Camera size={11} />
                {modo === 'print' ? 'Vendo o print' : 'Print da dobra'}
              </button>
            )}
            <BgToggle bg={bg} onChange={setBg} />
            <button
              type="button"
              onClick={() => add.mutate()}
              disabled={segment.inLibrary || add.isPending}
              className="ds-btn flex items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              {add.isPending ? <Mascote tamanho={12} girando /> : <Heart size={12} />}
              {segment.inLibrary ? 'Na Biblioteca' : 'Curtir'}
            </button>
          </div>
        </div>
        <FidelityPanel
          fidelity={segment.fidelity}
          comparacao={segment.comparacaoVisual}
          limitacoes={segment.limitacoes}
        />
        {modo === 'print' && print !== undefined ? (
          <div className="p-4">
            {/* Imagem, não iframe: é registro do que a captura viu, não o
                componente rodando. A distinção importa — misturar os dois é
                como o "card preto" nasce. */}
            <img
              src={frameUrl(dsId, print)}
              alt={`Print da dobra ${segment.name} no site de origem`}
              className="w-full rounded-lg"
              style={{ border: '1px solid var(--color-border)' }}
            />
            <p className="mt-3 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
              {abreNoPrint
                ? 'Esta camada cobre a página toda, então sozinha ela não mostra nada. Esmaeci o conteúdo de propósito: o que importa aqui é o fundo.'
                : 'A dobra no site de origem, no momento em que capturei. Compare com a prévia para ver o que veio junto e o que ficou pelo caminho.'}
            </p>
          </div>
        ) : (
          <div className="p-4">
            <PreviewFrame
              key={`${bg ?? 'auto'}-${ehReferenciaVisual ? 'ref' : modo}`}
              src={
                modo === 'scroll'
                  ? previewSegmentScrollUrl(segment.id, bg)
                  : modo === 'hover'
                    ? previewSegmentHoverUrl(segment.id, bg)
                    : modo === 'estados' || ehReferenciaVisual
                      ? previewSegmentReplayUrl(segment.id, bg)
                      : previewSegmentUrl(segment.id, bg)
              }
              title={segment.name}
              aspect={16 / 11}
              interactive
              // No detalhe a seção aparece inteira; a proporção fixa é da grade.
              autoHeight={modo === 'plano' && !ehReferenciaVisual}
              className="rounded-lg"
            />
          </div>
        )}
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
        <Mascote
          tamanho={96}
          esmaecido
          alt="O núcleo do sistema, apagado: nada foi trazido ainda"
          className="mx-auto mb-6"
        />
        <div className="ds-label">Galeria vazia</div>
        <h2
          className="ds-text-glow mt-2 text-[24px]"
          style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
        >
          {VAZIO.acervo.titulo}
        </h2>
        <p className="mt-3 text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
          {VAZIO.acervo.corpo}
        </p>
      </div>
    </div>
  );
}
