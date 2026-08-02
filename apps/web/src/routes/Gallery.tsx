import { ConfirmPop } from '@/components/ConfirmPop';
import { Mascote } from '@/components/Mascote';
import { Modal } from '@/components/Modal';
import { PreviewFrame } from '@/components/PreviewFrame';
import {
  type AncoraNaTela,
  type ConferenciaDePixel,
  type DesignSystemRecord,
  type Recolorabilidade,
  type SegmentFidelity,
  type SegmentRecord,
  type Veredito,
  api,
  frameUrl,
  previewSegmentHoverUrl,
  previewSegmentReplayUrl,
  previewSegmentScrollUrl,
  previewSegmentUrl,
} from '@/lib/api';
import { emMinutos, oQueFaltou, orcamentoSugeridoMs } from '@/lib/captura-parcial';
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
import {
  CATEGORIAS_POR_FAMILIA,
  FAMILIAS,
  FAMILIA_EXPLICA,
  FAMILIA_LABEL,
  ROTULO_DO_CANAL,
  familiaDe,
  rotuloDaCategoria,
} from '@ds/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  Columns2,
  Heart,
  Info,
  Layers,
  Monitor,
  MousePointer2,
  MoveVertical,
  Palette,
  Play,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * O filtro tem DOIS níveis: primeiro a família, depois a categoria dentro dela.
 *
 * O nível de cima é o que faltava. Vinte e cinco categorias num seletor plano
 * não são uma lista, são um monte, e elas nem são do mesmo tipo: `typography` é
 * um fundamento, `button` é uma peça, `interaction` é um efeito, `hero` é uma
 * dobra inteira. A família separa isso, e a categoria só aparece depois que a
 * pessoa escolheu de que tipo de coisa está atrás.
 *
 * A taxonomia mora no `@ds/shared` porque quatro telas mantinham cópias que já
 * tinham divergido. Aqui não se declara categoria nenhuma.
 */
type Familia = (typeof FAMILIAS)[number];
type FiltroDeFamilia = 'all' | Familia;

const CATEGORY_LABEL = (c: string): string => (c === 'all' ? 'Todos' : rotuloDaCategoria(c));

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

/** Estado da captura em linguagem de gente — o enum interno nunca vaza. */
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
 * O selo de alcance da marca.
 *
 * A recoloração deixa coisas de fora de propósito — palavra de cor, função
 * dinâmica, cor dentro de imagem — e cada decisão dessas está certa. O que não
 * estava certo era o silêncio: a peça entrava no kit parecendo que ia receber a
 * paleta da pessoa e saía com as cores da origem. Num site Tailwind isso é a
 * regra, não a exceção (medido no acervo: 46% de alcance, com 232 `var()`).
 *
 * "Aplicável" não ganha selo. Dizer que está tudo bem em toda peça boa vira
 * ruído e ensina a não ler nenhum.
 */
