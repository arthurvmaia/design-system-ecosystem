import { ConfirmPop } from '@/components/ConfirmPop';
import { FontPreview } from '@/components/FontPreview';
import { GoogleFontsPicker } from '@/components/GoogleFontsPicker';
import { type LayoutChoice, LayoutPicker } from '@/components/LayoutPicker';
import { Modal } from '@/components/Modal';
import { QueuePanel } from '@/components/QueuePanel';
import {
  type Blueprint,
  type MediaItem,
  type ProjectBranding,
  type ProjectRecord,
  type StartWorkResponse,
  type TaskRecord,
  api,
} from '@/lib/api';
import {
  type MarcaSubId,
  STATUS_LABEL,
  type SecaoStatus,
  marcaSectionStatus,
} from '@/lib/generator-sections';
import { SOCIAL_PLATFORMS, validarUrlSocial } from '@/lib/social';
import { toast } from '@/lib/toast';
import { useReveal } from '@/lib/use-reveal';
import { familyName } from '@ds/shared/fonts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Rocket,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

/**
 * Que categorias do kit atendem cada papel de seção. Se o kit tem algo, aquele
 * slot é preenchido com peça sua; se não, será criado no estilo do kit. É o que
 * a etapa de estrutura mostra em cada slot, para não haver surpresa no resultado.
 */
const ROLE_CATS: Record<string, string[]> = {
  nav: ['nav', 'header'],
  hero: ['hero'],
  logos: [],
  features: ['feature', 'card'],
  showcase: ['card'],
  stats: [],
  pricing: ['pricing'],
  testimonials: ['testimonial'],
  faq: ['faq'],
  about: [],
  team: [],
  gallery: ['card'],
  catalog: ['card'],
  contact: ['form'],
  cta: ['cta', 'button'],
  footer: ['footer'],
};

const mediaUrl = (prjId: string, path: string) =>
  `/api/projects/${prjId}/media/${encodeURIComponent(path)}`;

export function ProjectsPage() {
  const projects = useQuery({ queryKey: ['projects'], queryFn: api.listProjects });
  const kits = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  const [wizard, setWizard] = useState<ProjectRecord | 'novo' | null>(null);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // "Editar" vindo de Meus sites chega como ?edit=<id> — abre o wizard com o
  // projeto carregado assim que a lista responde, e limpa o parâmetro da URL.
  const editId = searchParams.get('edit');
  useEffect(() => {
    if (!editId || wizard !== null) return;
    const alvo = projects.data?.items.find((p) => p.id === editId);
    if (alvo) {
      setWizard(alvo);
      setSearchParams({}, { replace: true });
    }
  }, [editId, projects.data, wizard, setSearchParams]);

  const activeTask = useQuery({
    queryKey: ['task', activeTaskId],
    queryFn: () => (activeTaskId ? api.getTask(activeTaskId).then((r) => r.task) : null),
    refetchInterval: (query) => {
      const t = query.state.data as TaskRecord | null | undefined;
      if (t && (t.status === 'running' || t.status === 'queued')) return 2000;
      return false;
    },
    enabled: activeTaskId !== null,
  });

  const items = projects.data?.items ?? [];
  const kitCount = kits.data?.items.length ?? 0;
  useReveal([items.length]);

  const onWork = (res: StartWorkResponse) => {
    setWizard(null);
    if ('task' in res) setActiveTaskId(res.task.id);
    else toast.ok('Geração adicionada à fila. Rode o PROCESSAR.bat para produzir o site.');
  };

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-12">
      <div className="flex items-end justify-between">
        <div>
          <div
            className="ds-slide-up text-[10px] uppercase tracking-[0.28em]"
            style={{ color: 'var(--color-primary)', fontFamily: 'var(--font-display)' }}
          >
            Gerar site
          </div>
          <h1
            className="ds-slide-up ds-d1 ds-text-glow mt-2 text-[36px] font-medium tracking-tight"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            Um site novo com a sua marca.
          </h1>
          <p
            className="ds-slide-up ds-d2 mt-3 max-w-[62ch] text-[14px] leading-[1.6]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            Escolha um kit como base visual e traga a sua identidade e o seu conteúdo. O site nunca
            copia texto ou marca do site de origem — só o jeito visual do kit.
          </p>
        </div>
        <div className="ds-scale-in ds-d2">
          <button
            type="button"
            onClick={() => setWizard('novo')}
            disabled={kitCount === 0}
            className="ds-btn ds-gradient-crimson ds-glow flex items-center gap-2 rounded-full px-5 py-2.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
            style={{ color: 'var(--color-bone-1)' }}
          >
            <Rocket size={13} />
            Novo projeto
          </button>
        </div>
      </div>

      <div className="mt-6">
        <QueuePanel />
      </div>

      {kitCount === 0 && (
        <div
          className="ds-glass-static mt-8 rounded-lg p-4 text-[13px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Você ainda não tem nenhum kit. Monte um Design System final em{' '}
          <span className="ds-data">Design Systems</span> antes de gerar um site.
        </div>
      )}

      {activeTask.data && <TaskCard task={activeTask.data} />}

      <div className="mt-10">
        <div
          className="text-[10px] uppercase tracking-[0.28em]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
        >
          Projetos
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((p) => (
            <ProjectCard key={p.id} project={p} onEdit={() => setWizard(p)} onGenerated={onWork} />
          ))}
          {items.length === 0 && (
            <div
              className="col-span-full py-8 text-center text-[13px]"
              style={{ color: 'var(--color-fg-subtle)' }}
            >
              nenhum projeto ainda.
            </div>
          )}
        </div>
      </div>

      {wizard !== null && (
        <ProjectWizard
          existing={wizard === 'novo' ? null : wizard}
          onClose={() => setWizard(null)}
          onGenerated={onWork}
        />
      )}
    </div>
  );
}

