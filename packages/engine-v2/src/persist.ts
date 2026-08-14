import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type CaptureManifestV2,
  type Confidence,
  type DesignSystemId,
  type FidelityDimensions,
  type InteractionKind,
  type RejeitadosManifest,
  type SegmentInsight,
  type SegmentInteraction,
  type SegmentRecord,
  type SegmentScrollFile,
  type SegmentStatesFile,
  type SegmentsManifest,
  type StoredState,
  type SupportLevel,
  newSegmentId,
  vaultCaptureV2Dir,
  vaultCaptureV2Manifest,
  vaultRejeitadosPath,
  vaultSegmentScroll,
  vaultSegmentScrollDir,
  vaultSegmentStates,
  vaultSegmentStatesDir,
  vaultSegmentsDir,
  vaultSegmentsManifest,
} from '@ds/shared';
import type { ResultadoCaptura } from './engine.js';
import type { SegmentoV2 } from './segment/segment-v2.js';
import type { FilhoDeSecao } from './segment/subdividir.js';

/**
 * Persistência do V2 no formato que a Galeria já lê.
 *
 * Este arquivo é a razão de a Galeria, a Biblioteca, os Kits e a fila não terem
 * precisado mudar: o V2 produz `SegmentRecord` + `SegmentInsight` exatamente como
 * o V1 produzia, e escreve nos mesmos caminhos do vault. O que muda é a QUALIDADE
 * do que vai nesses campos — nome por evidência em vez de "Seção", fidelidade
 * medida em vez de adivinhada, limitação declarada em vez de omitida.
 *
 * O manifesto V2 vai para uma pasta SEPARADA (`capture-v2/`), e não sobrescreve a
 * `capture/` do V1: durante a migração os dois podem ter rodado no mesmo design
 * system, e comparar exige que nenhum apague o outro.
 */

/** Traduz a dimensão fina do V2 para o vocabulário que a Galeria já mostra. */
const paraSupport = (d: string | undefined): SupportLevel | undefined => {
  switch (d) {
    case 'portatil':
    case 'validado':
    case 'replayable':
      return 'completo';
    case 'runtime-preservado':
    case 'capturado':
    case 'associado':
    case 'parcial':
      return 'parcial';
    case 'referencia-visual':
      return 'visual';
    case 'externo':
      return 'externo';
    case 'unsupported':
      return 'nao-suportado';
    case 'detectado':
      return 'parcial';
    default:
      // `ausente` não é uma ressalva: a dimensão simplesmente não se aplica a
      // este item. Omitir é diferente de dizer "não suportado".
      return undefined;
  }
};

const dimensoesDoV2 = (seg: SegmentoV2): FidelityDimensions => {
  const f = seg.fidelity;
  const out: FidelityDimensions = {};
  // O scroll segue o gate do V1: `replayable` chega como `parcial` e só o
  // validador em navegador promove a `completo`. Declarar `completo` antes de
  // validar seria exatamente a desonestidade que o V2 existe para eliminar.
  const paraSupportScroll = (d: string | undefined): SupportLevel | undefined => {
    const s = paraSupport(d);
    return d === 'replayable' ? 'parcial' : s;
  };
  const por: Array<[keyof FidelityDimensions, string | undefined]> = [
    ['visual', f.visual],
    ['estrutura', f.estrutura],
    ['css', f.css],
    ['assets', f.assets],
    ['hover', f.hover],
    ['click', f.click],
    ['animacao', f.animation],
    ['runtime', f.runtime],
    ['portabilidade', f.portability],
    ['validacao', f.validation],
    ['temporal', f.temporal],
    ['pointer', f.pointer],
    ['drag', f.drag],
    ['keyboard', f.keyboard],
    ['background', f.background],
    ['media', f.media],
  ];
  for (const [chave, valor] of por) {
    const s = paraSupport(valor);
    if (s !== undefined) out[chave] = s;
  }
  const scroll = paraSupportScroll(f.scroll);
  if (scroll !== undefined) out.scroll = scroll;
  return out;
};

/**
 * O pipeline de interação de um segmento.
 *
 * O estado de cada interação sai do que FOI feito, não do que existe: `validated`
 * nunca nasce aqui (só o validador promove), e uma interação de cena sem DOM para
 * em `detected` porque não há como reproduzi-la como componente.
 */
