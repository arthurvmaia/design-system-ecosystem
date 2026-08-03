import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Recolorabilidade } from '@ds/composer';
import { runExtraction } from '@ds/extractor';
import { getDb, tables } from '@ds/indexer';
import { segmentDesignSystem } from '@ds/segmenter';
import {
  CATEGORIAS_DE_PECA,
  CreateDesignSystemInput,
  SegmentValidationFile,
  SegmentsManifest,
  aplicarValidacoes,
  ehDesignSystemId,
  listarAssetsFaltando,
  podeApagarDesignSystem,
  resumirPipeline,
  suporteAposVereditos,
  vaultCaptureV2Manifest,
  vaultDir,
  vaultDsDir,
  vaultExtractedDir,
  vaultSegmentValidation,
  vaultSegmentsManifest,
} from '@ds/shared';
import type {
  AncoraDeMidia,
  ComportamentoParaAncora,
  InteracaoNaoAssociada,
  MidiaParaAncora,
  ResultadoValidacaoSegmento,
  SegmentInsight,
  Veredito,
} from '@ds/shared';
import {
  ancorasDeMidia,
  enqueueJob,
  explicarAncora,
  procedenciaDaPrevia,
  vereditosDoSegmento,
} from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { getModels } from '../lib/anthropic.js';
import { type ChaveDeBundle, type RepresentacaoBundle, lerBundleInfo } from '../lib/bundle-v2.js';
import { isQueueMode } from '../lib/execution-mode.js';
import { exigeSenhaDeAcao } from '../lib/exige-senha-de-acao.js';
import { recolorabilidadeDoBundle } from '../lib/recolorabilidade-do-bundle.js';
import { enqueueTask } from '../lib/task-queue.js';
import { validarPreviews } from '../lib/validate-preview.js';

export const designSystemsRoute = new Hono();

designSystemsRoute.get('/', (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(tables.designSystems)
    .orderBy(desc(tables.designSystems.extractedAt))
    .all();
  return c.json({ items: rows });
});

designSystemsRoute.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  if (!ehDesignSystemId(id)) return c.json({ error: 'invalid_id' }, 400);
  const row = db.select().from(tables.designSystems).where(eq(tables.designSystems.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  // Integridade dos assets. Sem isto, uma extração que não gravou o CSS fica
  // idêntica a uma boa na listagem e só se revela nas prévias em branco.
  let assetsFaltando: string[] = [];
  const htmlPath = join(vaultExtractedDir(id), 'design-system.html');
  if (existsSync(htmlPath)) {
    assetsFaltando = listarAssetsFaltando(vaultExtractedDir(id), readFileSync(htmlPath, 'utf8'));
  }

  return c.json({ item: row, assetsFaltando });
});

/**
 * Insights de fidelidade + interações não associadas, do manifesto no vault.
 * Ficam em JSON (não no banco) para não exigir migration: a rota junta ao vivo.
 * Manifesto antigo sem esses campos simplesmente devolve vazios.
 */
const lerManifesto = (
  dsId: string,
): {
  insights: Map<string, SegmentInsight>;
  naoAssociados: InteracaoNaoAssociada[];
  capturaParcial: SegmentsManifest['capturaParcial'];
  /**
   * Todos os segmentos do MANIFESTO (não só as linhas vivas do banco). A
   * associação da conferência de pixel se mede sobre o que a captura escreveu:
   * um segmento excluído na triagem some da lista, mas continua contando na
   * ordem das comparações gravadas.
   */
  segmentos: Array<{ id: string; position: number; parentId: string | null }>;
} => {
  const path = vaultSegmentsManifest(dsId as `ds_${string}`);
  if (!existsSync(path))
    return { insights: new Map(), naoAssociados: [], capturaParcial: undefined, segmentos: [] };
  try {
    const manifest = SegmentsManifest.parse(JSON.parse(readFileSync(path, 'utf8')));
    return {
      insights: new Map((manifest.insights ?? []).map((i) => [i.segmentId, i])),
      naoAssociados: manifest.naoAssociados ?? [],
      capturaParcial: manifest.capturaParcial,
      segmentos: manifest.segments.map((s) => ({
        id: s.id,
        position: s.position,
        parentId: s.parentId ?? null,
      })),
    };
  } catch {
    return { insights: new Map(), naoAssociados: [], capturaParcial: undefined, segmentos: [] };
  }
};

// ── Conferência de pixel e declarações do bundle ─────────────────────────────

/** O que a Galeria mostra da conferência de pixel de um segmento. Frações 0..1. */
type ConferenciaDePixel = { delta: number; limiar: number; passou: boolean };

/** Uma comparação como está no manifesto V2, sem round-trip de schema. */
type ComparacaoBruta = { a: string; b: string; delta: number; threshold: number; ok: boolean };

/**
 * As comparações de pixel do manifesto V2, lidas UMA vez por design system.
 * Parse cru de propósito: o manifesto passa de 1 MB e a listagem só precisa
 * deste array; validar o documento inteiro por schema custaria mais do que a
 * informação vale.
 */
