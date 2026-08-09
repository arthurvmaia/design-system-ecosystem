/**
 * A REFINARIA: resegmenta e recompila um design system SEM abrir navegador.
 *
 * Uso:
 *   pnpm resegmentar <ds_id>            # refina um site
 *   pnpm resegmentar --todos            # o acervo inteiro
 *   pnpm resegmentar <ds_id> --seco     # só diz o que mudaria
 *
 * É a inversão da espinha que a auditoria pediu: a captura vira GRAVADOR de
 * evidência (o navegador roda uma vez), e tudo que decide — corte, categoria,
 * camadas, bundles — vira função reexecutável sobre o que está em disco.
 * Medido nesta própria reforma: provar um conserto de segmentação custava uma
 * reextração de 35 a 40 minutos; com a evidência gravada, custa segundos.
 *
 * Precisa de `capture-v2/evidencia.json`, que toda captura passa a gravar.
 * Captura antiga não tem: o script diz isso e manda reextrair uma vez — a
 * partir daí, nunca mais.
 */
import { existsSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  type EvidenciaDaCaptura,
  atributosDoDocumento,
  escolherCamadasDePagina,
  escolherComportamentos,
  escolherPecas,
  escreverBundle,
  persistirCapturaV2,
  runtimesQueViajam,
  segmentarPorEvidencia,
} from '@ds/engine-v2';
import { getDb, tables } from '@ds/indexer';
import {
  type CaptureManifestV2,
  type DesignSystemId,
  vaultCaptureV2Dir,
  vaultCaptureV2Manifest,
  vaultExtractedDir,
  vaultSegmentBundlesDir,
  vaultSegmentValidation,
} from '@ds/shared';
import { executadoDireto } from './executado-direto.js';
import { religarBibliotecaAosSegmentos } from './religar-biblioteca.js';
import { segmentarEIndexar } from './segmentar.js';

type Relato = {
  dsId: string;
  ok: boolean;
  motivo?: string;
  antes: number;
  depois: number;
  rejeitados: number;
  bundles: number;
  ms: number;
};

