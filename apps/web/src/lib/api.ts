import type {
  AjusteDoSite,
  AncoraDeRolagem,
  GovernancaDoKit,
  IdentidadeVerbal,
  KitDesignSystem,
  LocalDeLogo,
  LogoVariante,
  ObjetivoDoSite,
  PaletaDoProjeto,
  ProjectLayout,
  RedeSocial,
  SectionRole,
  SlotDeMidia,
  TipografiaDoProjeto,
  Violacao,
} from '@ds/shared/schemas';

export type { KitDesignSystem, ProjectLayout };

/** O patch de marca da geração automática — espelho da resposta do servidor. */
export type MarcaAutomaticaBranding = {
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
  identidadeVerbal: IdentidadeVerbal;
  logos: LogoVariante[];
  logosLocais: Partial<Record<LocalDeLogo, string>>;
  paleta: PaletaDoProjeto;
  tipografia: TipografiaDoProjeto;
  sociais: RedeSocial[];
};

/** A sugestão da montagem automática de kit — espelho da resposta do servidor. */
export type KitAutomaticoSugestao = {
  componentIds: string[];
  passos: Array<{
    papel: SectionRole;
    etapa: string;
    faz: string;
    componentId: string | null;
    nome: string | null;
    motivo: string;
  }>;
  origemPrincipal: string | null;
  nomeSugerido: string;
  avisos: string[];
};

/**
 * A âncora de rolagem de um slot de mídia, reexportada do shared para a tela
 * poder nomear o que recebe. Ela viaja DENTRO de `SlotDeMidia.ancoras`: `null` é
 * "ninguém mediu", `[]` é "medido e não está preso", lista é mídia que se move
 * com a rolagem. Redigitar essa forma aqui só criaria uma cópia para defasar.
 */
export type { AncoraDeRolagem };

export type HealthResponse = {
  status: 'ok';
  root: string;
  db: { connected: boolean; serverTimeUnix: number };
  anthropicConfigured: boolean;
};

export type DesignSystemRecord = {
  id: string;
  sourceUrl: string | null;
  sourceHash: string;
  extractedAt: number;
  name: string;
  stackJson: string | null;
  status: string;
  vaultPath: string;
  errorMessage: string | null;
};

/** Níveis de suporte que a Galeria mostra como selo. */
export type ComponentSupport = 'completo' | 'parcial' | 'visual' | 'externo' | 'nao-suportado';

export type ComponentInteraction = {
  kind: string;
  support: ComponentSupport;
  description?: string;
};

/** Estado de uma interação no pipeline (detectada → … → validada). */
export type InteractionStatus =
  | 'detected'
  | 'captured'
  | 'associated'
  | 'replayable'
  | 'validated'
  | 'unsupported'
  | 'external-runtime';

export type Confidence = 'alta' | 'media' | 'baixa' | 'nenhuma';

/** Uma interação de um segmento no modelo de pipeline. */
export type SegmentPipelineItem = {
  kind: string;
  status: InteractionStatus;
  confidence: Confidence;
  stateIds: string[];
  runtime?: string;
  note?: string;
};

/** Metadados de um estado capturado (o HTML fica no vault, servido pelo preview). */
export type SegmentStateMeta = {
  id: string;
  trigger: string;
  label: string;
  method?: string;
  hasPortal?: boolean;
};

/** Contagens por estado de interação, para a listagem da Galeria. */
export type PipelineResumo = {
  detected: number;
  captured: number;
  associated: number;
  replayable: number;
  validated: number;
  unsupported: number;
  externalRuntime: number;
  runtimes: string[];
};

/**
 * Avaliação de fidelidade de um segmento. É como a Galeria deixa de esconder a
 * falha: um componente que só saiu visual, ou que depende de JS, diz aqui. Os
 * campos novos (pipeline/estados/dimensões/confiança) chegam quando houve
 * captura profunda; extrações antigas trazem só o básico.
 */
export type SegmentFidelity = {
  support: ComponentSupport;
  renderMode: string;
  fidelity: number;
  warnings: string[];
  interactions: ComponentInteraction[];
  pipeline?: SegmentPipelineItem[];
  states?: SegmentStateMeta[];
  confidence?: Confidence;
  dimensions?: Partial<Record<string, ComponentSupport>>;
  related?: { kind: string; label: string; stateId?: string }[];
  dependencies?: { type: string; ref: string; runtime?: string; bundled?: boolean }[];
  limitations?: string[];
  /** Comportamentos de scroll associados (reveal/parallax/sticky/progress-*). */
  scroll?: { kind: string; scrub?: boolean; pin?: boolean }[];
  /** Print da dobra no momento da captura, relativo a `capture-v2/`. */
  framePath?: string;
};

