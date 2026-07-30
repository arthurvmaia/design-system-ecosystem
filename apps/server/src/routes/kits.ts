import { consolidarDesignSystemDoKit } from '@ds/generator';
import { getDb, tables } from '@ds/indexer';
import {
  CreateKitInput,
  KitDesignSystem,
  UpdateKitInput,
  lerOuDerivarContrato,
  newKitId,
} from '@ds/shared';
import { libraryComponentBundleDir } from '@ds/shared/paths';
import { zValidator } from '@hono/zod-validator';
import { asc, desc, eq, inArray } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

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

/**
 * Consolida o design system do kit e grava em `kits.tokensJson`.
 *
 * Roda no POST e em todo PATCH que troca a seleção de peças. FALHA NÃO DERRUBA
 * O CRUD: o kit continua utilizável sem design system (a geração degrada para
 * as cores de origem e diz isso nos avisos), e o GET /design-system tenta o
 * backfill de novo. Um kit que não salva porque um bundle não parseou seria
 * punir a pessoa pelo estado do disco.
 */
const consolidarEGravar = (db: ReturnType<typeof getDb>, kitId: string): void => {
  try {
    const componentes = db
      .select({
        componentId: tables.kitComponents.componentId,
        designSystemId: tables.libraryComponents.designSystemId,
      })
      .from(tables.kitComponents)
      .innerJoin(
        tables.libraryComponents,
        eq(tables.kitComponents.componentId, tables.libraryComponents.id),
      )
      .where(eq(tables.kitComponents.kitId, kitId))
      .all();
    const ds = consolidarDesignSystemDoKit(
      componentes.map((cmp) => ({
        id: cmp.componentId,
        bundlePath: libraryComponentBundleDir(cmp.componentId as `cmp_${string}`),
        designSystemId: cmp.designSystemId,
      })),
    );
    db.update(tables.kits)
      .set({ tokensJson: JSON.stringify(ds) })
      .where(eq(tables.kits.id, kitId))
      .run();
  } catch (err) {
    console.warn(`Consolidação do design system do kit ${kitId} falhou:`, err);
    db.update(tables.kits).set({ tokensJson: null }).where(eq(tables.kits.id, kitId)).run();
  }
};

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

  consolidarEGravar(db, id);
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

  // Só a troca de peças muda o design system; renomear o kit não.
  if (input.componentIds !== undefined) consolidarEGravar(db, id);
  return c.json({ item: carregarKit(id) });
});

/**
 * O design system consolidado do kit.
 *
 * Backfill preguiçoso: kit criado antes da consolidação existir (tokensJson
 * null) é consolidado AGORA, gravado e devolvido — o acervo inteiro ganha
 * design system sem nenhum passo manual. Se nem agora der, devolve null com as
 * consequências declaradas pela geração.
 */
kitsRoute.get('/:id/design-system', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const kit = db.select().from(tables.kits).where(eq(tables.kits.id, id)).get();
  if (!kit) return c.json({ error: 'not_found' }, 404);

  if (kit.tokensJson === null) {
    consolidarEGravar(db, id);
  }
  const atual = db.select().from(tables.kits).where(eq(tables.kits.id, id)).get();
  if (atual?.tokensJson == null) return c.json({ item: null });
  try {
    return c.json({ item: KitDesignSystem.parse(JSON.parse(atual.tokensJson)) });
  } catch {
    // Schema de uma versão futura ou JSON corrompido: reconsolidar na próxima.
    db.update(tables.kits).set({ tokensJson: null }).where(eq(tables.kits.id, id)).run();
    return c.json({ item: null });
  }
});

