/**
 * Fecha um job da fila depois que o trabalho foi produzido.
 *
 * Uso: pnpm fila:concluir <job_id> [--erro "mensagem"]
 *
 * Este script NÃO executa trabalho e NÃO chama a API. Ele só registra que um
 * job terminou, validando que o que foi produzido existe em disco antes de
 * marcar como concluído — para um job não ser fechado sem entrega.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  finishJob,
  getJob,
  listarAssetsFaltando,
  projectGeneratedDir,
  vaultDsDir,
  vaultExtractedDir,
} from '@ds/shared';

const [, , jobId, ...rest] = process.argv;

if (jobId === undefined) {
  console.error('Uso: pnpm fila:concluir <job_id> [--erro "mensagem"]');
  process.exit(1);
}

const erroIdx = rest.indexOf('--erro');
const erro = erroIdx >= 0 ? rest[erroIdx + 1] : undefined;

const job = getJob(jobId);
if (job === null) {
  console.error(`Job não encontrado: ${jobId}`);
  process.exit(1);
}
if (job.status !== 'pendente') {
  console.error(`Job já está como "${job.status}".`);
  process.exit(1);
}

if (erro !== undefined) {
  finishJob(jobId, { error: erro });
  console.log(`Job marcado como erro: ${job.label}`);
  process.exit(0);
}

// Verifica que a entrega existe antes de fechar.
const problemas: string[] = [];

if (job.type === 'extract') {
  const dsId = job.result?.designSystemId ?? job.payload.designSystemId;
  if (typeof dsId !== 'string') {
    problemas.push('designSystemId não informado — grave o id do design system no job.');
  } else if (!existsSync(vaultDsDir(dsId as `ds_${string}`))) {
    problemas.push(`pasta do vault não existe: ${vaultDsDir(dsId as `ds_${string}`)}`);
  } else {
    // A pasta existir não quer dizer nada. O que interessa é o HTML estar lá e
    // os arquivos que ele promete existirem de verdade — foi por não checar
    // isso que uma extração sem CSS entrou na galeria como se estivesse pronta.
    const extraido = vaultExtractedDir(dsId as `ds_${string}`);
    const htmlPath = join(extraido, 'design-system.html');

    if (!existsSync(htmlPath)) {
      problemas.push(`design-system.html não existe em ${extraido}`);
    } else {
      const html = readFileSync(htmlPath, 'utf8');

      if (html.length < 200) {
        problemas.push('design-system.html tem menos de 200 bytes — está praticamente vazio.');
      }

      const faltando = listarAssetsFaltando(extraido, html);
      if (faltando.length > 0) {
        problemas.push(
          `o HTML referencia ${faltando.length} arquivo(s) que não existem: ${faltando.slice(0, 6).join(', ')}${faltando.length > 6 ? ` (e mais ${faltando.length - 6})` : ''}`,
        );
        problemas.push(
          'Isso significa que os STEPs 2 a 4 não gravaram os assets. Sem eles o design system abre sem estilo.',
        );
      }
    }
  }
}

if (job.type === 'generate') {
  const prjId = job.payload.projectId;
  if (typeof prjId !== 'string') {
    problemas.push('projectId ausente no payload.');
  } else if (!existsSync(projectGeneratedDir(prjId as `prj_${string}`))) {
    problemas.push(`nenhuma versão gerada em: ${projectGeneratedDir(prjId as `prj_${string}`)}`);
  }
}

if (problemas.length > 0) {
  console.error('\nNão dá para concluir este job:\n');
  for (const p of problemas) console.error(`  - ${p}`);
  console.error('\nProduza a saída antes de fechar, ou use --erro para registrar a falha.\n');
  process.exit(1);
}

finishJob(jobId, { result: { fechadoEm: new Date().toISOString() } });
console.log(`\nConcluído: ${job.label}\n`);
