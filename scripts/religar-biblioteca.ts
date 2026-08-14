import { createHash } from 'node:crypto';
import { eq, getDb, isNull, tables } from '@ds/indexer';
import { executadoDireto } from './executado-direto.js';

/**
 * Religa as linhas ÓRFÃS da Biblioteca aos segmentos recriados.
 *
 * ## O nó que isto desata
 *
 * `pnpm resegmentar` apagava e recriava os segmentos de um design system, e
 * `library_components.segment_id` é `on delete set null`. Toda linha da
 * Biblioteca daquela origem perdia o vínculo — medido: **553 de 861**, e **183
 * de 183** das peças usadas por algum kit.
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
 * **A causa foi consertada na origem** (`segmentar.ts` reaproveita o id do
 * segmento cujo conteúdo não mudou), então isto aqui é o REPARO do que já
 * quebrou, não a rotina.
 *
 * ## A chave, e por que é esta
 *
 * `library_components.bundle_hash` é exatamente `sha256(segments.html_snippet)`,
 * gravado na promoção. Ele é a identidade que o segmento não tinha — e a
 * conferência contra a verdade de campo fecha: bate em 844 de 844 linhas ainda
 * ligadas, e em 400 de 400 `raw.html` do disco.
 *
 * Medido sobre a travessia que de fato aconteceu (as 288 linhas ligadas no
 * banco anterior à resegmentação, contra os segmentos de hoje):
 *
 * | chave | religa | ambíguas | sem candidato |
 * |---|---|---|---|
 * | origem + `bundle_hash` | **288** | 0 | 0 |
 * | origem + nome + categoria | 243 | 39 | 6 |
 *
 * A chave fraca não falha no meio: ela falha justamente na peça REPETIDA
 * ("Botão", "Selo", "Recursos com sticky"), que é a maioria do acervo.
 *
 * O empate que sobra é empate de verdade — dois segmentos da mesma origem com
 * HTML byte a byte idêntico. Escolher um no chute ligaria a peça ao segmento
 * errado, e peça ligada ao segmento errado é pior que peça sem vínculo: ela
 * passa a ser julgada pela evidência de outra.
 *
 * ## A metade que ninguém tinha medido
 *
 * Religar a FK não bastava. `segments.in_library` estava em 1 para **9**
 * segmentos de 1396, enquanto **313** tinham linha na Biblioteca — e essa flag
 * é o ÚNICO portão de idempotência do app (`routes/library.ts` e
 * `planBatchLike`). Com ela apagada, a Galeria mostra a peça como não-curtida e
 * cada clique cria OUTRA linha duplicada: o caminho da duplicação continuava
 * aberto pelo app mesmo com a FK consertada.
 */

export type Religacao = {
  religadas: number;
  aindaOrfas: number;
  /** Segmentos cuja flag `in_library` foi reacesa para casar com a Biblioteca. */
  flagsReacesas: number;
};

export const religarBibliotecaAosSegmentos = (dsId?: string): Religacao => {
  const db = getDb();

  const orfas = db
    .select()
    .from(tables.libraryComponents)
    .where(isNull(tables.libraryComponents.segmentId))
    .all()
    .filter((o) => dsId === undefined || o.designSystemId === dsId);

  const segs = db.select().from(tables.segments).all();
  const porConteudo = new Map<string, string | null>();
  for (const s of segs) {
    if (typeof s.htmlSnippet !== 'string' || s.htmlSnippet.length === 0) continue;
    const k = `${s.designSystemId}|${createHash('sha256').update(s.htmlSnippet).digest('hex')}`;
    porConteudo.set(k, porConteudo.has(k) ? null : s.id);
  }

  let religadas = 0;
  let aindaOrfas = 0;

  for (const o of orfas) {
    const escolhido = porConteudo.get(`${o.designSystemId}|${o.bundleHash}`);
    if (escolhido === undefined || escolhido === null) {
      aindaOrfas += 1;
      continue;
    }
    db.update(tables.libraryComponents)
      .set({ segmentId: escolhido })
      .where(eq(tables.libraryComponents.id, o.id))
      .run();
    religadas += 1;
  }

  // A flag que o app usa como portão. Ver o bloco acima: sem ela, cada clique
  // na Galeria cria mais uma duplicata da peça que já está na Biblioteca.
  const flagsReacesas = reconciliarFlagDaBiblioteca(dsId);
  return { religadas, aindaOrfas, flagsReacesas };
};

/**
 * `segments.in_library` volta a dizer a verdade: 1 se existe linha viva na
 * Biblioteca apontando para ele, 0 se não existe.
 *
 * Nos dois sentidos de propósito. A flag acesa sem linha nenhuma é tão ruim
 * quanto a apagada com linha: ela ESCONDE a peça da Galeria, e o dono não tem
 * como pôr de volta uma peça que o app acha que já está lá.
 */
export const reconciliarFlagDaBiblioteca = (dsId?: string): number => {
  const db = getDb();
  const comLinha = new Set(
    db
      .select()
      .from(tables.libraryComponents)
      .all()
      .filter((l) => l.segmentId !== null)
      .map((l) => l.segmentId as string),
  );
  let mudadas = 0;
  for (const s of db.select().from(tables.segments).all()) {
    if (dsId !== undefined && s.designSystemId !== dsId) continue;
    const deveria = comLinha.has(s.id);
    if (s.inLibrary === deveria) continue;
    db.update(tables.segments)
      .set({ inLibrary: deveria })
      .where(eq(tables.segments.id, s.id))
      .run();
    mudadas += 1;
  }
  return mudadas;
};

if (executadoDireto(import.meta.url)) {
  const dsId = process.argv.find((a) => a.startsWith('ds_'));
  console.log(
    `\n  Religando a Biblioteca aos segmentos${dsId !== undefined ? ` de ${dsId}` : ''}…\n`,
  );
  const r = religarBibliotecaAosSegmentos(dsId);
  console.log(`  ${r.religadas} linha(s) religada(s) pelo conteúdo.`);
  if (r.aindaOrfas > 0) {
    console.log(
      `  ${r.aindaOrfas} continuam sem vínculo: são empates de conteúdo, e escolher no chute ligaria a peça ao segmento errado.`,
    );
  }
  console.log(
    `  ${r.flagsReacesas} flag(s) in_library reconciliada(s) — é o portão de idempotência do app.\n`,
  );
}
