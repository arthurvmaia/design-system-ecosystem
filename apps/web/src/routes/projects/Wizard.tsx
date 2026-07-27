import type { LayoutChoice } from '@/components/LayoutPicker';
import { Modal } from '@/components/Modal';
import {
  type MediaItem,
  type ProjectBranding,
  type ProjectRecord,
  type StartWorkResponse,
  api,
} from '@/lib/api';
import { toast } from '@/lib/toast';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Loader2, Rocket } from 'lucide-react';
import { useState } from 'react';
import { StepConteudo } from './etapas/EtapaConteudo';
import { StepEstrutura } from './etapas/EtapaEstrutura';
import { StepMarca } from './etapas/EtapaMarca';
import { StepMidia } from './etapas/EtapaMidia';
import { StepProjeto } from './etapas/EtapaProjeto';
import { StepRevisao } from './etapas/EtapaRevisao';
import type { WizardBranding } from './partes';

// ── Wizard ───────────────────────────────────────────────────────────────────

const ETAPAS = ['Projeto', 'Marca', 'Estrutura', 'Conteúdo', 'Mídia', 'Revisão'] as const;

export function ProjectWizard({
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

// ── parsing/normalização ─────────────────────────────────────────────────────

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
