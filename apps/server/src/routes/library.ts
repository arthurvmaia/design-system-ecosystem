import { createHash } from 'node:crypto';
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { lerCssDoBundle } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import { isolateComponent } from '@ds/isolator';
import {
  CaptureManifest,
  CapturedAsset,
  type SegmentInsight,
  SegmentStatesFile,
  SegmentsManifest,
  type StoredState,
  coletarAssetRefs,
  construirIndiceAssets,
  libraryComponentBundleDir,
  libraryComponentDir,
  libraryComponentMetadata,
  newComponentId,
  reescreverParaLocal,
  vaultCaptureAssetsDir,
  vaultCaptureManifest,
  vaultCaptureV2AssetsDir,
  vaultCaptureV2Dir,
  vaultCaptureV2Manifest,
  vaultExtractedDir,
  vaultSegmentStates,
  vaultSegmentsManifest,
} from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { planBatchLike } from '../lib/batch.js';
import { lerBundleInfo } from '../lib/bundle-v2.js';
import { resolverEstadosV2 } from '../lib/estados-v2.js';

export const libraryRoute = new Hono();

/** Tags de um conjunto de componentes, num mapa id → tags[]. */
const carregarTags = (componentIds: string[]): Map<string, string[]> => {
  const mapa = new Map<string, string[]>();
  if (componentIds.length === 0) return mapa;
  const db = getDb();
  const rows = db
    .select()
    .from(tables.componentTags)
    .where(inArray(tables.componentTags.componentId, componentIds))
    .all();
  for (const r of rows) {
    const atual = mapa.get(r.componentId);
    if (atual) atual.push(r.tag);
    else mapa.set(r.componentId, [r.tag]);
  }
  return mapa;
};

libraryRoute.get('/', (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(tables.libraryComponents)
    .orderBy(desc(tables.libraryComponents.addedAt))
    .all();
  const tags = carregarTags(rows.map((r) => r.id));
  return c.json({ items: rows.map((r) => ({ ...r, tags: tags.get(r.id) ?? [] })) });
});

libraryRoute.get('/:id', (c) => {
  const db = getDb();
  const row = db
    .select()
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.id, c.req.param('id')))
    .get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  const tags = carregarTags([row.id]);
  return c.json({ item: { ...row, tags: tags.get(row.id) ?? [] } });
});

/**
 * O que acontece se este componente sair da Biblioteca. A UI pergunta antes de
 * apagar; o cascade do schema executa depois.
 */
libraryRoute.get('/:id/impacto', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const links = db
    .select()
    .from(tables.kitComponents)
    .where(eq(tables.kitComponents.componentId, id))
    .all();
  const kitIds = links.map((l) => l.kitId);
  const kits =
    kitIds.length > 0
      ? db
          .select({ id: tables.kits.id, name: tables.kits.name })
          .from(tables.kits)
          .where(inArray(tables.kits.id, kitIds))
          .all()
      : [];
  return c.json({ usadoEmKits: kits });
});

const AddInput = z.object({ segmentId: z.string().startsWith('seg_') });

type SegmentRow = typeof tables.segments.$inferSelect;

/** O insight de um segmento no manifesto do vault, quando existe. */
const lerInsightDoSegmento = (dsId: `ds_${string}`, segId: string): SegmentInsight | null => {
  const path = vaultSegmentsManifest(dsId);
  if (!existsSync(path)) return null;
  try {
    const manifest = SegmentsManifest.parse(JSON.parse(readFileSync(path, 'utf8')));
    return (manifest.insights ?? []).find((i) => i.segmentId === segId) ?? null;
  } catch {
    return null;
  }
};

/** Os estados capturados de um segmento (com HTML), quando existem. */
const lerEstadosDoSegmento = (dsId: `ds_${string}`, segId: string): StoredState[] => {
  const path = vaultSegmentStates(dsId, segId);
  if (!existsSync(path)) return [];
  try {
    return SegmentStatesFile.parse(JSON.parse(readFileSync(path, 'utf8'))).states;
  } catch {
    return [];
  }
};

/**
 * Índice de assets locais da captura de um design system, V1 ou V2 — o formato
 * do `CapturedAsset` é o mesmo; muda a pasta de origem (`capture/assets/` no
 * V1, `capture-v2/assets/` no V2).
 */