const lerComparacoesV2 = (dsId: string): ComparacaoBruta[] => {
  const path = vaultCaptureV2Manifest(dsId as `ds_${string}`);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { visualComparisons?: unknown };
    if (!Array.isArray(raw.visualComparisons)) return [];
    return raw.visualComparisons.filter(
      (c): c is ComparacaoBruta =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as ComparacaoBruta).a === 'string' &&
        typeof (c as ComparacaoBruta).b === 'string' &&
        typeof (c as ComparacaoBruta).delta === 'number' &&
        typeof (c as ComparacaoBruta).threshold === 'number' &&
        typeof (c as ComparacaoBruta).ok === 'boolean',
    );
  } catch {
    return [];
  }
};

/**
 * As mídias detectadas na captura, lidas UMA vez por design system.
 *
 * Parse cru pelo mesmo motivo das comparações: o manifesto passa de 1 MB e daqui
 * só interessa a identidade de cada mídia (id e classes estáveis) — é por ela
 * que a âncora de rolagem casa, e não pela seção dona.
 */
const lerMidiasV2 = (dsId: string): MidiaParaAncora[] => {
  const path = vaultCaptureV2Manifest(dsId as `ds_${string}`);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { mediaDetections?: unknown };
    if (!Array.isArray(raw.mediaDetections)) return [];
    return raw.mediaDetections
      .filter(
        (m): m is { id: string; kind: string; fingerprint?: MidiaParaAncora['fingerprint'] } =>
          typeof m === 'object' &&
          m !== null &&
          typeof (m as { id?: unknown }).id === 'string' &&
          typeof (m as { kind?: unknown }).kind === 'string',
      )
      .map((m) => ({ id: m.id, kind: m.kind, fingerprint: m.fingerprint ?? null }));
  } catch {
    return [];
  }
};

/** Uma âncora como a Galeria mostra: a medida, mais a frase e o tipo da mídia. */
type AncoraNaTela = AncoraDeMidia & { midiaKind: string; frase: string };

/** Os conjuntos de classes de cada `class="..."` do HTML. */
const classesDoHtml = (html: string): Set<string>[] => {
  const out: Set<string>[] = [];
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    const lista = (m[1] ?? '').split(/\s+/).filter((c) => c !== '');
    if (lista.length > 0) out.push(new Set(lista));
  }
  return out;
};

/**
 * A mídia está DENTRO desta peça, ou só passa por baixo dela?
 *
 * A pergunta não é acadêmica. Medido no acervo: o canvas WebGL de fundo da
 * página apareceu como âncora de SEIS peças — hero, cards, galeria, CTA, rodapé
 * e o próprio fundo. Ele é `position: fixed` e cobre a página inteira, então o
 * motor o associou a toda seção que ele atravessa, corretamente: para desenhar
 * aquela dobra, ele conta. Mas quem lê "esta peça tem mídia presa à rolagem"
 * entende que vai poder trocar o arquivo — e no hero não há arquivo nenhum para
 * trocar. Cinco das seis seriam âncoras de dono errado.
 *
 * O corte é o HTML da própria peça: o elemento está no recorte, ou não está.
 */
export const midiaEstaNoHtml = (midia: MidiaParaAncora, html: string): boolean => {
  const id = midia.fingerprint?.id ?? null;
  if (id !== null && id !== '') return html.includes(`id="${id}"`) || html.includes(`id='${id}'`);
  const classes = midia.fingerprint?.stableClasses ?? [];
  // Sem id e sem classe não há como afirmar identidade — e afirmar por palpite
  // é justamente o que produz a âncora inventada.
  if (classes.length === 0) return false;
  return classesDoHtml(html).some((conjunto) => classes.every((c) => conjunto.has(c)));
};

/**
 * As mídias deste segmento que estão presas a um ponto da rolagem.
 *
 * Dois filtros, e os dois são necessários:
 *
 * 1. O cruzamento usa os comportamentos que o motor JÁ associou a este segmento
 *    (`insight.scroll`), e não a lista da página inteira.
 * 2. A mídia tem de estar no HTML DESTA peça — ver `midiaEstaNoHtml`.
 *
 * Só o primeiro deixava passar o fundo fixo em cinco peças que não o contêm.
 */
export const ancorasDoSegmento = (
  midias: readonly MidiaParaAncora[],
  insight: { scroll?: readonly ComportamentoParaAncora[] } | null,
  html: string,
): AncoraNaTela[] => {
  const comportamentos = insight?.scroll ?? [];
  if (midias.length === 0 || comportamentos.length === 0) return [];
  const proprias = midias.filter((m) => midiaEstaNoHtml(m, html));
  if (proprias.length === 0) return [];
  const porId = new Map(proprias.map((m) => [m.id, m]));
  return ancorasDeMidia(proprias, comportamentos).map((a) => ({
    ...a,
    midiaKind: porId.get(a.midiaId)?.kind ?? 'midia',
    frase: explicarAncora(a),
  }));
};