export const resegmentar = (dsId: DesignSystemId, seco: boolean): Relato => {
  const inicio = Date.now();
  const base = { dsId, antes: 0, depois: 0, rejeitados: 0, bundles: 0 };

  const manifestPath = vaultCaptureV2Manifest(dsId);
  const evidenciaPath = join(vaultCaptureV2Dir(dsId), 'evidencia.json');
  if (!existsSync(manifestPath)) {
    return { ...base, ok: false, motivo: 'sem capture-v2/manifest.json', ms: Date.now() - inicio };
  }
  if (!existsSync(evidenciaPath)) {
    return {
      ...base,
      ok: false,
      motivo:
        'captura antiga, sem evidencia.json — reextraia UMA vez e a partir daí a Refinaria assume',
      ms: Date.now() - inicio,
    };
  }

  const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as CaptureManifestV2;
  const ev = JSON.parse(readFileSync(evidenciaPath, 'utf8')) as EvidenciaDaCaptura;
  base.antes = (m.segmentEvidence ?? []).length;

  const htmlPorHash = new Map(Object.entries(ev.htmlPorHash));
  const framePorHash = new Map(Object.entries(ev.framePorHash));
  const assetsLocais = new Set(ev.assetsLocais);
  const localPorUrl = new Map(ev.localPorUrl);
  const viewport = m.viewport ?? { width: 1440, height: 900 };
  const pageHeight = m.pageHeight ?? 0;

  // As escolhas derivadas são recomputadas pelas MESMAS funções puras do motor:
  // é exatamente isso que faz um conserto de critério valer para o acervo
  // inteiro sem recapturar nada.
  const pecas = escolherPecas({
    nos: m.structuralMap,
    pageHeight,
    viewportWidth: viewport.width,
  });
  const camadasDePagina = escolherCamadasDePagina({
    camadas: m.visualLayers,
    nos: m.structuralMap,
    viewport,
    pageHeight,
    hashesComRuntime: new Set((m.mediaDetections ?? []).map((x) => x.fingerprint.hash)),
  });
  const comportamentos = escolherComportamentos({
    scroll: m.scrollObservations ?? [],
    nos: m.structuralMap,
  });

  const r = segmentarPorEvidencia({
    structuralMap: m.structuralMap,
    tokensPorHash: new Map(Object.entries(ev.tokensPorHash)),
    visualLayers: m.visualLayers,
    backgroundDetections: m.backgroundDetections ?? [],
    mediaDetections: m.mediaDetections ?? [],
    runtimeDetections: m.runtimeDetections ?? [],
    temporalObservations: m.temporalObservations ?? [],
    scrollPasses: m.scrollPasses ?? [],
    pointerResponses: m.pointerResponses ?? [],
    scrollObservations: m.scrollObservations ?? [],
    stateGraph: m.stateGraph,
    safeActions: m.safeActions ?? [],
    htmlPorHash,
    framePorHash,
    pecas,
    camadasDePagina,
    comportamentos,
    assetsLocais,
    scriptsNaoLocalizados: ev.scriptsNaoLocalizados,
    cssExternoFaltando: ev.cssExternoFaltando,
    runtimesQueViajam: runtimesQueViajam(ev.scriptsDecididos),
    animacoesCssQueRodaram: ev.animacoesCssQueRodaram,
    shadowFechados: ev.shadowFechados,
    viewport,
    pageHeight,
  });
  base.depois = r.segmentos.length;
  base.rejeitados = r.rejeitados.length;

  if (seco) return { ...base, ok: true, ms: Date.now() - inicio };

  // ── Bundles novos, das MESMAS entradas que o motor usaria ────────────────
  const dirBundles = vaultSegmentBundlesDir(dsId);
  const anterior = `${dirBundles}.anterior`;
  rmSync(anterior, { recursive: true, force: true });
  if (existsSync(dirBundles)) renameSync(dirBundles, anterior);

  const extraido = join(vaultExtractedDir(dsId), 'design-system.html');
  const html = existsSync(extraido) ? readFileSync(extraido, 'utf8') : '';
  const documentoAttrs = atributosDoDocumento(html);

  for (const seg of r.segmentos) {
    const dosMeus = new Set(seg.evidence.assetKeys);
    const hashesDoSegmento = new Set([seg.hash, ...seg.evidence.members]);
    const frameProprio = framePorHash.get(seg.hash);
    const framesDoSegmento = [
      ...new Set([
        ...(frameProprio === undefined ? [] : [frameProprio]),
        ...[...framePorHash.entries()]
          .filter(([hash]) => hashesDoSegmento.has(hash))
          .map(([, frame]) => frame),
      ]),
    ];
    escreverBundle(join(dirBundles, `seg_${seg.position}`), {
      segmento: seg,
      css: ev.cssInline,
      cssExternos: ev.cssExternos,
      cssInlineOrdenado: ev.cssInlineOrdenado,
      assetsDeCss: ev.assetsDeCss,
      dirAssetsCaptura: join(vaultCaptureV2Dir(dsId), 'assets'),
      scripts: seg.representation.type === 'referencia-visual' ? [] : ev.scriptsInline,
      documentoAttrs,
      scriptsExternos: seg.representation.type === 'referencia-visual' ? [] : ev.scriptsDecididos,
      assets: ev.assets.filter((a) => dosMeus.has(a.originalUrl)),
      assetsLocais: localPorUrl,
      camadasDeFundo: (seg.camadasDeFundo ?? [])
        .map((h) => htmlPorHash.get(h) ?? '')
        .filter((h) => h.length > 0),
      stack: ev.stack,
      frames: framesDoSegmento,
      dirFramesCaptura: vaultCaptureV2Dir(dsId),
      runtimeScripts: (m.runtimeDetections ?? [])
        .filter((rt) => seg.evidence.runtimeIds.includes(rt.id))
        .flatMap((rt) => rt.scripts)
        .filter((u) => assetsLocais.has(u)),
      sourceUrl: ev.finalUrl,
      capturadoEm: Date.now(),
    });
    base.bundles++;
  }

  // ── O manifesto acompanha o corte novo ───────────────────────────────────
  // Os mapas derivados dos segmentos (evidência, representação, fidelidade,
  // selo, interações) são reescritos; a MEDIÇÃO (mapa, temporal, ponteiro,
  // comparações) fica intacta — ela é da captura, não do corte.
  const manifesto: CaptureManifestV2 = {
    ...m,
    segmentEvidence: r.segmentos.map((seg) => seg.evidence),
    representations: Object.fromEntries(r.segmentos.map((seg) => [seg.hash, seg.representation])),
    fidelity: Object.fromEntries(r.segmentos.map((seg) => [seg.hash, seg.fidelity])),
    support: Object.fromEntries(r.segmentos.map((seg) => [seg.hash, seg.support])),
    interactions: Object.fromEntries(r.segmentos.map((seg) => [seg.hash, seg.interactions])),
    dependencies: Object.fromEntries(
      r.segmentos.map((seg) => [
        seg.hash,
        {
          assets: seg.evidence.assetKeys,
          runtimes: seg.evidence.runtimeIds,
          scripts: [],
          fonts: [],
        },
      ]),
    ),
  };

  persistirCapturaV2(dsId, {
    manifesto,
    html,
    finalUrl: ev.finalUrl,
    segmentos: r.segmentos,
    rejeitados: r.rejeitados,
    evidencia: ev,
  });
  segmentarEIndexar(dsId);
  /**
   * Religa a Biblioteca ao segmento NOVO, aqui mesmo.
   *
   * A recriação dos segmentos orfana toda linha desta origem
   * (`segment_id` é `on delete set null`), e linha órfã é invisível para as
   * regras de aceite da Galeria e para o `curar`. Religar no mesmo passo é o
   * que impede o acervo de se desmontar a cada refinamento.
   */
  const religou = religarBibliotecaAosSegmentos(dsId);
  if (religou.religadas > 0 || religou.aindaOrfas > 0) {
    console.log(
      `    Biblioteca religada: ${religou.religadas} (${religou.porNome} por nome, ` +
        `${religou.porTrecho} pelo trecho)${religou.aindaOrfas > 0 ? `, ${religou.aindaOrfas} ainda sem vínculo` : ''}`,
    );
  }
  // A validação em navegador era da geração anterior de segmentos.
  rmSync(vaultSegmentValidation(dsId), { force: true });

  return { ...base, ok: true, ms: Date.now() - inicio };
};

