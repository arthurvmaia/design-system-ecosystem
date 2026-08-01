import { Mascote } from '@/components/Mascote';
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
  deveSalvar,
  reduzirAutosave,
} from '@/lib/autosave-core';
import {
  type DadosDasEtapas,
  ETAPA,
  ETAPAS,
  maiorEtapaLiberada,
  pendenciasDaEtapa,
} from '@/lib/etapas-core';
import { resumoDaVoz } from '@/lib/marca-rotulos';
import { bloqueantes, validarProjeto } from '@/lib/revisao-core';
import { toast } from '@/lib/toast';
import {
  type ObjetivoDoSite,
  type Produto,
  type SecaoDoSite,
  distribuirTokens,
  espelharBriefsDasSecoes,
  espelhoDoBrief,
  normalizarProjectBranding,
  normalizarProjectContent,
  normalizarProjectLayout,
  sugerirSecoes,
} from '@ds/shared/schemas';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, CloudOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { StepEstrutura } from './etapas/EtapaEstrutura';
import { StepMarca } from './etapas/EtapaMarca';
import { StepMidia } from './etapas/EtapaMidia';
import { StepProjeto } from './etapas/EtapaProjeto';
import { StepRevisao } from './etapas/EtapaRevisao';
import type { WizardBranding } from './partes';

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

  const parsedBranding = parseBranding(existing?.brandingJson);
  // Caminho único de migração: sections legado entra e sai como briefs.
  const parsedContent = normalizarProjectContent(existing?.contentJson ?? null);
  const parsedLayout = normalizarProjectLayout(existing?.layoutJson ?? null);

  const [step, setStep] = useState(0);
  // Até onde a pessoa JÁ chegou: a StepBar deixa voltar E avançar para
  // qualquer etapa visitada — só o desconhecido fica bloqueado.
  const [maxVisitado, setMaxVisitado] = useState(existing !== null ? ETAPAS.length - 1 : 0);
  const [projectId, setProjectId] = useState<string | null>(existing?.id ?? null);
  const [name, setName] = useState(existing?.name ?? '');
  const [kitId, setKitId] = useState<string | null>(existing?.kitId ?? null);
  const [branding, setBranding] = useState<WizardBranding>(parsedBranding);
  const [secoes, setSecoes] = useState<SecaoDoSite[]>(parsedLayout.secoes);
  // O objetivo do site: decide a estrutura SUGERIDA e nada mais.
  const [objetivo, setObjetivo] = useState<ObjetivoDoSite | null>(parsedLayout.objetivo);
  // Produtos vivem no conteúdo do projeto.
  const [produtos, setProdutos] = useState<Produto[]>(parsedContent.produtos ?? []);
  // As permissões moram em `layout.permissoes`, mas cada caixa fica na etapa em
  // que a decisão acontece: arte de apoio na Mídia, seções obrigatórias que
  // faltam na Estrutura. Chave sem tela atravessa intacta pelo espalhamento do
  // layout no salvar().
  const [criarArteDeApoio, setCriarArteDeApoio] = useState(
    parsedLayout.permissoes.criarArteDeApoio,
  );
  const [criarSecoesFaltantes, setCriarSecoesFaltantes] = useState(
    parsedLayout.permissoes.criarSecoesFaltantes,
  );
  const [media, setMedia] = useState<MediaItem[]>(parseMedia(existing?.mediaManifestJson));

  // Espelhos legados. A fonte do texto passou a ser `secao.instrucao`; `briefs` e
  // `sections` continuam sendo gravados porque o pipeline editorial e o contrato
  // do gerador leem de lá.
  const briefs = espelharBriefsDasSecoes(secoes);
  const sectionsEspelho = Object.fromEntries(
    Object.entries(briefs)
      .map(([id, b]) => [id, espelhoDoBrief(b)] as const)
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
      content: { sections: sectionsEspelho, briefs, produtos },
      branding: toBranding(),
      // Espalhar o layout lido preserva densidade, movimento e a preferência de
      // design system, que não têm tela: mandar só `secoes` faria o servidor
      // mesclar sobre o default e zerar os três a cada gravação.
      layout: {
        ...parsedLayout,
        secoes,
        objetivo,
        permissoes: { ...parsedLayout.permissoes, criarArteDeApoio, criarSecoesFaltantes },
      },
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
  // Tudo que `salvar()` grava precisa estar aqui.
  //
  // O `objetivo` ficou de fora quando foi criado, e o efeito era silencioso e
  // caro: escolher "Vender um produto" não mudava a assinatura, o autosave não
  // disparava, e a escolha se perdia ao fechar o wizard. A pessoa via o botão
  // marcado e o app não guardava nada. As permissões entram pela mesma razão:
  // marcar uma caixa de autorização precisa disparar o autosave.
  const assinatura = JSON.stringify({
    name,
    kitId,
    branding,
    secoes,
    produtos,
    objetivo,
    criarArteDeApoio,
    criarSecoesFaltantes,
  });
  const ultimaSalva = useRef(existing !== null ? assinatura : '');
  const emVoo = useRef(false);
  // Espelhos para as decisões dentro de timeout lerem o valor ATUAL sem
  // reamarrar o efeito (o estado fica velho dentro de uma closure de timer).
  const autosaveRef = useRef(autosave);
  autosaveRef.current = autosave;
  const assinaturaRef = useRef(assinatura);
  assinaturaRef.current = assinatura;
  const ultimaAlteracao = useRef(0);
  const montado = useRef(true);

  // O último salvamento ao sair. Fechar o wizard dentro da janela de silêncio
  // descartava a edição mais recente: o cleanup só fazia clearTimeout e nada
  // mais tentava. A ref é reescrita a cada render para o flush enxergar o
  // estado atual mesmo depois do desmonte.
  const flushRef = useRef(() => {});
  flushRef.current = () => {
    if (projectId === null || emVoo.current) return;
    if (assinatura === ultimaSalva.current) return;
    emVoo.current = true;
    const snapshot = assinatura;
    void salvar()
      .then(() => {
        ultimaSalva.current = snapshot;
      })
      .catch(() => {
        // Sem tela para avisar: o rascunho fica como estava e a próxima
        // abertura do wizard recarrega do servidor.
      })
      .finally(() => {
        emVoo.current = false;
      });
  };
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      flushRef.current();
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a assinatura serializa todas as dependências de dados; salvar é estável por closure
  useEffect(() => {
    if (projectId === null) return;
    if (assinatura === ultimaSalva.current) return;
    ultimaAlteracao.current = Date.now();
    setAutosave((e) => reduzirAutosave(e, emVoo.current ? 'alterou-durante-salvar' : 'alterou'));
    let timer = 0;
    const tentar = async () => {
      // A decisão de salvar é do núcleo testado (deveSalvar); o `emVoo`
      // serializa os PATCH. Quando ainda não dá, REAGENDA: era o return seco
      // daqui que perdia calado a edição feita durante um salvamento lento.
      const pronto =
        !emVoo.current &&
        deveSalvar({
          estado: autosaveRef.current,
          temRascunho: projectId !== null,
          msDesdeUltimaAlteracao: Date.now() - ultimaAlteracao.current,
        });
      if (!pronto) {
        timer = window.setTimeout(tentar, DEBOUNCE_AUTOSAVE_MS);
        return;
      }
      emVoo.current = true;
      const snapshot = assinatura;
      setAutosave((e) => reduzirAutosave(e, 'comecou-salvar'));
      try {
        await salvar();
        ultimaSalva.current = snapshot;
        // "Salvo" só quando o que está na tela é o que foi gravado. Quem
        // digitou DURANTE o PATCH tem trabalho pendente: dizer "Salvo" ali
        // apagava o estado `pendente` e o próprio deveSalvar passava a recusar
        // o reagendamento para sempre, com o rodapé jurando que estava tudo
        // gravado.
        setAutosave((e) =>
          reduzirAutosave(e, assinaturaRef.current === snapshot ? 'salvou' : 'alterou'),
        );
      } catch {
        setAutosave((e) => reduzirAutosave(e, 'falhou'));
      } finally {
        emVoo.current = false;
        // O wizard fechou enquanto ESTE salvamento corria: o flush do desmonte
        // não viu nada para fazer (emVoo travado), então roda agora.
        if (!montado.current) flushRef.current();
      }
    };
    timer = window.setTimeout(tentar, DEBOUNCE_AUTOSAVE_MS);
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

  const componentesDoKit = kit.data?.item.components ?? [];

  // Os espaços REAIS de imagem de cada peça. Alimenta a explicação da etapa
  // Estrutura e a contagem da etapa Mídia: as duas precisam dizer o MESMO
  // número, e duas buscas separadas acabariam discordando.
  const contratos = useQuery({
    queryKey: ['kit-contratos', kitId],
    queryFn: () => api.getKitContratos(kitId as string),
    enabled: kitId !== null,
  });
  const espacosDasPecas = contratos.data?.items ?? [];

  // Semente: a etapa Estrutura nunca abre em branco.
  //
  // Roda ao ENTRAR na etapa, não na montagem do wizard, e uma vez por kit. Se
  // dependesse só de "não tem seção", apagar a última seção re-semearia por
  // baixo do usuário; e se rodasse na montagem, só ABRIR um projeto antigo
  // reescreveria o layout dele pelo autosave, sem ninguém ter pedido.
  const semeado = useRef<string | null>(null);
  useEffect(() => {
    if (step !== ETAPA.estrutura || kitId === null) return;
    if (semeado.current === kitId) return;
    if (kit.data === undefined) return;
    semeado.current = kitId;
    if (secoes.length === 0)
      setSecoes(sugerirSecoes(kit.data.item.components, undefined, objetivo));
  }, [step, kitId, kit.data, secoes.length, objetivo]);

  const dadosDasEtapas: DadosDasEtapas = {
    nome: name,
    kitId,
    brandName: branding.brandName,
    secoes,
    produtos,
  };
  const pendencias = pendenciasDaEtapa(step, dadosDasEtapas);
  const podeAvancar = pendencias.length === 0;
  const tetoLiberado = Math.min(maxVisitado, maiorEtapaLiberada(dadosDasEtapas));
  const ultima = step === ETAPAS.length - 1;

  // Validação da revisão: bloqueante impede gerar; aviso só aponta. Enquanto o
  // kit carrega, um marcador evita o falso "kit vazio".
  const problemas = validarProjeto({
    nome: name,
    kitComponentes:
      kitId === null
        ? null
        : kit.data === undefined
          ? [{ id: '__carregando__' }]
          : kit.data.item.components,
    brandName: branding.brandName,
    nLogos: branding.logos.length,
    tons: branding.identidadeVerbal.tons,
    arquetipos: branding.identidadeVerbal.arquetipos,
    paleta: branding.paleta,
    ctaPrincipal: branding.mainCta.label,
    secoes,
    nMidias: media.filter((m) => m.kind !== 'logo').length,
  });
  const travadoPorBloqueante = bloqueantes(problemas).length > 0;

  return (
    // A moldura é quase de tela cheia: o wizard é uma tela de TRABALHO, com
    // etapas em grade, e o modal padrão de 1200px espremia tudo numa coluna.
    // O `!` vence a largura do size="xl" e o teto de 88vh do Modal; a altura é
    // FIXA em 94vh para o rodapé (Voltar/Próximo) não pular de lugar a cada
    // etapa — só o corpo rola, por isso o bodyScroll do Modal fica desligado.
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={existing ? 'Editar projeto' : 'Novo projeto'}
      className="h-[94vh]! max-h-[94vh]! max-w-[1440px]!"
      bodyScroll={false}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <StepBar
          step={step}
          maxVisitado={tetoLiberado}
          onStep={(s) => s <= tetoLiberado && setStep(s)}
        />

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-8">
          {step === ETAPA.projeto && (
            <StepProjeto
              name={name}
              onName={setName}
              kitId={kitId}
              onKit={setKitId}
              kits={kits.data?.items ?? []}
              objetivo={objetivo}
              onObjetivo={setObjetivo}
            />
          )}
          {step === ETAPA.marca && (
            <StepMarca branding={branding} setB={setB} projectId={projectId} />
          )}
          {step === ETAPA.estrutura && (
            <StepEstrutura
              secoes={secoes}
              onSecoes={setSecoes}
              components={componentesDoKit}
              objetivo={objetivo}
              espacos={espacosDasPecas}
              criarSecoesFaltantes={criarSecoesFaltantes}
              onCriarSecoesFaltantes={setCriarSecoesFaltantes}
            />
          )}
          {step === ETAPA.midia && (
            <StepMidia
              projectId={projectId}
              secoes={secoes}
              components={componentesDoKit}
              kitId={kitId}
              media={media}
              onMedia={setMedia}
              produtos={produtos}
              onProdutos={setProdutos}
              objetivo={objetivo}
              criarArteDeApoio={criarArteDeApoio}
              onCriarArteDeApoio={setCriarArteDeApoio}
            />
          )}
          {step === ETAPA.revisao && (
            <StepRevisao
              name={name}
              kit={kit.data?.item ?? null}
              branding={branding}
              secoes={secoes}
              media={media}
              problemas={problemas}
              onIr={setStep}
            />
          )}
        </div>

        <div
          className="flex items-center justify-between border-t px-6 py-4 md:px-8"
          style={{ borderColor: 'var(--color-border)' }}
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] transition-colors hover:text-[var(--color-fg)]"
              style={{ color: 'var(--color-fg-muted)' }}
            >
              <ArrowLeft size={14} />
              {step === 0 ? 'Cancelar' : 'Voltar'}
            </button>
            {autosave !== 'ocioso' && (
              <output
                className="flex items-center gap-1.5 text-[12px]"
                style={{
                  color: autosave === 'falha' ? 'var(--color-signal)' : 'var(--color-fg-subtle)',
                }}
              >
                {autosave === 'salvando' && <Mascote tamanho={11} girando />}
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
              disabled={gerar.isPending || travadoPorBloqueante}
              title={
                travadoPorBloqueante ? 'Resolva os itens bloqueantes listados acima' : undefined
              }
              className="ds-btn ds-glow flex items-center gap-2 rounded-full px-7 py-3 text-[14px] font-medium disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
            >
              {gerar.isPending ? <Mascote tamanho={14} girando /> : <Mascote tamanho={16} />}
              Gerar site
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {pendencias.length > 0 && (
                <output
                  className="max-w-[46ch] text-right text-[13px] leading-snug"
                  style={{ color: 'var(--color-fg-muted)' }}
                >
                  {pendencias[0]?.mensagem}
                </output>
              )}
              <button
                type="button"
                onClick={() => avancar.mutate()}
                disabled={!podeAvancar || avancar.isPending}
                // Botão travado que não diz por quê vira adivinhação. A pendência
                // aparece ao lado, e o title repete para quem navega por teclado.
                title={pendencias[0]?.mensagem}
                className="ds-btn ds-glow flex items-center gap-2 rounded-full px-7 py-3 text-[14px] font-medium disabled:opacity-40"
                style={{ backgroundColor: 'var(--color-primary)', color: 'var(--color-bone-1)' }}
              >
                {avancar.isPending ? <Mascote tamanho={14} girando /> : <ArrowRight size={14} />}
                Próximo
              </button>
            </div>
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
      className="flex items-center overflow-x-auto border-b px-6 py-3.5 md:px-8"
      style={{ borderColor: 'var(--color-border)' }}
    >
      {ETAPAS.map((label, i) => {
        const done = i < step;
        const active = i === step;
        const travada = i > maxVisitado;
        return (
          <div key={label} className="flex shrink-0 items-center">
            {/* O traço entre as etapas: acende até onde a pessoa já chegou. É o
                que transforma cinco botões numa trilha — sem ele, a barra é uma
                fileira de opções e não um caminho com começo e fim. */}
            {i > 0 && (
              <span
                aria-hidden
                className="mx-1 h-px w-5"
                style={{
                  backgroundColor: done || active ? 'var(--color-ion-6)' : 'var(--color-border)',
                }}
              />
            )}
            <button
              type="button"
              onClick={() => onStep(i)}
              disabled={travada}
              aria-current={active ? 'step' : undefined}
              title={travada ? 'Avance pelas etapas para desbloquear' : `Ir para ${label}`}
              className="flex shrink-0 items-center gap-2 rounded-full px-3.5 py-1.5 text-[12px] uppercase tracking-[0.12em] transition-colors disabled:cursor-default"
              style={{
                backgroundColor: active ? 'rgba(56,189,248,0.12)' : 'transparent',
                color: active
                  ? 'var(--color-ion-3)'
                  : done
                    ? 'var(--color-fg-muted)'
                    : 'var(--color-fg-subtle)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              <span
                className="ds-data flex h-[18px] w-[18px] items-center justify-center rounded-full text-[10px]"
                style={{
                  backgroundColor: done
                    ? 'var(--color-ion-7)'
                    : active
                      ? 'transparent'
                      : 'rgba(255,255,255,0.06)',
                  border: active ? '1px solid var(--color-ion-4)' : '1px solid transparent',
                  color: done
                    ? 'var(--color-bone-1)'
                    : active
                      ? 'var(--color-ion-3)'
                      : 'var(--color-fg-subtle)',
                }}
              >
                {done ? <Check size={10} /> : String(i + 1).padStart(2, '0')}
              </span>
              {label}
            </button>
          </div>
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
