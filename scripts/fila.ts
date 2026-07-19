/**
 * Lista a fila de trabalho.
 *
 * Uso: pnpm fila
 */
import { listDoneJobs, listPendingJobs } from '@ds/shared';

const pendentes = listPendingJobs();
const concluidos = listDoneJobs();

if (pendentes.length === 0) {
  console.log('\nFila vazia.\n');
} else {
  console.log(`\nFila: ${pendentes.length} pendente(s)\n`);
  pendentes.forEach((job, i) => {
    const idade = Math.round((Date.now() - job.createdAt) / 60000);
    console.log(`  ${i + 1}. ${job.label}`);
    console.log(`     ${job.id} · ${job.type} · há ${idade} min`);
  });
  console.log('');
}

const comErro = concluidos.filter((j) => j.status === 'erro');
if (comErro.length > 0) {
  console.log(`${comErro.length} job(s) com erro:\n`);
  for (const job of comErro.slice(-5)) {
    console.log(`  ${job.label} — ${job.error}`);
  }
  console.log('');
}
