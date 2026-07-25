import type {
  CapturedElement,
  Confidence,
  RelatedElement,
  ScrollBehavior,
  SegmentDependency,
  SegmentInteraction,
  SegmentState,
  StoredState,
} from '@ds/shared';
import { KINDS_REPRODUZIVEIS, statusDaInteracao } from '@ds/shared';

/**
 * Identidade estável entre o manifesto de captura e os segmentos.
 *
 * O problema (seção 3 do pedido): o `ref` que o explorer atribuiu a um elemento
 * (`data-dsx-ref`) só vale dentro daquela sessão de navegador. O
 * `design-system.html` que o segmenter fatia é OUTRO render. Ligar um pelo outro
 * por seletor CSS frágil erra fácil. A estratégia aqui é uma CADEIA de sinais,
 * da mais forte para a mais fraca, e cada acerto carrega um nível de confiança:
 *
 *   1. id            — `id="x"` é único por definição → confiança alta
 *   2. classes       — todas as classes distintivas no mesmo segmento → média
 *   3. conteúdo      — o texto/label do elemento aparece no segmento → baixa
 *
 * Quando nada casa com confiança, o elemento fica NÃO ASSOCIADO — nunca é
 * grudado no segmento errado em silêncio. Quem não associa vira uma limitação
 * honesta no segmento e um caso para a Revisão.
 */

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** O segmento tem um elemento com este id? */
const contemId = (html: string, id: string): boolean =>
  new RegExp(`\\bid\\s*=\\s*["']${escapeRe(id)}["']`).test(html);

/** O segmento tem um elemento cujo atributo class contém esta classe (token inteiro)? */
const contemClasse = (html: string, cls: string): boolean =>
  new RegExp(`\\bclass\\s*=\\s*["'][^"']*(?:^|\\s)${escapeRe(cls)}(?:\\s|["'])`).test(html) ||
  new RegExp(`\\bclass\\s*=\\s*["']${escapeRe(cls)}(?:\\s|["'])`).test(html);

/** Classes utilitárias curtas demais para distinguir um segmento do outro. */
const CLASSE_FRACA = /^(is-|has-|js-)?[a-z]{1,2}$/i;

const classesDistintas = (classes: string[]): string[] =>
  classes.filter((c) => c.length >= 3 && !CLASSE_FRACA.test(c)).slice(0, 6);

export type AssocMethod = 'id' | 'classes' | 'content' | 'nenhum';

export type Associacao = {
  segmentId: string;
  confidence: Confidence;
  method: AssocMethod;
};

/**
 * Acha o melhor segmento para um elemento capturado. Devolve `nenhum`/`nenhuma`
 * quando não há correspondência confiável — o chamador então NÃO associa.
 *
 * Desempate por especificidade: entre vários segmentos que casam, vence o de
 * menor HTML (o mais específico), e casar em mais de um baixa a confiança.
 */
export const associarElemento = (
  el: CapturedElement,
  segments: ReadonlyArray<{ id: string; htmlSnippet: string }>,
): Associacao => {
  const match = el.match;

  // 1. id — o sinal mais forte.
  if (match?.id) {
    const casam = segments.filter((s) => contemId(s.htmlSnippet, match.id as string));
    if (casam.length >= 1) {
      const alvo = maisEspecifico(casam);
      return {
        segmentId: alvo.id,
        confidence: casam.length === 1 ? 'alta' : 'media',
        method: 'id',
      };
    }
  }

  // 2. classes distintivas — todas no mesmo segmento.
  const distintas = classesDistintas(match?.classes ?? []);
  if (distintas.length > 0) {
    const casam = segments.filter((s) => distintas.every((c) => contemClasse(s.htmlSnippet, c)));
    if (casam.length >= 1) {
      const alvo = maisEspecifico(casam);
      const conf: Confidence =
        distintas.length >= 2 && casam.length === 1
          ? 'media'
          : casam.length === 1
            ? 'baixa'
            : 'baixa';
      return { segmentId: alvo.id, confidence: conf, method: 'classes' };
    }
  }

  // 3. conteúdo — o label/texto do elemento aparece no segmento.
  const texto = el.label?.trim() ?? '';
  if (texto.length >= 8) {
    const casam = segments.filter((s) => s.htmlSnippet.includes(texto));
    const unico = casam.length === 1 ? casam[0] : undefined;
    if (unico) return { segmentId: unico.id, confidence: 'baixa', method: 'content' };
  }

  return { segmentId: '', confidence: 'nenhuma', method: 'nenhum' };
};

const maisEspecifico = <T extends { htmlSnippet: string }>(xs: T[]): T =>
  xs.reduce((menor, s) => (s.htmlSnippet.length < menor.htmlSnippet.length ? s : menor));

/**
 * Associa um alvo (id + classes) a um segmento — só por id/classes (sem
 * conteúdo, que um `ScrollBehavior` não tem). Mesma cadeia de confiança do
 * `associarElemento`. Devolve `nenhuma` quando não há casamento confiável.
 */