const pipelineDoV2 = (seg: SegmentoV2, temEstados: boolean): SegmentInteraction[] => {
  const confianca: Confidence = seg.evidence.confidence;
  return seg.interactions.map((kind): SegmentInteraction => {
    const runtimes = seg.representation.runtimes;
    if (seg.representation.type === 'referencia-visual' && runtimes.length > 0) {
      return {
        kind,
        status: 'external-runtime',
        confidence: confianca,
        stateIds: [],
        runtime: runtimes[0],
        note: 'O movimento foi gravado; o runtime não foi reproduzido.',
      };
    }
    if (kind === 'pointer') {
      return {
        kind,
        status: 'detected',
        confidence: confianca,
        stateIds: [],
        note: 'Reação de cena ao ponteiro: medida, sem elemento DOM para reproduzir.',
      };
    }
    const cssNativa = kind === 'hover' || kind === 'focus' || kind === 'focus-visible';
    if (cssNativa) {
      return { kind, status: 'replayable', confidence: confianca, stateIds: [] };
    }
    return {
      kind,
      status: temEstados ? 'replayable' : 'detected',
      confidence: confianca,
      stateIds: seg.evidence.stateIds,
    };
  });
};

/** Capabilities no formato do V1, a partir do que o V2 mediu. */
const capabilitiesDoV2 = (seg: SegmentoV2, m: CaptureManifestV2) => {
  const midias = m.mediaDetections.filter((x) => seg.evidence.mediaIds.includes(x.id));
  const runtimes = m.runtimeDetections.filter((x) => seg.evidence.runtimeIds.includes(x.id));
  return {
    hasCanvas: midias.some(
      (x) => x.kind === 'canvas-2d' || x.kind === 'webgl' || x.kind === 'webgl2',
    ),
    hasWebGL: midias.some((x) => x.kind === 'webgl' || x.kind === 'webgl2'),
    hasVideo: midias.some((x) => x.kind === 'video'),
    hasIframe: midias.some((x) => x.kind === 'iframe'),
    hasLottie: runtimes.some((x) => x.kind === 'lottie') || midias.some((x) => x.kind === 'lottie'),
    hasAnimatedSvg: midias.some((x) => x.kind === 'svg-animado'),
    // Medido, não inferido do nome da classe: só é `true` se houve movimento.
    hasCssAnimation: seg.fidelity.animation === 'replayable',
    dependsOnExternalScript: runtimes.some((x) => x.scripts.length > 0),
    dependsOnJs: runtimes.length > 0 || seg.evidence.stateIds.length > 0,
    hasPortal:
      m.stateGraph?.nodes.some(
        (n) => n.portalHtmlRef !== undefined && seg.evidence.stateIds.includes(n.id),
      ) ?? false,
  };
};

/** Blobs saem do motor com o separador do SO; a referência gravada é portátil. */
const normalizarRef = (ref: string | undefined): string | undefined => ref?.replace(/\\/g, '/');

/**
 * O gatilho REAL de um estado sai da aresta do grafo que chega nele
 * (`StateEdge.to === node.id`), traduzido para o vocabulário que o preview já
 * exibe. O rótulo rico ("menu aberto") continua no `label` do próprio nó.
 */
const triggerDoEstado = (m: CaptureManifestV2, nodeId: string): string => {
  const aresta = m.stateGraph?.edges.find((e) => e.to === nodeId);
  if (aresta === undefined) return 'initial';
  switch (aresta.kind) {
    case 'hover':
      return 'hover';
    case 'focar-campo':
      return 'focus';
    default:
      // Inclui `teclado`: ativação por Enter/Espaço é o mesmo gesto do clique.
      return 'click';
  }
};

export type ResultadoPersistencia = {
  designSystemId: DesignSystemId;
  segments: SegmentRecord[];
  insights: SegmentInsight[];
  manifestPath: string;
  /** Caminho do manifesto V2 gravado. */
  manifestoV2Path: string;
};

/**
 * Grava tudo o que a Galeria precisa. Não toca no banco — quem faz isso é o
 * `segmentar.ts`, que já é idempotente e transacional.
 */
