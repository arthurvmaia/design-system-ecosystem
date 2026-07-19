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
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

export const libraryRoute = new Hono();

libraryRoute.get('/', (c) => {
  const db = getDb();
  const rows = db
    .select()
    .from(tables.libraryComponents)
    .orderBy(desc(tables.libraryComponents.addedAt))
    .all();
  return c.json({ items: rows });
});

libraryRoute.get('/:id', (c) => {
  const db = getDb();
  const row = db
    .select()
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.id, c.req.param('id')))
    .get();
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json({ item: row });
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
});

libraryRoute.patch('/:id', zValidator('json', PatchInput), (c) => {
  const id = c.req.param('id');
  const patch = c.req.valid('json');
  const db = getDb();
  db.update(tables.libraryComponents).set(patch).where(eq(tables.libraryComponents.id, id)).run();
  const row = db
    .select()
    .from(tables.libraryComponents)
    .where(eq(tables.libraryComponents.id, id))
    .get();
  return c.json({ item: row });
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