function ProjectCard({
  project,
  onEdit,
  onGenerated,
}: {
  project: ProjectRecord;
  onEdit: () => void;
  onGenerated: (res: StartWorkResponse) => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmDel, setConfirmDel] = useState(false);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['meus-projetos'] });
    qc.invalidateQueries({ queryKey: ['meus-projetos-contagem'] });
  };

  const gerar = useMutation({
    mutationFn: () => api.generateProject(project.id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      onGenerated(res);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao gerar.'),
  });

  const duplicar = useMutation({
    mutationFn: () => api.duplicateProject(project.id),
    onSuccess: () => {
      invalidate();
      toast.ok('Projeto duplicado como rascunho.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao duplicar.'),
  });

  const excluir = useMutation({
    mutationFn: () => api.deleteProject(project.id),
    onSuccess: () => {
      invalidate();
      toast.ok('Projeto excluído.');
      setConfirmDel(false);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao excluir.'),
  });

  const gerado = project.status === 'generated';

  return (
    <div className="ds-card ds-glass-static group rounded-xl p-4">
      <div className="ds-card-content">
        <div className="flex items-center justify-between gap-3">
          <div
            className="min-w-0 truncate text-[15px] font-medium"
            style={{ color: 'var(--color-fg)', fontFamily: 'var(--font-display)' }}
          >
            {project.name}
          </div>
          <StatusBadge status={project.status} />
        </div>

        <div className="ds-data mt-2 text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
          {project.id} · {new Date(project.updatedAt).toLocaleString('pt-BR')}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="ds-btn ds-glow-border ds-backdrop flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px]"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', color: 'var(--color-fg)' }}
          >
            <Pencil size={12} />
            Editar
          </button>
          <button
            type="button"
            onClick={() => gerar.mutate()}
            disabled={gerar.isPending}
            className="ds-btn ds-glow flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium disabled:opacity-50"
            style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
          >
            {gerar.isPending ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            {gerado ? 'Gerar de novo' : 'Gerar site'}
          </button>
          {gerado && (
            <button
              type="button"
              onClick={() => navigate('/meus-projetos')}
              className="flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[12px] transition-colors hover:text-[var(--color-fg)]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              Ver site
            </button>
          )}
          <div className="ml-auto flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              onClick={() => duplicar.mutate()}
              disabled={duplicar.isPending}
              title="Duplicar"
              className="rounded-full p-1.5 transition-all hover:scale-110 hover:bg-white/[0.06]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              {duplicar.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Copy size={13} />
              )}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDel(true)}
              title="Excluir"
              className="rounded-full p-1.5 transition-all hover:scale-110 hover:bg-[rgba(198,40,40,0.16)]"
              style={{ color: 'var(--color-crimson-3)' }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      <ConfirmPop
        open={confirmDel}
        title={`Apagar "${project.name}"?`}
        busy={excluir.isPending}
        confirmLabel="Apagar projeto"
        onConfirm={() => excluir.mutate()}
        onClose={() => setConfirmDel(false)}
        description="Leva junto os sites já gerados dele. Não dá para desfazer."
      />
    </div>
  );
}

// ── Wizard ───────────────────────────────────────────────────────────────────

type WizardBranding = {
  brandName: string;
  tone: string;
  primary: string;
  background: string;
  foreground: string;
  accent: string;
  fontDisplay: string;
  fontBody: string;
  logoPath: string | null;
  contact: { email: string; phone: string; whatsapp: string; address: string };
  social: Record<string, string>;
  mainCta: { label: string; href: string };
};

const ETAPAS = ['Projeto', 'Marca', 'Estrutura', 'Conteúdo', 'Mídia', 'Revisão'] as const;

function ProjectWizard({
  existing,
  onClose,
  onGenerated,
}: {
  existing: ProjectRecord | null;
  onClose: () => void;
  onGenerated: (res: StartWorkResponse) => void;
}) {
  const qc = useQueryClient();
  const kits = useQuery({ queryKey: ['kits'], queryFn: api.listKits });
  const blueprints = useQuery({ queryKey: ['blueprints'], queryFn: api.getBlueprints });

  const parsedBranding = parseBranding(existing?.brandingJson);
  const parsedContent = safeParse<{ sections?: Record<string, string> }>(existing?.contentJson);
  const parsedLayout = safeParse<LayoutChoice & Record<string, unknown>>(existing?.layoutJson);

  const [step, setStep] = useState(0);
  const [projectId, setProjectId] = useState<string | null>(existing?.id ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [kitId, setKitId] = useState<string | null>(existing?.kitId ?? null);
  const [branding, setBranding] = useState<WizardBranding>(parsedBranding);
  const [layout, setLayout] = useState<LayoutChoice>({
    mode: parsedLayout?.mode === 'criativo' ? 'criativo' : 'blueprint',
    blueprintId: parsedLayout?.blueprintId ?? 'saas-landing',
    disabledRoles: parsedLayout?.disabledRoles ?? [],
  });
  const [sections, setSections] = useState<Record<string, string>>(parsedContent?.sections ?? {});
  const [media, setMedia] = useState<MediaItem[]>(parseMedia(existing?.mediaManifestJson));

  const kit = useQuery({
    queryKey: ['kit', kitId],
    queryFn: () => {
      if (!kitId) throw new Error('sem kit');
      return api.getKit(kitId);
    },
    enabled: kitId !== null,
  });

  const setB = (patch: Partial<WizardBranding>) => setBranding((b) => ({ ...b, ...patch }));

  const toBranding = (): ProjectBranding => ({
    brandName: branding.brandName || undefined,
    tone: branding.tone || undefined,
    logoPath: branding.logoPath,
    palette: {
      primary: branding.primary,
      background: branding.background,
      foreground: branding.foreground,
      ...(branding.accent ? { accent: branding.accent } : {}),
    },
    typography: { display: branding.fontDisplay, body: branding.fontBody },
    contact: limparObjeto(branding.contact),
    social: limparObjeto(branding.social),
    mainCta: limparObjeto(branding.mainCta),
  });

  // Garante que o rascunho existe (cria no primeiro avanço). Retorna o id.
  const ensureDraft = async (): Promise<string> => {
    if (projectId) return projectId;
    const res = await api.createProject({ name: name.trim() || 'Sem nome', kitId });
    setProjectId(res.item.id);
    qc.invalidateQueries({ queryKey: ['projects'] });
    return res.item.id;
  };

  // Salva o estado acumulado. Chamado a cada avanço para não perder trabalho.
  const salvar = async (): Promise<string> => {
    const id = await ensureDraft();
    await api.updateProject(id, {
      name: name.trim() || 'Sem nome',
      kitId,
      content: { sections },
      branding: toBranding(),
      layout,
    });
    qc.invalidateQueries({ queryKey: ['projects'] });
    return id;
  };

  const avancar = useMutation({
    mutationFn: () => salvar(),
    onSuccess: () => setStep((s) => Math.min(ETAPAS.length - 1, s + 1)),
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao salvar o rascunho.'),
  });

  const gerar = useMutation({
    mutationFn: async () => {
      const id = await salvar();
      return api.generateProject(id);
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['queue'] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onGenerated(res);
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao gerar o site.'),
  });

  const bp = blueprints.data?.items.find((b) => b.id === layout.blueprintId);
  const activeSlots =
    layout.mode === 'blueprint'
      ? (bp?.slots.filter((s) => s.required || !layout.disabledRoles.includes(s.role)) ?? [])
      : [];

  const podeAvancar = step === 0 ? name.trim() !== '' && kitId !== null : true;
  const ultima = step === ETAPAS.length - 1;

  return (
    <Modal open onClose={onClose} size="xl" title={existing ? 'Editar projeto' : 'Novo projeto'}>
      <div className="flex max-h-[88vh] flex-col">
        <StepBar step={step} onStep={(s) => s <= step && setStep(s)} />

        <div className="min-h-[300px] flex-1 overflow-y-auto px-6 py-5">
          {step === 0 && (
            <StepProjeto
              name={name}
              onName={setName}
              kitId={kitId}
              onKit={setKitId}
              kits={kits.data?.items ?? []}
            />
          )}
          {step === 1 && (
            <StepMarca
              branding={branding}
              setB={setB}
              projectId={projectId}
              onLogo={(p) => setB({ logoPath: p })}
            />
          )}
          {step === 2 && (
            <StepEstrutura
              layout={layout}
              onLayout={setLayout}
              activeSlots={activeSlots}
              kitCategories={new Set((kit.data?.item.components ?? []).map((c) => c.category))}
            />
          )}
          {step === 3 && (
            <StepConteudo
              slots={activeSlots}
              mode={layout.mode}
              sections={sections}
              onSection={(role, v) => setSections((s) => ({ ...s, [role]: v }))}
              branding={branding}
              setB={setB}
            />
          )}
          {step === 4 && (
            <StepMidia projectId={projectId} slots={activeSlots} media={media} onMedia={setMedia} />
          )}
          {step === 5 && (
            <StepRevisao
              name={name}
              kit={kit.data?.item ?? null}
              branding={branding}
              activeSlots={activeSlots}
              mode={layout.mode}
              sections={sections}
              media={media}
            />
          )}
        </div>

        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <button
            type="button"
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] transition-colors hover:text-[var(--color-fg)]"
            style={{ color: 'var(--color-fg-muted)' }}
          >
            <ArrowLeft size={13} />
            {step === 0 ? 'Cancelar' : 'Voltar'}
          </button>

          {ultima ? (
            <button
              type="button"
              onClick={() => gerar.mutate()}
              disabled={gerar.isPending}
              className="ds-btn ds-glow flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              {gerar.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Rocket size={13} />
              )}
              Gerar site
            </button>
          ) : (
            <button
              type="button"
              onClick={() => avancar.mutate()}
              disabled={!podeAvancar || avancar.isPending}
              className="ds-btn ds-glow flex items-center gap-2 rounded-full px-6 py-2.5 text-[13px] font-medium disabled:opacity-40"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              {avancar.isPending ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <ArrowRight size={13} />
              )}
              Próximo
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function StepBar({ step, onStep }: { step: number; onStep: (s: number) => void }) {
  return (
    <div
      className="flex items-center gap-1 overflow-x-auto border-b px-6 py-3"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {ETAPAS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onStep(i)}
            disabled={i > step}
            className="flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-[11px] transition-colors disabled:cursor-default"
            style={{
              backgroundColor: active ? 'rgba(107,20,20,0.24)' : 'transparent',
              color: active
                ? 'var(--color-fg)'
                : done
                  ? 'var(--color-fg-muted)'
                  : 'var(--color-fg-subtle)',
              fontFamily: 'var(--font-display)',
            }}
          >
            <span
              className="ds-data flex h-4 w-4 items-center justify-center rounded-full text-[9px]"
              style={{
                backgroundColor: active || done ? 'var(--color-primary)' : 'rgba(255,255,255,0.06)',
                color: active || done ? 'var(--color-bone-1)' : 'var(--color-fg-subtle)',
              }}
            >
              {done ? <Check size={9} /> : i + 1}
            </span>
            {label}
          </button>
        );
      })}
    </div>
  );
}

