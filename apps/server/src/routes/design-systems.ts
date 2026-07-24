import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runExtraction } from '@ds/extractor';
import { getDb, tables } from '@ds/indexer';
import { segmentDesignSystem } from '@ds/segmenter';
import {
  CreateDesignSystemInput,
  SegmentsManifest,
  listarAssetsFaltando,
  resumirPipeline,
  vaultExtractedDir,
  vaultSegmentsManifest,
} from '@ds/shared';
import type { InteracaoNaoAssociada, SegmentInsight } from '@ds/shared';
import { enqueueJob } from '@ds/shared';
import { zValidator } from '@hono/zod-validator';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
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

/**
 * Insights de fidelidade + interações não associadas, do manifesto no vault.
 * Ficam em JSON (não no banco) para não exigir migration: a rota junta ao vivo.
 * Manifesto antigo sem esses campos simplesmente devolve vazios.
 */
const lerManifesto = (
  dsId: string,
): { insights: Map<string, SegmentInsight>; naoAssociados: InteracaoNaoAssociada[] } => {
  const path = vaultSegmentsManifest(dsId as `ds_${string}`);
  if (!existsSync(path)) return { insights: new Map(), naoAssociados: [] };
  try {
    const manifest = SegmentsManifest.parse(JSON.parse(readFileSync(path, 'utf8')));
    return {
      insights: new Map((manifest.insights ?? []).map((i) => [i.segmentId, i])),
      naoAssociados: manifest.naoAssociados ?? [],
    };
  } catch {
    return { insights: new Map(), naoAssociados: [] };
  }
};

designSystemsRoute.get('/:id/segments', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const rows = db
    .select()
    .from(tables.segments)
    .where(eq(tables.segments.designSystemId, id))
    .orderBy(asc(tables.segments.position))
    .all();
  const { insights, naoAssociados } = lerManifesto(id);
  // Resumo na listagem (contagens por estado de interação); o detalhe pesado —
  // o HTML dos estados — só é servido pela rota de preview.
  const items = rows.map((r) => {
    const insight = insights.get(r.id) ?? null;
    return {
      ...r,
      fidelity: insight,
      resumo: insight?.pipeline ? resumirPipeline(insight.pipeline) : null,
    };
  });
  return c.json({ items, naoAssociados });
});

/**
 * Impacto de apagar uma extração: o que deixa de existir e o que sobrevive.
 * A interface mostra isso ANTES do delete, para a confirmação ser informada.
 */
designSystemsRoute.get('/:id/impacto', (c) => {
  const db = getDb();
  const id = c.req.param('id');
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

designSystemsRoute.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  db.delete(tables.designSystems).where(eq(tables.designSystems.id, id)).run();
  // TODO: apagar vault/{id}/ também. Fica para a Fase 4 quando tiver GC.
  return c.json({ deleted: true });
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