/**
 * Resultado da conferência de pixel do bundle deste segmento: o bundle foi
 * aberto sozinho num navegador e comparado com o print da dobra de origem.
 * Frações 0..1 (a UI formata em %).
 */
export type ConferenciaDePixel = { delta: number; limiar: number; passou: boolean };

/**
 * O que o servidor responde sobre o portão.
 *
 * `desligado` é o modo de desenvolvimento (sem `ORBIS_SENHA`, na sua máquina).
 * `sem-credencial` é o servidor PUBLICADO que esqueceu a variável: ali ninguém
 * entra, e a tela diz por quê em vez de acusar a senha de quem digitou.
 */
export type SessaoDoPortao = {
  estado: 'ativo' | 'desligado' | 'sem-credencial';
  dentro: boolean;
  /**
   * `admin` faz tudo; `visita` vê tudo e não muda nada. Quem impõe é o
   * SERVIDOR: a interface usa isto só para não oferecer o que vai ser recusado.
   */
  nivel: 'admin' | 'visita' | null;
  /** Este servidor tem credencial de visita configurada. */
  temVisita?: boolean;
};

export type SegmentRecord = {
  id: string;
  designSystemId: string;
  category: string;
  kind: string;
  name: string;
  htmlSnippet: string;
  previewPath: string | null;
  position: number;
  inLibrary: boolean;
  /** Seção pai quando o segmento é um subcomponente dela; null = seção raiz. */
  parentId: string | null;
  /** Presente quando a segmentação gerou avaliação (extrações novas). */
  fidelity?: SegmentFidelity | null;
  /** Resumo das interações por estado (contagens). Presente na listagem nova. */
  resumo?: PipelineResumo | null;
  /** Presente quando a captura mediu o pixel E soube dizer de que segmento é. */
  comparacaoVisual?: ConferenciaDePixel;
  /**
   * O que o bundle deste segmento declarou ao ser compilado. Campo presente =
   * o segmento tem bundle (mesmo com a lista vazia); ausente = fluxo antigo ou
   * subcomponente, em que a conferência de pixel nem se aplica.
   */
  limitacoes?: string[];
  /**
   * Quanto da peça a paleta da marca alcança. Ausente = não deu para medir (sem
   * folha de estilo), e aí a tela não promete nem acusa.
   *
   * A recoloração deixa de fora, de propósito, as palavras de cor (`white`), as
   * funções dinâmicas (`color-mix`, `var()` como cor inteira) e o que mora
   * dentro de imagem. Cada exclusão está certa; o que faltava era CONTAR, para
   * a peça parar de entrar no kit parecendo que vai receber a marca.
   */
  marca?: Recolorabilidade;
  /**
   * O que foi conferido nesta peça, por canal. Sempre os quatro, inclusive os
   * que não rodaram — é o que a Galeria mostra em "Como eu conferi".
   */
  vereditos?: Veredito[];
  /**
   * As mídias desta peça que estão presas a um ponto da rolagem. Ausente = a
   * captura não achou nenhuma, e não que não haja: a medida vem dos
   * comportamentos que o motor associou a este segmento.
   */
  ancoras?: AncoraNaTela[];
};

/**
 * Uma mídia posicional: não é "uma imagem na seção", é "esta imagem neste ponto
 * da rolagem". Trocar o arquivo sem saber disso produz um site que parece
 * quebrado sem ninguém entender por quê — por isso a tela declara antes.
 */
export type AncoraNaTela = {
  midiaId: string;
  midiaKind: string;
  efeito: string;
  de: number;
  ate: number;
  acompanhaRolagem: boolean;
  frase: string;
};

/** O ritmo medido no acervo. Espelha `@ds/composer`. */
export type TokensDeMovimento = {
  rapidaMs: number;
  mediaMs: number;
  easing: string;
  amostras: number;
};

/**
 * O que foi conferido nesta peça, por canal. Espelha `@ds/shared`.
 *
 * Os quatro canais vêm sempre, inclusive os que não rodaram — com o motivo do
 * que impediu. Canal calado é indistinguível de canal aprovado, e essa confusão
 * é o defeito que este contrato existe para acabar.
 */
export type Veredito = {
  canal: 'pixel' | 'navegador' | 'scroll' | 'interacao';
  estado: 'passou' | 'falhou' | 'nao-rodou';
  motivo: string;
  delta?: number;
  limiar?: number;
};

/** A medida de alcance da marca sobre uma peça. Espelha `@ds/composer`. */
export type Recolorabilidade = {
  total: number;
  alcancavel: number;
  taxa: number;
  fora: Partial<Record<'palavra' | 'funcao-dinamica' | 'dentro-de-imagem', number>>;
};

export type TaskEvent = { timestamp: number; level: 'info' | 'warn' | 'error'; message: string };

