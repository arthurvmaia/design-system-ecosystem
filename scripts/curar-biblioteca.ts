/**
 * Escolhe, entre TODAS as peças da Galeria, as que merecem ir para a Biblioteca.
 *
 * Uso:
 *   pnpm curar --seco            # só mostra o que faria, com a nota de cada uma
 *   pnpm curar                   # aplica: curte as aprovadas
 *   pnpm curar --limpar          # tira da Biblioteca o que não passaria hoje
 *   pnpm curar --por-origem 6    # teto de peças por site de origem
 *
 * ## Por que isto existe
 *
 * Com o catálogo inteiro extraído a Galeria passa de mil peças, e "dar like no
 * que veio bom" deixa de ser uma tarde de cliques para virar uma tarde perdida.
 * Pior: o olho cansa e a escolha vira ordem alfabética.
 *
 * As peças aqui são julgadas pelo que a captura MEDIU sobre elas, não por gosto.
 *
 * ## O que reprova
 *
 * - **Suporte "nao-suportado"**: a captura não reproduz o item. É o mesmo portão
 *   que a rota de curtir já aplica; repeti-lo aqui evita propor o que seria
 *   recusado adiante.
 * - **Referência visual**: é uma FOTO da região, não um componente. Ela não
 *   aceita a copy da marca nem a recoloração, e entra no site do cliente como um
 *   retrato de outra empresa.
 * - **Reprovada na comparação de pixel**: o bundle não bate com o que a captura
 *   viu. A peça pode até abrir, mas não é aquilo que a pessoa escolheu.
 * - **HTML pequeno demais**: abaixo de 200 caracteres não há componente — é
 *   sobra de recorte. (Comportamento e cursor escapam desta regra: eles são
 *   pequenos POR NATUREZA, e o que vale neles é o script.)
 *
 * ## O que a nota premia
 *
 * Fidelidade medida, movimento reproduzível (o dono pediu movimento em toda
 * rodada), estado capturado e riqueza de conteúdo. Empate desfaz-se pelo id do
 * segmento — arbitrário, mas ESTÁVEL: o comentário antigo prometia desempate
 * por fidelidade e o código tinha uma chave só, então empate caía na ordem em
 * que o banco devolvia as linhas.
 *
 * ## O teto por origem
 *
 * Sem ele a Biblioteca vira o retrato de dois ou três sites: um site com 34
 * peças boas ocuparia sozinho um terço dela, e os kits sairiam todos parecidos.
 * O teto é o que garante variedade — que é exatamente o que o dono cobrou
 * ("vc sempre escolhe os mesmos componentes").
 *
 * ## Onde mora a decisão
 *
 * Aqui ficou a leitura de disco. A NOTA e a ESCOLHA (reserva por papel, cotas,
 * tetos) moram em `curadoria-escolha.ts`, puras e com teste próprio — enquanto
 * viviam neste arquivo, que chamava `principal()` na importação, importá-lo num
 * teste rodaria a curadoria do acervo real da máquina.
 */
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { getDb, tables } from '@ds/indexer';
import {
  type PecaParaAceite,
  SegmentsManifest,
  type SegmentsManifest as SegmentsManifestType,
  libraryComponentDir,
  rastreamentoDoBundle,
  vaultSegmentsManifest,
} from '@ds/shared';
import { eq } from 'drizzle-orm';
import { lerBundleInfo } from '../apps/server/src/lib/bundle-v2.js';
import { montarComponente } from '../apps/server/src/routes/library.js';
import { type Nota, avaliarPeca, escolherParaBiblioteca } from './curadoria-escolha.js';
import { executadoDireto } from './executado-direto.js';

const manifestoDe = (() => {
  const cache = new Map<string, SegmentsManifestType | null>();
  return (dsId: string): SegmentsManifestType | null => {
    const emCache = cache.get(dsId);
    if (emCache !== undefined) return emCache;
    let lido: SegmentsManifestType | null = null;
    const p = vaultSegmentsManifest(dsId as `ds_${string}`);
    if (existsSync(p)) {
      try {
        lido = SegmentsManifest.parse(JSON.parse(readFileSync(p, 'utf8')));
      } catch {
        lido = null;
      }
    }
    cache.set(dsId, lido);
    return lido;
  };
})();