export const associarPorMatch = (
  match: { id: string | null; classes: string[] },
  segments: ReadonlyArray<{ id: string; htmlSnippet: string }>,
): Associacao => {
  if (match.id) {
    const casam = segments.filter((s) => contemId(s.htmlSnippet, match.id as string));
    if (casam.length >= 1) {
      return {
        segmentId: maisEspecifico(casam).id,
        confidence: casam.length === 1 ? 'alta' : 'media',
        method: 'id',
      };
    }
  }
  const distintas = classesDistintas(match.classes);
  if (distintas.length > 0) {
    const casam = segments.filter((s) => distintas.every((c) => contemClasse(s.htmlSnippet, c)));
    if (casam.length >= 1) {
      return {
        segmentId: maisEspecifico(casam).id,
        confidence: distintas.length >= 2 && casam.length === 1 ? 'media' : 'baixa',
        method: 'classes',
      };
    }
  }
  return { segmentId: '', confidence: 'nenhuma', method: 'nenhum' };
};

/**
 * Liga comportamentos de scroll aos segmentos pela assinatura do alvo. Baixa
 * confiança fica DETECTADA, não reproduzida (a regra: não associar só porque
 * dois elementos estão próximos). Ajusta a confiança do comportamento à da
 * associação (a pior). Comportamentos de runtime externo (target vazio) ficam à
 * parte — não se ligam a um segmento.
 */
export const associarScroll = (
  behaviors: ReadonlyArray<ScrollBehavior>,
  segments: ReadonlyArray<{ id: string; htmlSnippet: string }>,
): { porSegmento: Map<string, ScrollBehavior[]>; naoAssociados: ScrollBehavior[] } => {
  const porSegmento = new Map<string, ScrollBehavior[]>();
  const naoAssociados: ScrollBehavior[] = [];
  for (const b of behaviors) {
    if (b.kind === 'external-scroll-runtime' || (!b.target.id && b.target.classes.length === 0)) {
      naoAssociados.push(b);
      continue;
    }
    const assoc = associarPorMatch(b.target, segments);
    if (assoc.confidence === 'nenhuma' || assoc.segmentId === '') {
      naoAssociados.push(b);
      continue;
    }
    const ajustado: ScrollBehavior = {
      ...b,
      confidence: piorConfianca(b.confidence, assoc.confidence),
    };
    const arr = porSegmento.get(assoc.segmentId) ?? [];
    arr.push(ajustado);
    porSegmento.set(assoc.segmentId, arr);
  }
  return { porSegmento, naoAssociados };
};

/** O enriquecimento que a associação produz para UM segmento. */
export type EnriquecimentoSegmento = {
  /** Metadados dos estados (índice para o manifesto). */
  states: SegmentState[];
  /** Estados COM o HTML (para o arquivo de estados no vault). */
  storedStates: StoredState[];
  pipeline: SegmentInteraction[];
  related: RelatedElement[];
  dependencies: SegmentDependency[];
  confidence: Confidence;
  limitations: string[];
};

/** Elementos capturados não associados a nenhum segmento. */
export type NaoAssociado = { label: string; kind: string; motivo: string };

export type ResultadoAssociacao = {
  /** segmentId → enriquecimento. Só entra segmento que recebeu algo. */
  porSegmento: Map<string, EnriquecimentoSegmento>;
  naoAssociados: NaoAssociado[];
};

const CONF_RANK: Record<Confidence, number> = { alta: 3, media: 2, baixa: 1, nenhuma: 0 };
const piorConfianca = (a: Confidence, b: Confidence): Confidence =>
  CONF_RANK[a] <= CONF_RANK[b] ? a : b;

const RUNTIME_DE_CAPACIDADE = (
  caps: CapturedElement['assessment']['capabilities'],
): string | undefined => {
  if (caps.hasLottie) return 'lottie';
  if (caps.hasWebGL) return 'webgl';
  if (caps.hasCanvas) return 'canvas';
  return undefined;
};

/** Método de reprodução de um estado, a partir do gatilho e do que ele revela. */
const metodoDoEstado = (
  trigger: string,
  hasPortal: boolean,
): NonNullable<SegmentState['method']> => {
  if (hasPortal) return 'portal';
  if (trigger === 'hover' || trigger === 'focus') return 'css';
  return 'swap-html';
};

/**
 * Associa TODOS os elementos capturados aos segmentos e monta o enriquecimento
 * de cada um. É a ponte entre o manifesto e o que a Galeria/preview/Biblioteca
 * vão mostrar. Puro: recebe o manifesto e a lista de segmentos, devolve dados.
 */