function MarcaBadge({ marca }: { marca?: Recolorabilidade }) {
  if (marca === undefined || marca.total === 0 || marca.taxa >= 0.8) return null;
  const fixas = marca.taxa < 0.35;
  const cor = fixas ? '#dc2626' : '#d97706';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-none px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
      style={{ backgroundColor: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
      title={
        fixas
          ? `As cores desta peça são fixas: só ${marca.alcancavel} de ${marca.total} aceitam a sua paleta. Ela vai sair com as cores da origem.`
          : `${marca.alcancavel} de ${marca.total} cores desta peça aceitam a sua paleta. O resto sai como está na origem.`
      }
    >
      <Palette size={9} />
      {fixas ? 'cores fixas' : `marca ${pct(marca.taxa)}`}
    </span>
  );
}

/**
 * Selo de mídia posicional no card.
 *
 * Só aparece quando a mídia ACOMPANHA a rolagem quadro a quadro. Um `reveal`
 * que só dispara ao chegar não muda a decisão de ninguém, e selo que aparece
 * sempre não é aviso, é decoração.
 */
function RolagemBadge({ ancoras }: { ancoras?: AncoraNaTela[] }) {
  const presas = (ancoras ?? []).filter((a) => a.acompanhaRolagem);
  const primeira = presas[0];
  if (primeira === undefined) return null;
  const cor = 'var(--color-accent)';
  return (
    <span
      className="inline-flex items-center gap-1 rounded-none px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--color-accent) 13%, transparent)',
        color: cor,
        border: '1px solid color-mix(in srgb, var(--color-accent) 33%, transparent)',
      }}
      title={
        presas.length === 1
          ? primeira.frase
          : `${presas.length} mídias desta peça se movem com a rolagem. ${primeira.frase}`
      }
    >
      <MoveVertical size={9} />
      {presas.length === 1 ? 'na rolagem' : `${presas.length} na rolagem`}
    </span>
  );
}

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
        className="inline-flex items-center gap-1 rounded-none px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
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
        className="inline-flex items-center gap-1 rounded-none px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
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
      className="inline-flex items-center gap-1 rounded-none px-1.5 py-px text-[9px] uppercase tracking-[0.1em]"
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
  vereditos,
  ancoras,
}: {
  fidelity?: SegmentFidelity | null;
  comparacao?: ConferenciaDePixel;
  limitacoes?: string[];
  vereditos?: Veredito[];
  ancoras?: AncoraNaTela[];
}) {
  if (!fidelity) return null;
  const temPipeline = (fidelity.pipeline?.length ?? 0) > 0;
  // `limitacoes` presente (mesmo vazia) = o segmento tem bundle, então a
  // conferência de pixel se aplica; ausente = peça antiga ou subcomponente.
  const temBundle = limitacoes !== undefined;
  // O que o compilador declarou e os avisos acima ainda não disseram — repetir
  // a mesma frase em duas listas só ensinaria a pessoa a não ler nenhuma.
  const declaracoes = (limitacoes ?? []).filter((l) => !fidelity.warnings.includes(l));
  const temAncora = (ancoras?.length ?? 0) > 0;
  const semRessalva =
    fidelity.support === 'completo' &&
    fidelity.warnings.length === 0 &&
    fidelity.interactions.length === 0 &&
    !temPipeline &&
    !temBundle &&
    !temAncora &&
    comparacao === undefined;
  if (semRessalva) return null;
  const cor = SUPORTE_COR[fidelity.support] ?? '#78716c';

  return (
    <div className="border-b px-6 py-3" style={{ borderColor: 'var(--color-border)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-none px-2 py-0.5 text-[10px] uppercase tracking-[0.1em]"
          style={{ backgroundColor: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}
        >
          {SUPORTE_LABEL[fidelity.support] ?? fidelity.support}
        </span>
        {fidelity.interactions.map((it) => (
          <span
            key={`${it.kind}-${it.support}`}
            className="ds-tag rounded-none border px-2 py-0.5 text-[10px]"
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
                className="ds-tag rounded-none px-2 py-0.5 text-[10px]"
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
      <ComoEuConferi vereditos={vereditos} comparacao={comparacao} temBundle={temBundle} />
      <MidiaPresaARolagem ancoras={ancoras} />
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
 * "Como eu conferi": uma linha por canal, com estado e motivo.
 *
 * A versão anterior tinha UMA frase — "esta peça não passou pela conferência de
 * pixel" — que juntava três coisas diferentes numa só: não rodou, rodou e
 * falhou, e nem se aplica. Quem lia não sabia se devia desconfiar da peça ou do
 * app, e a resposta muda tudo.
 *
 * Agora os quatro canais respondem sempre, inclusive os que não rodaram. Canal
 * calado é indistinguível de canal aprovado, e era assim que oito cápsulas
 * reprovadas chegavam à tela parecendo boas.
 */
function ComoEuConferi({
  vereditos,
  comparacao,
  temBundle,
}: {
  vereditos?: Veredito[];
  comparacao?: ConferenciaDePixel;
  temBundle: boolean;
}) {
  // Acervo antigo, sem o canal: cai no que a tela sabia dizer antes.
  if (vereditos === undefined || vereditos.length === 0) {
    if (comparacao !== undefined) {
      return (
        <div
          className="ds-data mt-2 text-[11px]"
          style={{ color: comparacao.passou ? 'var(--color-ok)' : 'var(--color-warn)' }}
        >
          conferência de pixel: delta {pct(comparacao.delta)} (limiar {pct(comparacao.limiar)})
        </div>
      );
    }
    return temBundle ? (
      <div className="mt-2 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
        esta peça não passou pela conferência de pixel
      </div>
    ) : null;
  }

  const COR: Record<Veredito['estado'], string> = {
    passou: 'var(--color-ok)',
    falhou: 'var(--color-warn)',
    'nao-rodou': 'var(--color-fg-subtle)',
  };
  const GLIFO: Record<Veredito['estado'], string> = {
    passou: '◉',
    falhou: '✕',
    'nao-rodou': '◯',
  };

  return (
    <div className="mt-3">
      <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
        como eu conferi:
      </span>
      <ul className="mt-1 space-y-1">
        {vereditos.map((v) => (
          <li key={v.canal} className="flex items-start gap-1.5 text-[11px] leading-relaxed">
            <span aria-hidden className="mt-px shrink-0" style={{ color: COR[v.estado] }}>
              {GLIFO[v.estado]}
            </span>
            <span className="min-w-0">
              <span style={{ color: 'var(--color-fg-muted)' }}>{ROTULO_DO_CANAL[v.canal]}</span>
              <span style={{ color: 'var(--color-fg-subtle)' }}>
                {' — '}
                {v.motivo}
                {v.delta !== undefined &&
                  v.limiar !== undefined &&
                  ` (${pct(v.delta)} de ${pct(v.limiar)})`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** O tipo da mídia em palavra de gente. Cai no próprio nome quando é novo. */
const MIDIA_LABEL: Record<string, string> = {
  video: 'vídeo',
  gif: 'gif',
  'webp-animado': 'imagem animada',
  'avif-animado': 'imagem animada',
  apng: 'imagem animada',
  'svg-animado': 'desenho animado',
  'svg-estatico': 'desenho',
  imagem: 'imagem',
  lottie: 'animação Lottie',
  'canvas-2d': 'desenho por script',
  webgl: 'cena 3D',
  webgl2: 'cena 3D',
  iframe: 'página embutida',
  audio: 'áudio',
};

/**
 * Mídia presa à rolagem.
 *
 * Numa peça com efeito guiado por scroll, a mídia não é "uma imagem": é esta
 * imagem NESTE ponto da página, andando neste ritmo. Quem troca o arquivo sem
 * saber disso recebe um site que parece quebrado sem entender por quê — e a
 * medida já existia, calada, dentro do manifesto.
 *
 * A tela declara o enquadramento. Ela ainda NÃO oferece a troca: enquanto a
 * peça não puder ser trocada com o movimento garantido, prometer isso seria
 * vender o que não se entrega.
 */
function MidiaPresaARolagem({ ancoras }: { ancoras?: AncoraNaTela[] }) {
  if (ancoras === undefined || ancoras.length === 0) return null;
  return (
    <div className="mt-3">
      <span className="ds-data text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
        mídia presa à rolagem:
      </span>
      <ul className="mt-1 space-y-1">
        {ancoras.map((a) => (
          <li
            key={`${a.midiaId}-${a.efeito}-${a.de}`}
            className="flex items-start gap-1.5 text-[11px] leading-relaxed"
          >
            <MoveVertical
              size={11}
              className="mt-0.5 shrink-0"
              style={{ color: 'var(--color-accent)' }}
            />
            <span className="min-w-0">
              <span style={{ color: 'var(--color-fg-muted)' }}>
                {MIDIA_LABEL[a.midiaKind] ?? a.midiaKind}
              </span>
              <span style={{ color: 'var(--color-fg-subtle)' }}>
                {' — '}
                {a.frase}
              </span>
            </span>
          </li>
        ))}
      </ul>
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
  const [familia, setFamilia] = useState<FiltroDeFamilia>('all');
  const [category, setCategory] = useState<string>('all');
  const [search, setSearch] = useState('');

  const effectiveDs = selectedDs ?? dsList.data?.items[0]?.id ?? null;

  // Trocar de família zera a categoria: manter "Botões" ligado depois de pular
  // para Dobras devolveria uma grade vazia sem explicar por quê.
  const trocarFamilia = (f: FiltroDeFamilia) => {
    setFamilia(f);
    setCategory('all');
  };

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
            familia={familia}
            onFamiliaChange={trocarFamilia}
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
      toast.ok('Removi a captura da Galeria.');
      setConfirming(null);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui remover a captura.'),
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
        Capturas
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="p-4 text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
            {TRABALHANDO.carregandoCapturas}
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
                className="mr-2 hidden rounded-none p-1.5 transition-all duration-300 hover:bg-[rgba(239,68,68,0.16)] group-hover:block"
                title="Excluir esta captura"
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
        confirmLabel="Excluir a captura"
        onConfirm={() => confirming && del.mutate(confirming.id)}
        onClose={() => setConfirming(null)}
        description={
          <>
            Tiro esta captura e as <strong>{impacto.data?.segmentos ?? '…'} peças</strong> que
            separei dela da Galeria.
            {(impacto.data?.componentesDaBiblioteca.length ?? 0) > 0 ? (
              <>
                {' '}
                As <strong>{impacto.data?.componentesDaBiblioteca.length} peças</strong> que já
                foram para a Biblioteca continuam lá (são cópias), mas as prévias delas podem perder
                as fontes e o runtime da origem.
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
  familia,
  onFamiliaChange,
  category,
  onCategoryChange,
  search,
  onSearchChange,
}: {
  dsId: string;
  familia: FiltroDeFamilia;
  onFamiliaChange: (f: FiltroDeFamilia) => void;
  category: string;
  onCategoryChange: (c: string) => void;
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

  // Sem filtro nenhum, a grade é das seções (raízes): os filhos da subdivisão
  // vivem na expansão do card da seção. Assim que a pessoa escolhe uma família
  // ou uma categoria, o filho SOBE para o primeiro nível — é o caminho de
  // "quero só os botões deste site", e é o que a família Peças existe para dar.
  const escopo = useMemo(() => {
    const todos = segments.data?.items ?? [];
    if (category !== 'all') return todos.filter((s) => s.category === category);
    if (familia !== 'all') return todos.filter((s) => familiaDe(s.category) === familia);
    return todos.filter((s) => s.parentId === null);
  }, [segments.data, familia, category]);

  const filtered = useMemo(() => {
    let items = escopo;
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
  }, [escopo, qualidade, search]);

  // A população da grade ANTES de qualidade e busca: o cabeçalho mostra
  // numerador e denominador do MESMO conjunto. Antes o numerador contava só
  // raízes e o denominador contava raízes + filhos, e a tela lia "10 /22" sem
  // filtro nenhum ligado.
  const populacao = escopo.length;

  // Os dois níveis do filtro saem do ACERVO, não da lista completa: família sem
  // nenhuma peça e categoria sem nenhum item não viram botão morto. O que está
  // selecionado continua visível mesmo que esvazie — excluir o último item não
  // pode sumir com o chip que desliga o filtro.
  const { familiasComItem, categoriasComItem } = useMemo(() => {
    const itens = segments.data?.items ?? [];
    const familiasPresentes = new Set(itens.map((s) => familiaDe(s.category)));
    const categoriasPresentes = new Set(itens.map((s) => s.category));
    const daFamilia =
      familia === 'all'
        ? [...categoriasPresentes]
        : CATEGORIAS_POR_FAMILIA[familia].filter(
            (c) => categoriasPresentes.has(c) || c === category,
          );
    return {
      familiasComItem: FAMILIAS.filter((f) => familiasPresentes.has(f) || f === familia),
      // A categoria só entra no segundo nível quando há uma família escolhida:
      // no "Todos" a lista voltaria a ser o monte plano de 25 que a família
      // existe para desfazer.
      categoriasComItem: familia === 'all' ? [] : daFamilia,
    };
  }, [segments.data, familia, category]);

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
  //
  // Tudo que está NA GRADE entra na seleção, peça inclusive. Antes só as seções
  // entravam, com o argumento de que o filho tem curtir próprio no card — e o
  // argumento ignorava a escala: as peças são a maioria dos segmentos de uma
  // captura, e triá-las uma a uma é o trabalho que ninguém faz. Quem filtra por
  // "Peças" quer decidir sobre um conjunto.
  const visiveis = useMemo(() => filtered.map((s) => s.id), [filtered]);
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
              vista. "12 de 35" diz muito mais que "12 peças" quando um filtro
              está ligado. As de dentro contam à parte porque são de outra
              natureza: uma dobra é um pedaço da página, e o botão de dentro
              dela é uma peça que se reusa sozinha. */}
          <div className="mt-1.5 flex items-center gap-4">
            <span className="flex items-baseline gap-1.5">
              <span className="ds-data text-[13px]" style={{ color: 'var(--color-ion-3)' }}>
                {filtered.length}
              </span>
              <span className="ds-data text-[11px]" style={{ color: 'var(--color-fg-subtle)' }}>
                /{populacao}
              </span>
              <span className="ds-label">{populacao === 1 ? 'peça' : 'peças'}</span>
            </span>
            {totalFilhos > 0 && (
              <span className="flex items-baseline gap-1.5">
                <span className="ds-data text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
                  {totalFilhos}
                </span>
                <span className="ds-label">de dentro delas</span>
              </span>
            )}
          </div>
          {segments.data?.capturaParcial && (
            <Aviso resumo="Não terminei esta captura dentro do tempo">
              <CapturaParcial parcial={segments.data.capturaParcial} dsId={dsId} />
            </Aviso>
          )}
          {(dsInfo.data?.assetsFaltando.length ?? 0) > 0 && (
            <Aviso
              resumo={`Não consegui baixar ${conta(dsInfo.data?.assetsFaltando.length ?? 0, 'arquivo', 'arquivos')} deste site`}
            >
              Faltaram imagens ou fontes, então algumas prévias aparecem sem estilo. Extraia este
              site de novo para eu buscar o que faltou.
            </Aviso>
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
          className="ds-btn ds-glow-border ds-backdrop ml-4 flex shrink-0 items-center gap-2 whitespace-nowrap rounded-none px-4 py-2 text-[12px] uppercase tracking-[0.14em] disabled:opacity-50"
          style={{
            backgroundColor: 'rgb(var(--acento) / 0.08)',
            borderColor: 'rgb(var(--acento) / 0.4)',
            color: 'var(--color-ion-3)',
            fontFamily: 'var(--font-display)',
          }}
        >
          {classify.isPending ? <Mascote tamanho={12} girando /> : <Sparkles size={12} />}
          Classificar com IA
        </button>
      </div>

      {/* Duas faixas, não uma. Categoria é uma lista que cresce com o acervo;
          seleção, qualidade e busca são controles de tamanho fixo. Numa linha
          só, a lista de categorias espremia os outros até quebrar em degraus —
          e com a display larga do tema isso acontece já em 1440px. */}
      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-8 py-3"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <label
          className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[11px]"
          style={{ color: 'var(--color-fg-muted)' }}
          title="Selecionar todas as peças visíveis"
        >
          <input
            ref={selTodosRef}
            type="checkbox"
            checked={isAllSelected(sel, visiveis)}
            onChange={() => setSel((s) => toggleAllVisible(s, visiveis))}
            aria-label={`Selecionar todas as ${visiveis.length} peças visíveis`}
            className="h-4 w-4 accent-[var(--color-ion-4)]"
          />
          Todos
        </label>
        <span className="h-4 w-px shrink-0" style={{ backgroundColor: 'var(--color-border)' }} />
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
                'ds-tag rounded-none border px-3 py-1 text-[11px]',
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
          className="ds-data ml-auto w-[200px] rounded-none border px-3.5 py-1.5 text-[12px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(34,211,238,0.25)]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'rgba(0, 0, 0, 0.35)',
            color: 'var(--color-fg)',
          }}
        />
      </div>

      {/* Faixa das categorias. Fica na linha de baixo porque a lista cresce com
          o acervo: um site com muitas dobras produz mais chips, e é a lista que
          precisa de espaço para quebrar sem empurrar os controles fixos. */}
      <div
        className="flex flex-wrap items-center gap-1.5 border-b px-8 py-2.5"
        style={{ borderColor: 'var(--color-border)' }}
      >
        <button
          type="button"
          onClick={() => onFamiliaChange('all')}
          className={cn(
            'ds-tag rounded-none border px-3 py-1 text-[11px]',
            familia === 'all'
              ? 'ds-glass-static text-[var(--color-fg)]'
              : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
          )}
          style={{ fontFamily: 'var(--font-body)' }}
        >
          Tudo
        </button>
        {familiasComItem.map((f) => (
          <button
            type="button"
            key={f}
            onClick={() => onFamiliaChange(f)}
            title={FAMILIA_EXPLICA[f]}
            className={cn(
              'ds-tag rounded-none border px-3 py-1 text-[11px]',
              familia === f
                ? 'ds-glass-static text-[var(--color-fg)]'
                : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            {FAMILIA_LABEL[f]}
          </button>
        ))}
      </div>

      {/* Segundo nível: só aparece com uma família escolhida, e diz o que aquela
          família é. Sem a explicação, "Dobras" e "Peças" são palavras nossas
          que ninguém tem obrigação de conhecer. */}
      {familia !== 'all' && (
        <div
          className="flex flex-wrap items-center gap-1.5 border-b px-8 py-2.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <span className="ds-label mr-2 shrink-0">{FAMILIA_EXPLICA[familia]}</span>
          <button
            type="button"
            onClick={() => onCategoryChange('all')}
            className={cn(
              'ds-tag rounded-none border px-3 py-1 text-[11px]',
              category === 'all'
                ? 'ds-glass-static text-[var(--color-fg)]'
                : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
            )}
            style={{ fontFamily: 'var(--font-body)' }}
          >
            Todas
          </button>
          {categoriasComItem.map((c) => (
            <button
              type="button"
              key={c}
              onClick={() => onCategoryChange(c)}
              className={cn(
                'ds-tag rounded-none border px-3 py-1 text-[11px]',
                category === c
                  ? 'ds-glass-static text-[var(--color-fg)]'
                  : 'border-transparent text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]',
              )}
              style={{ fontFamily: 'var(--font-body)' }}
            >
              {CATEGORY_LABEL(c)}
            </button>
          ))}
        </div>
      )}

      {selCount > 0 && (
        <section
          aria-label="Ações em massa"
          className="ds-backdrop flex flex-wrap items-center gap-3 border-b px-8 py-2.5"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(6,182,212,0.14)' }}
        >
          <span className="ds-data text-[12px]" style={{ color: 'var(--color-fg)' }}>
            {selCount} selecionado{selCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            onClick={() => curtirLote.mutate()}
            disabled={curtirLote.isPending}
            className="ds-btn flex items-center gap-1.5 rounded-none px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
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
                ? 'Marque 2 ou 3 peças e eu mostro lado a lado'
                : 'Ver lado a lado, com interação'
            }
            className="ds-tag flex items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-[12px] disabled:opacity-40"
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
            className="ds-tag flex items-center gap-1.5 rounded-none border px-3.5 py-1.5 text-[12px] disabled:opacity-50"
            style={{ borderColor: 'rgba(239,68,68,0.45)', color: 'var(--color-ion-3)' }}
          >
            <Trash2 size={12} />
            Excluir selecionados
          </button>
          <button
            type="button"
            onClick={() => setSel(new Set())}
            className="ds-tag ml-auto flex items-center gap-1.5 rounded-none border border-transparent px-3 py-1.5 text-[12px]"
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
                selected={sel.has(seg.id)}
                onToggle={() => setSel((s) => toggleSel(s, seg.id))}
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
          title={`Comparando ${comparando.length} peças`}
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
                        {CATEGORY_LABEL(s.category)}
                      </span>
                      <FidelityBadge fidelity={s.fidelity} comparacao={s.comparacaoVisual} />
                      <MarcaBadge marca={s.marca} />
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
      toast.ok('Tirei esta peça da triagem.');
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
                    className="rounded-none px-1.5 py-px text-[9px] uppercase tracking-[0.12em]"
                    style={{
                      backgroundColor: 'var(--color-ion-8)',
                      color: 'var(--color-bone-1)',
                    }}
                  >
                    sistema
                  </span>
                )}
                <span className="truncate">{CATEGORY_LABEL(segment.category)}</span>
                <FidelityBadge fidelity={segment.fidelity} comparacao={segment.comparacaoVisual} />
                <MarcaBadge marca={segment.marca} />
                <RolagemBadge ancoras={segment.ancoras} />
              </div>
              {subcomponentes > 0 && onAbrirPecas !== undefined && (
                <button
                  type="button"
                  onClick={onAbrirPecas}
                  className="ds-tag mt-1.5 flex items-center gap-1 rounded-none border px-2 py-0.5 text-[10px]"
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
                className="flex h-8 w-8 items-center justify-center rounded-none opacity-0 transition-all duration-300 hover:bg-[rgba(239,68,68,0.16)] group-hover:opacity-100"
                title="Excluir da triagem"
              >
                <Trash2 size={12} style={{ color: 'var(--color-ion-3)' }} />
              </button>
              <button
                type="button"
                onClick={() => add.mutate()}
                disabled={segment.inLibrary || add.isPending}
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-none transition-all duration-300 disabled:cursor-not-allowed',
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
              }. A Galeria é material de trabalho: se eu segmentar a captura de novo, a lista completa volta. O que já foi para a Biblioteca continua lá.`
            : 'A Galeria é material de trabalho. Se eu segmentar a captura de novo, a lista completa volta. O que já foi para a Biblioteca continua lá.'
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
            className="ds-tag flex shrink-0 items-center gap-2 rounded-none border px-3.5 py-2 text-[12px]"
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
                {CATEGORY_LABEL(categoria)}
                <span
                  className="rounded-none px-1.5 py-px text-[9px]"
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
  selected,
  onToggle,
}: {
  segment: SegmentRecord;
  dsId: string;
  nomeDoPai: string | undefined;
  onOpen: (s: SegmentRecord) => void;
  /** Ausentes no painel de peças de uma dobra, onde não há seleção em massa. */
  selected?: boolean;
  onToggle?: () => void;
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
      toast.ok('Tirei esta peça da triagem.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Não consegui excluir.'),
  });

  return (
    // SEM `overflow-hidden` aqui, e a razão é específica: num item de grid,
    // `overflow: hidden` faz o `min-height: auto` resolver para ZERO. A altura
    // deste card vem do `aspect-ratio` do preview, e com o mínimo em zero a
    // grid dimensionava a linha só pelo rodapé — 39px em vez de 274px. O card
    // virava uma tira e o componente sumia, cortado pelo próprio overflow.
    //
    // Aparecia só quando vários filhos caíam na grade de uma vez (o filtro por
    // família "Peças"), porque a primeira linha era medida com os cards de
    // dobra, que têm altura intrínseca. O recorte que o overflow dava já é
    // feito pelo PreviewFrame, que tem o seu.
    <div
      className="ds-glass-static group relative rounded-none"
      style={selected === true ? { outline: '2px solid var(--color-ion-5)' } : undefined}
    >
      {onToggle !== undefined && (
        <label
          className="absolute top-2 left-2 z-10 cursor-pointer p-1"
          title={`Selecionar ${segment.name}`}
        >
          <input
            type="checkbox"
            checked={selected === true}
            onChange={onToggle}
            aria-label={`Selecionar ${segment.name}`}
            className="h-4 w-4 accent-[var(--color-ion-4)]"
          />
        </label>
      )}
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
            <span className="shrink-0">{CATEGORY_LABEL(segment.category)}</span>
            <FidelityBadge fidelity={segment.fidelity} comparacao={segment.comparacaoVisual} />
            <MarcaBadge marca={segment.marca} />
            <RolagemBadge ancoras={segment.ancoras} />
            {nomeDoPai !== undefined && (
              <span
                className="truncate rounded-none border px-1.5 py-px"
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
            className="flex h-7 w-7 items-center justify-center rounded-none opacity-0 transition-all duration-300 hover:bg-[rgba(239,68,68,0.16)] group-hover:opacity-100"
            title="Excluir da triagem"
          >
            <Trash2 size={11} style={{ color: 'var(--color-ion-3)' }} />
          </button>
          <button
            type="button"
            onClick={() => add.mutate()}
            disabled={segment.inLibrary || add.isPending}
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-none transition-all duration-300 disabled:cursor-not-allowed',
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
        description="Sai só esta peça: a dobra de onde ela veio continua na Galeria. Se eu segmentar a captura de novo, a lista completa volta."
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
  // O laudo nasce FECHADO. Um clique na peça é para ver a peça: o laudo aberto
  // por padrão empurrava o componente para baixo e enchia a tela de texto sobre
  // aquilo que a pessoa veio olhar. Ele continua a um clique de distância, e o
  // botão avisa quando há ressalva para ler.
  const [laudo, setLaudo] = useState(false);
  // A largura em que a prévia é renderizada. 1440 é a viewport da captura;
  // 390 é o celular. Ver a peça nas duas é o que separa "parece bom" de
  // "funciona", e não existia lugar nenhum no app para fazer isso.
  const [largura, setLargura] = useState<1440 | 390>(1440);
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
  // Vale abrir o laudo? É o que decide o ponto de aviso no botão: sem medição,
  // com selo diferente de completo, com aviso do compilador ou reprovada no
  // pixel. Peça limpa não pede leitura nenhuma.
  const temRessalva =
    !segment.fidelity ||
    segment.fidelity.support !== 'completo' ||
    segment.fidelity.warnings.length > 0 ||
    segment.comparacaoVisual?.passou === false;

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
                  className="rounded-none px-1.5 py-px text-[9px] uppercase tracking-[0.12em]"
                  style={{
                    backgroundColor: 'var(--color-ion-8)',
                    color: 'var(--color-bone-1)',
                  }}
                >
                  sistema
                </span>
              )}
              {CATEGORY_LABEL(segment.category)} · {segment.kind}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {temEstados && (
              <button
                type="button"
                onClick={() => setModo((m) => (m === 'estados' ? 'plano' : 'estados'))}
                aria-pressed={modo === 'estados'}
                title="Mostro aqui os estados que capturei: hover, clique, modal"
                className="ds-tag flex items-center gap-2 rounded-none border px-3 py-2 text-[11px]"
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
                className="ds-tag flex items-center gap-2 rounded-none border px-3 py-2 text-[11px]"
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
                className="ds-tag flex items-center gap-2 rounded-none border px-3 py-2 text-[11px]"
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
                className="ds-tag flex items-center gap-2 rounded-none border px-3 py-2 text-[11px]"
                style={{
                  borderColor: modo === 'print' ? 'var(--color-primary)' : 'var(--color-border)',
                  color: modo === 'print' ? 'var(--color-primary)' : 'var(--color-fg-muted)',
                }}
              >
                <Camera size={11} />
                {modo === 'print' ? 'Vendo o print' : 'Print da dobra'}
              </button>
            )}
            <LarguraToggle largura={largura} onChange={setLargura} />
            <BgToggle bg={bg} onChange={setBg} />
            <BotaoDeLaudo
              aberto={laudo}
              temRessalva={temRessalva}
              onClick={() => setLaudo((v) => !v)}
            />
            <button
              type="button"
              onClick={() => add.mutate()}
              disabled={segment.inLibrary || add.isPending}
              className="ds-btn flex items-center gap-2 rounded-none px-4 py-2 text-[12px] font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              {add.isPending ? <Mascote tamanho={12} girando /> : <Heart size={12} />}
              {segment.inLibrary ? 'Na Biblioteca' : 'Curtir'}
            </button>
          </div>
        </div>
        {/* A peça e o laudo lado a lado, nunca um em cima do outro. Com o laudo
            fechado (o padrão) a peça fica com a largura toda. */}
        <div className="flex min-h-0">
          <div className="min-w-0 flex-1 p-4">
            {modo === 'print' && print !== undefined ? (
              <>
                {/* Imagem, não iframe: é registro do que a captura viu, não o
                    componente rodando. A distinção importa — misturar os dois é
                    como o "card preto" nasce. */}
                <img
                  src={frameUrl(dsId, print)}
                  alt={`Print da dobra ${segment.name} no site de origem`}
                  className="w-full rounded-none"
                  style={{ border: '1px solid var(--color-border)' }}
                />
                <p className="mt-3 text-[12px]" style={{ color: 'var(--color-fg-muted)' }}>
                  {abreNoPrint
                    ? 'Esta camada cobre a página toda, então sozinha ela não mostra nada. Esmaeci o conteúdo de propósito: o que importa aqui é o fundo.'
                    : 'A dobra no site de origem, no momento em que capturei. Compare com a prévia para ver o que veio junto e o que ficou pelo caminho.'}
                </p>
              </>
            ) : (
              <div
                className={cn('mx-auto', largura === 390 && 'max-w-[390px]')}
                style={largura === 390 ? { border: '1px solid var(--color-border)' } : undefined}
              >
                <PreviewFrame
                  key={`${bg ?? 'auto'}-${ehReferenciaVisual ? 'ref' : modo}-${largura}`}
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
                  virtualWidth={largura}
                  interactive
                  // No detalhe a seção aparece inteira; a proporção fixa é da grade.
                  autoHeight={modo === 'plano' && !ehReferenciaVisual}
                />
              </div>
            )}
          </div>
          {laudo && (
            <aside
              className="w-[340px] shrink-0 overflow-y-auto border-l"
              style={{ borderColor: 'var(--color-border)', maxHeight: '70vh' }}
              aria-label="O que eu medi nesta peça"
            >
              <FidelityPanel
                fidelity={segment.fidelity}
                comparacao={segment.comparacaoVisual}
                limitacoes={segment.limitacoes}
                vereditos={segment.vereditos}
                ancoras={segment.ancoras}
              />
            </aside>
          )}
        </div>
      </div>
    </Modal>
  );
}

/**
 * O detalhe do corte, com a instrução que de fato resolve.
 *
 * A versão antiga terminava em "Extraia o site de novo para eu completar", e
 * essa frase é um conselho que não funciona: repetir sem mudar o orçamento corta
 * a mesma fase no mesmo lugar. Foi medido nesta própria tela — a segunda
 * tentativa, com cinco vezes mais tempo, saiu parcial de novo.
 *
 * Agora a tela diz quanto a fase chegou a receber, quanto pedir na próxima, e
 * assume que é estimativa. Quando o motor não gravou o número, ela não inventa:
 * diz que o que está aqui é bom e o que falta são as dobras de baixo.
 */
function CapturaParcial({
  parcial,
  dsId,
}: {
  parcial: { fase: string; motivo?: string; totalMs: number };
  dsId: string;
}) {
  const sugerido = orcamentoSugeridoMs(parcial.motivo);
  return (
    <>
      <p>{oQueFaltou(parcial.fase)}</p>
      <p className="mt-2">
        O que está aqui é bom: as peças têm pacote próprio, o CSS veio inteiro e os ícones foram
        desenhados. O que falta são os comportamentos das dobras de baixo.
      </p>
      {sugerido === null ? (
        <p className="mt-2">
          Para tentar completar, extraia de novo com mais tempo — a fase que cortou foi a{' '}
          <code className="ds-data">{parcial.fase}</code>.
        </p>
      ) : (
        <>
          <p className="mt-2">
            Repetir do mesmo jeito dá o mesmo resultado. Para ir mais longe, dê mais tempo (cerca de{' '}
            {emMinutos(sugerido)} minutos, estimados a partir do que esta fase pediu):
          </p>
          <pre
            className="ds-data mt-1.5 overflow-x-auto rounded-none px-2 py-1.5 text-[10px]"
            style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          >
            {`$env:DS_EXPLORER_ORCAMENTO_TOTAL_MS = "${sugerido}"\npnpm reextrair ${dsId}`}
          </pre>
        </>
      )}
    </>
  );
}

/**
 * Aviso de uma linha, com o detalhe atrás de um clique.
 *
 * Os avisos da Galeria ocupavam três linhas cada, empilhados acima da grade, e
 * empurravam as peças para fora da tela — a informação é útil, o tamanho é que
 * não era. Aqui fica o essencial visível e o resto a um clique, pela mesma razão
 * do laudo: quem abriu a Galeria veio ver componente.
 */
function Aviso({ resumo, children }: { resumo: string; children: ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <div
      className="mt-2 rounded-none px-3 py-2 text-[11px] leading-relaxed"
      style={{ backgroundColor: 'rgba(245,158,11,0.14)', color: 'var(--color-fg)' }}
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 text-left"
      >
        <AlertTriangle size={13} className="shrink-0" style={{ color: 'var(--color-warn)' }} />
        <strong className="min-w-0 flex-1 truncate">{resumo}</strong>
        <span className="ds-label shrink-0">{aberto ? 'fechar' : 'saiba mais'}</span>
      </button>
      {aberto && <div className="mt-2 pl-[21px]">{children}</div>}
    </div>
  );
}

/**
 * O botão que abre o laudo.
 *
 * Ele existe porque a medição não pode sumir — a Galeria inteira foi consertada
 * para parar de esconder o que mediu. Mas medição em modo laudo, aberta em cima
 * da peça, é o que fazia a lente virar formulário. Aqui ela fica a um clique, e
 * o ponto âmbar avisa que há ressalva para ler antes de curtir.
 */
function BotaoDeLaudo({
  aberto,
  temRessalva,
  onClick,
}: {
  aberto: boolean;
  temRessalva: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aberto}
      title={
        temRessalva
          ? 'Esta peça tem ressalva na medição. Clique para ler o que eu conferi'
          : 'O que eu medi nesta peça'
      }
      className="ds-tag relative flex items-center gap-2 rounded-none border px-3 py-2 text-[11px]"
      style={{
        borderColor: aberto ? 'var(--color-primary)' : 'var(--color-border)',
        color: aberto ? 'var(--color-primary)' : 'var(--color-fg-muted)',
      }}
    >
      <Info size={12} />
      {aberto ? 'Fechar laudo' : 'O que eu medi'}
      {temRessalva && !aberto && (
        <span
          aria-hidden
          className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: 'var(--color-warn)' }}
        />
      )}
    </button>
  );
}

/** Largura da prévia: a da captura (1440) e a do celular (390). */
function LarguraToggle({
  largura,
  onChange,
}: {
  largura: 1440 | 390;
  onChange: (l: 1440 | 390) => void;
}) {
  return (
    <div className="flex shrink-0">
      {([1440, 390] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => onChange(l)}
          aria-pressed={largura === l}
          title={l === 1440 ? 'Ver como no computador' : 'Ver como no celular'}
          className="ds-tag ds-data flex items-center gap-1.5 rounded-none border px-3 py-2 text-[11px]"
          style={{
            borderColor: largura === l ? 'var(--color-primary)' : 'var(--color-border)',
            color: largura === l ? 'var(--color-primary)' : 'var(--color-fg-muted)',
            marginLeft: l === 390 ? -1 : 0,
          }}
        >
          {l === 1440 ? <Monitor size={11} /> : <Smartphone size={11} />}
          {l}
        </button>
      ))}
    </div>
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
      className="ds-tag flex items-center gap-2 rounded-none border px-3 py-2 text-[11px]"
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
          {VAZIO.capturas.titulo}
        </h2>
        <p className="mt-3 text-[13px]" style={{ color: 'var(--color-fg-muted)' }}>
          {VAZIO.capturas.corpo}
        </p>
      </div>
    </div>
  );
}