export type TaskRecord = {
  id: string;
  operation: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  input: unknown;
  result: unknown;
  errorMessage: string | null;
  events: TaskEvent[];
};

/** Job da fila, como o servidor devolve no modo `queue`. */
export type QueueJobRef = {
  id: string;
  type: string;
  label: string;
  createdAt: number;
};

/**
 * Resposta das rotas que disparam trabalho.
 *
 * No modo `api` o servidor executa e devolve uma `task` para acompanhar.
 * No modo `queue` ele só registra o pedido em disco e devolve o `job`.
 * Quem consome precisa checar qual dos dois veio — nunca assumir `task`.
 */
export type StartWorkResponse = { task: TaskRecord } | { queued: true; job: QueueJobRef };

export type LibraryComponentRecord = {
  id: string;
  segmentId: string | null;
  designSystemId: string | null;
  category: string;
  kind: string;
  name: string;
  bundlePath: string;
  bundleHash: string;
  tokensJson: string | null;
  addedAt: number;
  notes: string | null;
  /** Etiquetas livres do usuário. Sempre presente (lista vazia quando não há). */
  tags: string[];
};

// ── Kits (Design Systems finais) ─────────────────────────────────────────────

export type KitComponentRef = {
  id: string;
  name: string;
  category: string;
  kind: string;
  position: number;
  /** De qual captura a peça veio — a regra de origem decide por ela. */
  designSystemId: string | null;
};

/** Resumo do contrato de um componente do kit (espaços reais de conteúdo). */
export type KitContratoResumo = {
  id: string;
  /** O nome da peça, para o aviso poder dizer QUAL peça não aceita a paleta. */
  nome?: string;
  disponivel: boolean;
  textos: number;
  links: number;
  logos: number;
  /**
   * Os espaços de mídia INTEIROS, como o contrato os derivou (o tipo do
   * elemento de origem, a proporção medida, se a peça perde o sentido sem
   * aquela mídia). Não é `{ tipo }`: sem a proporção e sem o papel do espaço, a
   * tela só conseguiria conferir vídeo contra imagem e teria de chutar o resto.
   *
   * O shape é o do shared, importado e não redigitado: o servidor devolve o
   * `SlotDeMidia` do contrato tal como está, e uma cópia à mão aqui ficaria
   * defasada em silêncio na primeira mudança do schema.
   */
  midias: SlotDeMidia[];
  /** Quanto desta peça a paleta da marca alcança. Ausente = não deu para medir. */
  marca?: Recolorabilidade;
};

export type KitRecord = {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  components: KitComponentRef[];
  /** Projetos que usam este kit — a UI avisa antes de excluir. */
  usedByProjects: Array<{ id: string; name: string }>;
  /** Quem manda em quê: a origem-base e as origens travadas por categoria. */
  governanca: GovernancaDoKit;
  /**
   * O que está fora da regra AGORA. Kit montado antes desta camada pode ter
   * violações: elas são mostradas, nunca corrigidas em silêncio.
   */
  violacoes: Violacao[];
};

/**
 * Kit que algum projeto usa — a exclusão em lote devolve isto em vez de
 * excluir, para a UI confirmar de novo com os projetos nomeados.
 */
export type KitEmUso = { id: string; name: string; projetos: string[] };

export type CreateKitInput = {
  name: string;
  description?: string | null;
  componentIds?: string[];
};

export type UpdateKitInput = {
  name?: string;
  description?: string | null;
  /** Lista completa, na ordem desejada. Substitui a anterior. */
  componentIds?: string[];
  /** A captura que dá o ritmo: espaçamento, forma, movimento. `null` limpa. */
  origemBase?: string | null;
  /** `categoria → designSystemId`. Lista completa; substitui a anterior. */
  origemPorCategoria?: Record<string, string>;
};

// ── Impacto (o que quebra ao apagar) ─────────────────────────────────────────

export type DesignSystemImpact = {
  segmentos: number;
  componentesDaBiblioteca: Array<{ id: string; name: string }>;
};

export type LibraryComponentImpact = {
  usadoEmKits: Array<{ id: string; name: string }>;
};

// ── Rejeitados (não passaram na validação; vão para a Revisão) ────────────────

export type RejectedSegment = {
  id: string;
  designSystemId: string;
  category: string;
  kind: string;
  name: string;
  htmlSnippet: string;
  position: number;
  /** Por que o algoritmo não teve confiança neste bloco. */
  motivos: string[];
};

export type RejeitadosGrupo = {
  designSystemId: string;
  designSystemName: string;
  itens: RejectedSegment[];
};

// O layout que trafega no PATCH é o do `@ds/shared` (importado no topo), não uma
// cópia à mão. Havia uma redeclaração local aqui, e ela ficou defasada em
// silêncio: o modelo mudou no shared e este tipo continuou descrevendo
// blueprints, então o cliente compilava e mandava um corpo que o servidor já não
// reconhecia.