export const persistirCapturaV2 = (
  dsId: DesignSystemId,
  captura: ResultadoCaptura,
): ResultadoPersistencia => {
  const m = captura.manifesto;

  mkdirSync(vaultCaptureV2Dir(dsId), { recursive: true });
  const manifestoV2Path = vaultCaptureV2Manifest(dsId);
  writeFileSync(manifestoV2Path, `${JSON.stringify(m, null, 2)}\n`, 'utf8');

  // A evidência da Refinaria, ao lado do manifesto. Sem ela, toda mudança de
  // critério de corte exigia recapturar o site inteiro (35 a 40 minutos de
  // navegador para exercitar funções de milissegundos). Sem indentação: é
  // insumo de máquina, e o manifesto indentado já custa o dobro do necessário.
  if (captura.evidencia !== undefined) {
    writeFileSync(
      join(vaultCaptureV2Dir(dsId), 'evidencia.json'),
      JSON.stringify(captura.evidencia),
      'utf8',
    );
  }

  const segments: SegmentRecord[] = [];
  const insights: SegmentInsight[] = [];
  /** Filhos de cada seção, esperando o id do pai já gerado para serem gravados. */
  const filhosDosPais: Array<{ paiId: `seg_${string}`; filhos: FilhoDeSecao[] }> = [];
  const statesDir = vaultSegmentStatesDir(dsId);
  const scrollDir = vaultSegmentScrollDir(dsId);
  let escreveuEstado = false;
  let escreveuScroll = false;

  for (const seg of captura.segmentos) {
    const id = newSegmentId();

    // Estados: só os que têm HTML gravado dão para reproduzir no preview.
    const nosDoSegmento = (m.stateGraph?.nodes ?? []).filter((n) =>
      seg.evidence.stateIds.includes(n.id),
    );
    const armazenados: StoredState[] = [];
    for (const n of nosDoSegmento) {
      // Um estado sem NENHUM blob não tem o que reproduzir. Um estado só de
      // portal (modal montado fora da subtree) é reproduzível — não pode ser
      // descartado só porque o escopo em si não mudou.
      if (n.htmlRef === undefined && n.portalHtmlRef === undefined) continue;
      // O HTML do estado foi gravado pelo motor em `capture-v2/states/`; aqui só
      // referenciamos (`htmlRef`, relativo a `capture-v2/`). Copiar o blob
      // duplicaria peso sem ganho — o preview resolve a referência ao servir.
      armazenados.push({
        id: n.id,
        trigger: triggerDoEstado(m, n.id),
        label: n.label,
        // `portal` diz ao runtime do preview para aplicar SÓ o portalHtml; um
        // estado que também muda o escopo precisa de `swap-html` (que aplica os
        // dois). Portanto: `portal` apenas quando não há blob de escopo.
        method: n.htmlRef === undefined ? 'portal' : 'swap-html',
        hasPortal: n.portalHtmlRef !== undefined,
        html: '',
        portalHtml: undefined,
        htmlRef: normalizarRef(n.htmlRef),
        portalHtmlRef: normalizarRef(n.portalHtmlRef),
      });
    }

    segments.push({
      id,
      designSystemId: dsId,
      category: seg.category,
      kind: seg.kind,
      name: seg.name,
      htmlSnippet: seg.htmlSnippet,
      previewPath: null,
      position: seg.position,
      inLibrary: false,
      parentId: null,
    });
    if (seg.filhos.length > 0) filhosDosPais.push({ paiId: id, filhos: seg.filhos });

    const caps = capabilitiesDoV2(seg, m);
    const temEstados = armazenados.length > 0;
    const scroll = (m.scrollObservations ?? []).filter((s) =>
      seg.evidence.scrollIds.includes(s.id),
    );

    insights.push({
      segmentId: id,
      support: seg.support,
      renderMode: seg.representation.renderMode ?? 'html',
      // A nota vem da representação, não de uma tabela fixa: uma cápsula que
      // executa vale mais que uma referência que só mostra.
      fidelity:
        seg.representation.type === 'componente-portatil'
          ? 90
          : seg.representation.type === 'capsula-runtime'
            ? 70
            : 45,
      warnings: seg.limitations,
      capabilities: caps,
      interactions: seg.interactions.map((kind: InteractionKind) => ({
        kind,
        support: seg.support,
      })),
      states: armazenados.map((s) => ({
        id: s.id,
        trigger: s.trigger,
        label: s.label,
        method: s.method,
        hasPortal: s.hasPortal,
      })),
      framePath: normalizarRef(seg.framePath),
      pipeline: pipelineDoV2(seg, temEstados),
      dimensions: dimensoesDoV2(seg),
      scroll: scroll.length > 0 ? scroll : undefined,
      confidence: seg.evidence.confidence,
      dependencies: m.runtimeDetections
        .filter((r) => seg.evidence.runtimeIds.includes(r.id))
        .map((r) => ({
          type: 'runtime' as const,
          ref: r.label,
          runtime: r.kind,
          // Embutida só quando a representação é cápsula: aí o runtime viaja.
          bundled: seg.representation.type === 'capsula-runtime',
        })),
    });

    if (armazenados.length > 0) {
      if (!escreveuEstado) {
        mkdirSync(statesDir, { recursive: true });
        escreveuEstado = true;
      }
      const arquivo: SegmentStatesFile = {
        segmentId: id,
        generatedAt: Date.now(),
        states: armazenados,
      };
      writeFileSync(vaultSegmentStates(dsId, id), `${JSON.stringify(arquivo, null, 2)}\n`, 'utf8');
    }

    if (scroll.length > 0) {
      if (!escreveuScroll) {
        mkdirSync(scrollDir, { recursive: true });
        escreveuScroll = true;
      }
      const arquivo: SegmentScrollFile = {
        segmentId: id,
        generatedAt: Date.now(),
        behaviors: scroll,
      };
      writeFileSync(vaultSegmentScroll(dsId, id), `${JSON.stringify(arquivo, null, 2)}\n`, 'utf8');
    }
  }

  // Filhos das seções: as peças de dentro (botão, card, badge…), gravadas como
  // `SegmentRecord` com `parentId` — sem bundle de compilador e SEM insight na
  // v1 (a UI já tolera `fidelity: null`; o preview cai no caminho clássico).
  // A `position` continua DEPOIS de todas as seções, para o esquema de pastas
  // dos bundles não mudar: a seção i segue sendo `seg_<i>`. No manifesto os
  // pais vêm primeiro, filhos depois — a FK do banco exige essa ordem no insert.
  let posicaoFilho = captura.segmentos.length;
  for (const { paiId, filhos } of filhosDosPais) {
    for (const filho of filhos) {
      segments.push({
        id: newSegmentId(),
        designSystemId: dsId,
        category: filho.category,
        kind: filho.kind,
        name: filho.name,
        htmlSnippet: filho.htmlSnippet,
        previewPath: null,
        position: posicaoFilho,
        inLibrary: false,
        parentId: paiId,
      });
      posicaoFilho++;
    }
  }

  mkdirSync(vaultSegmentsDir(dsId), { recursive: true });
  const manifest: SegmentsManifest = {
    designSystemId: dsId,
    generatedAt: Date.now(),
    segments,
    insights,
    capturaParcial:
      m.captureMode === 'completo'
        ? undefined
        : {
            fase: m.telemetry?.faseInterrompida ?? m.captureMode,
            motivo: m.partialReasons[0] ?? m.telemetry?.motivo,
            totalMs: m.telemetry?.totalMs ?? 0,
          },
  };
  const manifestPath = vaultSegmentsManifest(dsId);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  // Gerações MORTAS de scroll/states saem junto com a gravação da nova. Medido
  // no acervo: 141 arquivos de scroll com só 44 válidos — qualquer leitor que
  // listasse o diretório (em vez de resolver por id) lia comportamento de uma
  // captura que não existe mais.
  const idsVivos = new Set<string>(segments.map((s) => s.id));
  for (const dirGeracoes of [statesDir, scrollDir]) {
    if (!existsSync(dirGeracoes)) continue;
    try {
      for (const nome of readdirSync(dirGeracoes)) {
        const semExtensao = nome.replace(/\.json$/i, '');
        const idDoArquivo = semExtensao.split('-')[0] ?? '';
        if (!idDoArquivo.startsWith('seg_')) continue;
        if (!idsVivos.has(idDoArquivo)) rmSync(join(dirGeracoes, nome), { force: true });
      }
    } catch {
      // limpeza é cortesia: falhar aqui não pode derrubar a persistência
    }
  }

  // Os reprovados vão para a Revisão COM o motivo — nunca somem calados. A
  // categoria e o HTML são os REAIS: a tela de Revisão mostra a prévia do bloco
  // reprovado, e um comentário vazio ali seria um card em branco.
  const rejeitados: RejeitadosManifest = {
    designSystemId: dsId,
    generatedAt: Date.now(),
    rejeitados: captura.rejeitados.map((r, i) => ({
      id: newSegmentId(),
      designSystemId: dsId,
      category: r.category,
      kind: 'component' as const,
      name: r.name.length > 0 ? r.name : 'Bloco reprovado',
      htmlSnippet: r.htmlSnippet.length > 0 ? r.htmlSnippet : `<!-- ${r.motivos.join(' | ')} -->`,
      position: i,
      motivos: r.motivos,
    })),
  };
  writeFileSync(vaultRejeitadosPath(dsId), `${JSON.stringify(rejeitados, null, 2)}\n`, 'utf8');

  return { designSystemId: dsId, segments, insights, manifestPath, manifestoV2Path };
};