const lerCaptureAssets = (
  dsId: `ds_${string}`,
): { index: Map<string, string>; assets: CapturedAsset[]; origem: string } => {
  const vazio = {
    index: new Map<string, string>(),
    assets: [],
    origem: vaultCaptureAssetsDir(dsId),
  };
  const v1 = vaultCaptureManifest(dsId);
  if (existsSync(v1)) {
    try {
      const m = CaptureManifest.parse(JSON.parse(readFileSync(v1, 'utf8')));
      const locais = (m.assets ?? []).filter((a) => !a.status || a.status === 'local');
      return {
        index: construirIndiceAssets(locais),
        assets: locais,
        origem: vaultCaptureAssetsDir(dsId),
      };
    } catch {
      return vazio;
    }
  }
  const v2 = vaultCaptureV2Manifest(dsId);
  if (existsSync(v2)) {
    try {
      const raw = JSON.parse(readFileSync(v2, 'utf8')) as { assets?: unknown };
      const todos = CapturedAsset.array().parse(raw.assets ?? []);
      const locais = todos.filter((a) => !a.status || a.status === 'local');
      return {
        index: construirIndiceAssets(locais),
        assets: locais,
        origem: vaultCaptureV2AssetsDir(dsId),
      };
    } catch {
      return vazio;
    }
  }
  return vazio;
};

/**
 * Copia para o bundle (content-addressed) os assets locais que o componente
 * referencia. É o que faz o componente sobreviver à exclusão da extração: os
 * arquivos passam a ser DELE, não da pasta temporária. Devolve o índice
 * originUrl→localPath só dos copiados, para reescrever as refs.
 */
/** O conteúdo do `<head>` do design-system.html (sem `<base>`/`<title>`). */
const lerHeadDoVault = (dsId: `ds_${string}`): string => {
  const path = join(vaultExtractedDir(dsId), 'design-system.html');
  if (!existsSync(path)) return '';
  try {
    const html = readFileSync(path, 'utf8');
    const m = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
    return (m?.[1] ?? '').replace(/<base[^>]*>/gi, '').replace(/<title[\s\S]*?<\/title>/gi, '');
  } catch {
    return '';
  }
};

const semFragmento = (u: string): string => {
  const i = u.indexOf('#');
  return i >= 0 ? u.slice(0, i) : u;
};

/** Resolve um ref RELATIVO de dentro de um CSS (base `css/`) para um localPath. */
const relDeCssParaLocal = (rel: string): string | null => {
  const r = semFragmento(rel);
  if (r.startsWith('../')) return r.slice(3); // ../image/x.png → image/x.png
  if (!r.includes('/') && r.endsWith('.css')) return `css/${r}`; // vizinho.css → css/vizinho.css
  return null; // absoluto/data/externo — não é arquivo local do bundle
};

