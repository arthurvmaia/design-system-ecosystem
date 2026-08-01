import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { getDb, tables } from '@ds/indexer';
import {
  type RejectedSegment,
  RejeitadosManifest,
  ehDesignSystemId,
  vaultRejeitadosPath,
} from '@ds/shared';
import { desc, eq } from 'drizzle-orm';
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

const gravarRejeitados = (dsId: `ds_${string}`, itens: RejectedSegment[]): void => {
  writeFileSync(
    vaultRejeitadosPath(dsId),
    JSON.stringify({ designSystemId: dsId, generatedAt: Date.now(), rejeitados: itens }, null, 2),
    'utf8',
  );
};

/**
 * "Aproveitar mesmo assim": a pessoa olhou, discordou do algoritmo e quer o
 * bloco na Galeria. O rejeitado vira segmento de verdade (mesmo id, mesma
 * posição) e sai da lista de pendências — deixou de ser um beco sem saída.
 */
rejeitadosRoute.post('/:dsId/:segId/recuperar', (c) => {
  const dsId = c.req.param('dsId');
  if (!ehDesignSystemId(dsId)) return c.json({ error: 'invalid_id' }, 400);
  const segId = c.req.param('segId');
  const itens = lerRejeitados(dsId);
  const item = itens.find((i) => i.id === segId);
  if (item === undefined) return c.json({ error: 'not_found' }, 404);

  const db = getDb();
  const existente = db.select().from(tables.segments).where(eq(tables.segments.id, item.id)).get();
  if (existente === undefined) {
    // A `position` do rejeitado NÃO pode ser reaproveitada.
    //
    // Ela vem de um contador próprio que começa em zero, enquanto a `position`
    // de um segmento também é a identidade da pasta de bundle (`seg_<n>`).
    // Reusar o número colidia com uma seção existente, e a partir daí a prévia
    // e a promoção deste bloco serviam o bundle de OUTRO segmento — com o nome
    // certo e os arquivos errados. O acervo tinha um rejeitado esperando esse
    // clique.
    //
    // Depois do fim da fila ninguém colide, e a ordem de exibição continua
    // fazendo sentido: o bloco recuperado à mão entra no fim, que é onde ele
    // realmente está na decisão da pessoa.
    const ultima = db
      .select({ position: tables.segments.position })
      .from(tables.segments)
      .where(eq(tables.segments.designSystemId, dsId))
      .orderBy(desc(tables.segments.position))
      .get();
    db.insert(tables.segments)
      .values({
        id: item.id,
        designSystemId: dsId,
        category: item.category,
        kind: item.kind,
        name: item.name,
        htmlSnippet: item.htmlSnippet,
        previewPath: null,
        position: ultima === undefined ? 0 : ultima.position + 1,
        inLibrary: false,
      })
      .run();
  }
  gravarRejeitados(
    dsId,
    itens.filter((i) => i.id !== segId),
  );
  return c.json({ ok: true, segmentId: item.id });
});

/** Descartar de vez: a pessoa concordou com o algoritmo. Some da lista. */
rejeitadosRoute.delete('/:dsId/:segId', (c) => {
  const dsId = c.req.param('dsId');
  if (!ehDesignSystemId(dsId)) return c.json({ error: 'invalid_id' }, 400);
  const segId = c.req.param('segId');
  const itens = lerRejeitados(dsId);
  if (!itens.some((i) => i.id === segId)) return c.json({ error: 'not_found' }, 404);
  gravarRejeitados(
    dsId,
    itens.filter((i) => i.id !== segId),
  );
  return c.json({ ok: true });
});
