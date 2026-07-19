/**
 * Esvazia a fila.
 *
 * Uso:
 *   pnpm fila:limpar         apaga tudo: os pendentes que sobraram e o
 *                            histórico de processados
 *   pnpm fila:limpar <ids>   apaga só esses ids, separados por vírgula
 *
 * Roda no fim do PROCESSAR.bat para a próxima abertura começar do zero. Sem
 * isso a fila é acumulativa: o `fila:concluir` só move o job de `pendente/`
 * para `concluido/`, então o arquivo fica em disco para sempre e os que
 * falharam continuam aparecendo na listagem.
 *
 * O que isso apaga são PEDIDOS, não trabalho. O que foi extraído vive em
 * `vault/` e `library/` e não é tocado aqui. No pior caso, descartar um job
 * custa recolar a URL na tela de Extrair.
 */
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { clearLote, queueDoneDir, queuePendingDir } from '@ds/shared';

const alvo = (process.argv[2] ?? '').trim().toLowerCase();

/** `null` = apagar tudo. Lista = apagar só esses ids. */
const ids =
  alvo === '' || alvo === 'tudo'
    ? null
    : alvo
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

const apagarEm = (dir: string): number => {
  if (!existsSync(dir)) return 0;

  let removidos = 0;
  for (const arquivo of readdirSync(dir)) {
    if (!arquivo.endsWith('.json')) continue;
    if (ids !== null && !ids.includes(arquivo.replace(/\.json$/, ''))) continue;
    try {
      unlinkSync(join(dir, arquivo));
      removidos++;
    } catch {
      // Arquivo em uso ou já removido. Não vale abortar a limpeza inteira por um.
    }
  }
  return removidos;
};

const pendentes = apagarEm(queuePendingDir());
const historico = apagarEm(queueDoneDir());
const total = pendentes + historico;

// Fecha a rodada. Sem isto a barra de progresso ficaria parada em 100% na tela,
// como se ainda houvesse algo acontecendo.
clearLote();

console.log('');
if (total === 0) {
  console.log('  Fila já estava limpa.');
} else {
  console.log(`  Fila zerada: ${total} registro(s) removido(s).`);
  if (pendentes > 0) console.log(`    ${pendentes} que ainda estavam pendentes`);
  if (historico > 0) console.log(`    ${historico} do histórico de processados`);
  console.log('');
  console.log('  Isso apaga pedidos, não o que foi extraído.');
  console.log('  O vault e a biblioteca ficam intactos.');
}
