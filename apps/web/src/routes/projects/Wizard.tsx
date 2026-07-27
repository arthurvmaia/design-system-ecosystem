import type { LayoutChoice } from '@/components/LayoutPicker';
import { Modal } from '@/components/Modal';
import {
  type MediaItem,
  type ProjectBranding,
  type ProjectRecord,
  type StartWorkResponse,
  api,
} from '@/lib/api';
import {
  DEBOUNCE_AUTOSAVE_MS,
  type EstadoAutosave,
  ROTULO_AUTOSAVE,
  reduzirAutosave,
} from '@/lib/autosave-core';
import { resumoDaVoz } from '@/lib/marca-rotulos';
import { toast } from '@/lib/toast';
import {
  type BriefDaSecao,
  distribuirTokens,
  espelhoDoBrief,
  normalizarProjectBranding,
  normalizarProjectContent,
} from '@ds/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, CloudOff, Loader2, Rocket } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  // Caminho único de migração: sections legado entra e sai como briefs.
  const parsedContent = normalizarProjectContent(existing?.contentJson ?? null);
  const parsedLayout = safeParse<LayoutChoice & Record<string, unknown>>(existing?.layoutJson);

  const [step, setStep] = useState(0);
  // Até onde a pessoa JÁ chegou: a StepBar deixa voltar E avançar para
  // qualquer etapa visitada — só o desconhecido fica bloqueado.
  const [maxVisitado, setMaxVisitado] = useState(existing !== null ? ETAPAS.length - 1 : 0);
  const [projectId, setProjectId] = useState<string | null>(existing?.id ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [kitId, setKitId] = useState<string | null>(existing?.kitId ?? null);
  const [branding, setBranding] = useState<WizardBranding>(parsedBranding);
  const [layout, setLayout] = useState<LayoutChoice>({
    mode: parsedLayout?.mode === 'criativo' ? 'criativo' : 'blueprint',
    blueprintId: parsedLayout?.blueprintId ?? 'saas-landing',
    disabledRoles: parsedLayout?.disabledRoles ?? [],
    placements: Array.isArray(parsedLayout?.placements) ? parsedLayout.placements : [],
  });
  const [briefs, setBriefs] = useState<Record<string, BriefDaSecao>>(parsedContent.briefs ?? {});
  const [media, setMedia] = useState<MediaItem[]>(parseMedia(existing?.mediaManifestJson));

  // Espelho legado: quem ainda lê texto plano por seção continua atendido.
  const sectionsEspelho = Object.fromEntries(
    Object.entries(briefs)
      .map(([role, b]) => [role, espelhoDoBrief(b)] as const)
      .filter(([, texto]) => texto !== ''),
  );

  const kit = useQuery({
    queryKey: ['kit', kitId],
    queryFn: () => {
      if (!kitId) throw new Error('sem kit');
      return api.getKit(kitId);
    },
    enabled: kitId !== null,
  });

  const setB = (patch: Partial<WizardBranding>) => setBranding((b) => ({ ...b, ...patch }));

  // Grava o modelo NOVO (identidade verbal, logos, paleta, tipografia, redes)
  // e mantém os campos LEGADOS como espelho derivado — o gerador e os fluxos
  // que ainda leem `palette`/`tone`/`logoPath` continuam funcionando até a A10.
  const toBranding = (): ProjectBranding => {
    const tokens = distribuirTokens(branding.paleta);
    const logoPrincipal = branding.logos.find((l) => l.tipo === 'principal') ?? branding.logos[0];
    const socialNovo = Object.fromEntries(
      branding.sociais
        .filter((s) => s.visivel && s.url.trim() !== '')
        .map((s) => [s.plataforma, s.url]),
    );
    return {
      brandName: branding.brandName || undefined,
      tone: resumoDaVoz(branding.identidadeVerbal) ?? (branding.tone || undefined),
      logoPath: logoPrincipal?.path ?? branding.logoPath,
      palette: {
        primary: tokens.primary ?? branding.primary,
        background: tokens.background ?? branding.background,
        foreground: tokens.body ?? branding.foreground,
        ...(tokens.secondary ? { secondary: tokens.secondary } : {}),
        ...(tokens.accent
          ? { accent: tokens.accent }
          : branding.accent
            ? { accent: branding.accent }
            : {}),
      },
      typography: { display: branding.fontDisplay, body: branding.fontBody },
      contact: limparObjeto(branding.contact),
      social: Object.keys(socialNovo).length > 0 ? socialNovo : limparObjeto(branding.social),
      mainCta: limparObjeto(branding.mainCta),
      identidadeVerbal: branding.identidadeVerbal,
      ...(branding.logos.length > 0 ? { logos: branding.logos } : {}),
      ...(Object.keys(branding.logosLocais).length > 0
        ? { logosLocais: branding.logosLocais }
        : {}),
      paleta: branding.paleta,
      tipografia: {
        ...branding.tipografia,
        display: branding.fontDisplay,
        body: branding.fontBody,
      },
      ...(branding.sociais.length > 0 ? { sociais: branding.sociais } : {}),
    };
  };

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
      content: { sections: sectionsEspelho, briefs },
      branding: toBranding(),
      layout,
    });
    qc.invalidateQueries({ queryKey: ['projects'] });
    return id;
  };

  const avancar = useMutation({
    mutationFn: () => salvar(),
    onSuccess: () => {
      setAutosave((e) => reduzirAutosave(e, 'salvou'));
      setStep((s) => {
        const proxima = Math.min(ETAPAS.length - 1, s + 1);
        setMaxVisitado((m) => Math.max(m, proxima));
        return proxima;
      });
    },
    onError: (e) => toast.erro(e instanceof Error ? e.message : 'Falha ao salvar o rascunho.'),
  });

  // ── Autosave ──────────────────────────────────────────────────────────────
  // Debounce sobre o ESTADO serializado (nunca request por tecla); só depois
  // que o rascunho existe (o rascunho nasce no primeiro "Próximo" — digitar a
  // primeira letra do nome não pode criar um projeto). A máquina de estados e
  // as decisões vivem em lib/autosave-core, testadas sem navegador.
  const [autosave, setAutosave] = useState<EstadoAutosave>('ocioso');
  const assinatura = JSON.stringify({ name, kitId, branding, layout, briefs });
  const ultimaSalva = useRef(existing !== null ? assinatura : '');
  const emVoo = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a assinatura serializa todas as dependências de dados; salvar é estável por closure
  useEffect(() => {
    if (projectId === null) return;
    if (assinatura === ultimaSalva.current) return;
    setAutosave((e) => reduzirAutosave(e, emVoo.current ? 'alterou-durante-salvar' : 'alterou'));
    const timer = window.setTimeout(async () => {
      if (emVoo.current) return;
      emVoo.current = true;
      const snapshot = assinatura;
      setAutosave((e) => reduzirAutosave(e, 'comecou-salvar'));
      try {
        await salvar();
        ultimaSalva.current = snapshot;
        setAutosave((e) => reduzirAutosave(e, 'salvou'));
      } catch {
        setAutosave((e) => reduzirAutosave(e, 'falhou'));
      } finally {
        emVoo.current = false;
      }
    }, DEBOUNCE_AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [assinatura, projectId]);

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
        <StepBar
          step={step}
          maxVisitado={maxVisitado}
          onStep={(s) => s <= maxVisitado && setStep(s)}
        />

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
          {step === 1 && <StepMarca branding={branding} setB={setB} projectId={projectId} />}
          {step === 2 && (
            <StepEstrutura
              layout={layout}
              onLayout={setLayout}
              activeSlots={activeSlots}
              components={kit.data?.item.components ?? []}
            />
          )}
          {step === 3 && (
            <StepConteudo
              slots={activeSlots}
              mode={layout.mode}
              briefs={briefs}
              onBrief={(role, b) => setBriefs((s) => ({ ...s, [role]: b }))}
              branding={branding}
              setB={setB}
            />
          )}
          {step === 4 && (
            <StepMidia
              projectId={projectId}
              slots={activeSlots}
              layout={layout}
              components={kit.data?.item.components ?? []}
              kitId={kitId}
              media={media}
              onMedia={setMedia}
            />
          )}
          {step === 5 && (
            <StepRevisao
              name={name}
              kit={kit.data?.item ?? null}
              branding={branding}
              activeSlots={activeSlots}
              mode={layout.mode}
              sections={sectionsEspelho}
              media={media}
            />
          )}
        </div>

        <div
          className="flex items-center justify-between border-t px-6 py-4"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[12px] transition-colors hover:text-[var(--color-fg)]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <ArrowLeft size={13} />
              {step === 0 ? 'Cancelar' : 'Voltar'}
            </button>
            {autosave !== 'ocioso' && (
              <output
                className="flex items-center gap-1.5 text-[11px]"
                style={{
                  color: autosave === 'falha' ? 'var(--color-signal)' : 'var(--color-fg-subtle)',
                }}
              >
                {autosave === 'salvando' && <Loader2 size={11} className="animate-spin" />}
                {autosave === 'salvo' && <Check size={11} />}
                {autosave === 'falha' && <CloudOff size={11} />}
                {ROTULO_AUTOSAVE[autosave]}
              </output>
            )}
          </div>

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

function StepBar({
  step,
  maxVisitado,
  onStep,
}: {
  step: number;
  maxVisitado: number;
  onStep: (s: number) => void;
}) {
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
            disabled={i > maxVisitado}
            aria-current={active ? 'step' : undefined}
            title={i > maxVisitado ? 'Avance pelas etapas para desbloquear' : `Ir para ${label}`}
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

const hex6 = (v: string | undefined, fallback: string): string =>
  v !== undefined && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;

/**
 * Lê o branding persistido pelo caminho ÚNICO de migração do shared
 * (`normalizarProjectBranding`): JSON corrompido vira default, legado incompleto
 * é completado e os campos novos (A5) nascem migrados dos antigos.
 */
function parseBranding(raw: string | null | undefined): WizardBranding {
  const b = normalizarProjectBranding(raw ?? null);
  return {
    brandName: b.brandName ?? '',
    tone: b.tone ?? '',
    primary: b.palette.primary,
    background: b.palette.background,
    foreground: b.palette.foreground,
    accent: b.palette.accent ?? '',
    fontDisplay: b.typography.display,
    fontBody: b.typography.body,
    logoPath: b.logoPath ?? null,
    contact: {
      email: b.contact?.email ?? '',
      phone: b.contact?.phone ?? '',
      whatsapp: b.contact?.whatsapp ?? '',
      address: b.contact?.address ?? '',
    },
    social: { ...(b.social ?? {}) },
    mainCta: { label: b.mainCta?.label ?? '', href: b.mainCta?.href ?? '' },
    identidadeVerbal: b.identidadeVerbal ?? {
      tons: [],
      arquetipos: [],
      vocabularioPreferido: [],
      vocabularioEvitar: [],
    },
    logos: b.logos ?? [],
    logosLocais: b.logosLocais ?? {},
    paleta: b.paleta ?? {
      cores: [
        { id: 'primaria', nome: 'Primária', hex: hex6(b.palette.primary, '#7f1d1d') },
        { id: 'fundo', nome: 'Fundo', hex: hex6(b.palette.background, '#ffffff') },
        { id: 'texto', nome: 'Texto', hex: hex6(b.palette.foreground, '#0a0a0a') },
      ],
      atribuicoes: { primary: 'primaria', background: 'fundo', body: 'texto', heading: 'texto' },
    },
    tipografia: b.tipografia ?? {
      display: b.typography.display,
      body: b.typography.body,
      presetTitulos: 'equilibrada',
      presetCorpo: 'confortavel',
    },
    sociais: b.sociais ?? [],
  };
}

/** Remove chaves vazias e devolve `undefined` se nada sobrar — não polui o JSON. */
function limparObjeto<T extends Record<string, string>>(obj: T): T | undefined {
  const limpo = Object.fromEntries(Object.entries(obj).filter(([, v]) => v && v.trim() !== ''));
  return Object.keys(limpo).length > 0 ? (limpo as T) : undefined;
}