// ── Projetos ─────────────────────────────────────────────────────────────────

export type ProjectContent = {
  about?: string;
  slogan?: string;
  cta?: string;
  sections?: Record<string, string>;
  [k: string]: unknown;
};

export type ProjectBranding = {
  brandName?: string;
  tone?: string;
  logoPath?: string | null;
  faviconPath?: string | null;
  palette: {
    primary: string;
    secondary?: string;
    background: string;
    foreground: string;
    accent?: string;
  };
  typography: { display: string; body: string; mono?: string };
  contact?: { email?: string; phone?: string; whatsapp?: string; address?: string };
  social?: Record<string, string>;
  mainCta?: { label?: string; href?: string };
  // ── Campos novos (A5) — aditivos; o shape vem do shared (fonte única) ──
  identidadeVerbal?: IdentidadeVerbal;
  logos?: LogoVariante[];
  logosLocais?: Partial<Record<LocalDeLogo, string>>;
  paleta?: PaletaDoProjeto;
  tipografia?: TipografiaDoProjeto;
  sociais?: RedeSocial[];
};

export type MediaItem = {
  path: string;
  mimeType: string;
  kind: 'image' | 'video' | 'logo' | 'icon' | '3d' | 'lottie' | 'mockup';
  originalName: string;
  alt?: string;
  /** A seção onde esta mídia entra. Ausente = o gerador escolhe onde encaixa. */
  secaoId?: string;
  /** Espelho legado do papel da seção. Derivado no servidor, nunca digitado. */
  slotRole?: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  kitId: string | null;
  contentJson: string | null;
  brandingJson: string | null;
  mediaManifestJson: string | null;
  layoutJson: string | null;
  status: string;
};

export type ProjectVersion = { timestamp: string; arquivos: number; bytes: number };

export type MeusProjetosItem = {
  id: string;
  name: string;
  status: string;
  updatedAt: number;
  versoes: ProjectVersion[];
};

export type UpdateProjectInput = {
  name?: string;
  kitId?: string | null;
  content?: ProjectContent;
  branding?: ProjectBranding;
  layout?: ProjectLayout;
};

/**
 * O cabeçalho onde a credencial das ações caras viaja.
 *
 * Nunca na URL: URL entra em log de servidor, em histórico de navegador e no
 * `Referer` de qualquer requisição seguinte.
 */
export const CABECALHO_DA_ACAO = 'x-orbis-acao';

/**
 * O servidor pediu a credencial desta ação (HTTP 428).
 *
 * É um erro à parte porque significa uma coisa diferente de "você não pode": a
 * sessão está válida, só falta confirmar ESTE gasto. Quem chama distingue os
 * dois e abre a caixa de confirmação em vez de mandar entrar de novo.
 */
export class PrecisaDaSenhaDeAcao extends Error {}

const jsonFetch = async <T>(input: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(input, {
    ...init,
    // O cookie da sessão é `HttpOnly`: o JavaScript não o lê nem o escreve, só
    // pede que ele viaje. Sem `credentials`, o app publicado num domínio e a
    // API noutro nunca mandariam a sessão, e toda tela responderia 401.
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    // O erro que chega ao toast é o que a PESSOA lê: preferir a mensagem
    // humana que o servidor mandou; nunca despejar status/JSON cru na tela.
    const body = await res.text();
    if (res.status === 428) {
      let msg = 'Preciso da credencial antes de pôr a máquina para trabalhar.';
      try {
        const p = JSON.parse(body) as { message?: string };
        if (typeof p.message === 'string' && p.message.trim() !== '') msg = p.message;
      } catch {
        // corpo não-JSON: fica a mensagem padrão
      }
      throw new PrecisaDaSenhaDeAcao(msg);
    }
    let mensagem = 'Não deu para concluir agora. Tente de novo em instantes.';
    try {
      const parsed = JSON.parse(body) as { message?: string };
      if (typeof parsed.message === 'string' && parsed.message.trim() !== '') {
        mensagem = parsed.message;
      }
    } catch {
      // corpo não-JSON: fica a mensagem genérica
    }
    throw new Error(mensagem);
  }
  return (await res.json()) as T;
};

/**
 * URLs de prévia servidas pelo próprio backend.
 *
 * A prévia é um documento HTML completo montado no server (head real, scripts,
 * atributos do body) e servido com `Content-Security-Policy: sandbox`. O front
 * só aponta um iframe para cá — nada de montar srcDoc no cliente. `bg` força o
 * contraste do fundo no modal de detalhe.
 */
export const previewSegmentUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}${bg ? `?bg=${bg}` : ''}`;
/**
 * Prévia em modo HOVER: reescreve as regras `:hover` do site como classe e as
 * liga num elemento de cada vez. Existe porque `:hover` não se aciona por
 * código, então sem isto o hover só aparecia por acaso.
 */
export const previewSegmentHoverUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}?hover=1${bg ? `&bg=${bg}` : ''}`;
/**
 * O print da dobra, como a captura a viu no site. `framePath` vem do insight e
 * é relativo a `capture-v2/` (ex.: `frames/secao-ab12.png`).
 */
