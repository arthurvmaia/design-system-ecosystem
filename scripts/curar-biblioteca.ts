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
 * rodada), estado capturado e riqueza de conteúdo. Empate desfaz-se pela
 * fidelidade.
 *
 * ## O teto por origem
 *
 * Sem ele a Biblioteca vira o retrato de dois ou três sites: um site com 34
 * peças boas ocuparia sozinho um terço dela, e os kits sairiam todos parecidos.
 * O teto é o que garante variedade — que é exatamente o que o dono cobrou
 * ("vc sempre escolhe os mesmos componentes").
 */
import { existsSync, readFileSync } from 'node:fs';
import { getDb, tables } from '@ds/indexer';
import {
  type PecaParaAceite,
  SegmentsManifest,
  type SegmentsManifest as SegmentsManifestType,
  conferirPecaDaGaleria,
  vaultSegmentsManifest,
} from '@ds/shared';
import { eq } from 'drizzle-orm';

type Nota = {
  segId: string;
  dsId: string;
  nome: string;
  categoria: string;
  kind: string;
  nota: number;
  motivos: string[];
  reprova: string | null;
  /** O motivo da reprova SEM os números — é por ele que o resumo agrupa. */
  reprovaTipo: string | null;
  jaNaBiblioteca: boolean;
};

const MIN_HTML = 200;
/** Categorias cujo valor é o COMPORTAMENTO, não o tamanho do HTML. */
const PEQUENAS_POR_NATUREZA = new Set(['interaction', 'cursor']);

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

const avaliar = (seg: {
  id: string;
  designSystemId: string;
  name: string;
  category: string;
  kind: string;
  htmlSnippet: string | null;
  inLibrary: boolean;
}): Nota => {
  const manifesto = manifestoDe(seg.designSystemId);
  const insight = (manifesto?.insights ?? []).find((i) => i.segmentId === seg.id) ?? null;
  const motivos: string[] = [];
  let nota = 0;
  let reprova: string | null = null;
  let reprovaTipo: string | null = null;

  const html = seg.htmlSnippet ?? '';

  /**
   * A REGRA DE ACEITE DA GALERIA manda aqui (`docs/regras-de-aceite.md`).
   *
   * Ela é o portão que o dono pediu: "uma etapa de conferência antes de você
   * realmente colocar isso na galeria". A curadoria continua tendo a nota dela
   * para ORDENAR, mas quem decide se a peça pode subir é a regra — senão haveria
   * dois critérios, e o mais frouxo venceria na primeira pressa.
   */
  const aceite = conferirPecaDaGaleria({
    categoria: seg.category,
    kind: seg.kind,
    htmlSnippet: html,
    representacao: (insight?.representation as PecaParaAceite['representacao'] | undefined) ?? null,
    // A captura não guarda, por segmento, qual runtime trouxe script — isso
    // mora no manifesto do bundle. Aqui a lista fica vazia e G1 passa; a
    // conferência completa de G1 acontece na compilação, onde o bundle existe.
    runtimes: [],
    movimentoProprio: (insight?.scroll?.length ?? 0) > 0 || seg.kind === 'animation',
    classesDeRevelacao: [],
    temObservadorDeRolagem: false,
    refsQuebradas: [],
    assetsNaOrigem: [],
  });
  const primeiraReprovacao = aceite.vereditos.find((v) => v.estado === 'reprovou');
  if (primeiraReprovacao !== undefined) {
    reprova = `${primeiraReprovacao.codigo}: ${primeiraReprovacao.motivo}`;
    reprovaTipo = `${primeiraReprovacao.codigo} — ${primeiraReprovacao.titulo}`;
  }
  const pendencias = aceite.vereditos.filter((v) => v.estado === 'pendente');
  if (insight?.support === 'nao-suportado') {
    reprova = 'a captura não reproduz este item';
    reprovaTipo = 'a captura não reproduz este item';
  }
  if (insight?.comparacaoVisual?.ok === false) {
    reprova = `o bundle não bate com o que a captura viu (${Math.round((insight.comparacaoVisual.delta ?? 0) * 100)}% de diferença)`;
    reprovaTipo = 'o bundle não bate com o que a captura viu';
  }
  if (seg.kind === 'asset') {
    reprova = 'peça promovida como imagem congelada do site de origem';
    reprovaTipo = 'imagem congelada do site de origem';
  }

  for (const p of pendencias) motivos.push(`pendência ${p.codigo}`);

  const fid = insight?.fidelity ?? 0;
  nota += fid;
  if (fid > 0) motivos.push(`fidelidade ${fid}`);

  if (insight?.representation === 'capsula-runtime') {
    nota += 8;
    motivos.push('cena viva (cápsula de runtime)');
  }
  if ((insight?.interactions?.length ?? 0) > 0) {
    nota += 6;
    motivos.push(`${insight?.interactions?.length} interação(ões)`);
  }
  if (seg.kind === 'animation') {
    nota += 10;
    motivos.push('carrega movimento');
  }
  if (PEQUENAS_POR_NATUREZA.has(seg.category)) {
    nota += 12;
    motivos.push('comportamento de página: vale para o site inteiro');
  }
  // Conteúdo, com retorno decrescente: uma peça de 40 KB não vale o dobro de
  // uma de 20 KB — passa a ser uma dobra inteira, que é outra coisa.
  nota += Math.min(10, Math.round(Math.log2(Math.max(1, html.length / 200)) * 2));

  return {
    segId: seg.id,
    dsId: seg.designSystemId,
    nome: seg.name,
    categoria: seg.category,
    kind: seg.kind,
    nota,
    motivos,
    reprova,
    reprovaTipo,
    jaNaBiblioteca: seg.inLibrary,
  };
};

