/**
 * Atualiza NO LUGAR o bundle das peças promovidas da Biblioteca, a partir do
 * acervo atual.
 *
 * Por que existe: as peças promovidas antes da reforma do motor congelaram os
 * defeitos da captura da época (runtime como `.17` morto, `src` remoto, CSS
 * fatiado no meio de string). O motor foi consertado e o acervo recapturado —
 * mas a Biblioteca é cópia curada, e re-promover pela tela criaria ids novos,
 * quebrando os kits que apontam para os antigos.
 *
 * O que este script faz, por peça:
 *   1. Casa a peça com o segmento ATUAL do acervo (mesma origem + mesmo nome;
 *      desempate por categoria). O que não casar é LISTADO e não é tocado —
 *      re-promover é curadoria do dono.
 *   2. Reusa a promoção inteira (`montarComponente`) num componente temporário.
 *   3. Troca o bundle do temporário para dentro do componente existente,
 *      guardando o anterior em `bundle.anterior/` para rollback.
 *   4. Regrava o metadata mantendo id/addedAt/tags/notes originais e apaga o
 *      temporário. O banco recebe o novo segmentId/bundleHash.
 *
 * Uso:
 *   pnpm tsx scripts/biblioteca-atualizar-bundles.ts          # ensaio (só diz o que faria)
 *   pnpm tsx scripts/biblioteca-atualizar-bundles.ts --aplicar
 */
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { and, eq, getDb, runMigrations, tables } from '@ds/indexer';
import {
  libraryComponentBundleDir,
  libraryComponentDir,
  libraryComponentMetadata,
} from '@ds/shared';
import { montarComponente } from '../apps/server/src/routes/library.js';

const aplicar = process.argv.includes('--aplicar');
runMigrations();
const db = getDb();

const pecas = db.select().from(tables.libraryComponents).all();
console.log(
  `\n${pecas.length} peça(s) na Biblioteca. ${aplicar ? '' : '(ensaio — nada será tocado)'}\n`,
);

let atualizadas = 0;
const naoCasadas: string[] = [];

/** Tokens significativos de um nome de peça, para o casamento por afinidade. */
const tokensDe = (nome: string): Set<string> =>
  new Set(
    nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !['com', 'por', 'para', 'animado'].includes(t)),
  );

for (const cmp of pecas) {
  /**
   * Peça sem design system de origem não tem onde ser procurada.
   *
   * `designSystemId` é anulável na Biblioteca, e o casamento inteiro deste
   * script parte dela: mesma origem, mesmo nome — depois mesma origem, mesma
   * categoria. Sem origem não há a primeira metade de nenhuma das duas buscas,
   * então ela entra na lista de não-casadas com o motivo em vez de derrubar a
   * consulta.
   */
  const daOrigem = cmp.designSystemId;
  if (daOrigem === null) {
    naoCasadas.push(`${cmp.name} (sem design system de origem)`);
    continue;
  }

  const candidatos = db
    .select()
    .from(tables.segments)
    .where(and(eq(tables.segments.designSystemId, daOrigem), eq(tables.segments.name, cmp.name)))
    .all();
  let seg =
    candidatos.length <= 1
      ? candidatos[0]
      : (candidatos.find((s) => s.category === cmp.category) ?? candidatos[0]);

  if (seg === undefined) {
    // O naming da reforma acrescentou sufixos e corrigiu rótulos ("WebP" que
    // era WebGL), então o nome exato não basta. Fallback: mesma origem + MESMA
    // categoria, maior sobreposição de tokens do nome — e só com maioria dos
    // tokens antigos presentes; empate ou afinidade fraca não casa.
    const daCategoria = db
      .select()
      .from(tables.segments)
      .where(
        and(
          eq(tables.segments.designSystemId, daOrigem),
          eq(tables.segments.category, cmp.category),
        ),
      )
      .all();
    const alvo = tokensDe(cmp.name);
    const pontuados = daCategoria
      .map((s) => {
        const dele = tokensDe(s.name);
        const comuns = [...alvo].filter((t) => dele.has(t)).length;
        return { s, afinidade: alvo.size === 0 ? 0 : comuns / alvo.size };
      })
      .filter((p) => p.afinidade > 0.5)
      .sort((a, b) => b.afinidade - a.afinidade);
    const melhor = pontuados[0];
    const segundo = pontuados[1];
    if (melhor !== undefined && (segundo === undefined || segundo.afinidade < melhor.afinidade)) {
      seg = melhor.s;
      console.log(
        `  (afinidade ${(melhor.afinidade * 100).toFixed(0)}%) "${cmp.name}" → "${melhor.s.name}"`,
      );
    }
  }

  if (seg === undefined) {
    naoCasadas.push(
      `${cmp.id} — "${cmp.name}" (${cmp.designSystemId}): sem segmento equivalente no acervo atual`,
    );
    continue;
  }

  console.log(`  ${cmp.name}`);
  console.log(
    `    ${cmp.id}  ←  ${seg.id}${candidatos.length > 1 ? ` (${candidatos.length} candidatos, desempate por categoria)` : ''}`,
  );
  if (!aplicar) continue;

  // 2. Promoção real, num componente temporário.
  const novo = montarComponente(seg);
  const dirNovo = libraryComponentDir(novo.id as `cmp_${string}`);

  try {
    // 3. Troca atômica do bundle, com o anterior guardado.
    const bundleAtual = libraryComponentBundleDir(cmp.id as `cmp_${string}`);
    const anterior = `${bundleAtual}.anterior`;
    rmSync(anterior, { recursive: true, force: true });
    if (existsSync(bundleAtual)) renameSync(bundleAtual, anterior);
    renameSync(libraryComponentBundleDir(novo.id as `cmp_${string}`), bundleAtual);

    // 4. Metadata: o conteúdo novo, a identidade antiga.
    const metaNovo = JSON.parse(
      readFileSync(libraryComponentMetadata(novo.id as `cmp_${string}`), 'utf8'),
    ) as Record<string, unknown>;
    const metaPath = libraryComponentMetadata(cmp.id as `cmp_${string}`);
    const metaVelho = existsSync(metaPath)
      ? (JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>)
      : {};
    writeFileSync(
      metaPath,
      JSON.stringify(
        {
          ...metaNovo,
          id: cmp.id,
          name: cmp.name,
          addedAt: metaVelho.addedAt ?? cmp.addedAt,
          tags: metaVelho.tags ?? [],
          notes: metaVelho.notes ?? cmp.notes,
        },
        null,
        2,
      ),
      'utf8',
    );

    db.update(tables.libraryComponents)
      .set({ segmentId: seg.id, bundleHash: novo.bundleHash })
      .where(eq(tables.libraryComponents.id, cmp.id))
      .run();
    atualizadas++;
  } finally {
    rmSync(dirNovo, { recursive: true, force: true });
  }
}

console.log(`\n${aplicar ? `${atualizadas} atualizada(s).` : 'Ensaio: nada aplicado.'}`);
if (naoCasadas.length > 0) {
  console.log('\nNÃO casaram (ficam como estão; re-promover é curadoria):');
  for (const n of naoCasadas) console.log(`  - ${n}`);
}