/**
 * Solta os projetos de um conjunto de kits e apaga os kits, numa transação.
 *
 * O `kit_id = null` explícito não é redundância: o schema.ts declara
 * `onDelete: 'set null'`, mas a migration 0002 criou a coluna com
 * `REFERENCES kits(id)` SEM a ação — e no SQLite a ação de FK mora no DDL da
 * tabela, não no ORM. Com `foreign_keys = ON` (db.ts:29), apagar um kit em uso
 * estourava `SQLITE_CONSTRAINT_FOREIGNKEY` em vez de soltar o projeto. O
 * comentário antigo desta rota ("kit_id vira null pelo schema") descrevia a
 * intenção, não o comportamento; o teste de lote pegou a diferença.
 *
 * Refazer a tabela `projects` só para consertar o DDL seria uma migration de
 * reconstrução (SQLite não altera FK) por um ganho que esta linha já entrega.
 */
const soltarProjetosEApagar = (db: ReturnType<typeof getDb>, ids: readonly string[]): void => {
  if (ids.length === 0) return;
  db.transaction((tx) => {
    tx.update(tables.projects)
      .set({ kitId: null })
      .where(inArray(tables.projects.kitId, [...ids]))
      .run();
    tx.delete(tables.kits)
      .where(inArray(tables.kits.id, [...ids]))
      .run();
  });
};

kitsRoute.delete('/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const kit = db.select().from(tables.kits).where(eq(tables.kits.id, id)).get();
  if (!kit) return c.json({ error: 'not_found' }, 404);

  // Projetos que usavam este kit continuam existindo, soltos do kit. A UI já
  // mostrou o impacto via GET antes de chegar aqui.
  soltarProjetosEApagar(db, [id]);
  return c.json({ deleted: true });
});

const ExcluirLoteInput = z.object({
  kitIds: z.array(z.string().startsWith('kit_')).min(1).max(200),
  /** Sem isto, kit EM USO por projeto não é excluído — volta na resposta para a UI avisar. */
  confirmarEmUso: z.boolean().optional().default(false),
});

/**
 * Exclusão em lote com aviso de uso: um kit que algum projeto usa só sai com
 * confirmação explícita. Excluir não apaga projeto nenhum — o kit_id vira null
 * pelo schema, mesmo comportamento do DELETE unitário — mas a pessoa precisa
 * decidir isso sabendo QUAIS projetos perdem a ligação, não descobrir depois.
 */
kitsRoute.post('/excluir-lote', zValidator('json', ExcluirLoteInput), (c) => {
  const { kitIds, confirmarEmUso } = c.req.valid('json');
  const db = getDb();
  const rows = db.select().from(tables.kits).where(inArray(tables.kits.id, kitIds)).all();

  // Uma consulta só para o lote inteiro: o vínculo é direto (projects.kit_id),
  // sem a tabela intermediária que a Biblioteca precisa atravessar.
  const projetos =
    rows.length > 0
      ? db
          .select({ name: tables.projects.name, kitId: tables.projects.kitId })
          .from(tables.projects)
          .where(
            inArray(
              tables.projects.kitId,
              rows.map((r) => r.id),
            ),
          )
          .all()
      : [];

  const emUso = rows.flatMap((r) => {
    const nomes = projetos.filter((p) => p.kitId === r.id).map((p) => p.name);
    if (nomes.length === 0) return [];
    return [{ id: r.id, name: r.name, projetos: nomes }];
  });

  const bloqueados = confirmarEmUso ? new Set<string>() : new Set(emUso.map((u) => u.id));
  const paraExcluir = rows.filter((r) => !bloqueados.has(r.id));

  // O cascade limpa kit_components; os projetos são soltos explicitamente
  // (ver soltarProjetosEApagar: o DDL da migration 0002 não tem o SET NULL que
  // o schema promete). As peças da Biblioteca não são tocadas — kit é seleção.
  soltarProjetosEApagar(
    db,
    paraExcluir.map((r) => r.id),
  );

  return c.json({
    excluidos: paraExcluir.map((r) => r.id),
    emUso,
    faltando: kitIds.filter((id) => !rows.some((r) => r.id === id)),
  });
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
