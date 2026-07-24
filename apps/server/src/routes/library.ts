import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, tables } from '@ds/indexer';
import { isolateComponent } from '@ds/isolator';
import {
  type SegmentInsight,
  SegmentStatesFile,
  SegmentsManifest,
  type StoredState,
  libraryComponentBundleDir,
  libraryComponentDir,
  libraryComponentMetadata,
  newComponentId,
  vaultExtractedDir,
  vaultSegmentStates,
  vaultSegmentsManifest,
} from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { planBatchLike } from '../lib/batch.js';

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
 * Cria os arquivos do bundle de um segmento (isolamento + metadata) e devolve o
 * record pronto para inserir. Compartilhado entre o "curtir" único e o em lote —
 * a mesma peça vira componente do mesmo jeito, não importa por qual caminho, e
 * com EXATAMENTE os mesmos metadados (seção 11 do pedido).
 *
 * Preserva o que a exploração descobriu: os estados capturados (índice +, quando
 * há, o HTML em `bundle/states.json` para o preview reproduzir), o pipeline de
 * interações, as dependências, o selo honesto, a confiança e as limitações.
 */
const montarComponente = (seg: SegmentRow) => {
  const componentId = newComponentId();
  const bundleHash = createHash('sha256').update(seg.htmlSnippet).digest('hex');

  const bundleDir = libraryComponentBundleDir(componentId);
  mkdirSync(bundleDir, { recursive: true });

  const cssDir = join(vaultExtractedDir(seg.designSystemId as `ds_${string}`), 'assets/css');
  const isolation = isolateComponent({ html: seg.htmlSnippet, cssDir });

  writeFileSync(join(bundleDir, 'index.html'), isolation.html, 'utf8');
  writeFileSync(join(bundleDir, 'styles.css'), isolation.css, 'utf8');
  writeFileSync(
    join(bundleDir, 'isolation.json'),
    JSON.stringify(isolation.stats, null, 2),
    'utf8',
  );

  const dsId = seg.designSystemId as `ds_${string}`;
  const insight = lerInsightDoSegmento(dsId, seg.id);
  const estados = lerEstadosDoSegmento(dsId, seg.id);

  // Estados COM HTML vão para o bundle: é o que sobrevive à origem e deixa o
  // componente reproduzir os estados na Biblioteca, como na Galeria.
  if (estados.length > 0) {
    writeFileSync(
      join(bundleDir, 'states.json'),
      JSON.stringify({ segmentId: seg.id, generatedAt: Date.now(), states: estados }, null, 2),
      'utf8',
    );
  }

  // Dependências: as do isolamento (assets) + as que a exploração associou (runtime).
  const dependencies = [
    ...isolation.referencedAssets.map((ref) => ({
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
        // Fidelidade honesta: o insight da exploração (com dimensões/pipeline)
        // quando existe; senão o do isolamento estático.
        fidelity: insight ?? isolation.fidelity,
        dependencies,
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
  const records = plano.toAdd.map(montarComponente);
  const addedIds = plano.toAdd.map((s) => s.id);

  db.transaction((tx) => {
    for (const r of records) tx.insert(tables.libraryComponents).values(r).run();
    if (addedIds.length > 0) {
      tx.update(tables.segments)
        .set({ inLibrary: true })
        .where(inArray(tables.segments.id, addedIds))
        .run();
    }
  });

  return c.json({ added: addedIds, already: plano.already, missing: plano.missing });
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
