/**
 * Esvazia a fila.
 *
 * Uso:
 *   pnpm fila:limpar                     apaga tudo: os pendentes que sobraram e
 *                                        o histórico de processados
 *   pnpm fila:limpar <ids>               apaga só esses ids, separados por vírgula
 *   pnpm fila:limpar ... --incluir-criativos   apaga também os jobs `criativo`
 *
 * O que isso apaga são PEDIDOS, não trabalho. O que foi extraído vive em
 * `vault/` e `library/` e não é tocado aqui. No pior caso, descartar um job de
 * extração custa recolar a URL na tela de Extrair.
 *
 * ## Por que o `criativo` é exceção
 *
 * Aquela frase acima — "no pior caso custa recolar a URL" — é verdadeira para
 * `extract` e FALSA para `criativo`. O job criativo é a única identidade que o
 * pedido tem: `criativos/<job_id>/` é indexado por ele, a tela "Minhas peças"
 * monta a listagem a partir da fila, e o `payload` guarda o teto de créditos e
 * os claims autorizados que a conferência de fechamento confere.
 *
 * Apagá-lo faz três estragos de uma vez: a peça **paga** some da tela para
 * sempre, os arquivos ficam órfãos numa pasta que ninguém mais alcança, e o
 * gasto vira inauditável porque o teto que ele deveria respeitar foi junto.
 *
 * Por isso ele só sai com `--incluir-criativos` escrito à mão. Limpeza de rotina
 * não pode custar material que custou dinheiro.
 *
 * ## Por que o desconhecido também fica
 *
 * Um JSON ilegível não diz que tipo é. Em limpeza de rotina (sem ids), ele é
 * preservado: não dá para afirmar que aquilo não era um criativo. Ele continua
 * removível pelo id, e a saída diz exatamente como.
 */
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { clearLote, queueDoneDir, queuePendingDir } from '@ds/shared';
import { executadoDireto } from './executado-direto.js';

/** Um arquivo da fila, já identificado. `tipo: null` = JSON ilegível. */
export type JobNaFila = {
  /** Nome do arquivo, com `.json`. */
  arquivo: string;
  /** O id, sem a extensão. */
  id: string;
  tipo: string | null;
};

export type PlanoDeLimpeza = {
  /** Nomes de arquivo a remover. */
  apagar: readonly JobNaFila[];
  /** Poupados porque são `criativo` e ninguém pediu para incluí-los. */
  criativosPoupados: readonly JobNaFila[];
  /** Poupados porque o JSON não diz o que são. */
  desconhecidosPoupados: readonly JobNaFila[];
};

/**
 * Decide o que sai e o que fica. Puro: não toca em disco, para o teste poder
 * cobrir a regra sem montar uma fila de mentira.
 *
 * `ids: null` significa limpeza de rotina (o `tudo`). Com ids explícitos a
 * pessoa nomeou o alvo, e nomear é decidir — só o `criativo` continua exigindo
 * a bandeira, porque o dinheiro já foi gasto.
 */
export const planejarLimpeza = (opts: {
  jobs: readonly JobNaFila[];
  ids: readonly string[] | null;
  incluirCriativos: boolean;
}): PlanoDeLimpeza => {
  const apagar: JobNaFila[] = [];
  const criativosPoupados: JobNaFila[] = [];
  const desconhecidosPoupados: JobNaFila[] = [];

  for (const job of opts.jobs) {
    if (opts.ids !== null && !opts.ids.includes(job.id)) continue;

    if (job.tipo === 'criativo' && !opts.incluirCriativos) {
      criativosPoupados.push(job);
      continue;
    }
    if (job.tipo === null && opts.ids === null) {
      desconhecidosPoupados.push(job);
      continue;
    }
    apagar.push(job);
  }

  return { apagar, criativosPoupados, desconhecidosPoupados };
};

/** Lê a pasta e identifica cada job pelo `type` do próprio arquivo. */
const lerJobs = (dir: string): JobNaFila[] => {
  if (!existsSync(dir)) return [];
  const jobs: JobNaFila[] = [];
  for (const arquivo of readdirSync(dir)) {
    if (!arquivo.endsWith('.json')) continue;
    const id = arquivo.replace(/\.json$/, '');
    let tipo: string | null = null;
    try {
      // U+FEFF é o BOM. O Node nunca escreve um, mas qualquer editor do Windows
      // põe — e sem tirá-lo o `JSON.parse` recusa um arquivo que está perfeito,
      // o job vira "desconhecido" e a limpeza o poupa para sempre por um motivo
      // que não existe. Conferido pelo código do caractere, e não por regex com
      // ele escrito: o BOM é invisível no editor e some numa cópia distraída.
      const cru = readFileSync(join(dir, arquivo), 'utf8');
      const texto = cru.charCodeAt(0) === 0xfeff ? cru.slice(1) : cru;
      const bruto = JSON.parse(texto) as { type?: unknown };
      if (typeof bruto.type === 'string') tipo = bruto.type;
    } catch {
      // Ilegível: fica como desconhecido, e a regra acima decide o que fazer.
    }
    jobs.push({ arquivo, id, tipo });
  }
  return jobs;
};

const principal = (): void => {
  const args = process.argv.slice(2);
  const incluirCriativos = args.includes('--incluir-criativos');
  const alvo = (args.find((a) => !a.startsWith('--')) ?? '').trim().toLowerCase();

  const ids =
    alvo === '' || alvo === 'tudo'
      ? null
      : alvo
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);

  const dirs = [queuePendingDir(), queueDoneDir()] as const;
  const planos = dirs.map((dir) => planejarLimpeza({ jobs: lerJobs(dir), ids, incluirCriativos }));

  let removidos = 0;
  planos.forEach((plano, i) => {
    for (const job of plano.apagar) {
      try {
        unlinkSync(join(dirs[i] as string, job.arquivo));
        removidos++;
      } catch {
        // Arquivo em uso ou já removido. Não vale abortar a limpeza inteira por um.
      }
    }
  });

  const criativos = planos.flatMap((p) => p.criativosPoupados);
  const desconhecidos = planos.flatMap((p) => p.desconhecidosPoupados);

  // Fecha a rodada. Sem isto a barra de progresso ficaria parada em 100% na tela,
  // como se ainda houvesse algo acontecendo.
  clearLote();

  console.log('');
  if (removidos === 0) {
    console.log('  Nada a remover da fila.');
  } else {
    console.log(`  Fila limpa: ${removidos} registro(s) removido(s).`);
    console.log('  Isso apaga pedidos, não o que foi extraído.');
  }

  if (criativos.length > 0) {
    console.log('');
    console.log(`  Preservei ${criativos.length} pedido(s) de criativo:`);
    for (const job of criativos) console.log(`    ${job.id}`);
    console.log('');
    console.log('  Eles custaram crédito e a tela "Minhas peças" depende deles.');
    console.log('  Para remover mesmo assim: pnpm fila:limpar <ids> --incluir-criativos');
  }

  if (desconhecidos.length > 0) {
    console.log('');
    console.log(`  Preservei ${desconhecidos.length} arquivo(s) que não consegui ler:`);
    for (const job of desconhecidos) console.log(`    ${job.id}`);
    console.log('  Não dá para afirmar que não eram criativos. Remova pelo id se quiser.');
  }
};

if (executadoDireto(import.meta.url)) principal();