const principal = (): void => {
  const args = process.argv.slice(2);
  const seco = args.includes('--seco');
  const limpar = args.includes('--limpar');
  const tetoPorOrigem = Number(args[args.indexOf('--por-origem') + 1]) || 6;

  const db = getDb();
  const segs = db.select().from(tables.segments).all();
  const notas = segs.map((s) =>
    avaliar({
      id: s.id,
      designSystemId: s.designSystemId,
      name: s.name,
      category: s.category,
      kind: s.kind,
      htmlSnippet: s.htmlSnippet,
      inLibrary: s.inLibrary === true,
    }),
  );

  const aprovadas = notas.filter((n) => n.reprova === null).sort((a, b) => b.nota - a.nota);

  /**
   * A escolha é POR CATEGORIA, e não uma fila única de notas.
   *
   * Uma fila única parece mais justa e é inútil aqui: medido nesta Galeria, as
   * quinze primeiras colocadas eram TODAS `interaction`, porque comportamento de
   * página soma pontos por natureza. Com teto por origem, elas ocupariam as
   * vagas e sobrariam poucas seções — e uma Biblioteca sem hero, sem preços e
   * sem rodapé não monta kit nenhum, por melhor que seja a nota média.
   *
   * Então cada categoria recebe a sua cota, e dentro dela vence a nota. Efeito
   * e comportamento têm cota pequena de propósito: um por página basta, e o
   * dono escolhe qual.
   */
  const COTA_POR_CATEGORIA: Record<string, number> = {
    interaction: 8,
    cursor: 6,
    background: 8,
    overlay: 4,
    typography: 4,
  };
  const COTA_PADRAO = 24;

  const porOrigem = new Map<string, number>();
  const porCategoria = new Map<string, number>();
  const porCategoriaNaOrigem = new Map<string, number>();
  const escolhidas: Nota[] = [];
  for (const n of aprovadas) {
    const cota = COTA_POR_CATEGORIA[n.categoria] ?? COTA_PADRAO;
    if ((porCategoria.get(n.categoria) ?? 0) >= cota) continue;
    // Teto por origem: sem ele a Biblioteca vira o retrato de dois ou três
    // sites e os dez kits saem parecidos.
    if ((porOrigem.get(n.dsId) ?? 0) >= tetoPorOrigem) continue;
    // E teto por (origem, categoria): dois heros do mesmo site é repetição.
    const chave = `${n.dsId}|${n.categoria}`;
    if ((porCategoriaNaOrigem.get(chave) ?? 0) >= 2) continue;
    porOrigem.set(n.dsId, (porOrigem.get(n.dsId) ?? 0) + 1);
    porCategoria.set(n.categoria, (porCategoria.get(n.categoria) ?? 0) + 1);
    porCategoriaNaOrigem.set(chave, (porCategoriaNaOrigem.get(chave) ?? 0) + 1);
    escolhidas.push(n);
  }

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

  let entraram = 0;
  for (const n of entrar) {
    db.update(tables.segments)
      .set({ inLibrary: true })
      .where(eq(tables.segments.id, n.segId))
      .run();
    entraram++;
  }
  let sairam = 0;
  if (limpar) {
    for (const n of sair) {
      db.update(tables.segments)
        .set({ inLibrary: false })
        .where(eq(tables.segments.id, n.segId))
        .run();
      sairam++;
    }
  }
  console.log(
    `  ${entraram} marcada(s) para a Biblioteca${limpar ? `, ${sairam} retirada(s)` : ''}.`,
  );
  console.log('  Rode a rota de curtir do app para materializar os bundles.');
  console.log('');
};

principal();