const principal = (): void => {
  const seco = process.argv.includes('--seco');
  const todos = process.argv.includes('--todos');
  const alvo = process.argv[2];

  const ids: DesignSystemId[] = todos
    ? getDb()
        .select({ id: tables.designSystems.id })
        .from(tables.designSystems)
        .all()
        .map((l) => l.id as DesignSystemId)
    : alvo?.startsWith('ds_')
      ? [alvo as DesignSystemId]
      : [];

  if (ids.length === 0) {
    console.error('\n  Uso: pnpm resegmentar <ds_id>   (ou --todos; --seco para ensaiar)\n');
    process.exit(1);
  }

  const inicio = Date.now();
  const relatos = ids.map((id) => {
    const r = resegmentar(id, seco);
    console.log(
      r.ok
        ? `  ${r.dsId}: ${r.antes} → ${r.depois} segmentos, ${r.rejeitados} na Revisão, ${r.bundles} bundles, ${r.ms} ms${seco ? '  (seco)' : ''}`
        : `  ${r.dsId}: NÃO deu — ${r.motivo}`,
    );
    return r;
  });
  const okS = relatos.filter((r) => r.ok).length;
  console.log(
    `\n  ${okS} de ${relatos.length} refinados em ${((Date.now() - inicio) / 1000).toFixed(1)} s, sem navegador.`,
  );
  if (relatos.some((r) => !r.ok)) process.exit(1);
};

if (executadoDireto(import.meta.url)) principal();