/**
 * O que a listagem precisa do bundle de um segmento: a representação declarada,
 * as limitações que o compilador escreveu e o alcance da marca. `null` =
 * segmento sem bundle (fluxo V1 ou subcomponente).
 *
 * Passa por `lerBundleInfo` desde a chave composta. Antes montava o caminho
 * `seg_<position>` à mão, o que tinha duas consequências: a resolução por
 * identidade não valia aqui (a listagem podia declarar as limitações do
 * vizinho), e a listagem discordava do preview sobre O QUE É TER BUNDLE — um
 * manifest sem `representation.type` válido contava aqui e não contava lá.
 * Agora é a mesma decisão nos dois lugares, que é o mínimo para a procedência
 * do card não mentir sobre a prévia que o card vai carregar.
 */
const lerBundleParaListagem = (
  dsId: string,
  chave: ChaveDeBundle,
): {
  limitacoes: string[];
  representacao: RepresentacaoBundle;
  marca: Recolorabilidade | null;
} | null => {
  const b = lerBundleInfo(dsId as `ds_${string}`, chave);
  if (b === null) return null;
  return {
    limitacoes: b.limitacoes,
    representacao: b.representation,
    // Quanto da peça a marca do usuário alcança. Sai daqui e não do
    // compilador porque precisa valer para o acervo que já está em disco.
    marca: recolorabilidadeDoBundle(b.dir),
  };
};

/**
 * Liga cada comparação de pixel ao segmento dela — só quando dá para AFIRMAR.
 *
 * O schema `VisualComparison` não tem chave por segmento (decisão antiga,
 * confirmada em `validate-preview.ts`), então a única associação possível é
 * pela ordem de escrita:
 *
 * - Na captura, o motor compara os bundles na ordem de posição dos segmentos
 *   que têm print da dobra, e um item pulado NÃO deixa marca no array. A ordem
 *   só é confiável quando a cobertura foi completa: mesmo tamanho dos dois
 *   lados, tudo `captura`×`bundle`.
 * - Na validação por preview, só cápsulas de runtime são comparadas, em ordem
 *   de conclusão (workers concorrentes). Com uma única cápsula não há o que
 *   confundir; com mais de uma, a ordem não diz nada.
 *
 * Fora desses dois casos a medição existe mas não tem dono identificável, e
 * atribuí-la por palpite seria pintar número de medição. Fica sem dono.
 */
const associarConferencias = (opts: {
  comparacoes: ComparacaoBruta[];
  /** Ids dos segmentos COM print da dobra, em ordem de posição. */
  comFrame: string[];
  /** Ids dos segmentos cuja representação é cápsula de runtime, em ordem. */
  capsulas: string[];
}): Map<string, ConferenciaDePixel> => {
  const out = new Map<string, ConferenciaDePixel>();
  const cs = opts.comparacoes;
  if (cs.length === 0) return out;

  const resumo = (c: ComparacaoBruta): ConferenciaDePixel => ({
    delta: c.delta,
    limiar: c.threshold,
    passou: c.ok,
  });

  const daCaptura = cs.every((c) => c.a === 'captura' && c.b === 'bundle');
  if (daCaptura && cs.length === opts.comFrame.length) {
    cs.forEach((c, i) => {
      const id = opts.comFrame[i];
      if (id !== undefined) out.set(id, resumo(c));
    });
    return out;
  }

  const daValidacao = cs.every((c) => c.b === 'preview');
  const unica = cs[0];
  const capsula = opts.capsulas[0];
  if (
    daValidacao &&
    cs.length === 1 &&
    opts.capsulas.length === 1 &&
    unica !== undefined &&
    capsula !== undefined
  ) {
    out.set(capsula, resumo(unica));
  }
  return out;
};

/**
 * Registros de validação em navegador, agrupados por segmento. É o que permite
 * mostrar `validated` na Galeria — mas só onde a reprodução foi de fato
 * executada e conferida. Ausente → nada é promovido (tudo continua no máximo
 * `replayable`, que é a verdade honesta).
 */
const lerValidacoes = (dsId: string): Map<string, ResultadoValidacaoSegmento[]> => {
  const path = vaultSegmentValidation(dsId as `ds_${string}`);
  if (!existsSync(path)) return new Map();
  try {
    const file = SegmentValidationFile.parse(JSON.parse(readFileSync(path, 'utf8')));
    const mapa = new Map<string, ResultadoValidacaoSegmento[]>();
    for (const r of file.results) {
      const atual = mapa.get(r.segmentId);
      if (atual) atual.push(r);
      else mapa.set(r.segmentId, [r]);
    }
    return mapa;
  } catch {
    return new Map();
  }
};

