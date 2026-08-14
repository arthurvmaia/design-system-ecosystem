/**
 * Preenche `stack_json` para as capturas que já estão no acervo.
 *
 * Uso: pnpm stack:backfill [--seco]
 *
 * O motor sempre detectou a stack e o manifesto sempre guardou; só o caminho
 * `api` gravava no banco, e ele nunca roda. Resultado medido: NULL nas 7 linhas
 * do acervo, com o dado pronto em disco. Este script fecha a dívida sem
 * re-extrair nada: lê o manifesto de cada design system e grava o que achou.
 *
 * Seguro por construção:
 * - só preenche onde está NULL (não sobrescreve o que o modo `api` ou uma
 *   segmentação nova já gravaram);
 * - manifesto ausente ou ilegível deixa a linha como está e avisa;
 * - `--seco` mostra o que faria, sem tocar no banco.
 */
import { eq, getDb, runMigrations, tables } from '@ds/indexer';
import { executadoDireto } from './executado-direto.js';
import { lerStackDoManifesto } from './segmentar.js';

export type ResultadoBackfill = {
  preenchidos: number;
  semManifesto: number;
  jaTinham: number;
};

export const backfillStack = (seco: boolean): ResultadoBackfill => {
  runMigrations();
  const db = getDb();
  const todos = db
    .select({ id: tables.designSystems.id, stackJson: tables.designSystems.stackJson })
    .from(tables.designSystems)
    .all();

  let preenchidos = 0;
  let semManifesto = 0;
  let jaTinham = 0;

  for (const ds of todos) {
    if (ds.stackJson !== null) {
      jaTinham++;
      continue;
    }
    const stackJson = lerStackDoManifesto(ds.id as `ds_${string}`);
    if (stackJson === null) {
      semManifesto++;
      console.log(`  ${ds.id}: sem stack no manifesto (ou sem manifesto) — deixei como está.`);
      continue;
    }
    const nomes = (JSON.parse(stackJson) as Array<{ name?: string }>)
      .map((s) => s.name)
      .filter((n): n is string => typeof n === 'string')
      .slice(0, 4)
      .join(', ');
    if (!seco) {
      db.update(tables.designSystems)
        .set({ stackJson })
        .where(eq(tables.designSystems.id, ds.id))
        .run();
    }
    preenchidos++;
    console.log(`  ${ds.id}: ${nomes}${seco ? '  (seco: nada gravado)' : ''}`);
  }

  return { preenchidos, semManifesto, jaTinham };
};

if (executadoDireto(import.meta.url)) {
  const seco = process.argv.includes('--seco');
  const r = backfillStack(seco);
  console.log(
    `\n${seco ? '[seco] ' : ''}stack preenchida em ${r.preenchidos}, já tinham ${r.jaTinham}, sem manifesto ${r.semManifesto}.`,
  );
}
