/**
 * Fatia um design system extraído nos segmentos que aparecem na Galeria.
 *
 * Uso: pnpm segmentar <ds_id>
 *
 * No modo `api` o servidor extrai e segmenta na mesma rota, uma coisa depois da
 * outra. No modo `queue` a extração é feita à mão e a segmentação ficava de
 * fora — o design system entrava no banco com status `extracted`, a Galeria
 * abria com "0 de 0 segmentos" e não havia nada para curar.
 *
 * Este script existe para fechar esse buraco, e o `fila:concluir` o chama
 * sozinho ao fechar um job de extração. Rodar na mão só é necessário para
 * consertar um design system que já ficou para trás.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { eq, getDb, runMigrations, tables } from '@ds/indexer';
import { segmentDesignSystem } from '@ds/segmenter';
import {
  type SegmentRecord,
  SegmentsManifest,
  vaultCaptureV2Manifest,
  vaultSegmentsManifest,
} from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

export type ResultadoSegmentacao = {
  total: number;
  /** Só as seções (parentId null) — os filhos da subdivisão não contam aqui. */
  raizes: number;
  suspeitoDeSpa: boolean;
};

/**
 * Segmentos de uma captura V2, já gravados no vault pela extração.
 *
 * No V2 a segmentação acontece DURANTE a captura (por evidência: geometria,
 * tempo, reação medida), e `persistirCapturaV2` grava o `segments/manifest.json`
 * no mesmo formato do V1. Re-segmentar aqui por string não só seria pior — ela
 * SOBRESCREVERIA o manifesto do V2 com uma releitura cega do HTML. Este leitor
 * falha alto se o manifesto sumiu: a saída certa é re-extrair, não forçar.
 */
const lerSegmentosV2 = (dsId: `ds_${string}`): SegmentRecord[] => {
  const path = vaultSegmentsManifest(dsId);
  if (!existsSync(path)) {
    throw new Error(
      'A captura V2 existe (capture-v2/manifest.json), mas o segments/manifest.json não. ' +
        'Rode `pnpm extrair` de novo para regravar a persistência.',
    );
  }
  return SegmentsManifest.parse(JSON.parse(readFileSync(path, 'utf8'))).segments;
};

/**
 * A stack detectada pela captura, pronta para a coluna `stack_json`.
 *
 * O motor sempre mediu isso (WebGL, Tailwind, GSAP, iconify, com evidência) e o
 * manifesto sempre carregou — mas quem gravava no banco era só o caminho `api`,
 * que nunca roda. No modo fila a coluna ficava NULL em todas as capturas: o
 * dado existia em disco e a Galeria não tinha como filtrar por tecnologia.
 *
 * Parse cru de propósito, no mesmo padrão dos leitores do servidor: o manifesto
 * passa de 1 MB e daqui só interessa um array.
 */
export const lerStackDoManifesto = (dsId: `ds_${string}`): string | null => {
  const path = vaultCaptureV2Manifest(dsId);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as { stack?: unknown };
    // Stack VAZIA não é ausência de stack: é a captura tendo olhado e não achado
    // tecnologia nenhuma, que é o resultado legítimo de um site de HTML e CSS
    // puros. Devolver `null` aqui misturava isso com "não consegui ler o
    // manifesto", e três design systems do acervo ficavam para sempre com
    // `stack_json` NULL — o backfill os via como pendência e não tinha o que
    // preencher, rodada após rodada.
    if (!Array.isArray(raw.stack)) return null;
    return JSON.stringify(raw.stack);
  } catch {
    return null;
  }
};

/**
 * Abaixo disso, quase sempre o que foi extraído é a moldura de uma página que
 * monta o conteúdo por JavaScript — uma listagem, um app de página única.
 *
 * Buscar a URL traz só o HTML servido; o miolo aparece quando o script roda no
 * navegador. O resultado é um punhado de segmentos de cabeçalho, filtro e um
 * container vazio, e nada disso serve como componente. Quatro é arbitrário, mas
 * uma página real de design system passa longe desse número.
 */
const MINIMO_ESPERADO = 4;

