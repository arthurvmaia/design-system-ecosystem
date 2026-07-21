import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, tables } from '@ds/indexer';
import { isolateComponent } from '@ds/isolator';
import {
  libraryComponentBundleDir,
  libraryComponentDir,
  libraryComponentMetadata,
  newComponentId,
  vaultExtractedDir,
} from '@ds/shared';
import { extractTokens } from '@ds/tokens';
import { zValidator } from '@hono/zod-validator';
import { desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

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

libraryRoute.post('/', zValidator('json', AddInput), (c) => {
  const { segmentId } = c.req.valid('json');
  const db = getDb();

  const seg = db.select().from(tables.segments).where(eq(tables.segments.id, segmentId)).get();
  if (!seg) return c.json({ error: 'segment_not_found' }, 404);

  const componentId = newComponentId();
  const bundleHash = createHash('sha256').update(seg.htmlSnippet).digest('hex');

  const bundleDir = libraryComponentBundleDir(componentId);
  mkdirSync(bundleDir, { recursive: true });

  // Fase 5: isolamento pragmático.
  const cssDir = join(vaultExtractedDir(seg.designSystemId as `ds_${string}`), 'assets/css');
  const isolation = isolateComponent({ html: seg.htmlSnippet, cssDir });

  writeFileSync(join(bundleDir, 'index.html'), isolation.html, 'utf8');

  // Fase 6: extrai tokens do CSS isolado.
  const tokenized = extractTokens(isolation.css);
  writeFileSync(join(bundleDir, 'styles.css'), tokenized.css, 'utf8');
  writeFileSync(join(bundleDir, 'tokens.json'), JSON.stringify(tokenized.tokens, null, 2), 'utf8');
  writeFileSync(
    join(bundleDir, 'isolation.json'),
    JSON.stringify(isolation.stats, null, 2),
    'utf8',
  );

  writeFileSync(
    libraryComponentMetadata(componentId),
    JSON.stringify(
      {
        id: componentId,
        name: seg.name,
        category: seg.category,
        kind: seg.kind,
        origin: {
          designSystemId: seg.designSystemId,
          segmentId: seg.id,
          sourceUrl: null,
        },
        addedAt: Date.now(),
        tags: [],
        notes: null,
        bundleHash,
      },
      null,
      2,
    ),
  );

  const record = {
    id: componentId,
    segmentId: seg.id,
    designSystemId: seg.designSystemId,
    category: seg.category,
    kind: seg.kind,
    name: seg.name,
    bundlePath: libraryComponentDir(componentId),
    bundleHash,
    tokensJson: JSON.stringify(tokenized.tokens),
    addedAt: Date.now(),
    notes: null,
  };

  db.transaction((tx) => {
    tx.insert(tables.libraryComponents).values(record).run();
    tx.update(tables.segments)
      .set({ inLibrary: true })
      .where(eq(tables.segments.id, segmentId))
      .run();
  });

  return c.json({ item: record }, 201);
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