export const frameUrl = (dsId: string, framePath: string): string =>
  `/api/frame/${dsId}/${framePath.replace(/^frames[/\\]/, '')}`;
/**
 * Prévia em modo REPLAY: injeta a barra de interações capturadas e o runtime que
 * reproduz cada estado (com botão Reiniciar). Só faz efeito quando o segmento
 * tem estados no vault; senão cai na prévia limpa.
 */
export const previewSegmentReplayUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}?replay=1${bg ? `&bg=${bg}` : ''}`;
/**
 * Prévia em modo SCROLL: reproduz os comportamentos capturados (reveal,
 * parallax, sticky, progress) com rolagem REAL numa área alta — é onde o
 * usuário VÊ o efeito acontecer em vez de ler que ele existe.
 */
export const previewSegmentScrollUrl = (segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/segment/${segId}?scroll=1${bg ? `&bg=${bg}` : ''}`;
/**
 * A prévia do kit MONTADO: as peças juntas, já vestidas com a marca.
 *
 * `componentes` permite prever uma seleção que ainda NÃO foi salva — quem está
 * escolhendo precisa ver o efeito da escolha, não o da escolha anterior. E
 * `versao` força o iframe a recarregar: sem ela, o navegador serve a montagem
 * passada e a tela parece congelada.
 */
export const previewKitUrl = (
  kitId: string,
  opts: { componentes?: readonly string[]; projectId?: string; versao?: number } = {},
): string => {
  const q = new URLSearchParams();
  if (opts.componentes !== undefined) q.set('componentes', opts.componentes.join(','));
  if (opts.projectId !== undefined) q.set('projectId', opts.projectId);
  q.set('v', String(opts.versao ?? 0));
  return `/api/preview/kit/${kitId}?${q.toString()}`;
};

/**
 * Os avisos da última montagem da prévia do kit: o que degradou, sumiu ou não
 * pôde ser reproduzido. Buscar DEPOIS do iframe carregar, porque é a navegação
 * do iframe que dispara a montagem que os grava.
 */
export const kitPreviewAvisos = (
  kitId: string,
): Promise<{ avisos: string[]; faltando: string[] }> =>
  jsonFetch<{ avisos: string[]; faltando: string[] }>(`/api/preview/kit/${kitId}/avisos`);