/**
 * A identidade de um segmento entre duas segmentações é o CONTEÚDO dele.
 *
 * ## O que quebrava
 *
 * O motor cunha um ULID novo a cada persistência (`newSegmentId()` em
 * `persist.ts`), então o id NÃO atravessa uma resegmentação. E como aqui se
 * apagava tudo antes de reinserir, o `on delete set null` de
 * `library_components.segment_id` desligava a Biblioteca inteira daquela
 * origem.
 *
 * Medido no acervo: **553 de 861 linhas órfãs**, e — o que trava o trabalho —
 * **183 de 183** das peças usadas por algum kit. Nenhuma peça em uso tinha
 * vínculo.
 *
 * O estrago tem dois lados. `curar-biblioteca` reconhece "já está lá" por
 * `segmentId`, então sem vínculo ele readiciona tudo (foi assim que a
 * Biblioteca foi de 298 para 861 linhas). E as regras de aceite da Galeria só
 * alcançam peça COM segmento: linha órfã é inalcançável, e por isso não dava
 * para tirar da Biblioteca as peças que o dono mandou tirar.
 *
 * ## Por que dá para reaproveitar o id
 *
 * O corte é determinístico: medido na resegmentação real, **1349 dos 1396**
 * segmentos saem byte a byte iguais de uma rodada para a outra. A
 * resegmentação não perdeu peça nenhuma — perdeu só o NOME de cada uma.
 *
 * A chave é a mesma que a promoção já grava em `library_components.bundle_hash`
 * (`sha256(htmlSnippet)`), conferida contra a verdade de campo: bate em 844 de
 * 844 linhas ainda ligadas e em 400 de 400 `raw.html` do disco.
 *
 * Simulado sobre a travessia que de fato aconteceu: com o diff, as 288 linhas
 * ligadas do banco anterior teriam mantido **288 de 288** vínculos, sem
 * religação nenhuma. Religar depois recupera 243 de 288. Prevenir custa zero
 * ambiguidade; remendar custa 45 casos duvidosos por travessia.
 *
 * ## O que fica de fora, e por quê
 *
 * Conteúdo repetido na mesma origem (dois cortes byte a byte idênticos) dá
 * empate: 19 chaves do acervo cobrem 38 segmentos (2,7%). Empate não escolhe —
 * esses nascem com id novo, como antes. Ligar ao errado é pior que não ligar:
 * a peça passaria a ser julgada pela evidência de outra.
 */
const identidadeDoSegmento = (htmlSnippet: string | null): string | null =>
  htmlSnippet === null || htmlSnippet.length === 0
    ? null
    : createHash('sha256').update(htmlSnippet).digest('hex');

/** O mínimo que a decisão precisa saber de um segmento. */
export type PecaComIdentidade = { id: string; htmlSnippet: string | null; parentId: string | null };

export type Casamento<T> = {
  /** Os segmentos a gravar, já com o id reaproveitado onde coube. */
  gravar: T[];
  /** Ids antigos que voltaram — estes são UPDATE, não INSERT. */
  reaproveitados: Set<string>;
};

/**
 * Decide, sem tocar no banco, quais ids atravessam a segmentação.
 *
 * Separada da transação porque é ELA que carrega o risco: um casamento errado
 * liga uma peça da Biblioteca ao segmento de outra, e a peça passa a ser
 * julgada pela evidência que não é dela.
 */
export const casarPorConteudo = <T extends PecaComIdentidade>(
  antigos: readonly PecaComIdentidade[],
  novos: readonly T[],
): Casamento<T> => {
  const porConteudo = new Map<string, string | null>();
  for (const a of antigos) {
    const k = identidadeDoSegmento(a.htmlSnippet);
    if (k === null) continue;
    // Chave repetida vira empate e sai da disputa: ver `identidadeDoSegmento`.
    porConteudo.set(k, porConteudo.has(k) ? null : a.id);
  }

  const reaproveitados = new Set<string>();
  const comId = novos.map((seg) => {
    const k = identidadeDoSegmento(seg.htmlSnippet);
    const antigo = k === null ? undefined : porConteudo.get(k);
    if (antigo === undefined || antigo === null || reaproveitados.has(antigo)) return seg;
    reaproveitados.add(antigo);
    return { ...seg, id: antigo };
  });

  // `parentId` aponta para o id que o filho conhecia; se o pai reaproveitou o
  // id antigo, o filho tem de apontar para o mesmo lugar. Sem esta tradução o
  // subcomponente ficaria pendurado num id que não existe mais.
  const de = new Map(novos.map((s, i) => [s.id, comId[i]?.id ?? s.id]));
  const gravar = comId.map((s) =>
    s.parentId === null ? s : { ...s, parentId: de.get(s.parentId) ?? s.parentId },
  );
  return { gravar, reaproveitados };
};

/**
 * Segmenta e grava no índice. Idempotente: o segmento cujo conteúdo não mudou
 * mantém o id (e com ele o vínculo da Biblioteca, a flag `in_library` e a
 * classificação feita à mão); o que mudou entra novo e o que sumiu sai.
 */