/**
 * A leitura de disco de uma peça; a NOTA em si mora em `curadoria-escolha.ts`.
 *
 * A separação existe para a decisão poder ser testada: enquanto tudo morava
 * aqui, importar este arquivo num teste rodaria a curadoria do acervo real da
 * máquina, porque a última linha chamava `principal()`.
 */
const avaliar = (seg: {
  id: string;
  designSystemId: string;
  name: string;
  category: string;
  kind: string;
  htmlSnippet: string | null;
  position: number;
  inLibrary: boolean;
}): Nota => {
  const manifesto = manifestoDe(seg.designSystemId);
  const insight = (manifesto?.insights ?? []).find((i) => i.segmentId === seg.id) ?? null;
  const bundle = lerBundleInfo(seg.designSystemId as `ds_${string}`, { position: seg.position });

  return avaliarPeca({
    segId: seg.id,
    dsId: seg.designSystemId,
    nome: seg.name,
    categoria: seg.category,
    kind: seg.kind,
    htmlSnippet: seg.htmlSnippet,
    jaNaBiblioteca: seg.inLibrary,
    fidelidade: insight?.fidelity ?? 0,
    representacao: (bundle?.representation as PecaParaAceite['representacao'] | undefined) ?? null,
    representacaoDoInsight:
      (insight?.representation as PecaParaAceite['representacao'] | undefined) ?? null,
    interacoes: insight?.interactions?.length ?? 0,
    movimentoProprio: (insight?.scroll?.length ?? 0) > 0 || seg.kind === 'animation',
    suporte: insight?.support ?? null,
    comparacaoVisualOk: insight?.comparacaoVisual?.ok ?? null,
    comparacaoVisualDelta: insight?.comparacaoVisual?.delta ?? null,
    // O bundle está em disco AGORA: G8 é a única regra do aceite que a curadoria
    // consegue conferir por inteiro, e é a que evita levar para o kit uma peça
    // cujo script mistura o analytics da origem com o comportamento dela.
    rastreamento: bundle === null ? null : rastreamentoDoBundle(bundle.dir).estado,
  });
};

