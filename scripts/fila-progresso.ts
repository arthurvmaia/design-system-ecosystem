/**
 * Reporta o quanto um job já andou por dentro.
 *
 * Uso: pnpm fila:progresso <job_id> <0-100>
 *
 * Serve para a barra da interface subir de forma contínua em vez de saltar de
 * 0 para 100 quando o job fecha. Uma extração leva minutos e passa por 6 STEPs
 * — sem isto, a tela fica parada em 0% durante todo o trabalho e parece travada.
 *
 * Não executa nada e não valida entrega: é só um número. Quem manda no estado
 * real continua sendo o disco — o `fila:concluir` é que marca um job como feito.
 */
import { getJob, reportarProgresso } from '@ds/shared';

const [, , jobId, valor] = process.argv;

if (jobId === undefined || valor === undefined) {
  console.error('Uso: pnpm fila:progresso <job_id> <0-100>');
  process.exit(1);
}

const percentual = Number(valor);
if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
  console.error(`Percentual inválido: ${valor}. Use um número de 0 a 100.`);
  process.exit(1);
}

if (getJob(jobId) === null) {
  console.error(`Job não encontrado: ${jobId}`);
  process.exit(1);
}

reportarProgresso(jobId, percentual);
console.log(`  ${jobId}: ${Math.round(percentual)}%`);