export const segmentarEIndexar = (dsId: `ds_${string}`): ResultadoSegmentacao => {
  // O modo `queue` insere no banco sem passar pelo boot do servidor — quem
  // atualiza o repo pelo GitHub e roda o PROCESSAR.bat antes de abrir o app
  // tinha um banco parado numa migração antiga, e o insert quebrava na coluna
  // nova. Idempotente: o drizzle só aplica o que falta.
  runMigrations();
  // O sinal de que a extração foi do motor V2 é o manifesto em `capture-v2/`.
  const v2 = existsSync(vaultCaptureV2Manifest(dsId));
  const segments = v2 ? lerSegmentosV2(dsId) : segmentDesignSystem(dsId).segments;
  if (v2)
    console.log(
      `  Segmentos do V2 (por evidência): ${segments.length} — indexando sem re-segmentar.`,
    );
  const db = getDb();

  db.transaction((tx) => {
    // Os segmentos que ESTÃO no banco, indexados pelo conteúdo. Chave repetida
    // vira empate e sai da disputa: ver `identidadeDoSegmento`.
    const antigos = tx
      .select()
      .from(tables.segments)
      .where(eq(tables.segments.designSystemId, dsId))
      .all();
    const { gravar, reaproveitados } = casarPorConteudo(antigos, segments);

    // Só some quem não voltou. O DELETE largo era o que desligava a Biblioteca.
    for (const a of antigos) {
      if (reaproveitados.has(a.id)) continue;
      tx.delete(tables.segments).where(eq(tables.segments.id, a.id)).run();
    }
    for (const seg of gravar) {
      if (reaproveitados.has(seg.id)) {
        const { id, ...campos } = seg;
        tx.update(tables.segments).set(campos).where(eq(tables.segments.id, id)).run();
        continue;
      }
      tx.insert(tables.segments).values(seg).run();
    }
    if (antigos.length > 0) {
      console.log(
        `  Identidade preservada: ${reaproveitados.size} de ${antigos.length} segmento(s) mantiveram o id (e com ele o vínculo da Biblioteca).`,
      );
    }
    // O fechamento do job é o único UPDATE que o modo fila faz nesta linha, e
    // era aqui que o fio do stack estava cortado: gravar junto custa uma
    // leitura de arquivo que já foi conferido acima.
    const stackJson = v2 ? lerStackDoManifesto(dsId) : null;
    tx.update(tables.designSystems)
      .set({ status: 'segmented', ...(stackJson !== null ? { stackJson } : {}) })
      .where(eq(tables.designSystems.id, dsId))
      .run();
  });

  const total = segments.length;
  // O sintoma de SPA se mede nas SEÇÕES: 1 seção com 7 botões-filhos continua
  // sendo uma página de uma seção só — contar os filhos mascararia o aviso.
  const raizes = segments.filter((s) => s.parentId === null).length;
  return { total, raizes, suspeitoDeSpa: raizes > 0 && raizes < MINIMO_ESPERADO };
};

/** Texto do aviso, compartilhado entre este script e o `fila:concluir`. */
export const avisoSpa = (total: number): string =>
  [
    '',
    `  Atenção: só ${total} segmento(s). Isso costuma significar que a página`,
    '  monta o conteúdo por JavaScript, e a extração pegou só a moldura.',
    '',
    '  Acontece ao extrair uma listagem em vez de uma página de design system.',
    '  Confira a URL: ela deve apontar para o design em si, não para o índice',
    '  do site. Normalmente termina em /design-system.',
    '',
  ].join('\n');

// Execução direta pela linha de comando.
if (executadoDireto(import.meta.url)) {
  const dsId = process.argv[2];

  if (dsId === undefined || !dsId.startsWith('ds_')) {
    console.error('Uso: pnpm segmentar <ds_id>');
    console.error('O id começa com ds_ e aparece na tela da Galeria.');
    process.exit(1);
  }

  try {
    const { total, raizes, suspeitoDeSpa } = segmentarEIndexar(dsId as `ds_${string}`);
    if (total === 0) {
      console.log('\n  Nenhuma peça encontrada.');
      console.log('  O design-system.html existe, mas o <body> não tem filhos diretos');
      console.log('  que sirvam como peça. Confira se a captura saiu completa.\n');
    } else {
      console.log(`\n  ${total} peça(s) gravadas. Abra a Galeria.`);
      if (suspeitoDeSpa) console.log(avisoSpa(raizes));
      else console.log('');
    }
  } catch (err) {
    console.error(`\n  Falhou: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
