import { getDb, tables } from '@ds/indexer';
import { CreateKitInput, UpdateKitInput, lerOuDerivarContrato, newKitId } from '@ds/shared';
import { libraryComponentBundleDir } from '@ds/shared/paths';
import { zValidator } from '@hono/zod-validator';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';

/**
 * CRUD dos kits — os Design Systems finais.
 *
 * Toda resposta de leitura devolve o kit COM os componentes resolvidos
 * (id, nome, categoria), porque é assim que a interface sempre consome:
 * um kit sem a lista do que tem dentro não diz nada.
 */
export const kitsRoute = new Hono();

type KitComComponentes = {
  id: string;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  components: Array<{
    id: string;
    name: string;
    category: string;
    kind: string;
    position: number;
  }>;
  /** Projetos que usam este kit — para a UI avisar antes de excluir. */
  usedByProjects: Array<{ id: string; name: string }>;
};

const carregarKit = (kitId: string): KitComComponentes | null => {
  const db = getDb();
  const kit = db.select().from(tables.kits).where(eq(tables.kits.id, kitId)).get();
  if (!kit) return null;

  const links = db
    .select()
    .from(tables.kitComponents)
    .where(eq(tables.kitComponents.kitId, kitId))
    .orderBy(asc(tables.kitComponents.position))
    .all();

  const componentIds = links.map((l) => l.componentId);
  const componentes =
    componentIds.length > 0
      ? db
          .select()
          .from(tables.libraryComponents)
          .where(inArray(tables.libraryComponents.id, componentIds))
          .all()
      : [];
  const porId = new Map(componentes.map((c) => [c.id, c]));

  const projetos = db
    .select({ id: tables.projects.id, name: tables.projects.name })
    .from(tables.projects)
    .where(eq(tables.projects.kitId, kitId))
    .all();

  return {
    id: kit.id,
    name: kit.name,
    description: kit.description,
    createdAt: kit.createdAt,
    updatedAt: kit.updatedAt,
    components: links.flatMap((l) => {
      const c = porId.get(l.componentId);
      // Link órfão (componente sumiu entre o cascade e a leitura): ignora.
      if (!c) return [];
      return [{ id: c.id, name: c.name, category: c.category, kind: c.kind, position: l.position }];
    }),
    usedByProjects: projetos,
  };
};

kitsRoute.get('/', (c) => {
  const db = getDb();
  const rows = db.select().from(tables.kits).orderBy(desc(tables.kits.updatedAt)).all();
  const items = rows
    .map((r) => carregarKit(r.id))
    .filter((k): k is KitComComponentes => k !== null);
  return c.json({ items });
});

kitsRoute.get('/:id', (c) => {
  const kit = carregarKit(c.req.param('id'));
  if (!kit) return c.json({ error: 'not_found' }, 404);
  return c.json({ item: kit });
});

/**
 * Resumo do CONTRATO de cada componente do kit: quantos espaços de texto,
 * mídia e link a peça realmente tem. É o que a etapa de mídia usa para mostrar
 * espaços REAIS em vez de um chute — componente sem bundle legível entra com
 * contrato nulo (a UI degrada para o comportamento genérico).
 */
kitsRoute.get('/:id/contratos', (c) => {
  const kit = carregarKit(c.req.param('id'));
  if (!kit) return c.json({ error: 'not_found' }, 404);
  const items = kit.components.map((cmp) => {
    const contrato = lerOuDerivarContrato(libraryComponentBundleDir(cmp.id as `cmp_${string}`));
    if (contrato === null) {
      return { id: cmp.id, disponivel: false, textos: 0, links: 0, logos: 0, midias: [] };
    }
    const midias = contrato.slots.midias.filter((m) => !m.pareceLogo);
    return {
      id: cmp.id,
      disponivel: true,
      textos: contrato.slots.textos.length,
      links: contrato.slots.links.length,
      logos: contrato.slots.midias.length - midias.length,
      midias: midias.map((m) => ({ tipo: m.tipo })),
    };
  });
  return c.json({ items });
});

kitsRoute.post('/', zValidator('json', CreateKitInput), (c) => {
  const input = c.req.valid('json');
  const db = getDb();
  const id = newKitId();
  const now = Date.now();

  // Valida os componentes ANTES de gravar: um kit apontando para itens que não
  // existem nasceria quebrado e a UI não teria como explicar o porquê.
  if (input.componentIds.length > 0) {
    const existentes = db
      .select({ id: tables.libraryComponents.id })
      .from(tables.libraryComponents)
      .where(inArray(tables.libraryComponents.id, input.componentIds))
      .all();
    if (existentes.length !== input.componentIds.length) {
      return c.json({ error: 'componentes_inexistentes' }, 400);
    }
  }

  db.transaction((tx) => {
    tx.insert(tables.kits)
      .values({
        id,
        name: input.name,
        description: input.description ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    input.componentIds.forEach((componentId, position) => {
      tx.insert(tables.kitComponents).values({ kitId: id, componentId, position }).run();
    });
  });

  return c.json({ item: carregarKit(id) }, 201);
});

kitsRoute.patch('/:id', zValidator('json', UpdateKitInput), (c) => {
  const id = c.req.param('id');
  const input = c.req.valid('json');
  const db = getDb();

  const kit = db.select().from(tables.kits).where(eq(tables.kits.id, id)).get();
  if (!kit) return c.json({ error: 'not_found' }, 404);

  if (input.componentIds !== undefined && input.componentIds.length > 0) {
    const existentes = db
      .select({ id: tables.libraryComponents.id })
      .from(tables.libraryComponents)
      .where(inArray(tables.libraryComponents.id, input.componentIds))
      .all();
    if (existentes.length !== input.componentIds.length) {
      return c.json({ error: 'componentes_inexistentes' }, 400);
    }
  }

  db.transaction((tx) => {
    tx.update(tables.kits)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        updatedAt: Date.now(),
      })
      .where(eq(tables.kits.id, id))
      .run();

    if (input.componentIds !== undefined) {
      // Substituição completa: a ordem que veio é a ordem que vale.
      tx.delete(tables.kitComponents).where(eq(tables.kitComponents.kitId, id)).run();
      input.componentIds.forEach((componentId, position) => {
        tx.insert(tables.kitComponents).values({ kitId: id, componentId, position }).run();
      });
    }
  });

  return c.json({ item: carregarKit(id) });
});

kitsRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const kit = db.select().from(tables.kits).where(eq(tables.kits.id, id)).get();
  if (!kit) return c.json({ error: 'not_found' }, 404);

  // Projetos que usavam este kit continuam existindo (kit_id vira null pelo
  // schema). A UI já mostrou o impacto via GET antes de chegar aqui.
  db.delete(tables.kits).where(eq(tables.kits.id, id)).run();
  return c.json({ deleted: true });
});

/** Duplicar um kit: mesma seleção, nome novo. */
kitsRoute.post('/:id/duplicate', (c) => {
  const id = c.req.param('id');
  const origem = carregarKit(id);
  if (!origem) return c.json({ error: 'not_found' }, 404);

  const db = getDb();
  const novoId = newKitId();
  const now = Date.now();
  db.transaction((tx) => {
    tx.insert(tables.kits)
      .values({
        id: novoId,
        name: `${origem.name} (cópia)`,
        description: origem.description,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    origem.components.forEach((comp, position) => {
      tx.insert(tables.kitComponents)
        .values({ kitId: novoId, componentId: comp.id, position })
        .run();
    });
  });

  return c.json({ item: carregarKit(novoId) }, 201);
});