const principal = (): void => {
  const args = process.argv.slice(2);
  const seco = args.includes('--seco');
  const limpar = args.includes('--limpar');
  const tetoPorOrigem = Number(args[args.indexOf('--por-origem') + 1]) || 6;

  const db = getDb();
  const segs = db.select().from(tables.segments).all();
  /**
   * Quem está na Biblioteca é quem tem LINHA em `library_components` — não quem
   * tem a flag `inLibrary` ligada no segmento.
   *
   * Os dois saíram de sincronia na primeira rodada deste script: ele desligava a
   * flag e deixava a linha, então na rodada seguinte a peça não aparecia como
   * "na Biblioteca", não entrava na lista de retirada, e ficava lá para sempre.
   * A flag é espelho; a linha é o fato.
   */
  const naBiblioteca = new Set(
    db
      .select({ segmentId: tables.libraryComponents.segmentId })
      .from(tables.libraryComponents)
      .all()
      .map((r) => r.segmentId),
  );
  const notas = segs.map((s) =>
    avaliar({
      id: s.id,
      designSystemId: s.designSystemId,
      name: s.name,
      category: s.category,
      kind: s.kind,
      htmlSnippet: s.htmlSnippet,
      position: s.position,
      inLibrary: naBiblioteca.has(s.id),
    }),
  );

  const aprovadas = notas.filter((n) => n.reprova === null);
  const escolhidas = escolherParaBiblioteca(notas, { tetoPorOrigem });

  const entrar = escolhidas.filter((n) => !n.jaNaBiblioteca);
  const sair = notas.filter(
    (n) => n.jaNaBiblioteca && !escolhidas.some((e) => e.segId === n.segId),
  );

  console.log('');
  console.log(`  Galeria: ${notas.length} peça(s)`);
  console.log(`  Reprovadas: ${notas.length - aprovadas.length}`);
  const porMotivo = new Map<string, number>();
  for (const n of notas) {
    if (n.reprova === null) continue;
    const chave = n.reprovaTipo ?? n.reprova;
    porMotivo.set(chave, (porMotivo.get(chave) ?? 0) + 1);
  }
  for (const [motivo, n] of [...porMotivo.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(4)} — ${motivo}`);
  }
  console.log(
    `  Aprovadas: ${aprovadas.length} | escolhidas com teto de ${tetoPorOrigem}/origem: ${escolhidas.length}`,
  );
  console.log(`  Entram na Biblioteca: ${entrar.length} | sairiam: ${sair.length}`);
  console.log('');
  console.log('  Cobertura por categoria (é ela que decide se dá para montar kit):');
  const contagem = new Map<string, number>();
  for (const n of escolhidas) contagem.set(n.categoria, (contagem.get(n.categoria) ?? 0) + 1);
  const linhas = [...contagem.entries()].sort((a, b) => b[1] - a[1]);
  for (let i = 0; i < linhas.length; i += 4) {
    console.log(
      `    ${linhas
        .slice(i, i + 4)
        .map(([c, n]) => `${c}: ${n}`.padEnd(22))
        .join('')}`,
    );
  }
  console.log('');
  console.log(`  Origens representadas: ${new Set(escolhidas.map((e) => e.dsId)).size}`);
  console.log('');

  if (seco) {
    console.log('  (--seco: nada foi alterado)');
    return;
  }

  /**
   * A promoção é a MESMA do botão de curtir — `montarComponente`.
   *
   * A primeira versão deste script só marcava `inLibrary: true` no banco e
   * mandava "rodar a rota do app para materializar". Não materializava nada: a
   * Biblioteca ficava com a flag ligada e sem bundle em disco, e os kits
   * montados depois não achariam peça nenhuma. Meia promoção é pior que
   * nenhuma, porque parece feita.
   */
  let entraram = 0;
  let falharam = 0;
  for (const n of entrar) {
    const seg = segs.find((x) => x.id === n.segId);
    if (seg === undefined) continue;
    try {
      const record = montarComponente(seg);
      db.transaction((tx) => {
        tx.insert(tables.libraryComponents).values(record).run();
        tx.update(tables.segments)
          .set({ inLibrary: true })
          .where(eq(tables.segments.id, n.segId))
          .run();
      });
      entraram++;
      if (entraram % 25 === 0) console.log(`    ${entraram}/${entrar.length}…`);
    } catch (e) {
      falharam++;
      console.log(`    falhou ${n.nome.slice(0, 40)}: ${(e as Error).message.slice(0, 80)}`);
    }
  }
  let sairam = 0;
  /**
   * Retirar é retirar de VERDADE: a linha sai e o bundle sai do disco.
   *
   * A primeira versão só desligava `inLibrary` no segmento e deixava a
   * `library_components` intacta — a peça continuava na Biblioteca, continuava
   * entrando em kit, e o contador dizia "4 retiradas". O mesmo engano da
   * promoção pela metade, do outro lado.
   */
  if (limpar) {
    for (const n of sair) {
      const comp = db
        .select()
        .from(tables.libraryComponents)
        .where(eq(tables.libraryComponents.segmentId, n.segId))
        .get();
      db.transaction((tx) => {
        if (comp !== undefined) {
          tx.delete(tables.kitComponents)
            .where(eq(tables.kitComponents.componentId, comp.id))
            .run();
          tx.delete(tables.libraryComponents).where(eq(tables.libraryComponents.id, comp.id)).run();
        }
        tx.update(tables.segments)
          .set({ inLibrary: false })
          .where(eq(tables.segments.id, n.segId))
          .run();
      });
      if (comp !== undefined) {
        const dir = libraryComponentDir(comp.id as `cmp_${string}`);
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
      }
      sairam++;
    }
  }
  const retiradas = limpar ? `, ${sairam} retirada(s)` : '';
  const naoDeram = falharam > 0 ? ` ${falharam} não deu(ram) certo.` : '';
  console.log(`  ${entraram} peça(s) na Biblioteca, com bundle em disco${retiradas}.${naoDeram}`);
  console.log('');
};

if (executadoDireto(import.meta.url)) principal();