/**
 * Aplica os registros de validação ao insight, promovendo replayable→validated
 * e REBAIXANDO o que reprovou em navegador.
 *
 * O rebaixamento é o que faltava. Um resultado de `capsula` não casava com
 * nenhum ramo aqui: não virava limitação, não mexia no selo, não chegava à
 * tela. A peça que abriu num navegador e não pareceu com a captura ficava
 * indistinguível de uma que passou.
 */
const comValidacoes = (
  insight: SegmentInsight,
  resultados: ResultadoValidacaoSegmento[] | undefined,
  vereditos?: readonly Veredito[],
): SegmentInsight => {
  let out = insight;
  const limitacoesExtra: string[] = [];

  if (vereditos !== undefined) {
    const rebaixado = suporteAposVereditos(out.support, vereditos);
    if (rebaixado !== out.support) {
      out = { ...out, support: rebaixado };
      const porQue = vereditos.find((v) => v.canal === 'navegador' && v.estado === 'falhou');
      limitacoesExtra.push(
        `Abri esta peça sozinha num navegador e ela não apareceu como na captura${
          porQue?.motivo ? `: ${porQue.motivo}` : '.'
        }`,
      );
    }
  }

  if (!resultados || resultados.length === 0) {
    return limitacoesExtra.length > 0
      ? { ...out, limitations: [...new Set([...(out.limitations ?? []), ...limitacoesExtra])] }
      : out;
  }

  // Interações (pipeline): replayable → validated pelo resultado real.
  if (insight.pipeline && insight.pipeline.length > 0) {
    const { pipeline, limitacoes } = aplicarValidacoes(insight.pipeline, resultados);
    out = { ...out, pipeline };
    limitacoesExtra.push(...limitacoes);
  }

  // Scroll: o efeito foi reproduzido e conferido em navegador → promove a
  // dimensão de `parcial` para `completo`. Falha mantém `parcial` (honesto).
  const rScroll = resultados.find((r) => r.kind === 'scroll');
  if (rScroll && out.dimensions?.scroll === 'parcial') {
    if (rScroll.ok) {
      out = { ...out, dimensions: { ...out.dimensions, scroll: 'completo' } };
    } else {
      limitacoesExtra.push('Validação do scroll falhou — mantido como reproduzível, não validado.');
    }
  }

  return limitacoesExtra.length > 0
    ? { ...out, limitations: [...new Set([...(out.limitations ?? []), ...limitacoesExtra])] }
    : out;
};

designSystemsRoute.get('/:id/segments', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  if (!ehDesignSystemId(id)) return c.json({ error: 'invalid_id' }, 400);
  const rows = db
    .select()
    .from(tables.segments)
    .where(eq(tables.segments.designSystemId, id))
    .orderBy(asc(tables.segments.position))
    .all();
  const { insights, naoAssociados, capturaParcial, segmentos } = lerManifesto(id);
  const validacoes = lerValidacoes(id);

  // A medição que ficava invisível: a conferência de pixel do manifesto V2 e as
  // limitações que cada bundle declarou. O manifesto de captura é lido UMA vez;
  // os manifests de bundle, um por seção (medido no acervo real: 12 a 32 KB
  // cada, 8 a 12 seções por extração — leitura local barata).
  const bundles = new Map<
    string,
    { limitacoes: string[]; representacao: RepresentacaoBundle; marca: Recolorabilidade | null }
  >();
  for (const s of segmentos) {
    if (s.parentId !== null) continue; // subcomponente não tem bundle próprio
    const b = lerBundleParaListagem(id, {
      position: s.position,
      framePath: insights.get(s.id)?.framePath ?? null,
    });
    if (b !== null) bundles.set(s.id, b);
  }
  const midias = lerMidiasV2(id);
  const ordenados = [...segmentos].sort((a, b) => a.position - b.position);
  const conferencias = associarConferencias({
    comparacoes: lerComparacoesV2(id),
    comFrame: ordenados.filter((s) => insights.get(s.id)?.framePath !== undefined).map((s) => s.id),
    capsulas: ordenados
      .filter((s) => bundles.get(s.id)?.representacao === 'capsula-runtime')
      .map((s) => s.id),
  });

  // Resumo na listagem (contagens por estado de interação); o detalhe pesado —
  // o HTML dos estados — só é servido pela rota de preview.
  const items = rows.map((r) => {
    const bruto = insights.get(r.id) ?? null;
    const bundle = bundles.get(r.id);
    const conferencia = conferencias.get(r.id);
    // Os quatro canais, sempre os quatro, com motivo até quando não rodaram.
    // É o que separa "conferi e está bom" de "ninguém conferiu" — a distinção
    // que a tela não fazia, e que fazia ausência de medição ler como aprovação.
    const vereditos = vereditosDoSegmento({
      resultados: validacoes.get(r.id) ?? [],
      pixel: conferencia,
      temBundle: bundle !== undefined,
      capturaParcial: capturaParcial !== undefined,
    });
    // De onde vem o que a prévia do card mostra. Sai do MESMO fato que decide a
    // prévia (existe pacote para este segmento?), então card e iframe não podem
    // discordar. Um subcomponente não tem pacote próprio: a prévia dele é a
    // origem, e o entregável sai do pacote da seção de onde ele foi recortado.
    const procedencia = procedenciaDaPrevia({
      representacao: bundle?.representacao ?? null,
      paiTemPacote: r.parentId !== null && bundles.has(r.parentId),
    });
    const insight = bruto
      ? { ...comValidacoes(bruto, validacoes.get(r.id), vereditos), procedencia }
      : null;
    // Mídia presa à rolagem: nesta peça a imagem não é "uma imagem", é "esta
    // imagem neste ponto da página". Quem for trocar o arquivo precisa saber o
    // enquadramento antes, não depois de o site sair estranho.
    const ancoras = ancorasDoSegmento(midias, bruto, r.htmlSnippet);
    return {
      ...r,
      fidelity: insight,
      resumo: insight?.pipeline ? resumirPipeline(insight.pipeline) : null,
      // `limitacoes` presente = o segmento TEM bundle (mesmo que a lista venha
      // vazia); é como o front distingue "não medido" de "não se aplica".
      ...(bundle !== undefined ? { limitacoes: bundle.limitacoes } : {}),
      ...(conferencia !== undefined ? { comparacaoVisual: conferencia } : {}),
      // Quanto da peça a marca do usuário vai alcançar. Ausente quando não há
      // folha para medir — a tela não promete nem acusa o que não mediu.
      ...(bundle?.marca != null ? { marca: bundle.marca } : {}),
      ...(ancoras.length > 0 ? { ancoras } : {}),
      // Também no topo do item, e não só dentro de `fidelity`: subcomponente e
      // rejeitado recuperado não têm insight nenhum (`fidelity: null`), e são
      // exatamente os casos em que a prévia é a origem. Se a procedência
      // viajasse só dentro do insight, ela sumiria onde mais importa. É o mesmo
      // objeto nos dois lugares, calculado uma vez.
      procedencia,
      vereditos,
    };
  });
  return c.json({ items, naoAssociados, capturaParcial });
});