const copiarAssetsParaBundle = (
  dsId: `ds_${string}`,
  bundleDir: string,
  textos: string[],
): { index: Map<string, string>; assets: CapturedAsset[] } => {
  const { index: captureIdx, assets: todos, origem } = lerCaptureAssets(dsId);
  if (captureIdx.size === 0) return { index: new Map(), assets: [] };
  const usados = new Map<string, string>();
  const assets: CapturedAsset[] = [];
  const copiados = new Set<string>();

  /** Copia um arquivo local + (se CSS) os que ele referencia relativamente. */
  const copiarArquivo = (localPath: string): void => {
    if (copiados.has(localPath)) return;
    const src = join(origem, localPath);
    if (!existsSync(src)) return;
    copiados.add(localPath);
    const dest = join(bundleDir, 'assets', localPath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
    const a = todos.find((x) => x.localPath === localPath);
    if (a && !assets.includes(a)) assets.push(a);
    // Transitivo: um CSS aponta para ../<kind>/<hash> e <hash>.css (relativos a css/).
    if (localPath.endsWith('.css')) {
      for (const rel of coletarAssetRefs(readFileSync(src, 'utf8'))) {
        const alvo = relDeCssParaLocal(rel);
        if (alvo) copiarArquivo(alvo);
      }
    }
  };

  for (const ref of new Set(textos.flatMap((t) => coletarAssetRefs(t)))) {
    const localPath = captureIdx.get(semFragmento(ref));
    if (!localPath) continue;
    usados.set(semFragmento(ref), localPath);
    copiarArquivo(localPath);
  }
  return { index: usados, assets };
};

/**
 * Cria os arquivos do bundle de um segmento (isolamento + assets locais +
 * metadata) e devolve o record pronto para inserir. Compartilhado entre o
 * "curtir" único e o em lote — a mesma peça vira componente do mesmo jeito, com
 * EXATAMENTE os mesmos metadados (seção 11/15 do pedido).
 *
 * Preserva o que a exploração descobriu: os estados capturados, o pipeline, as
 * dependências, o selo honesto E os assets locais copiados para o bundle (o HTML/
 * CSS/estados passam a apontar para a rota do bundle, não para a origem).
 */
/**
 * Copia para o bundle da Biblioteca os frames que o bundle do V2 referencia
 * (`dependencies.frames` do manifest do compilador). Os arquivos moram em
 * `capture-v2/frames/` — sem a cópia, apagar a extração quebraria o fallback
 * visual da referência.
 */
const copiarFramesDoBundle = (dsId: `ds_${string}`, bundleDir: string): void => {
  const manifestPath = join(bundleDir, 'manifest.json');
  if (!existsSync(manifestPath)) return;
  try {
    const m = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      dependencies?: { frames?: unknown };
    };
    const frames = Array.isArray(m.dependencies?.frames) ? m.dependencies.frames : [];
    for (const f of frames) {
      if (typeof f !== 'string') continue;
      const rel = f.replace(/\\/g, '/');
      if (rel.split('/').includes('..')) continue;
      const src = join(vaultCaptureV2Dir(dsId), rel);
      if (!existsSync(src)) continue;
      const dest = join(bundleDir, rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(src, dest);
    }
  } catch {
    // Manifest ilegível: o bundle fica sem frames — o preview declara a ausência.
  }
};

/**
 * `styles.css` de um bundle V2 copiado: os CSS na ordem dos `<link>` do index.
 *
 * A implementação mudou de casa para `@ds/generator` (`lerCssDoBundle`), porque
 * o gerador precisava exatamente disto e estava fazendo errado — ordenava a
 * pasta por nome e desfazia a cascata. Duas cópias da mesma regra acabam
 * discordando; uma só, não.
 */
const concatenarCssDoBundle = (bundleDir: string): string => lerCssDoBundle(bundleDir).css;

const montarComponente = (seg: SegmentRow) => {
  const componentId = newComponentId();
  const bundleHash = createHash('sha256').update(seg.htmlSnippet).digest('hex');

  const bundleDir = libraryComponentBundleDir(componentId);
  mkdirSync(bundleDir, { recursive: true });

  const dsId = seg.designSystemId as `ds_${string}`;
  const insight = lerInsightDoSegmento(dsId, seg.id);
  // Estados V2 referenciam blobs em `capture-v2/` — resolvidos AQUI, na
  // promoção: o componente da Biblioteca precisa sobreviver à exclusão da
  // extração, então o HTML entra inline e a referência ao vault morre.
  const estados = resolverEstadosV2(dsId, lerEstadosDoSegmento(dsId, seg.id)).map((s) => ({
    ...s,
    htmlRef: undefined,
    portalHtmlRef: undefined,
  }));

  // O bundle do segmento (motor V2) carrega a decisão de representação.
  const bundleV2 = lerBundleInfo(dsId, seg.position);
  const representation = bundleV2?.representation ?? 'componente-portatil';

  let isolation: ReturnType<typeof isolateComponent> | null = null;
  let local: (t: string) => string;
  let bundleAssets: { index: Map<string, string>; assets: CapturedAsset[] };

  if (bundleV2 !== null && representation !== 'componente-portatil') {
    // Cápsula de runtime / referência visual: o bundle do COMPILADOR é o
    // componente — copiá-lo inteiro preserva a decisão (runtime.html isolado,
    // aviso + frame, css/js organizados, manifest com limitações). Servir o
    // htmlSnippet estático aqui seria reintroduzir o card preto na Biblioteca.
    cpSync(bundleV2.dir, bundleDir, { recursive: true });
    copiarFramesDoBundle(dsId, bundleDir);
    // `styles.css` para o gerador, que concatena index.html + styles.css.
    writeFileSync(join(bundleDir, 'styles.css'), concatenarCssDoBundle(bundleDir), 'utf8');
    bundleAssets = { index: new Map(), assets: [] };
    local = (t) => t;
  } else {
    // Componente portátil (ou extração V1): isolamento clássico. No V2, o CSS
    // organizado mora no próprio bundle do segmento (`assets/css/`) —
    // `extracted/assets/css` é coisa do V1 e fica vazio numa extração V2.
    const cssDir =
      bundleV2 !== null
        ? join(bundleV2.dir, 'assets', 'css')
        : join(vaultExtractedDir(dsId), 'assets/css');
    isolation = isolateComponent({ html: seg.htmlSnippet, cssDir });

    // Head da extração (fontes, runtime, <link> de CSS externo). Incluído para
    // que o CSS externo e seus assets transitivos sejam copiados e o componente
    // fique portátil — não dependa mais do head da origem.
    const headOrigem = lerHeadDoVault(dsId);

    // Copia os assets locais para o bundle e reescreve tudo para a rota do bundle.
    const textos = [
      headOrigem,
      isolation.html,
      isolation.css,
      ...estados.flatMap((s) => [s.html, s.portalHtml ?? '']),
    ];
    bundleAssets = copiarAssetsParaBundle(dsId, bundleDir, textos);
    const prefixo = `/api/library-asset/${componentId}/`;
    const idx = bundleAssets.index;
    local = (t) => reescreverParaLocal(t, idx, prefixo).text;

    writeFileSync(join(bundleDir, 'index.html'), local(isolation.html), 'utf8');
    writeFileSync(join(bundleDir, 'styles.css'), local(isolation.css), 'utf8');
    // HTML CRU reescrito: preserva as classes/ids originais para o CSS EXTERNO
    // (que mira esses seletores) casar no preview. O isolado (index.html) fica
    // para o gerador; o preview do componente usa este.
    writeFileSync(join(bundleDir, 'raw.html'), local(seg.htmlSnippet), 'utf8');
    // Head portátil: o CSS externo (<link>) e as fontes já apontam para o bundle.
    if (headOrigem) writeFileSync(join(bundleDir, 'head.html'), local(headOrigem), 'utf8');
    writeFileSync(
      join(bundleDir, 'isolation.json'),
      JSON.stringify(isolation.stats, null, 2),
      'utf8',
    );
  }

  // Estados COM HTML (reescritos p/ local) vão para o bundle: sobrevivem à origem
  // e deixam o componente reproduzir os estados na Biblioteca, como na Galeria.
  const estadosLocal = estados.map((s) => ({
    ...s,
    html: local(s.html),
    portalHtml: s.portalHtml ? local(s.portalHtml) : undefined,
  }));
  if (estadosLocal.length > 0) {
    writeFileSync(
      join(bundleDir, 'states.json'),
      JSON.stringify({ segmentId: seg.id, generatedAt: Date.now(), states: estadosLocal }, null, 2),
      'utf8',
    );
  }

  // Dependências: as do isolamento (assets) + as que a exploração associou (runtime).
  const dependencies = [
    ...(isolation?.referencedAssets ?? []).map((ref) => ({
      type: 'shared-asset' as const,
      ref,
      bundled: false,
    })),
    ...(insight?.dependencies ?? []),
  ];

  writeFileSync(
    libraryComponentMetadata(componentId),
    JSON.stringify(
      {
        id: componentId,
        name: seg.name,
        category: seg.category,
        kind: seg.kind,
        origin: { designSystemId: seg.designSystemId, segmentId: seg.id, sourceUrl: null },
        addedAt: Date.now(),
        tags: [],
        notes: null,
        bundleHash,
        // A decisão do V2 viaja com o componente: quem consumir o bundle sabe
        // se está diante de um portátil, uma cápsula ou uma referência.
        representation,
        // Fidelidade honesta: o insight da exploração (com dimensões/pipeline)
        // quando existe; senão o do isolamento estático.
        fidelity: insight ?? isolation?.fidelity ?? null,
        dependencies,
        // Assets locais copiados para o bundle (content-addressed).
        assets: bundleAssets.assets,
        states: insight?.states ?? [],
        pipeline: insight?.pipeline ?? [],
        confidence: insight?.confidence ?? null,
        limitations: insight?.limitations ?? [],
        manifestVersion: insight?.manifestVersion ?? null,
        pipelineVersion: insight?.pipelineVersion ?? null,
      },
      null,
      2,
    ),
  );

  return {
    id: componentId,
    segmentId: seg.id,
    designSystemId: seg.designSystemId,
    category: seg.category,
    kind: seg.kind,
    name: seg.name,
    bundlePath: libraryComponentDir(componentId),
    bundleHash,
    // Sem paleta: a Galeria não persiste identidade visual. Tema é da geração.
    tokensJson: null,
    addedAt: Date.now(),
    notes: null,
  };
};

libraryRoute.post('/', zValidator('json', AddInput), (c) => {
  const { segmentId } = c.req.valid('json');
  const db = getDb();

  const seg = db.select().from(tables.segments).where(eq(tables.segments.id, segmentId)).get();
  if (!seg) return c.json({ error: 'segment_not_found' }, 404);

  // Gate de qualidade: um bloco que a captura NÃO consegue reproduzir fora do
  // site de origem não entra na Biblioteca — entraria quebrado e apareceria
  // quebrado no site gerado. A recusa explica, não esconde.
  const insight = lerInsightDoSegmento(seg.designSystemId as `ds_${string}`, seg.id);
  if (insight?.support === 'nao-suportado') {
    return c.json(
      {
        error: 'sem_suporte',
        message:
          'Este bloco não se sustenta fora do site de origem — a captura não conseguiu reproduzi-lo. Por isso ele não pode entrar na Biblioteca.',
      },
      422,
    );
  }

  // Idempotente: já na Biblioteca não cria cópia nova.
  if (seg.inLibrary) {
    const existente = db
      .select()
      .from(tables.libraryComponents)
      .where(eq(tables.libraryComponents.segmentId, segmentId))
      .get();
    return c.json({ item: existente ?? null, already: true }, 200);
  }

  const record = montarComponente(seg);
  db.transaction((tx) => {
    tx.insert(tables.libraryComponents).values(record).run();
    tx.update(tables.segments)
      .set({ inLibrary: true })
      .where(eq(tables.segments.id, segmentId))
      .run();
  });

  return c.json({ item: record }, 201);
});

const BatchAddInput = z.object({
  segmentIds: z.array(z.string().startsWith('seg_')).min(1).max(200),
});

/**
 * Curtir vários de uma vez. Idempotente (pula os que já estão na Biblioteca),
 * numa transação só, com sucesso parcial: devolve o que entrou, o que já estava
 * e o que não existe mais. Um endpoint em vez de dezenas de requests.
 */
libraryRoute.post('/batch', zValidator('json', BatchAddInput), (c) => {
  const { segmentIds } = c.req.valid('json');
  const db = getDb();

  const segs = db
    .select()
    .from(tables.segments)
    .where(inArray(tables.segments.id, segmentIds))
    .all();

  const plano = planBatchLike(segmentIds, segs);
  // Mesmo gate do caminho unitário: o que a captura não reproduz não entra.
  const recusados: string[] = [];
  const aprovados = plano.toAdd.filter((s) => {
    const insight = lerInsightDoSegmento(s.designSystemId as `ds_${string}`, s.id);
    if (insight?.support === 'nao-suportado') {
      recusados.push(s.id);
      return false;
    }
    return true;
  });
  const records = aprovados.map(montarComponente);
  const addedIds = aprovados.map((s) => s.id);

  db.transaction((tx) => {
    for (const r of records) tx.insert(tables.libraryComponents).values(r).run();
    if (addedIds.length > 0) {
      tx.update(tables.segments)
        .set({ inLibrary: true })
        .where(inArray(tables.segments.id, addedIds))
        .run();
    }
  });

  return c.json({ added: addedIds, already: plano.already, missing: plano.missing, recusados });
});

const PatchInput = z.object({
  name: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  category: z.string().min(1).optional(),
  /** Lista completa. Substitui as tags anteriores. */
  tags: z.array(z.string().min(1).max(40)).max(12).optional(),
});

libraryRoute.patch('/:id', zValidator('json', PatchInput), (c) => {
  const id = c.req.param('id');
  const { tags, ...patch } = c.req.valid('json');
  const db = getDb();

  const existe = db
    .select({ id: tables.libraryComponents.id })
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.id, id))
    .get();
  if (!existe) return c.json({ error: 'not_found' }, 404);

  db.transaction((tx) => {
    if (Object.keys(patch).length > 0) {
      tx.update(tables.libraryComponents)
        .set(patch)
        .where(eq(tables.libraryComponents.id, id))
        .run();
    }
    if (tags !== undefined) {
      tx.delete(tables.componentTags).where(eq(tables.componentTags.componentId, id)).run();
      // Normaliza para não guardar "Hero" e "hero" como tags diferentes.
      const unicas = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter((t) => t !== ''))];
      for (const tag of unicas) {
        tx.insert(tables.componentTags).values({ componentId: id, tag }).run();
      }
    }
  });

  const row = db
    .select()
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.id, id))
    .get();
  const mapaTags = carregarTags([id]);
  return c.json({ item: { ...row, tags: mapaTags.get(id) ?? [] } });
});

libraryRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const row = db
    .select()
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.id, id))
    .get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  db.transaction((tx) => {
    if (row.segmentId) {
      tx.update(tables.segments)
        .set({ inLibrary: false })
        .where(eq(tables.segments.id, row.segmentId))
        .run();
    }
    tx.delete(tables.libraryComponents).where(eq(tables.libraryComponents.id, id)).run();
  });

  const dir = libraryComponentDir(id as `cmp_${string}`);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });

  return c.json({ deleted: true });
});

const ExcluirLoteInput = z.object({
  componentIds: z.array(z.string().startsWith('cmp_')).min(1).max(200),
  /** Sem isto, componente EM USO não é excluído — volta na resposta para a UI avisar. */
  confirmarEmUso: z.boolean().optional().default(false),
});

/**
 * Exclusão em lote com aviso de uso: um componente dentro de um kit (e,
 * por consequência, dos sites gerados a partir dele) só sai com confirmação
 * explícita. Antes, o DELETE derrubava o vínculo por cascade em silêncio.
 */
libraryRoute.post('/excluir-lote', zValidator('json', ExcluirLoteInput), (c) => {
  const { componentIds, confirmarEmUso } = c.req.valid('json');
  const db = getDb();
  const rows = db
    .select()
    .from(tables.libraryComponents)
    .where(inArray(tables.libraryComponents.id, componentIds))
    .all();

  const links =
    rows.length > 0
      ? db
          .select()
          .from(tables.kitComponents)
          .where(
            inArray(
              tables.kitComponents.componentId,
              rows.map((r) => r.id),
            ),
          )
          .all()
      : [];
  const kitIds = [...new Set(links.map((l) => l.kitId))];
  const kits =
    kitIds.length > 0
      ? db
          .select({ id: tables.kits.id, name: tables.kits.name })
          .from(tables.kits)
          .where(inArray(tables.kits.id, kitIds))
          .all()
      : [];
  const projetos =
    kitIds.length > 0
      ? db
          .select({ name: tables.projects.name, kitId: tables.projects.kitId })
          .from(tables.projects)
          .where(inArray(tables.projects.kitId, kitIds))
          .all()
      : [];
  const nomeDoKit = new Map(kits.map((k) => [k.id, k.name]));

  const emUso = rows.flatMap((r) => {
    const seusKits = links.filter((l) => l.componentId === r.id).map((l) => l.kitId);
    if (seusKits.length === 0) return [];
    return [
      {
        id: r.id,
        name: r.name,
        kits: seusKits.map((k) => nomeDoKit.get(k) ?? 'um kit'),
        projetos: projetos
          .filter((p) => p.kitId !== null && seusKits.includes(p.kitId))
          .map((p) => p.name),
      },
    ];
  });

  const bloqueados = confirmarEmUso ? new Set<string>() : new Set(emUso.map((u) => u.id));
  const paraExcluir = rows.filter((r) => !bloqueados.has(r.id));

  db.transaction((tx) => {
    for (const row of paraExcluir) {
      if (row.segmentId) {
        tx.update(tables.segments)
          .set({ inLibrary: false })
          .where(eq(tables.segments.id, row.segmentId))
          .run();
      }
      tx.delete(tables.libraryComponents).where(eq(tables.libraryComponents.id, row.id)).run();
    }
  });
  for (const row of paraExcluir) {
    const dir = libraryComponentDir(row.id as `cmp_${string}`);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }

  return c.json({
    excluidos: paraExcluir.map((r) => r.id),
    emUso,
    faltando: componentIds.filter((id) => !rows.some((r) => r.id === id)),
  });
});
