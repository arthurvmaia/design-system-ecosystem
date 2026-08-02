import { consolidarDesignSystemDoKit } from '@ds/generator';
import { type getDb, tables } from '@ds/indexer';
import { libraryComponentBundleDir } from '@ds/shared';
import { eq, inArray } from 'drizzle-orm';

/**
 * Reconsolida o design system de um kit a partir das peças que ele tem AGORA.
 *
 * ## Por que saiu de `kits.ts`
 *
 * Morava lá, e por isso só era chamada de lá — nas três rotas de kit. O efeito
 * media-se no banco: **excluir uma peça da Biblioteca deixava todo kit que a
 * usava com um `tokensJson` que ainda descrevia as cores e as fontes da peça
 * apagada**. A linha da tabela ia embora por cascata; o design system derivado
 * dela, não. O kit continuava prometendo uma paleta que não existia mais.
 *
 * Cascata de linha e propagação de derivado são coisas diferentes, e o SQLite
 * só faz a primeira. A segunda é esta função, e ela precisa ser chamada de todo
 * lugar que muda o conjunto — inclusive de fora do CRUD de kit.
 *
 * ## Falha não derruba quem chamou
 *
 * Um kit que não salva porque um bundle não parseou seria punir a pessoa pelo
 * estado do disco. Em caso de erro o `tokensJson` vira `null`, o kit segue
 * utilizável (a geração degrada para as cores de origem e diz isso nos avisos)
 * e o `GET /design-system` tenta o backfill de novo.
 */
export const consolidarEGravar = (db: ReturnType<typeof getDb>, kitId: string): void => {
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

/**
 * Quais kits usam estas peças. A pergunta que a propagação precisa responder
 * ANTES de a peça sair, porque depois do delete o vínculo já foi embora pela
 * cascata e não há mais como saber quem dependia dela.
 */
export const kitsQueUsam = (
  db: ReturnType<typeof getDb>,
  componentIds: readonly string[],
): string[] => {
  if (componentIds.length === 0) return [];
  const linhas = db
    .select({ kitId: tables.kitComponents.kitId })
    .from(tables.kitComponents)
    .where(inArray(tables.kitComponents.componentId, [...componentIds]))
    .all();
  return [...new Set(linhas.map((l) => l.kitId))];
};

/**
 * Reconsolida vários kits. Cada um por sua conta: um bundle ruim num kit não
 * pode impedir a atualização dos outros.
 */
export const reconsolidarKits = (db: ReturnType<typeof getDb>, kitIds: readonly string[]): void => {
  for (const kitId of kitIds) consolidarEGravar(db, kitId);
};
