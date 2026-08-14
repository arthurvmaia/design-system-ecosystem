import { existsSync, rmSync } from 'node:fs';
import { and, eq, getDb, tables } from '@ds/indexer';
import { libraryComponentDir } from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

/**
 * Tira da Biblioteca as CÓPIAS da mesma peça.
 *
 * ## De onde vieram
 *
 * A resegmentação apagava e recriava os segmentos, e `segment_id` é
 * `on delete set null`. `curar-biblioteca` reconhece "já está lá" por
 * `segmentId` — sem vínculo, ele não reconhecia nada e readicionava a peça
 * inteira, rodada após rodada.
 *
 * Medido: **861 linhas para 403 conteúdos distintos** — 458 duplicatas exatas,
 * 53% da Biblioteca. Depois de religar, 302 segmentos carregam de 2 a 3 linhas
 * cada.
 *
 * A causa está consertada em dois lugares (`segmentar.ts` preserva o id;
 * `religar-biblioteca.ts` reacende a flag `in_library`, que é o portão de
 * idempotência do app). Isto aqui limpa o que já se acumulou.
 *
 * ## Quem fica
 *
 * A peça é a mesma; o que muda é qual LINHA sobrevive. A ordem é: quem tem
 * vínculo com o segmento primeiro (é a que as regras de aceite alcançam), depois
 * quem tem bundle em disco (é a que a geração consegue montar), depois a mais
 * antiga (é a que os kits provavelmente já citam).
 *
 * ## O que não pode acontecer
 *
 * Kit apontando para linha apagada. Cada `kit_components` que cita uma cópia é
 * REAPONTADO para a sobrevivente antes de a cópia sair — e quando o kit já cita
 * as duas, a segunda citação some em vez de virar linha duplicada (a chave
 * primária é `kitId + componentId`). Isso significa que um kit pode perder uma
 * VAGA, e é o certo: ele estava usando a mesma peça duas vezes sem saber.
 */

export type Deduplicacao = {
  /** Grupos de conteúdo que tinham mais de uma linha. */
  grupos: number;
  /** Linhas removidas. */
  removidas: number;
  /** Citações de kit que passaram a apontar para a linha que ficou. */
  reapontadas: number;
  /** Citações que sumiram porque o kit já usava a sobrevivente. */
  vagasFundidas: number;
};

type Linha = {
  id: string;
  designSystemId: string;
  bundleHash: string;
  segmentId: string | null;
  addedAt: number;
};

/** A ordem de sobrevivência, isolada para ser testável sem banco. */
export const escolherSobrevivente = <T extends Linha>(
  copias: readonly T[],
  temBundle: (id: string) => boolean,
): T => {
  const nota = (l: T): number => (l.segmentId !== null ? 4 : 0) + (temBundle(l.id) ? 2 : 0);
  return [...copias].sort((a, b) => nota(b) - nota(a) || a.addedAt - b.addedAt)[0] as T;
};

export const deduplicarBiblioteca = (opcoes?: { seco?: boolean }): Deduplicacao => {
  const db = getDb();
  const seco = opcoes?.seco === true;
  const todas = db.select().from(tables.libraryComponents).all() as Linha[];

  const porConteudo = new Map<string, Linha[]>();
  for (const l of todas) {
    const k = `${l.designSystemId}|${l.bundleHash}`;
    porConteudo.set(k, [...(porConteudo.get(k) ?? []), l]);
  }

  let grupos = 0;
  let removidas = 0;
  let reapontadas = 0;
  let vagasFundidas = 0;

  const temBundle = (id: string): boolean => existsSync(libraryComponentDir(id as `cmp_${string}`));

  for (const copias of porConteudo.values()) {
    if (copias.length < 2) continue;
    grupos += 1;
    const fica = escolherSobrevivente(copias, temBundle);
    const saem = copias.filter((c) => c.id !== fica.id);

    for (const c of saem) {
      const citacoes = db
        .select()
        .from(tables.kitComponents)
        .where(eq(tables.kitComponents.componentId, c.id))
        .all();
      const jaTem = new Set(
        db
          .select()
          .from(tables.kitComponents)
          .where(eq(tables.kitComponents.componentId, fica.id))
          .all()
          .map((k) => k.kitId),
      );
      for (const cit of citacoes) {
        if (jaTem.has(cit.kitId)) {
          vagasFundidas += 1;
          continue;
        }
        reapontadas += 1;
        jaTem.add(cit.kitId);
        if (seco) continue;
        db.update(tables.kitComponents)
          .set({ componentId: fica.id })
          .where(
            and(
              eq(tables.kitComponents.kitId, cit.kitId),
              eq(tables.kitComponents.componentId, c.id),
            ),
          )
          .run();
      }
      removidas += 1;
      if (seco) continue;
      // O que restar de citação (as vagas fundidas) cai por `on delete cascade`.
      db.delete(tables.libraryComponents).where(eq(tables.libraryComponents.id, c.id)).run();
      const dir = libraryComponentDir(c.id as `cmp_${string}`);
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
  }

  return { grupos, removidas, reapontadas, vagasFundidas };
};

if (executadoDireto(import.meta.url)) {
  const seco = process.argv.includes('--seco');
  console.log(`\n  Deduplicando a Biblioteca${seco ? ' (SECO: nada será apagado)' : ''}…\n`);
  const r = deduplicarBiblioteca({ seco });
  console.log(`  ${r.grupos} conteúdo(s) tinham cópia.`);
  console.log(`  ${r.removidas} linha(s) ${seco ? 'sairiam' : 'saíram'}.`);
  console.log(
    `  ${r.reapontadas} citação(ões) de kit ${seco ? 'passariam' : 'passaram'} a apontar para a linha que ficou.`,
  );
  if (r.vagasFundidas > 0) {
    console.log(
      `  ${r.vagasFundidas} vaga(s) de kit ${seco ? 'sumiriam' : 'sumiram'}: aquele kit já usava a mesma peça duas vezes.`,
    );
  }
  console.log('');
}
