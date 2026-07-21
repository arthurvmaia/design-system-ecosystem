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
import { getDb, tables } from '@ds/indexer';
import { segmentDesignSystem } from '@ds/segmenter';
import { eq } from 'drizzle-orm';

export type ResultadoSegmentacao = { total: number; suspeitoDeSpa: boolean };

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
  const resultado = segmentDesignSystem(dsId);
  const db = getDb();

  db.transaction((tx) => {
    tx.delete(tables.segments).where(eq(tables.segments.designSystemId, dsId)).run();
    for (const seg of resultado.segments) {
      tx.insert(tables.segments).values(seg).run();
    }
    tx.update(tables.designSystems)
      .set({ status: 'segmented' })
      .where(eq(tables.designSystems.id, dsId))
      .run();
  });

  const total = resultado.segments.length;
  return { total, suspeitoDeSpa: total > 0 && total < MINIMO_ESPERADO };
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
if (process.argv[1]?.includes('segmentar')) {
  const dsId = process.argv[2];

  if (dsId === undefined || !dsId.startsWith('ds_')) {
    console.error('Uso: pnpm segmentar <ds_id>');
    console.error('O id começa com ds_ e aparece na tela da Galeria.');
    process.exit(1);
  }

  try {
    const { total, suspeitoDeSpa } = segmentarEIndexar(dsId as `ds_${string}`);
    if (total === 0) {
      console.log('\n  Nenhum segmento encontrado.');
      console.log('  O design-system.html existe, mas o <body> não tem filhos diretos');
      console.log('  que sirvam como componente. Confira se a extração saiu completa.\n');
    } else {
      console.log(`\n  ${total} segmento(s) gravados. Abra a Galeria.`);
      if (suspeitoDeSpa) console.log(avisoSpa(total));
      else console.log('');
    }
  } catch (err) {
    console.error(`\n  Falhou: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