export const associarManifesto = (
  elements: ReadonlyArray<CapturedElement>,
  segments: ReadonlyArray<{ id: string; htmlSnippet: string }>,
): ResultadoAssociacao => {
  const porSegmento = new Map<string, EnriquecimentoSegmento>();
  const naoAssociados: NaoAssociado[] = [];

  const novo = (): EnriquecimentoSegmento => ({
    states: [],
    storedStates: [],
    pipeline: [],
    related: [],
    dependencies: [],
    confidence: 'nenhuma',
    limitations: [],
  });

  for (const el of elements) {
    const runtime = RUNTIME_DE_CAPACIDADE(el.assessment.capabilities);
    const temEstados = el.states.length > 0;
    const temInteracao = el.interactions.length > 0 || temEstados || Boolean(runtime);
    if (!temInteracao) continue;

    const assoc = associarElemento(el, segments);
    const associado = assoc.confidence !== 'nenhuma' && assoc.segmentId !== '';

    if (!associado) {
      naoAssociados.push({
        label: el.label,
        kind: el.interactions[0] ?? 'interação',
        motivo:
          'Sem correspondência confiável com um segmento — interação preservada no manifesto, mas não ligada.',
      });
      continue;
    }

    const enr = porSegmento.get(assoc.segmentId) ?? novo();

    // Estados capturados → metadados (índice) + HTML (vault).
    for (const st of el.states) {
      const hasPortal = Boolean(st.portalHtml);
      const method = metodoDoEstado(st.trigger, hasPortal);
      enr.states.push({ id: st.id, trigger: st.trigger, label: st.label, method, hasPortal });
      enr.storedStates.push({
        id: st.id,
        trigger: st.trigger,
        label: st.label,
        method,
        hasPortal,
        html: st.html,
        portalHtml: st.portalHtml,
      });
      if (hasPortal) {
        enr.related.push({ kind: 'portal', label: st.label, stateId: st.id });
      }
    }

    // Interações → pipeline, cada uma com onde parou.
    const kinds = new Set(el.interactions);
    // Runtime externo detectado sem interação explícita ainda conta como sinal.
    if (runtime && kinds.size === 0) kinds.add('timer');
    for (const kind of kinds) {
      const status = statusDaInteracao({ kind, associated: true, hasStates: temEstados, runtime });
      enr.pipeline.push({
        kind,
        status,
        confidence: assoc.confidence,
        stateIds: el.states.map((s) => s.id),
        runtime,
        note: runtime ? `Depende de ${runtime} (runtime externo não embutido).` : undefined,
      });
    }

    // Dependências de runtime/asset.
    if (runtime) {
      enr.dependencies.push({ type: 'runtime', ref: runtime, runtime, bundled: false });
      enr.limitations.push(
        `Comportamento depende de ${runtime}, ainda não reproduzido isoladamente.`,
      );
    }
    if (el.assessment.capabilities.dependsOnExternalScript) {
      enr.dependencies.push({ type: 'external-script', ref: 'script externo', bundled: false });
    }

    enr.confidence =
      enr.confidence === 'nenhuma'
        ? assoc.confidence
        : piorConfianca(enr.confidence, assoc.confidence);
    porSegmento.set(assoc.segmentId, enr);
  }

  // Dedup de estados/pipeline repetidos e limitação para o que só foi associado.
  for (const enr of porSegmento.values()) {
    enr.states = dedup(enr.states, (s) => s.id);
    enr.storedStates = dedup(enr.storedStates, (s) => s.id);
    enr.related = dedup(enr.related, (r) => `${r.kind}:${r.stateId ?? r.label}`);
    enr.dependencies = dedup(enr.dependencies, (d) => `${d.type}:${d.ref}`);
    enr.pipeline = juntarPipeline(enr.pipeline);
    for (const it of enr.pipeline) {
      if (it.status === 'associated' && KINDS_REPRODUZIVEIS.has(it.kind)) {
        enr.limitations.push(
          `Interação "${it.kind}" associada mas sem estado capturado para reproduzir.`,
        );
      }
    }
    enr.limitations = [...new Set(enr.limitations)];
  }

  return { porSegmento, naoAssociados };
};

const dedup = <T>(xs: T[], key: (x: T) => string): T[] => {
  const vistos = new Set<string>();
  const saida: T[] = [];
  for (const x of xs) {
    const k = key(x);
    if (vistos.has(k)) continue;
    vistos.add(k);
    saida.push(x);
  }
  return saida;
};

/** Junta interações do mesmo kind, mantendo o status mais avançado. */
const juntarPipeline = (xs: SegmentInteraction[]): SegmentInteraction[] => {
  const porKind = new Map<string, SegmentInteraction>();
  for (const it of xs) {
    const atual = porKind.get(it.kind);
    if (!atual) {
      porKind.set(it.kind, { ...it, stateIds: [...it.stateIds] });
      continue;
    }
    // Mantém o de maior alcance; une os stateIds.
    const vencedor = statusRank(it.status) >= statusRank(atual.status) ? { ...it } : { ...atual };
    vencedor.stateIds = [...new Set([...atual.stateIds, ...it.stateIds])];
    porKind.set(it.kind, vencedor);
  }
  return [...porKind.values()];
};

const statusRank = (s: SegmentInteraction['status']): number =>
  ({
    detected: 1,
    captured: 2,
    associated: 3,
    replayable: 4,
    validated: 5,
    unsupported: 0,
    'external-runtime': 0,
  })[s];