function StepProjeto({
  name,
  onName,
  kitId,
  onKit,
  kits,
}: {
  name: string;
  onName: (v: string) => void;
  kitId: string | null;
  onKit: (id: string) => void;
  kits: Array<{ id: string; name: string; components: unknown[] }>;
}) {
  return (
    <div className="space-y-5">
      <Campo label="Nome do projeto">
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder="Ex: Landing do Cliente X"
          className={INPUT}
          style={inputStyle}
        />
      </Campo>
      <div>
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
          Kit base <span style={{ color: 'var(--color-crimson-3)' }}>*</span>
        </div>
        {kits.length === 0 ? (
          <div className="text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
            Nenhum kit disponível. Monte um em Design Systems.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {kits.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => onKit(k.id)}
                className="ds-glass rounded-lg p-3 text-left"
                style={kitId === k.id ? { borderColor: 'var(--color-crimson-5)' } : undefined}
              >
                <div className="text-[13px] font-medium" style={{ color: 'var(--color-fg)' }}>
                  {k.name}
                </div>
                <div
                  className="ds-data mt-1 text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {k.components.length} componentes
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

type MarcaSecaoDef = { id: MarcaSubId; label: string };
const MARCA_SECOES: MarcaSecaoDef[] = [
  { id: 'marca', label: 'Marca' },
  { id: 'paleta', label: 'Paleta' },
  { id: 'tipografia', label: 'Tipografia' },
  { id: 'redes', label: 'Redes sociais' },
];

/**
 * A etapa "Marca" foi quebrada em subseções independentes: uma navegação interna
 * abre um formulário por vez (Marca, Paleta, Tipografia, Redes) em vez de
 * empilhar tudo numa tela só. Cada item mostra status e um resumo do que já foi
 * preenchido. É a defesa direta contra a tela carregada.
 */
function StepMarca({
  branding,
  setB,
  projectId,
  onLogo,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
  onLogo: (path: string | null) => void;
}) {
  const [sub, setSub] = useState<MarcaSubId>('marca');
  const status = marcaSectionStatus(branding);

  return (
    <div className="flex flex-col gap-5 md:flex-row">
      <nav
        aria-label="Seções da marca"
        className="flex gap-1.5 overflow-x-auto pb-1 md:w-[188px] md:flex-col md:overflow-visible md:pb-0"
      >
        {MARCA_SECOES.map((s) => {
          const info = status[s.id];
          const ativo = sub === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setSub(s.id)}
              aria-current={ativo ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-left text-[13px] transition-all duration-200 ${ativo ? 'ds-glass-static text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)] hover:bg-white/[0.04] hover:text-[var(--color-fg)]'}`}
            >
              <StatusDot status={info.status} />
              <span className="min-w-0">
                <span className="block">{s.label}</span>
                <span
                  className="ds-data block max-w-[124px] truncate text-[10px]"
                  style={{ color: 'var(--color-fg-subtle)' }}
                >
                  {info.resumo}
                </span>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="min-w-0 flex-1">
        {sub === 'marca' && (
          <PainelMarca branding={branding} setB={setB} projectId={projectId} onLogo={onLogo} />
        )}
        {sub === 'paleta' && <PainelPaleta branding={branding} setB={setB} />}
        {sub === 'tipografia' && <PainelTipografia branding={branding} setB={setB} />}
        {sub === 'redes' && <PainelRedes branding={branding} setB={setB} />}
      </div>
    </div>
  );
}

/** Ponto de status: não depende só de cor — tem título/aria com o rótulo textual. */
function StatusDot({ status }: { status: SecaoStatus }) {
  const cor =
    status === 'configurado'
      ? 'var(--color-signal)'
      : status === 'opcional'
        ? 'var(--color-fg-subtle)'
        : 'var(--color-border-strong)';
  return (
    <span
      title={STATUS_LABEL[status]}
      aria-label={STATUS_LABEL[status]}
      className="inline-block h-[7px] w-[7px] shrink-0 rounded-full"
      style={{
        backgroundColor: cor,
        boxShadow: status === 'configurado' ? '0 0 8px rgba(198,40,40,0.5)' : undefined,
      }}
    />
  );
}

function SecaoCabecalho({
  titulo,
  descricao,
  opcional,
}: {
  titulo: string;
  descricao: string;
  opcional?: boolean;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <h3 className="text-[15px] font-medium" style={{ color: 'var(--color-fg)' }}>
          {titulo}
        </h3>
        {opcional && (
          <span
            className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em]"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-subtle)' }}
          >
            Opcional
          </span>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--color-fg-muted)' }}>
        {descricao}
      </p>
    </div>
  );
}

function PainelMarca({
  branding,
  setB,
  projectId,
  onLogo,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
  projectId: string | null;
  onLogo: (path: string | null) => void;
}) {
  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      return api.uploadMedia(projectId, file, { kind: 'logo' });
    },
    onSuccess: (res) => {
      onLogo(res.item.path);
      toast.ok('Logo enviada.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha no upload.'),
  });

  return (
    <div className="max-w-[440px] space-y-4">
      <SecaoCabecalho titulo="Marca" descricao="Como a marca se apresenta no site." />
      <Campo label="Nome da marca">
        <input
          type="text"
          value={branding.brandName}
          onChange={(e) => setB({ brandName: e.target.value })}
          className={INPUT}
          style={inputStyle}
          placeholder="como aparece no site"
        />
      </Campo>
      <Campo label="Tom de voz">
        <input
          type="text"
          value={branding.tone}
          onChange={(e) => setB({ tone: e.target.value })}
          className={INPUT}
          style={inputStyle}
          placeholder="ex: direto e confiante"
        />
      </Campo>
      <Campo label="Logo">
        {branding.logoPath && projectId ? (
          <div className="flex items-center gap-3">
            <img
              src={mediaUrl(projectId, branding.logoPath)}
              alt="logo"
              className="h-12 max-w-[140px] rounded-md object-contain"
              style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}
            />
            <button
              type="button"
              onClick={() => onLogo(null)}
              className="text-[11px]"
              style={{ color: 'var(--color-crimson-3)' }}
            >
              remover
            </button>
          </div>
        ) : (
          <label
            className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2.5 text-[12px] transition-colors hover:border-[var(--color-signal)]"
            style={{ borderColor: 'var(--color-border-strong)', color: 'var(--color-fg-muted)' }}
          >
            {upload.isPending ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Upload size={13} />
            )}
            enviar logo (png/svg)
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) upload.mutate(f);
              }}
            />
          </label>
        )}
      </Campo>
    </div>
  );
}

function PainelPaleta({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  return (
    <div className="max-w-[540px] space-y-4">
      <SecaoCabecalho
        titulo="Paleta de cores"
        descricao="A identidade visual do novo site. É definida aqui — não é herdada das cores dos componentes da Galeria, que servem só de preview fiel."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Cor label="Primária" value={branding.primary} onChange={(v) => setB({ primary: v })} />
        <Cor label="Fundo" value={branding.background} onChange={(v) => setB({ background: v })} />
        <Cor label="Texto" value={branding.foreground} onChange={(v) => setB({ foreground: v })} />
        <Cor
          label="Destaque"
          value={branding.accent || '#c62828'}
          onChange={(v) => setB({ accent: v })}
        />
      </div>
      <div
        className="rounded-lg border p-4"
        style={{ borderColor: 'var(--color-border)', backgroundColor: branding.background }}
      >
        <div className="text-[15px] font-medium" style={{ color: branding.foreground }}>
          Aa — {branding.brandName || 'Sua marca'}
        </div>
        <button
          type="button"
          className="mt-2 rounded-md px-3 py-1.5 text-[12px]"
          style={{ backgroundColor: branding.primary, color: '#ffffff' }}
        >
          Botão primário
        </button>
      </div>
    </div>
  );
}

function PainelTipografia({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  const [role, setRole] = useState<'display' | 'body'>('display');
  const valor = role === 'display' ? branding.fontDisplay : branding.fontBody;
  const escolher = (fam: string) =>
    setB(role === 'display' ? { fontDisplay: fam } : { fontBody: fam });

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
        <SecaoCabecalho
          titulo="Tipografia"
          descricao="Clique numa fonte para escolher. Títulos e corpo podem ter fontes diferentes."
        />
        <div
          className="mb-3 inline-flex rounded-md border p-0.5"
          style={{ borderColor: 'var(--color-border)' }}
        >
          {(['display', 'body'] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              aria-pressed={role === r}
              className="rounded px-3 py-1.5 text-[12px] transition-colors"
              style={{
                backgroundColor: role === r ? 'var(--color-primary)' : 'transparent',
                color: role === r ? 'var(--color-bone-1)' : 'var(--color-fg-muted)',
              }}
            >
              {r === 'display' ? 'Fonte de títulos' : 'Fonte de corpo'}
            </button>
          ))}
        </div>
        <GoogleFontsPicker
          value={valor}
          onChange={escolher}
          ariaLabel={`Fonte de ${role === 'display' ? 'títulos' : 'corpo'}`}
        />
      </div>
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-[11px]">
          <span
            className="rounded-full border px-2.5 py-1"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            Títulos:{' '}
            <strong style={{ color: 'var(--color-fg)' }}>{familyName(branding.fontDisplay)}</strong>
          </span>
          <span
            className="rounded-full border px-2.5 py-1"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg-muted)' }}
          >
            Corpo:{' '}
            <strong style={{ color: 'var(--color-fg)' }}>{familyName(branding.fontBody)}</strong>
          </span>
        </div>
        <FontPreview heading={branding.fontDisplay} body={branding.fontBody} />
        <button
          type="button"
          onClick={() => setB({ fontBody: branding.fontDisplay })}
          className="text-[11px] underline"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          Usar a fonte de títulos também no corpo
        </button>
      </div>
    </div>
  );
}

function PainelRedes({
  branding,
  setB,
}: {
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  return (
    <div className="max-w-[520px] space-y-3">
      <SecaoCabecalho
        titulo="Redes sociais"
        descricao="Preencha só as redes que a marca usa. Nenhuma é obrigatória."
        opcional
      />
      {SOCIAL_PLATFORMS.map((p) => {
        const val = branding.social[p.id] ?? '';
        const erro = validarUrlSocial(val);
        return (
          <Campo key={p.id} label={p.label}>
            <input
              type="url"
              value={val}
              onChange={(e) => setB({ social: { ...branding.social, [p.id]: e.target.value } })}
              placeholder={p.placeholder}
              aria-invalid={erro ? true : undefined}
              className={INPUT}
              style={erro ? { ...inputStyle, borderColor: 'var(--color-crimson-4)' } : inputStyle}
            />
            {erro && (
              <div
                role="alert"
                className="mt-1 text-[11px]"
                style={{ color: 'var(--color-crimson-3)' }}
              >
                {erro}
              </div>
            )}
          </Campo>
        );
      })}
    </div>
  );
}

function StepEstrutura({
  layout,
  onLayout,
  activeSlots,
  kitCategories,
}: {
  layout: LayoutChoice;
  onLayout: (l: LayoutChoice) => void;
  activeSlots: Blueprint['slots'];
  kitCategories: Set<string>;
}) {
  return (
    <div className="space-y-5">
      <LayoutPicker value={layout} onChange={onLayout} />

      {layout.mode === 'blueprint' && activeSlots.length > 0 && (
        <div className="ds-glass-static rounded-lg p-4">
          <div className="mb-3 text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            O que vem do seu kit
          </div>
          <div className="space-y-1.5">
            {activeSlots.map((s) => {
              const cats = ROLE_CATS[s.role] ?? [];
              const doKit = cats.some((cat) => kitCategories.has(cat));
              return (
                <div key={s.role} className="flex items-center justify-between text-[12px]">
                  <span style={{ color: 'var(--color-fg)' }}>{s.label}</span>
                  <span
                    className="ds-data rounded-full px-2 py-0.5 text-[10px]"
                    style={{
                      backgroundColor: doKit ? 'rgba(107,20,20,0.24)' : 'rgba(255,255,255,0.05)',
                      color: doKit ? 'var(--color-fg)' : 'var(--color-fg-subtle)',
                    }}
                  >
                    {doKit ? 'do seu kit' : 'criado no estilo'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StepConteudo({
  slots,
  mode,
  sections,
  onSection,
  branding,
  setB,
}: {
  slots: Blueprint['slots'];
  mode: 'blueprint' | 'criativo';
  sections: Record<string, string>;
  onSection: (role: string, v: string) => void;
  branding: WizardBranding;
  setB: (p: Partial<WizardBranding>) => void;
}) {
  return (
    <div className="space-y-6">
      {mode === 'blueprint' ? (
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            Texto por seção
          </div>
          {slots.map((s) => (
            <Campo key={s.role} label={s.label}>
              <textarea
                rows={2}
                value={sections[s.role] ?? ''}
                onChange={(e) => onSection(s.role, e.target.value)}
                placeholder={s.hint}
                className={`${INPUT} resize-none`}
                style={inputStyle}
              />
            </Campo>
          ))}
        </div>
      ) : (
        <div
          className="ds-glass-static rounded-lg p-4 text-[12px]"
          style={{ color: 'var(--color-fg-muted)' }}
        >
          No modo criativo o gerador decide as seções. Use o campo abaixo para descrever a mensagem
          central e deixe a estrutura com ele.
          <textarea
            rows={3}
            value={sections.hero ?? ''}
            onChange={(e) => onSection('hero', e.target.value)}
            placeholder="mensagem central do site"
            className={`${INPUT} mt-3 resize-none`}
            style={inputStyle}
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            Contato
          </div>
          <MiniInput
            label="E-mail"
            value={branding.contact.email}
            onChange={(v) => setB({ contact: { ...branding.contact, email: v } })}
          />
          <MiniInput
            label="Telefone"
            value={branding.contact.phone}
            onChange={(v) => setB({ contact: { ...branding.contact, phone: v } })}
          />
          <MiniInput
            label="WhatsApp"
            value={branding.contact.whatsapp}
            onChange={(v) => setB({ contact: { ...branding.contact, whatsapp: v } })}
          />
          <MiniInput
            label="Endereço"
            value={branding.contact.address}
            onChange={(v) => setB({ contact: { ...branding.contact, address: v } })}
          />
        </div>
        <div className="space-y-3">
          <div className="text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
            CTA principal
          </div>
          <MiniInput
            label="Texto do botão"
            value={branding.mainCta.label}
            onChange={(v) => setB({ mainCta: { ...branding.mainCta, label: v } })}
          />
          <MiniInput
            label="Link"
            value={branding.mainCta.href}
            onChange={(v) => setB({ mainCta: { ...branding.mainCta, href: v } })}
          />
          <p
            className="pt-1 text-[11px] leading-relaxed"
            style={{ color: 'var(--color-fg-subtle)' }}
          >
            As redes sociais agora ficam em Marca → Redes sociais.
          </p>
        </div>
      </div>
    </div>
  );
}

function StepMidia({
  projectId,
  slots,
  media,
  onMedia,
}: {
  projectId: string | null;
  slots: Blueprint['slots'];
  media: MediaItem[];
  onMedia: (m: MediaItem[]) => void;
}) {
  // No modo criativo não há slots de blueprint — cai numa lista genérica de
  // seções para a mídia ainda ter onde ser ancorada.
  const secoes =
    slots.length > 0
      ? slots.map((s) => ({ role: s.role, label: s.label }))
      : [
          { role: 'hero', label: 'Destaque' },
          { role: 'showcase', label: 'Demonstração' },
          { role: 'gallery', label: 'Galeria' },
          { role: 'about', label: 'Sobre' },
        ];
  const [slotRole, setSlotRole] = useState<string>(secoes[0]?.role ?? 'hero');
  const [kind, setKind] = useState<MediaItem['kind']>('image');

  const upload = useMutation({
    mutationFn: (file: File) => {
      if (!projectId) throw new Error('rascunho ainda não criado');
      return api.uploadMedia(projectId, file, { kind, slotRole });
    },
    onSuccess: (res) => {
      onMedia(res.media);
      toast.ok('Mídia enviada.');
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha no upload.'),
  });

  const remover = useMutation({
    mutationFn: (path: string) => {
      if (!projectId) throw new Error('sem projeto');
      return api.deleteMedia(projectId, path);
    },
    onSuccess: (res) => onMedia(res.media),
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao remover.'),
  });

  // Logo aparece na etapa de marca; aqui listamos só as mídias de conteúdo.
  const conteudo = media.filter((m) => m.kind !== 'logo');

  return (
    <div className="space-y-5">
      <div className="ds-glass-static flex flex-wrap items-end gap-3 rounded-lg p-4">
        <Campo label="Seção">
          <select
            value={slotRole}
            onChange={(e) => setSlotRole(e.target.value)}
            className={INPUT}
            style={inputStyle}
          >
            {secoes.map((s) => (
              <option
                key={s.role}
                value={s.role}
                style={{ backgroundColor: 'var(--color-obsidian-2)' }}
              >
                {s.label}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Tipo">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as MediaItem['kind'])}
            className={INPUT}
            style={inputStyle}
          >
            <option value="image" style={{ backgroundColor: 'var(--color-obsidian-2)' }}>
              imagem
            </option>
            <option value="video" style={{ backgroundColor: 'var(--color-obsidian-2)' }}>
              vídeo
            </option>
            <option value="mockup" style={{ backgroundColor: 'var(--color-obsidian-2)' }}>
              mockup
            </option>
          </select>
        </Campo>
        <label
          className="ds-btn flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-[12px] font-medium"
          style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
        >
          {upload.isPending ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          Enviar
          <input
            type="file"
            accept="image/*,video/*"
            className="hidden"
            disabled={!projectId || upload.isPending}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload.mutate(f);
            }}
          />
        </label>
      </div>

      {conteudo.length === 0 ? (
        <div className="py-8 text-center text-[12px]" style={{ color: 'var(--color-fg-subtle)' }}>
          Nenhuma mídia ainda. A mídia é opcional — os slots sem imagem são criados no estilo do
          kit.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {conteudo.map((m) => (
            <div key={m.path} className="ds-glass-static overflow-hidden rounded-lg">
              <div
                className="flex aspect-[16/10] items-center justify-center overflow-hidden"
                style={{ backgroundColor: 'var(--color-obsidian-2)' }}
              >
                {m.kind === 'video' ? (
                  <video
                    src={projectId ? mediaUrl(projectId, m.path) : undefined}
                    className="h-full w-full object-cover"
                    muted
                  />
                ) : projectId ? (
                  <img
                    src={mediaUrl(projectId, m.path)}
                    alt={m.alt ?? m.originalName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <ImageIcon size={18} style={{ color: 'var(--color-fg-subtle)' }} />
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-2">
                <div className="min-w-0">
                  <div className="truncate text-[11px]" style={{ color: 'var(--color-fg)' }}>
                    {m.originalName}
                  </div>
                  <div className="ds-data text-[9px]" style={{ color: 'var(--color-fg-subtle)' }}>
                    {m.slotRole ?? '—'} · {m.kind}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => remover.mutate(m.path)}
                  className="shrink-0 rounded-full p-1 hover:bg-[rgba(198,40,40,0.16)]"
                  title="Remover"
                >
                  <Trash2 size={12} style={{ color: 'var(--color-crimson-3)' }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StepRevisao({
  name,
  kit,
  branding,
  activeSlots,
  mode,
  sections,
  media,
}: {
  name: string;
  kit: { name: string; components: unknown[] } | null;
  branding: WizardBranding;
  activeSlots: Blueprint['slots'];
  mode: 'blueprint' | 'criativo';
  sections: Record<string, string>;
  media: MediaItem[];
}) {
  return (
    <div className="space-y-4">
      <div className="ds-glass-static rounded-lg p-4">
        <Linha rotulo="Projeto" valor={name || '—'} />
        <Linha
          rotulo="Kit base"
          valor={kit ? `${kit.name} · ${kit.components.length} componentes` : '—'}
        />
        <Linha rotulo="Marca" valor={branding.brandName || '—'} />
        <Linha
          rotulo="Estrutura"
          valor={
            mode === 'blueprint' ? `${activeSlots.length} seções` : 'criativa (o gerador decide)'
          }
        />
        <Linha
          rotulo="Seções com texto"
          valor={String(Object.values(sections).filter((v) => v.trim()).length)}
        />
        <Linha rotulo="Mídias" valor={String(media.length)} />
      </div>
      <div
        className="flex items-start gap-2 rounded-lg p-3 text-[12px] leading-relaxed"
        style={{ backgroundColor: 'rgba(107,20,20,0.16)', color: 'var(--color-fg)' }}
      >
        <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: 'var(--color-signal)' }} />
        <span>
          Ao gerar, o site usa <strong>somente os componentes do kit</strong> como base visual e
          aplica a sua marca, o seu texto e a sua mídia. Slots sem peça no kit são criados no estilo
          dele. Nada de texto ou marca do site de origem é copiado.
        </span>
      </div>
    </div>
  );
}

// ── UI helpers ───────────────────────────────────────────────────────────────

function TaskCard({ task }: { task: TaskRecord }) {
  return (
    <div className="ds-glass-static ds-scale-in mt-8 rounded-xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <div
            className="text-[10px] uppercase tracking-[0.24em]"
            style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-display)' }}
          >
            Gerando
          </div>
          <div className="ds-data mt-1 text-[13px]" style={{ color: 'var(--color-fg)' }}>
            {task.id}
          </div>
        </div>
        <StatusBadge status={task.status} />
      </div>
      {(task.status === 'running' || task.status === 'queued') && (
        <div className="ds-progress mt-5 rounded-full" />
      )}
      <div className="mt-4 max-h-[220px] overflow-y-auto">
        {(task.events ?? []).map((ev, i) => (
          <div
            key={`${ev.timestamp}-${i}`}
            className="ds-data border-t py-1 text-[11px]"
            style={{
              borderColor: 'var(--color-border)',
              color: ev.level === 'error' ? 'var(--color-crimson-3)' : 'var(--color-fg)',
            }}
          >
            {ev.message}
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'var(--color-fg-subtle)',
    'ready-to-generate': 'var(--color-signal)',
    running: 'var(--color-signal)',
    queued: 'var(--color-signal)',
    generating: 'var(--color-signal)',
    succeeded: 'var(--color-primary)',
    generated: 'var(--color-primary)',
    failed: 'var(--color-crimson-3)',
  };
  return (
    <span
      className="ds-tag ds-backdrop rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.18em]"
      style={{
        backgroundColor: 'rgba(255, 255, 255, 0.04)',
        borderColor: 'var(--color-border)',
        color: map[status] ?? 'var(--color-fg)',
        fontFamily: 'var(--font-display)',
      }}
    >
      {status}
    </span>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: o controle vem por children; o <label> o envolve e a associação implícita vale em runtime.
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.2em]" style={rotulo}>
        {label}
      </span>
      {children}
    </label>
  );
}

function MiniInput({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="ds-data mb-1 block text-[10px]" style={{ color: 'var(--color-fg-subtle)' }}>
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--color-signal)]"
        style={inputStyle}
      />
    </label>
  );
}

function Cor({
  label,
  value,
  onChange,
}: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-10 cursor-pointer rounded"
      />
      <div className="flex-1">
        <div
          className="text-[10px]"
          style={{ color: 'var(--color-fg-subtle)', fontFamily: 'var(--font-mono)' }}
        >
          {label}
        </div>
        <div className="ds-data text-[12px]" style={{ color: 'var(--color-fg)' }}>
          {value}
        </div>
      </div>
    </label>
  );
}

function Linha({ rotulo: r, valor }: { rotulo: string; valor: string }) {
  return (
    <div
      className="flex items-center justify-between border-b py-2 text-[13px] last:border-0"
      style={{ borderColor: 'var(--color-border)' }}
    >
      <span style={{ color: 'var(--color-fg-subtle)' }}>{r}</span>
      <span style={{ color: 'var(--color-fg)' }}>{valor}</span>
    </div>
  );
}

// ── parsing/normalização ─────────────────────────────────────────────────────

const INPUT =
  'w-full rounded-md border px-3 py-2 text-[13px] outline-none transition-all duration-300 focus:border-[var(--color-signal)] focus:shadow-[0_0_20px_rgba(198,40,40,0.18)]';

const inputStyle: React.CSSProperties = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'rgba(0, 0, 0, 0.35)',
  color: 'var(--color-fg)',
  fontFamily: 'var(--font-body)',
};

const rotulo: React.CSSProperties = {
  color: 'var(--color-fg-subtle)',
  fontFamily: 'var(--font-display)',
};

function safeParse<T>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function parseMedia(raw: string | null | undefined): MediaItem[] {
  const parsed = safeParse<MediaItem[]>(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function parseBranding(raw: string | null | undefined): WizardBranding {
  const b = safeParse<ProjectBranding>(raw);
  return {
    brandName: b?.brandName ?? '',
    tone: b?.tone ?? '',
    primary: b?.palette?.primary ?? '#7f1d1d',
    background: b?.palette?.background ?? '#ffffff',
    foreground: b?.palette?.foreground ?? '#0a0a0a',
    accent: b?.palette?.accent ?? '',
    fontDisplay: b?.typography?.display ?? 'Inter, sans-serif',
    fontBody: b?.typography?.body ?? 'Inter, sans-serif',
    logoPath: b?.logoPath ?? null,
    contact: {
      email: b?.contact?.email ?? '',
      phone: b?.contact?.phone ?? '',
      whatsapp: b?.contact?.whatsapp ?? '',
      address: b?.contact?.address ?? '',
    },
    social: { ...(b?.social ?? {}) },
    mainCta: { label: b?.mainCta?.label ?? '', href: b?.mainCta?.href ?? '' },
  };
}

/** Remove chaves vazias e devolve `undefined` se nada sobrar — não polui o JSON. */
function limparObjeto<T extends Record<string, string>>(obj: T): T | undefined {
  const limpo = Object.fromEntries(Object.entries(obj).filter(([, v]) => v && v.trim() !== ''));
  return Object.keys(limpo).length > 0 ? (limpo as T) : undefined;
}
