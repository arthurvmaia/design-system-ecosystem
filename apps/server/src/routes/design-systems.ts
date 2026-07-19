import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runExtraction } from '@ds/extractor';
import { getDb, tables } from '@ds/indexer';
import { segmentDesignSystem } from '@ds/segmenter';
import { CreateDesignSystemInput, listarAssetsFaltando, vaultExtractedDir } from '@ds/shared';
import { enqueueJob } from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { asc, desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { getModels } from '../lib/anthropic.js';
import { isQueueMode } from '../lib/execution-mode.js';
import { enqueueTask } from '../lib/task-queue.js';

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
  const row = db.select().from(tables.designSystems).where(eq(tables.designSystems.id, id)).get();
  if (!row) return c.json({ error: 'not_found' }, 404);

  // Integridade dos assets. Sem isto, uma extração que não gravou o CSS fica
  // idêntica a uma boa na listagem e só se revela nas prévias em branco.
  let assetsFaltando: string[] = [];
  const htmlPath = join(vaultExtractedDir(id as `ds_${string}`), 'design-system.html');
  if (existsSync(htmlPath)) {
    assetsFaltando = listarAssetsFaltando(
      vaultExtractedDir(id as `ds_${string}`),
      readFileSync(htmlPath, 'utf8'),
    );
  }

  return c.json({ item: row, assetsFaltando });
});

designSystemsRoute.get('/:id/segments', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const rows = db
    .select()
    .from(tables.segments)
    .where(eq(tables.segments.designSystemId, id))
    .orderBy(asc(tables.segments.position))
    .all();
  return c.json({ items: rows });
});

designSystemsRoute.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  db.delete(tables.designSystems).where(eq(tables.designSystems.id, id)).run();
  // TODO: apagar vault/{id}/ também. Fica para a Fase 4 quando tiver GC.
  return c.json({ deleted: true });
});

/**
 * Inicia uma extração + segmentação. Retorna o task_id imediatamente.
 */
designSystemsRoute.post('/', zValidator('json', CreateDesignSystemInput), (c) => {
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
  const models = getModels();

  const task = enqueueTask('extract', input, async (payload, onEvent) => {
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
        set: { status: 'extracted', extractedAt: Date.now() },
      })
      .run();

    onEvent('info', `Design system salvo: ${result.designSystemId}`);

    // Fase 2: segmentação automática após a extração.
    onEvent('info', 'Iniciando segmentação');
    const segmentResult = segmentDesignSystem(result.designSystemId);
    db.transaction((tx) => {
      // Limpa segmentos antigos se for re-extração
      tx.delete(tables.segments)
        .where(eq(tables.segments.designSystemId, result.designSystemId))
        .run();
      for (const seg of segmentResult.segments) {
        tx.insert(tables.segments).values(seg).run();
      }
      tx.update(tables.designSystems)
        .set({ status: 'segmented' })
        .where(eq(tables.designSystems.id, result.designSystemId))
        .run();
    });
    onEvent('info', `Segmentação: ${segmentResult.segments.length} candidatos`);

    return { ...result, segmentCount: segmentResult.segments.length };
  });

  return c.json({ task }, 202);
});

designSystemsRoute.post('/:id/classify', async (c) => {
  const dsId = c.req.param('id');
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
      rows.map((r) => ({ id: r.id, currentName: r.name, htmlSnippet: r.htmlSnippet })),
      {
        apiKey,
        model: models.classifier,
        onProgress: (done, total) => onEvent('info', `${done}/${total}`),
      },
    );

    const db2 = getDb();
    db2.transaction((tx) => {
      for (const r of results) {
        tx.update(tables.segments)
          .set({ category: r.category, kind: r.kind, name: r.suggestedName })
          .where(eq(tables.segments.id, r.id))
          .run();
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