/**
 * Impacto de apagar uma extração: o que deixa de existir e o que sobrevive.
 * A interface mostra isso ANTES do delete, para a confirmação ser informada.
 */
designSystemsRoute.get('/:id/impacto', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  if (!ehDesignSystemId(id)) return c.json({ error: 'invalid_id' }, 400);
  const segs = db
    .select({ id: tables.segments.id })
    .from(tables.segments)
    .where(eq(tables.segments.designSystemId, id))
    .all();
  const componentes = db
    .select({ id: tables.libraryComponents.id, name: tables.libraryComponents.name })
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.designSystemId, id))
    .all();
  return c.json({
    segmentos: segs.length,
    // Componentes da Biblioteca são cópias (bundle próprio em library/), então
    // sobrevivem — mas as prévias deles perdem fontes e runtime do head da
    // origem. É perda de fidelidade, não de dados.
    componentesDaBiblioteca: componentes,
  });
});

/**
 * Apagar um design system apaga os ARQUIVOS dele também.
 *
 * Havia um `TODO` aqui esperando um coletor de lixo que nunca veio, e o efeito
 * foi medido: o vault tinha 851 MB e **30 das 32 pastas eram órfãs** — cada
 * exclusão feita na tela deixava a captura inteira para trás, invisível e para
 * sempre. Uma pasta que o app não mostra e não sabe abrir não é backup: é
 * espaço ocupado sem dono.
 *
 * Os componentes que a pessoa promoveu para a Biblioteca NÃO são afetados: eles
 * são cópias autônomas em `library/<cmp>/`, e é exatamente por isso que a
 * promoção copia em vez de referenciar.
 *
 * A remoção é guardada por caminho: só apaga o que está DENTRO do vault e cujo
 * nome é um id de design system. Um `id` vindo da URL nunca escolhe sozinho
 * qual diretório some do disco.
 */
designSystemsRoute.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  if (!ehDesignSystemId(id)) return c.json({ error: 'id_invalido' }, 400);

  db.delete(tables.designSystems).where(eq(tables.designSystems.id, id)).run();

  let arquivosRemovidos = false;
  const dir = vaultDsDir(id);
  if (podeApagarDesignSystem(dir, vaultDir(), id) && existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
      arquivosRemovidos = true;
    } catch {
      // Arquivo preso por outro processo (a prévia aberta numa aba, por
      // exemplo): a linha já saiu do banco, então o app não mostra mais nada.
      // O `pnpm acervo:limpar-orfas` recolhe o que ficou.
    }
  }
  return c.json({ deleted: true, arquivosRemovidos });
});

