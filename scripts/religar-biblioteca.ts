import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDb, tables } from '@ds/indexer';
import { libraryComponentBundleDir } from '@ds/shared';
import { eq, isNull } from 'drizzle-orm';

/**
 * Religa as linhas ÓRFÃS da Biblioteca aos segmentos recriados.
 *
 * ## O nó que isto desata
 *
 * `pnpm resegmentar` apaga e recria os segmentos de um design system, e
 * `library_components.segment_id` é `on delete set null`. Toda linha da
 * Biblioteca daquela origem perde o vínculo — medido: **553 de 861**.
 *
 * O estrago tem dois lados, e o segundo é o que trava o trabalho:
 *
 * 1. `curar-biblioteca.ts` reconhece "já está na Biblioteca" por `segmentId`.
 *    Sem vínculo, ele não reconhece nada e readiciona a peça inteira. Foi assim
 *    que a Biblioteca foi de 298 para 861 linhas com metade de duplicata.
 * 2. As regras de aceite da Galeria (G1..G9) só alcançam peça COM segmento.
 *    Linha órfã é inalcançável — e é por isso que não dava para tirar da
 *    Biblioteca as peças que o dono mandou tirar. A régua existia e não chegava.
 *
 * ## Como o vínculo é reencontrado, e o que cada passo resolve
 *
 * Medido sobre as 553 órfãs de hoje:
 *
 * | chave | resolve |
 * |---|---|
 * | origem + nome + categoria, candidato ÚNICO | 477 |
 * | entre os empatados, o segmento cujo trecho de HTML está no bundle | +65 |
 * | ainda ambíguo | 11 |
 *
 * 542 de 553 — 98%. O trecho de HTML é o desempate certo porque é o CONTEÚDO:
 * dois segmentos podem ter o mesmo nome e categoria na mesma origem (duas
 * faixas de cartões), e o que os separa é o que está escrito dentro.
 *
 * Os 11 que sobram ficam órfãos e são DITOS. Escolher um deles no chute ligaria
 * a peça ao segmento errado, e uma peça ligada ao segmento errado é pior que uma
 * peça sem vínculo: ela passa a ser julgada pela evidência de outra.
 */

export type Religacao = {
  religadas: number;
  porNome: number;
  porTrecho: number;
  aindaOrfas: number;
};

/** Quanto do trecho basta para reconhecer: o começo já é assinatura. */
const ASSINATURA = 200;

export const religarBibliotecaAosSegmentos = (dsId?: string): Religacao => {
  const db = getDb();

  const orfas = db
    .select()
    .from(tables.libraryComponents)
    .where(isNull(tables.libraryComponents.segmentId))
    .all()
    .filter((o) => dsId === undefined || o.designSystemId === dsId);

  if (orfas.length === 0) return { religadas: 0, porNome: 0, porTrecho: 0, aindaOrfas: 0 };

  const segs = db.select().from(tables.segments).all();
  const porChave = new Map<string, typeof segs>();
  for (const s of segs) {
    const k = `${s.designSystemId}|${s.name}|${s.category}`;
    porChave.set(k, [...(porChave.get(k) ?? []), s]);
  }

  let porNome = 0;
  let porTrecho = 0;
  let aindaOrfas = 0;

  for (const o of orfas) {
    const candidatos = porChave.get(`${o.designSystemId}|${o.name}|${o.category}`) ?? [];
    let escolhido = candidatos.length === 1 ? candidatos[0] : undefined;
    let viaTrecho = false;

    if (escolhido === undefined && candidatos.length > 1) {
      const index = join(libraryComponentBundleDir(o.id as `cmp_${string}`), 'index.html');
      if (existsSync(index)) {
        let html = '';
        try {
          html = readFileSync(index, 'utf8');
        } catch {
          html = '';
        }
        const casam = candidatos.filter(
          (s) =>
            typeof s.htmlSnippet === 'string' &&
            s.htmlSnippet.length > 0 &&
            html.includes(s.htmlSnippet.slice(0, ASSINATURA)),
        );
        if (casam.length === 1) {
          escolhido = casam[0];
          viaTrecho = true;
        }
      }
    }

    if (escolhido === undefined) {
      aindaOrfas += 1;
      continue;
    }
    db.update(tables.libraryComponents)
      .set({ segmentId: escolhido.id })
      .where(eq(tables.libraryComponents.id, o.id))
      .run();
    if (viaTrecho) porTrecho += 1;
    else porNome += 1;
  }

  return { religadas: porNome + porTrecho, porNome, porTrecho, aindaOrfas };
};