export const previewComponentUrl = (cmpId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/component/${cmpId}${bg ? `?bg=${bg}` : ''}`;
export const previewRejeitadoUrl = (dsId: string, segId: string, bg?: 'claro' | 'escuro'): string =>
  `/api/preview/rejeitado/${dsId}/${segId}${bg ? `?bg=${bg}` : ''}`;

/** URL estática de uma versão gerada de um site (iframe de Meus sites / nova aba). */
export const siteUrl = (prjId: string, versao: string): string =>
  `/site/${prjId}/${encodeURIComponent(versao)}/index.html`;

/** URL de download do .zip de uma versão gerada. */
export const downloadUrl = (prjId: string, versao: string): string =>
  `/api/meus-projetos/${prjId}/download?versao=${encodeURIComponent(versao)}`;

export const api = {
  health: () => jsonFetch<HealthResponse>('/health'),

  // ── O portão ────────────────────────────────────────────────────────────
  /**
   * Esta sessão já passou pelo portão?
   *
   * A pergunta vai ao SERVIDOR e não ao navegador. Guardar "já entrei" aqui
   * seria uma tranca com a chave do lado de fora.
   */
  sessao: () => jsonFetch<SessaoDoPortao>('/api/orbis/sessao'),
  /** Manda a credencial. O que volta é um sim ou um não, nunca a senha. */
  entrar: (senha: string) =>
    jsonFetch<{ dentro: boolean; nivel: 'admin' | 'visita' }>('/api/orbis/entrar', {
      method: 'POST',
      body: JSON.stringify({ senha }),
    }),
  sair: () => jsonFetch<{ dentro: boolean }>('/api/orbis/sair', { method: 'POST' }),

  // ── Design Systems (extrações) ──────────────────────────────────────────
  listDesignSystems: () => jsonFetch<{ items: DesignSystemRecord[] }>('/api/design-systems'),
  getDesignSystem: (id: string) =>
    jsonFetch<{ item: DesignSystemRecord; assetsFaltando: string[] }>(`/api/design-systems/${id}`),
  deleteDesignSystem: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/design-systems/${id}`, { method: 'DELETE' }),
  designSystemImpact: (id: string) =>
    jsonFetch<DesignSystemImpact>(`/api/design-systems/${id}/impacto`),
  listSegments: (dsId: string) =>
    jsonFetch<{
      items: SegmentRecord[];
      capturaParcial?: { fase: string; motivo?: string; totalMs: number };
      /** O que a captura declarou não ter conseguido medir, nas palavras dela. */
      limitacoesDaCaptura?: string[];
    }>(`/api/design-systems/${dsId}/segments`),
  deleteSegment: (dsId: string, segId: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/design-systems/${dsId}/segments/${segId}`, {
      method: 'DELETE',
    }),
  /** Excluir vários segmentos da Galeria. Cópias na Biblioteca sobrevivem. */
  deleteSegmentsBatch: (dsId: string, segmentIds: string[]) =>
    jsonFetch<{ deleted: number }>(`/api/design-systems/${dsId}/segments/batch-delete`, {
      method: 'POST',
      body: JSON.stringify({ segmentIds }),
    }),
  createDesignSystem: (
    input:
      | { kind: 'url'; url: string; name?: string }
      | { kind: 'html'; html: string; name: string },
    /** A credencial desta ação. Ausente = o servidor responde 428 e a tela pede. */
    senhaDeAcao?: string,
  ) =>
    jsonFetch<StartWorkResponse>('/api/design-systems', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: senhaDeAcao === undefined ? undefined : { [CABECALHO_DA_ACAO]: senhaDeAcao },
    }),
  classify: (dsId: string) =>
    jsonFetch<StartWorkResponse>(`/api/design-systems/${dsId}/classify`, { method: 'POST' }),

  /**
   * O ritmo do acervo: a mediana das durações e a curva mais usada nos sites
   * trazidos. `amostras: 0` significa que não houve o que medir, e aí o app
   * mantém o próprio padrão em vez de fingir que mediu.
   */
  getMovimento: () => jsonFetch<{ tokens: TokensDeMovimento }>('/api/movimento'),

  // ── Tasks ───────────────────────────────────────────────────────────────
  getTask: (id: string) => jsonFetch<{ task: TaskRecord }>(`/api/tasks/${id}`),
  listTasks: () => jsonFetch<{ items: TaskRecord[] }>('/api/tasks'),

  // ── Biblioteca ──────────────────────────────────────────────────────────
  listLibrary: () => jsonFetch<{ items: LibraryComponentRecord[] }>('/api/library'),
  getLibraryComponent: (id: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>(`/api/library/${id}`),
  addToLibrary: (segmentId: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>('/api/library', {
      method: 'POST',
      body: JSON.stringify({ segmentId }),
    }),
  /**
   * Curtir vários de uma vez. Idempotente; devolve o que entrou, o que já
   * estava, o que sumiu e o que o servidor RECUSOU (peça que a captura não
   * reproduz). O campo `recusados` sempre existiu na resposta; era o tipo daqui
   * que o descartava, e a pessoa via "sucesso" com itens faltando.
   */
  addToLibraryBatch: (segmentIds: string[]) =>
    jsonFetch<{ added: string[]; already: string[]; missing: string[]; recusados: string[] }>(
      '/api/library/batch',
      {
        method: 'POST',
        body: JSON.stringify({ segmentIds }),
      },
    ),
  removeFromLibrary: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/library/${id}`, { method: 'DELETE' }),
  patchComponent: (
    id: string,
    patch: { name?: string; category?: string; notes?: string | null; tags?: string[] },
  ) =>
    jsonFetch<{ item: LibraryComponentRecord }>(`/api/library/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  /** Atalho preservado: renomear é o caso mais comum de PATCH. */
  renameComponent: (id: string, name: string) =>
    jsonFetch<{ item: LibraryComponentRecord }>(`/api/library/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),
  libraryImpact: (id: string) => jsonFetch<LibraryComponentImpact>(`/api/library/${id}/impacto`),

  // ── Rejeitados (Revisão) ────────────────────────────────────────────────
  listRejeitados: () => jsonFetch<{ grupos: RejeitadosGrupo[]; total: number }>('/api/rejeitados'),
  excluirDaBibliotecaEmLote: (componentIds: string[], confirmarEmUso = false) =>
    jsonFetch<{
      excluidos: string[];
      emUso: { id: string; name: string; kits: string[]; projetos: string[] }[];
      faltando: string[];
    }>('/api/library/excluir-lote', {
      method: 'POST',
      body: JSON.stringify({ componentIds, confirmarEmUso }),
    }),
  recuperarRejeitado: (dsId: string, segId: string) =>
    jsonFetch<{ ok: true; segmentId: string }>(`/api/rejeitados/${dsId}/${segId}/recuperar`, {
      method: 'POST',
    }),
  descartarRejeitado: (dsId: string, segId: string) =>
    jsonFetch<{ ok: true }>(`/api/rejeitados/${dsId}/${segId}`, { method: 'DELETE' }),

  // ── Kits (Design Systems finais) ────────────────────────────────────────
  listKits: () => jsonFetch<{ items: KitRecord[] }>('/api/kits'),
  getKit: (id: string) => jsonFetch<{ item: KitRecord }>(`/api/kits/${id}`),
  getKitContratos: (id: string) =>
    jsonFetch<{ items: KitContratoResumo[] }>(`/api/kits/${id}/contratos`),
  /**
   * O design system consolidado do kit (paleta por origem, fontes, limitações).
   * O servidor tenta o backfill na hora; `item: null` = nem agora deu, e a
   * geração degrada para as cores de origem das peças.
   */
  getKitDesignSystem: (id: string) =>
    jsonFetch<{ item: KitDesignSystem | null }>(`/api/kits/${id}/design-system`),
  createKit: (input: CreateKitInput) =>
    jsonFetch<{ item: KitRecord }>('/api/kits', { method: 'POST', body: JSON.stringify(input) }),
  updateKit: (id: string, input: UpdateKitInput) =>
    jsonFetch<{ item: KitRecord }>(`/api/kits/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
  deleteKit: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/kits/${id}`, { method: 'DELETE' }),
  excluirKitsEmLote: (kitIds: string[], confirmarEmUso = false) =>
    jsonFetch<{ excluidos: string[]; emUso: KitEmUso[]; faltando: string[] }>(
      '/api/kits/excluir-lote',
      { method: 'POST', body: JSON.stringify({ kitIds, confirmarEmUso }) },
    ),
  duplicateKit: (id: string) =>
    jsonFetch<{ item: KitRecord }>(`/api/kits/${id}/duplicate`, { method: 'POST' }),
  /**
   * Montagem automática de kit a partir do objetivo do site. Leitura pura: o
   * servidor sugere (ordem da sequência de marketing + peças que combinam) e a
   * tela aplica no editor — quem salva é a pessoa, depois de revisar.
   */
  montarKitAutomatico: (objetivo: ObjetivoDoSite) =>
    jsonFetch<{ sugestao: KitAutomaticoSugestao }>('/api/kits/montar-automatico', {
      method: 'POST',
      body: JSON.stringify({ objetivo }),
    }),
  /**
   * Marca automática para testes de geração: o servidor cria a identidade
   * completa e as mídias dela (logos + imagens); a tela aplica o patch na
   * bancada e o autosave grava.
   */
  /**
   * Via expressa: kit + projeto + marca num pedido só, trancado pela
   * credencial de ação. Devolve o projectId; a tela dispara a geração em
   * seguida pelo generateProject de sempre, com a mesma credencial.
   */
  expresso: (
    input: { objetivo: ObjetivoDoSite; nicho?: string; nome?: string; marca?: string },
    senhaDeAcao?: string,
  ) =>
    jsonFetch<{
      projectId: string;
      kitId: string;
      marca: string;
      midias: number;
      passos: KitAutomaticoSugestao['passos'];
      avisos: string[];
    }>('/api/projects/expresso', {
      method: 'POST',
      body: JSON.stringify(input),
      headers: senhaDeAcao === undefined ? undefined : { [CABECALHO_DA_ACAO]: senhaDeAcao },
    }),
  /**
   * Gera as imagens das SEÇÕES a partir da marca já salva do projeto — o
   * fecho do ciclo Marca→Estrutura: cada seção que aceita mídia recebe as
   * suas, ancoradas por secaoId.
   */
  gerarMidiasAutomaticas: (projectId: string) =>
    jsonFetch<{ criadas: MediaItem[]; media: MediaItem[] }>(
      `/api/projects/${projectId}/midias-automaticas`,
      { method: 'POST' },
    ),
  criarMarcaAutomatica: (projectId: string, nicho?: string) =>
    jsonFetch<{ branding: MarcaAutomaticaBranding; media: MediaItem[] }>(
      `/api/projects/${projectId}/marca-automatica`,
      { method: 'POST', body: JSON.stringify({ nicho: nicho ?? null }) },
    ),

  // ── Projetos ────────────────────────────────────────────────────────────
  listProjects: () => jsonFetch<{ items: ProjectRecord[] }>('/api/projects'),
  getProject: (id: string) => jsonFetch<{ item: ProjectRecord }>(`/api/projects/${id}`),
  /** Cria um rascunho. NÃO gera nada — só nome + kit. */
  createProject: (input: { name: string; kitId?: string | null }) =>
    jsonFetch<{ item: ProjectRecord }>('/api/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  updateProject: (id: string, patch: UpdateProjectInput) =>
    jsonFetch<{ item: ProjectRecord }>(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  duplicateProject: (id: string) =>
    jsonFetch<{ item: ProjectRecord }>(`/api/projects/${id}/duplicate`, { method: 'POST' }),
  deleteProject: (id: string) =>
    jsonFetch<{ deleted: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
  /** Dispara a geração do site a partir do rascunho já salvo. */
  generateProject: (id: string, senhaDeAcao?: string) =>
    jsonFetch<StartWorkResponse & { projectId?: string }>(`/api/projects/${id}/generate`, {
      method: 'POST',
      headers: senhaDeAcao === undefined ? undefined : { [CABECALHO_DA_ACAO]: senhaDeAcao },
    }),
  /** Upload de mídia (multipart). Não passa por jsonFetch: o corpo é FormData. */
  uploadMedia: async (
    id: string,
    file: File,
    meta: { kind: MediaItem['kind']; secaoId?: string; alt?: string },
  ): Promise<{ item: MediaItem; media: MediaItem[] }> => {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', meta.kind);
    if (meta.secaoId) form.append('secaoId', meta.secaoId);
    if (meta.alt) form.append('alt', meta.alt);
    const res = await fetch(`/api/projects/${id}/media`, { method: 'POST', body: form });
    if (!res.ok) {
      // Quando o servidor explica o problema por extenso (campo `message`, como
      // no 413 do limite de 200 MB), o toast mostra essa frase — e não o JSON
      // cru colado atrás de "413 Payload Too Large".
      const texto = await res.text();
      let mensagem = `${res.status} ${res.statusText}: ${texto}`;
      try {
        const corpo = JSON.parse(texto) as { message?: unknown };
        if (typeof corpo.message === 'string' && corpo.message) mensagem = corpo.message;
      } catch {
        // corpo não era JSON; a mensagem técnica já serve
      }
      throw new Error(mensagem);
    }
    return res.json();
  },
  /** Move a mídia de seção. `secaoId: null` devolve para "o gerador decide". */
  updateMedia: (id: string, path: string, patch: { secaoId: string | null }) =>
    jsonFetch<{ media: MediaItem[] }>(`/api/projects/${id}/media`, {
      method: 'PATCH',
      body: JSON.stringify({ path, ...patch }),
    }),
  deleteMedia: (id: string, path: string) =>
    jsonFetch<{ deleted: boolean; media: MediaItem[] }>(
      `/api/projects/${id}/media?path=${encodeURIComponent(path)}`,
      { method: 'DELETE' },
    ),

  // ── Meus sites (versões geradas em disco) ───────────────────────────────
  listMeusProjetos: () => jsonFetch<{ items: MeusProjetosItem[] }>('/api/meus-projetos'),
  meusProjetosContagem: () => jsonFetch<{ total: number }>('/api/meus-projetos/contagem'),
  abrirPasta: (id: string) =>
    jsonFetch<{ ok: boolean }>(`/api/meus-projetos/${id}/abrir-pasta`, { method: 'POST' }),
  /**
   * Os retoques pedidos para uma versão gerada, e o pedido novo.
   *
   * Não regera o site: o pedido vira job e o ajuste pousa no
   * `assets/ajustes.css` daquela versão, que a montagem emite vazio e liga por
   * último na cascata.
   */
  ajustesDoSite: (id: string, versao?: string) =>
    jsonFetch<{ versao: string; formato: number; ajustes: AjusteDoSite[] }>(
      `/api/meus-projetos/${id}/ajustes${versao ? `?versao=${encodeURIComponent(versao)}` : ''}`,
    ),
  /** O que a regra de aceite nao deixou passar, em todos os sites. */
  pendencias: () =>
    jsonFetch<{
      itens: {
        projectId: string;
        projectName: string;
        versao: string;
        vereditos: { codigo: string; titulo: string; estado: string; motivo: string }[];
      }[];
    }>('/api/meus-projetos/pendencias'),
  /** "Faca-me aprender": mais uma tentativa sobre o que nao passou. */
  pedirAprendizado: (id: string, versao: string, codigo: string, motivo: string) =>
    jsonFetch<{ job: { id: string } }>(`/api/meus-projetos/${id}/aprender`, {
      method: 'POST',
      body: JSON.stringify({ versao, codigo, motivo }),
    }),
  pedirAjuste: (id: string, pedido: string, versao?: string) =>
    jsonFetch<{ ajuste: AjusteDoSite; job: { id: string } }>(
      `/api/meus-projetos/${id}/ajustes${versao ? `?versao=${encodeURIComponent(versao)}` : ''}`,
      { method: 'POST', body: JSON.stringify({ pedido }) },
    ),
};