/**
 * Remove um segmento bruto da Galeria.
 *
 * A Galeria é material de trabalho, não acervo — excluir um bruto que não
 * interessa é parte da triagem. O que já foi curado não é tocado: o item da
 * Biblioteca é uma cópia independente e o vínculo é desfeito via `set null`
 * pelo próprio schema.
 *
 * Previsibilidade: re-segmentar a mesma extração recria a lista completa, e os
 * excluídos voltam. É o comportamento esperado de material derivado.
 */
designSystemsRoute.delete('/:dsId/segments/:segId', (c) => {
  const db = getDb();
  const segId = c.req.param('segId');
  const seg = db.select().from(tables.segments).where(eq(tables.segments.id, segId)).get();
  if (!seg || seg.designSystemId !== c.req.param('dsId')) {
    return c.json({ error: 'not_found' }, 404);
  }
  db.delete(tables.segments).where(eq(tables.segments.id, segId)).run();
  return c.json({ deleted: true });
});

const BatchDeleteInput = z.object({
  segmentIds: z.array(z.string().startsWith('seg_')).min(1).max(500),
});

/**
 * Exclui vários segmentos da Galeria de uma vez.
 *
 * Seguro por construção: o `and` exige que o segmento pertença A ESTA extração
 * (não dá para apagar segmento de outro ds pelo id), e as cópias já curadas na
 * Biblioteca sobrevivem — o schema faz `segmentId` virar null no componente, sem
 * apagar o componente, os kits ou os projetos que o usam. Devolve quantos foram
 * de fato removidos (sucesso parcial: ids inexistentes só não contam).
 */
designSystemsRoute.post(
  '/:dsId/segments/batch-delete',
  zValidator('json', BatchDeleteInput),
  (c) => {
    const dsId = c.req.param('dsId');
    const { segmentIds } = c.req.valid('json');
    const db = getDb();

    const res = db
      .delete(tables.segments)
      .where(and(inArray(tables.segments.id, segmentIds), eq(tables.segments.designSystemId, dsId)))
      .run();

    return c.json({ deleted: res.changes });
  },
);

/**
 * Revalida os previews de uma extração (idempotente). O fluxo normal já valida
 * automaticamente ao extrair/segmentar; este endpoint existe para revalidar sob
 * demanda — por exemplo, depois de subir a versão do validador — sem reextrair.
 * A listagem NÃO fica bloqueada: é outra requisição, tratada em paralelo.
 */
designSystemsRoute.post('/:id/validate', async (c) => {
  const id = c.req.param('id');
  if (!ehDesignSystemId(id)) return c.json({ error: 'invalid_id' }, 400);
  try {
    const val = await validarPreviews(id);
    return c.json({
      status: val.status,
      validadas: val.results.filter((r) => r.ok).length,
      interacoes: val.results.length,
      segmentos: val.segments.length,
    });
  } catch (err) {
    return c.json(
      { error: 'validation_failed', message: err instanceof Error ? err.message : String(err) },
      500,
    );
  }
});

/**
 * Re-extração: a captura nova nasceu sob um id novo, mas a linha do banco
 * manteve o id antigo (o upsert conflita no `sourceHash`). Os arquivos trocam
 * de lugar para o id que sobreviveu.
 *
 * A troca tem VOLTA, e a razão é a mesma que o `pnpm reextrair` documenta: o
 * gesto ingênuo (apagar o antigo e depois renomear) deixa estado misto quando o
 * disco recusa. No Windows isso não é hipótese — a prévia aberta numa aba
 * segura os arquivos, e a rota de exclusão deste mesmo arquivo já trata
 * `EBUSY` como falha esperada. Apagar antes do rename podia deixar a linha do
 * banco viva apontando para uma pasta pela metade, ou para nada.
 *
 * Então: arquiva o antigo, põe o novo no lugar, e só então descarta o
 * arquivado. Se qualquer passo falhar, o antigo volta e o erro sobe com o
 * motivo — a captura nova continua no disco sob o id novo, recuperável, em vez
 * de meio apagada.
 */
const trocarVaultMantendoId = (
  dsId: `ds_${string}`,
  idNovo: `ds_${string}`,
  onEvent: (nivel: 'info' | 'warn' | 'error', msg: string) => void,
): void => {
  const dirAntigo = vaultDsDir(dsId);
  const dirNovo = vaultDsDir(idNovo);
  const arquivado = `${dirAntigo}.anterior`;

  if (!podeApagarDesignSystem(dirAntigo, vaultDir(), dsId)) {
    throw new Error(`Não troquei os arquivos: ${dirAntigo} não é uma pasta de design system.`);
  }
  if (existsSync(arquivado)) rmSync(arquivado, { recursive: true, force: true });

  let arquivou = false;
  try {
    if (existsSync(dirAntigo)) {
      renameSync(dirAntigo, arquivado);
      arquivou = true;
    }
    renameSync(dirNovo, dirAntigo);
  } catch (err) {
    if (arquivou && !existsSync(dirAntigo)) renameSync(arquivado, dirAntigo);
    throw new Error(
      `Esta página já tinha a extração ${dsId} e não consegui trocar os arquivos ` +
        `(${err instanceof Error ? err.message : String(err)}). ` +
        `A captura anterior continua no lugar e a nova ficou em ${dirNovo}.`,
    );
  }

  try {
    if (arquivou) rmSync(arquivado, { recursive: true, force: true });
  } catch {
    // A troca já valeu; o que sobrou é a cópia velha. Um arquivo preso aqui não
    // desfaz nada, e o `pnpm acervo:limpar-orfas` recolhe depois.
    onEvent('warn', `Não consegui apagar a cópia anterior em ${arquivado}.`);
  }
  onEvent('info', `Esta página já tinha extração: mantive o id ${dsId} e troquei os arquivos`);
};

