import { existsSync, readFileSync } from 'node:fs';
import { getDb, tables } from '@ds/indexer';
import { type RejectedSegment, RejeitadosManifest, vaultRejeitadosPath } from '@ds/shared';
import { desc } from 'drizzle-orm';
import { Hono } from 'hono';

/**
 * Os candidatos que não passaram na validação da segmentação.
 *
 * A Galeria mostra só o que o algoritmo conseguiu interpretar. O que ficou de
 * fora não some calado: fica gravado em `vault/<ds>/segments/rejeitados.json` e
 * é servido aqui, agrupado por design system, para a tela de Revisão e para o
 * contador que avisa quantos blocos precisam de um olhar humano.
 */
export const rejeitadosRoute = new Hono();

const lerRejeitados = (dsId: `ds_${string}`): RejectedSegment[] => {
  const path = vaultRejeitadosPath(dsId);
  if (!existsSync(path)) return [];
  try {
    return RejeitadosManifest.parse(JSON.parse(readFileSync(path, 'utf8'))).rejeitados;
  } catch {
    return [];
  }
};

rejeitadosRoute.get('/', (c) => {
  const db = getDb();
  const dss = db
    .select()
    .from(tables.designSystems)
    .orderBy(desc(tables.designSystems.extractedAt))
    .all();

  const grupos = dss
    .map((ds) => ({
      designSystemId: ds.id,
      designSystemName: ds.name,
      itens: lerRejeitados(ds.id as `ds_${string}`),
    }))
    .filter((g) => g.itens.length > 0);

  const total = grupos.reduce((n, g) => n + g.itens.length, 0);
  return c.json({ grupos, total });
});
