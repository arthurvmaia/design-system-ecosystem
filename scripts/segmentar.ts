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
 * Segmenta e grava no índice. Idempotente: apaga os segmentos anteriores antes
 * de inserir, então rodar duas vezes não duplica nada.
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
    tx.delete(tables.segments).where(eq(tables.segments.designSystemId, dsId)).run();
    for (const seg of segments) {
      tx.insert(tables.segments).values(seg).run();
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