/**
 * Extrações em voo, por alvo. O `enqueueTask` não serializa nada — dois cliques
 * no botão põem duas extrações da mesma página correndo ao mesmo tempo, e a
 * segunda, ao resolver o id efetivo, troca por baixo os arquivos que a primeira
 * ainda está segmentando e validando. O resultado é um `validation.json`
 * descrevendo segmentos que já não existem.
 *
 * Uma pessoa não extrai a mesma página duas vezes de propósito: o segundo
 * clique é engano ou aba esquecida. Então o segundo pedido é recusado com o
 * motivo, em vez de virar corrida.
 */
const extracoesEmVoo = new Set<string>();

/**
 * Inicia uma extração + segmentação. Retorna o task_id imediatamente.
 */
designSystemsRoute.post('/', zValidator('json', CreateDesignSystemInput), (c) => {
  // Abrir um navegador de verdade e varrer um site inteiro leva minutos e, no
  // modo `api`, gasta crédito. A credencial é pedida na hora, e não herdada da
  // sessão: entrar no app e mandar gastar são decisões de peso diferente.
  const recusa = exigeSenhaDeAcao(c);
  if (recusa !== null) return recusa;

  const input = c.req.valid('json');

  // Modo fila: registra o pedido e devolve na hora. Nada é executado aqui.
  if (isQueueMode()) {
    const alvo = input.kind === 'url' ? input.url : (input.name ?? 'HTML colado');
    const job = enqueueJob('extract', `Extrair — ${alvo}`, { ...input });
    return c.json({ queued: true, job }, 202);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return c.json({ error: 'anthropic_not_configured' }, 500);
  }

  const alvo = input.kind === 'url' ? input.url : (input.name ?? 'html');
  if (extracoesEmVoo.has(alvo)) {
    return c.json(
      {
        error: 'extracao_em_andamento',
        message: 'Já estou extraindo esta página. Espere esta terminar antes de pedir de novo.',
      },
      409,
    );
  }
  extracoesEmVoo.add(alvo);

  const task = enqueueTask('extract', input, async (payload, onEvent) => {
    try {
      return await extrairEIndexar(payload, onEvent);
    } finally {
      extracoesEmVoo.delete(alvo);
    }
  });

  return c.json({ task }, 202);
});

