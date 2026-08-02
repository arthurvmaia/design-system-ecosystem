import { type getDb, tables } from '@ds/indexer';
import {
  type GovernancaDoKit,
  type PecaParaRegra,
  type Violacao,
  violacoesDoKit,
} from '@ds/shared';
import { eq, inArray } from 'drizzle-orm';

/**
 * A governança de um kit, lida do banco.
 *
 * A regra em si mora em `@ds/shared` e é função pura, testável sem banco. Aqui
 * fica só o que precisa de SQL: buscar as regras gravadas e as peças com as
 * origens delas.
 */
export const governancaDoKit = (db: ReturnType<typeof getDb>, kitId: string): GovernancaDoKit => {
  const kit = db
    .select({ origemBase: tables.kits.origemBase })
    .from(tables.kits)
    .where(eq(tables.kits.id, kitId))
    .get();
  const regras = db
    .select({
      categoria: tables.kitRegrasDeOrigem.categoria,
      designSystemId: tables.kitRegrasDeOrigem.designSystemId,
    })
    .from(tables.kitRegrasDeOrigem)
    .where(eq(tables.kitRegrasDeOrigem.kitId, kitId))
    .all();

  return {
    origemBase: kit?.origemBase ?? null,
    origemPorCategoria: Object.fromEntries(regras.map((r) => [r.categoria, r.designSystemId])),
  };
};

/** As peças de uma lista de ids, no formato que a regra entende. */
export const pecasParaRegra = (
  db: ReturnType<typeof getDb>,
  componentIds: readonly string[],
): PecaParaRegra[] => {
  if (componentIds.length === 0) return [];
  return db
    .select({
      id: tables.libraryComponents.id,
      name: tables.libraryComponents.name,
      category: tables.libraryComponents.category,
      designSystemId: tables.libraryComponents.designSystemId,
    })
    .from(tables.libraryComponents)
    .where(inArray(tables.libraryComponents.id, [...componentIds]))
    .all();
};

/**
 * Esta lista de peças cabe nas regras deste kit?
 *
 * Chamada ANTES de gravar. O kit é recusado inteiro quando há violação, e não
 * gravado pela metade: um kit meio-salvo deixaria a pessoa sem saber o que
 * entrou e o que não entrou.
 */
export const conferirRegras = (
  db: ReturnType<typeof getDb>,
  kitId: string,
  componentIds: readonly string[],
): Violacao[] => violacoesDoKit(pecasParaRegra(db, componentIds), governancaDoKit(db, kitId));
