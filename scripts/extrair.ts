/**
 * Extrai um site para o vault — por navegador, de forma determinística.
 *
 * Uso: pnpm extrair <job_id>
 *
 * É o coração do fluxo redondo: renderiza o DOM real da URL (resolve 403 e SPA),
 * torna as referências absolutas para o preview carregar da origem, grava o
 * `design-system.html` no vault e registra o design system no banco. Em seguida,
 * `pnpm fila:concluir <job_id>` valida, segmenta e fecha o job.
 *
 * Degrada com honestidade: sem Playwright, cai para fetch estático e avisa — não
 * trava. NÃO chama a API da Anthropic e NÃO dispara nada sozinho: é iniciado por
 * uma pessoa, processando um job que ela escolheu.
 *
 * Para a captura PROFUNDA (descoberta de estados interativos), use `pnpm
 * explorar <url>` — é o passo caro e opcional, separado da extração.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderPage } from '@ds/explorer';
import { getDb, tables } from '@ds/indexer';
import {
  type DesignSystemId,
  getJob,
  newDesignSystemId,
  reportarProgresso,
  setJobResult,
  vaultExtractedDir,
  vaultSourceDir,
} from '@ds/shared';
import { eq } from 'drizzle-orm';

const nomeDaUrl = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 60);
  }
};

const main = async (): Promise<void> => {
  const [, , jobId] = process.argv;
  if (jobId === undefined) {
    console.error('Uso: pnpm extrair <job_id>');
    process.exit(1);
  }

  const job = getJob(jobId);
  if (job === null) {
    console.error(`Job não encontrado: ${jobId}`);
    process.exit(1);
  }
  if (job.type !== 'extract') {
    console.error(`Job ${jobId} é do tipo "${job.type}", não "extract".`);
    process.exit(1);
  }
  if (job.status !== 'pendente') {
    console.error(`Job já está como "${job.status}".`);
    process.exit(1);
  }

  const kind = job.payload.kind as string | undefined;
  const url = job.payload.url as string | undefined;
  const htmlColado = job.payload.html as string | undefined;
  const nomeManual = job.payload.name as string | undefined;

  reportarProgresso(jobId, 8);

  // Obtém o HTML: renderizado (URL) ou colado (HTML).
  let html: string;
  let sourceUrl: string | null;
  let strategy: string;
  if (kind === 'html' && typeof htmlColado === 'string') {
    html = htmlColado;
    sourceUrl = null;
    strategy = 'colado';
    console.log('Extraindo do HTML colado.');
  } else if (typeof url === 'string') {
    console.log(`Extraindo ${url}`);
    const r = await renderPage(url, {
      log: (evento, dados) => console.log(`  [${evento}] ${dados ? JSON.stringify(dados) : ''}`),
    });
    html = r.html;
    sourceUrl = r.finalUrl;
    strategy = r.strategy;
    for (const w of r.warnings) console.log(`  aviso: ${w}`);
  } else {
    console.error('Payload sem url nem html. Nada a extrair.');
    process.exit(1);
  }

  if (html.trim().length < 200) {
    console.error('A página veio praticamente vazia (<200 bytes). Não dá para extrair.');
    console.error('Se o site exige navegador e o Playwright não está instalado, instale-o:');
    console.error('  pnpm --filter @ds/explorer exec playwright install chromium');
    process.exit(1);
  }
  reportarProgresso(jobId, 45);

  const sourceHash = createHash('sha256').update(html).digest('hex');
  const db = getDb();

  // Reaproveita o id se o mesmo conteúdo já foi extraído (sourceHash é único).
  const existente = db
    .select({ id: tables.designSystems.id })
    .from(tables.designSystems)
    .where(eq(tables.designSystems.sourceHash, sourceHash))
    .get();
  const dsId: DesignSystemId = existente ? (existente.id as DesignSystemId) : newDesignSystemId();

  // Grava o vault: design-system.html + metadata de origem.
  const extractedDir = vaultExtractedDir(dsId);
  const sourceDir = vaultSourceDir(dsId);
  mkdirSync(extractedDir, { recursive: true });
  mkdirSync(sourceDir, { recursive: true });
  writeFileSync(join(extractedDir, 'design-system.html'), html, 'utf8');
  writeFileSync(
    join(sourceDir, 'metadata.json'),
    JSON.stringify({ url: sourceUrl, sourceHash, fetchedAt: Date.now(), strategy }, null, 2),
    'utf8',
  );
  reportarProgresso(jobId, 70);

  // Registra no banco (upsert por id).
  const name = nomeManual ?? (sourceUrl ? nomeDaUrl(sourceUrl) : 'HTML colado');
  const row = {
    id: dsId,
    sourceUrl,
    sourceHash,
    extractedAt: Date.now(),
    name,
    stackJson: null,
    status: 'extracted',
    vaultPath: extractedDir,
    errorMessage: null,
  };
  if (existente) {
    db.update(tables.designSystems).set(row).where(eq(tables.designSystems.id, dsId)).run();
  } else {
    db.insert(tables.designSystems).values(row).run();
  }

  // Anexa o id ao job para o fila:concluir segmentar.
  setJobResult(jobId, { designSystemId: dsId, strategy });
  reportarProgresso(jobId, 90);

  console.log(`\nExtraído (${strategy}): ${dsId}`);
  console.log(`  ${html.length} bytes de HTML renderizado no vault.`);
  console.log('\nAgora feche o job (valida, segmenta e indexa):');
  console.log(`  pnpm fila:concluir ${jobId}`);
};

main().catch((err) => {
  console.error(`\nFalha na extração: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