/** O trabalho da extração no modo `api`, do fetch à validação de prévia. */
async function extrairEIndexar(
  payload: z.infer<typeof CreateDesignSystemInput>,
  onEvent: (nivel: 'info' | 'warn' | 'error', msg: string) => void,
) {
  const apiKey = process.env.ANTHROPIC_API_KEY as string;
  const models = getModels();
  {
    onEvent('info', 'Iniciando extração');
    const result = await runExtraction(payload, {
      apiKey,
      model: models.extractor,
      onEvent: (event) => {
        switch (event.type) {
          case 'start':
            onEvent('info', `Prompt versão ${event.promptVersion}`);
            break;
          case 'iteration':
            onEvent(
              'info',
              `Iteração ${event.index + 1} (in ${event.usage.inputTokens}, out ${event.usage.outputTokens})`,
            );
            break;
          case 'tool_call':
            onEvent(
              event.success ? 'info' : 'warn',
              `${event.name}${event.path ? ` ${event.path}` : ''}: ${event.message}`,
            );
            break;
          case 'complete':
            onEvent(
              'info',
              `Extração concluída em ${event.iterations} iterações, ${event.touchedFiles.length} arquivos`,
            );
            break;
          case 'error':
            onEvent('error', event.message);
            break;
        }
      },
    });

    const db = getDb();
    const name =
      payload.kind === 'url' ? (payload.name ?? new URL(payload.url).hostname) : payload.name;

    db.insert(tables.designSystems)
      .values({
        id: result.designSystemId,
        sourceUrl: payload.kind === 'url' ? payload.url : null,
        sourceHash: result.sourceHash,
        extractedAt: Date.now(),
        name,
        stackJson: JSON.stringify(result.stack),
        status: 'extracted',
        vaultPath: result.vaultPath,
        errorMessage: null,
      })
      .onConflictDoUpdate({
        target: tables.designSystems.sourceHash,
        set: {
          status: 'extracted',
          extractedAt: Date.now(),
          name,
          stackJson: JSON.stringify(result.stack),
          errorMessage: null,
        },
      })
      .run();

    // O id EFETIVO depois do upsert. Extrair a mesma página de novo conflita
    // no `sourceHash` e a linha mantém o id ANTIGO; seguir com o id novo era o
    // defeito — os segments apontavam para uma linha que não existe e a
    // extração morria em FK depois de já ter custado os tokens.
    const efetivo = db
      .select({ id: tables.designSystems.id })
      .from(tables.designSystems)
      .where(eq(tables.designSystems.sourceHash, result.sourceHash))
      .get();
    const dsId = (efetivo?.id ?? result.designSystemId) as `ds_${string}`;
    if (dsId !== result.designSystemId) {
      trocarVaultMantendoId(dsId, result.designSystemId, onEvent);
      db.update(tables.designSystems)
        .set({ vaultPath: vaultExtractedDir(dsId) })
        .where(eq(tables.designSystems.id, dsId))
        .run();
    }

    onEvent('info', `Design system salvo: ${dsId}`);

    // Fase 2: segmentação automática após a extração.
    onEvent('info', 'Iniciando segmentação');
    const segmentResult = segmentDesignSystem(dsId);
    db.transaction((tx) => {
      // Limpa segmentos antigos se for re-extração
      tx.delete(tables.segments).where(eq(tables.segments.designSystemId, dsId)).run();
      for (const seg of segmentResult.segments) {
        tx.insert(tables.segments).values(seg).run();
      }
      tx.update(tables.designSystems)
        .set({ status: 'segmented' })
        .where(eq(tables.designSystems.id, dsId))
        .run();
    });
    onEvent('info', `Segmentação: ${segmentResult.segments.length} candidatos`);

    // Validação automática do replay: fecha a lacuna de produção — promove
    // `replayable`→`validated` o que reproduz de verdade no navegador. Não
    // derruba a extração se falhar (a Galeria só não mostra `validated`).
    try {
      onEvent('info', 'Validando previews (navegador)');
      const val = await validarPreviews(dsId, {
        log: (m) => onEvent('info', m),
      });
      const validadas = val.results.filter((r) => r.ok).length;
      onEvent('info', `Validação: ${val.status} — ${validadas} interação(ões) validada(s)`);
    } catch (err) {
      onEvent('warn', `Validação de preview falhou: ${err instanceof Error ? err.message : err}`);
    }

    return {
      ...result,
      designSystemId: dsId,
      vaultPath: vaultExtractedDir(dsId),
      segmentCount: segmentResult.segments.length,
    };
  }
}

designSystemsRoute.post('/:id/classify', async (c) => {
  const dsId = c.req.param('id');
  if (!ehDesignSystemId(dsId)) return c.json({ error: 'invalid_id' }, 400);
  const db = getDb();

  const rows = db
    .select()
    .from(tables.segments)
    .where(eq(tables.segments.designSystemId, dsId))
    .all();
  if (rows.length === 0) return c.json({ error: 'no_segments' }, 404);

  if (isQueueMode()) {
    const job = enqueueJob('classify', `Classificar — ${rows.length} segmentos`, {
      designSystemId: dsId,
      segmentCount: rows.length,
    });
    return c.json({ queued: true, job }, 202);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return c.json({ error: 'anthropic_not_configured' }, 500);

  const models = getModels();
  const { classifySegments } = await import('@ds/classifier');

  const task = enqueueTask('classify', { dsId, count: rows.length }, async (_, onEvent) => {
    onEvent('info', `Classificando ${rows.length} segmentos`);
    const results = await classifySegments(
      rows.map((r) => ({
        id: r.id,
        currentName: r.name,
        htmlSnippet: r.htmlSnippet,
        subcomponente: r.parentId !== null,
      })),
      {
        apiKey,
        model: models.classifier,
        onProgress: (done, total) => onEvent('info', `${done}/${total}`),
      },
    );

    const paiDe = new Map(rows.map((r) => [r.id, r.parentId]));
    const db2 = getDb();
    db2.transaction((tx) => {
      for (const r of results) {
        // Clamp: um subcomponente é sempre uma PEÇA (botão, selo, campo…).
        // Se o LLM devolver categoria de seção para um filho, o nome e o kind
        // entram, mas a categoria fica a que a subdivisão determinou.
        const ehFilho = (paiDe.get(r.id) ?? null) !== null;
        const set =
          ehFilho && !CATEGORIAS_DE_PECA.has(r.category)
            ? { kind: r.kind, name: r.suggestedName }
            : { category: r.category, kind: r.kind, name: r.suggestedName };
        tx.update(tables.segments).set(set).where(eq(tables.segments.id, r.id)).run();
      }
      tx.update(tables.designSystems)
        .set({ status: 'ready' })
        .where(eq(tables.designSystems.id, dsId))
        .run();
    });
    onEvent('info', 'Classificação concluída');
    return { classified: results.length };
  });

  return c.json({ task }, 202);
});
