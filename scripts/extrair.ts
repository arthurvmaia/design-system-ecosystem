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
 * O motor é decidido por `EXTRACTION_ENGINE` (padrão: `v2`):
 *
 * - **v2** — uma captura só faz tudo: observa a página no tempo, varre o
 *   ponteiro, percorre com scroll, monta o grafo de estados e SEGMENTA POR
 *   EVIDÊNCIA. Grava `capture-v2/` + bundles + `segments/manifest.json` no
 *   formato que a Galeria já lê; o `fila:concluir` só indexa.
 * - **v1** — renderiza, e a captura PROFUNDA (descoberta de estados) entra
 *   automaticamente quando o HTML tem sinais que a merecem (canvas, sticky,
 *   lottie, gsap…). A decisão é de `decidirProfundidade` (`DS_EXPLORER_DEPTH=
 *   force|off` força/desliga). O manifesto vai para `vault/<ds>/capture/
 *   manifest.json`; o segmenter o consome no fila:concluir.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  PlaywrightIndisponivel,
  type ResultadoCaptura,
  capturarComV2,
  persistirCapturaV2,
} from '@ds/engine-v2';
import { decidirProfundidade, explorePage, renderPage, resolveDepthMode } from '@ds/explorer';
import { eq, getDb, tables } from '@ds/indexer';
import {
  type DesignSystemId,
  type TelemetriaRelatorio,
  getJob,
  newDesignSystemId,
  reportarProgresso,
  resolveEngine,
  setJobResult,
  vaultCaptureAssetsDir,
  vaultCaptureDir,
  vaultCaptureManifest,
  vaultCaptureV2Dir,
  vaultDir,
  vaultExtractedDir,
  vaultSegmentBundlesDir,
  vaultSourceDir,
} from '@ds/shared';
import { historicoDeFasesDoAcervo } from './historico-de-fases.js';

/**
 * Relatório agregado da telemetria (regra 15): duração por fase, contadores e —
 * o que importa — se a extração saiu PARCIAL por tempo. É onde se vê a causa do
 * antigo "7 minutos" e a diferença antes/depois do orçamento por fase.
 */
const imprimirTelemetria = (t: TelemetriaRelatorio | undefined): void => {
  if (!t) return;
  console.log(
    `\n  Telemetria — total ${(t.totalMs / 1000).toFixed(1)}s${t.parcial ? ' (PARCIAL)' : ''}:`,
  );
  for (const f of [...t.fases].sort((a, b) => b.ms - a.ms).slice(0, 8)) {
    console.log(
      `    ${f.nome.padEnd(16)} ${Math.round(f.ms)}ms${f.abortada ? '  (cortada por orçamento)' : ''}`,
    );
  }
  const c = t.contadores;
  console.log(
    `    requests=${c.requests ?? 0} downloadsOk=${c.downloadsOk ?? 0} fallbacksHttp=${c.fallbacksHttp ?? 0} timeouts=${c.timeouts ?? 0} candidatos=${c.candidatos ?? 0} estados=${c.estados ?? 0} assetsLocais=${c.assetsLocais ?? 0}`,
  );
  if (t.parcial) {
    console.log(
      `    ⚠ PARCIAL na fase "${t.faseInterrompida}" — ${t.motivo}. O capturado foi preservado.`,
    );
  }
};

const nomeDaUrl = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 60);
  }
};

type ExploracaoResumo = {
  mode: 'quick' | 'deep';
  reasons: string[];
  statesFound?: number;
  erro?: string;
  /** A captura saiu parcial por orçamento de tempo (regra 10). */
  parcial?: boolean;
};

type CapturaV2 = {
  captura: ResultadoCaptura;
  dirCaptura: string;
  dirBundles: string;
  tmpBase: string;
};

/**
 * Captura com o motor V2, em diretórios temporários DENTRO do vault (mesmo
 * volume, rename barato): o id do design system nasce do hash do HTML, que só
 * existe depois da captura — os artefatos são movidos para `vault/<ds>/` assim
 * que o id é conhecido.
 *
 * Degrada com honestidade: sem Playwright devolve `null` e o chamador segue no
 * caminho V1 (fetch estático). Qualquer outro erro sobe — falha de captura não
 * pode virar extração "concluída" pela metade.
 */
const capturarV2 = async (jobId: string, url: string): Promise<CapturaV2 | null> => {
  const tmpBase = join(vaultDir(), '.tmp', `extracao-${jobId}`);
  rmSync(tmpBase, { recursive: true, force: true });
  const dirCaptura = join(tmpBase, 'capture-v2');
  const dirBundles = join(tmpBase, 'bundles');
  try {
    const captura = await capturarComV2(url, {
      dirCaptura,
      dirBundles,
      // A reserva de orçamento das fases vem do CUSTO MEDIDO nas capturas que
      // já estão no acervo (p95 por fase). Sem acervo, o motor cai na fração
      // fixa. Medido: a diferença é de 150 a 210 s devolvidos ao percurso.
      historicoDeFases: historicoDeFasesDoAcervo(),
      // A conferência de pixel de cada bundle contra o print da dobra. É aqui
      // que ela vale — uma extração por vez, com alguém olhando o resultado.
      // `DS_SEM_VERIFICACAO=1` desliga, para quem vai processar uma fila longa
      // de sites e prefere gastar o orçamento capturando.
      verificarVisual: process.env.DS_SEM_VERIFICACAO !== '1',
      log: (evento, dados) => console.log(`  [v2:${evento}] ${dados ? JSON.stringify(dados) : ''}`),
    });
    return { captura, dirCaptura, dirBundles, tmpBase };
  } catch (err) {
    // A coleta NÃO é apagada na falha: frames, assets e o que mais já desceu
    // ficam em .tmp para autópsia (a proxima extração do mesmo job sobrescreve
    // sozinha). Apagar transformava qualquer erro tardio em perda total de
    // minutos de navegador — era o "tudo ou nada" da auditoria.
    console.log(`  A coleta parcial ficou em ${tmpBase} para inspeção.`);
    if (err instanceof PlaywrightIndisponivel) {
      rmSync(tmpBase, { recursive: true, force: true });
      console.log('  Playwright indisponível — caindo para o motor V1 (fetch estático).');
      console.log('  Para a captura completa, instale uma vez:');
      console.log('    pnpm --filter @ds/explorer exec playwright install chromium');
      return null;
    }
    throw err;
  }
};

/** Move um diretório do temporário para o lugar final no vault (substituindo). */
const moverDir = (origem: string, destino: string): void => {
  if (!existsSync(origem)) return;
  rmSync(destino, { recursive: true, force: true });
  mkdirSync(dirname(destino), { recursive: true });
  renameSync(origem, destino);
};

/**
 * Captura profunda opcional. Decide pela profundidade a partir do HTML JÁ
 * renderizado e, quando vale, roda o explorer para descobrir estados e escrever
 * o manifesto no vault (`capture/manifest.json`), que o segmenter consome no
 * fila:concluir. Nunca derruba a extração: falha vira aviso e a extração segue.
 */
const capturarProfundo = async (
  dsId: DesignSystemId,
  url: string,
  html: string,
): Promise<ExploracaoResumo> => {
  const decisao = decidirProfundidade(html, resolveDepthMode());
  if (!decisao.deep) {
    console.log('Exploração: rápida (sem sinais de comportamento complexo).');
    return { mode: 'quick', reasons: [] };
  }

  console.log(`Exploração PROFUNDA — motivos: ${decisao.reasons.join(', ') || 'forçada'}`);
  const assetsDir = vaultCaptureAssetsDir(dsId);
  try {
    const manifest = await explorePage(url, {
      exploration: { mode: 'deep', reasons: decisao.reasons },
      // Localiza os assets a partir do design-system.html (o que é segmentado),
      // não do render interno da exploração — que pode ter menos (lazy-load).
      htmlParaAssets: html,
      assetSink: (localPath, bytes) => {
        const dest = join(assetsDir, localPath);
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, bytes);
      },
      log: (evento, dados) =>
        console.log(`  [explorer:${evento}] ${dados ? JSON.stringify(dados) : ''}`),
    });
    mkdirSync(vaultCaptureDir(dsId), { recursive: true });
    writeFileSync(vaultCaptureManifest(dsId), JSON.stringify(manifest, null, 2), 'utf8');
    console.log(
      `  ${manifest.stats.statesFound} estados em ${manifest.elements.length} elementos — manifesto gravado.`,
    );
    imprimirTelemetria(manifest.telemetry);
    return {
      mode: 'deep',
      reasons: decisao.reasons,
      statesFound: manifest.stats.statesFound,
      parcial: manifest.telemetry?.parcial ?? false,
    };
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    console.log(`  exploração profunda falhou (${erro}) — extração segue sem estados.`);
    return { mode: 'quick', reasons: decisao.reasons, erro };
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

  // Obtém o HTML: renderizado (URL) ou colado (HTML). Com `EXTRACTION_ENGINE=v2`
  // (o padrão), a renderização E a exploração acontecem numa captura só — mesma
  // página, mesmo DOM, segmentação por evidência. HTML colado não tem navegador:
  // segue o caminho estático do V1.
  const engine = resolveEngine();
  let html: string;
  let sourceUrl: string | null;
  let strategy: string;
  let v2: CapturaV2 | null = null;
  if (kind === 'html' && typeof htmlColado === 'string') {
    html = htmlColado;
    sourceUrl = null;
    strategy = 'colado';
    console.log('Extraindo do HTML colado.');
  } else if (typeof url === 'string') {
    if (engine === 'v2') {
      console.log(`Extraindo ${url} — motor V2 (observa, explora e segmenta por evidência).`);
      v2 = await capturarV2(jobId, url);
    }
    if (v2 !== null) {
      html = v2.captura.html;
      sourceUrl = v2.captura.finalUrl;
      strategy = 'playwright-v2';
    } else {
      console.log(`Extraindo ${url}`);
      const r = await renderPage(url, {
        log: (evento, dados) => console.log(`  [${evento}] ${dados ? JSON.stringify(dados) : ''}`),
      });
      html = r.html;
      sourceUrl = r.finalUrl;
      strategy = r.strategy;
      for (const w of r.warnings) console.log(`  aviso: ${w}`);
    }
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

  reportarProgresso(jobId, 78);

  // Persistência: no V2, os artefatos saem do temporário para o vault e o
  // manifesto + segmentos + estados + rejeitados são gravados no formato que a
  // Galeria já lê — a captura profunda do V1 não é necessária, porque o V2 já
  // observou estados, ponteiro, scroll e assets na MESMA página que segmentou.
  // No V1, a captura profunda automática continua como sempre foi.
  let exploration: ExploracaoResumo;
  if (v2 !== null) {
    moverDir(v2.dirCaptura, vaultCaptureV2Dir(dsId));
    moverDir(v2.dirBundles, vaultSegmentBundlesDir(dsId));
    rmSync(v2.tmpBase, { recursive: true, force: true });
    const persistido = persistirCapturaV2(dsId, v2.captura);
    const m = v2.captura.manifesto;
    console.log(
      `  ${persistido.segments.length} segmento(s) por evidência, ${v2.captura.rejeitados.length} reprovado(s) com motivo.`,
    );
    imprimirTelemetria(m.telemetry);
    exploration = {
      mode: 'deep',
      reasons: ['engine-v2'],
      statesFound: Math.max(0, (m.stateGraph?.nodes.length ?? 0) - 1),
      parcial: m.captureMode !== 'completo',
    };
  } else {
    // Captura profunda automática (só faz sentido com URL viva; HTML colado não
    // tem navegador para explorar).
    exploration =
      kind !== 'html' && typeof url === 'string'
        ? await capturarProfundo(dsId, url, html)
        : { mode: 'quick', reasons: [] };
  }

  // Anexa o id + a exploração ao job para o fila:concluir segmentar.
  setJobResult(jobId, { designSystemId: dsId, strategy, exploration });
  reportarProgresso(jobId, 92);

  console.log(`\nExtraído (${strategy}): ${dsId}`);
  console.log(`  ${html.length} bytes de HTML renderizado no vault.`);
  if (exploration.mode === 'deep') {
    console.log(`  captura profunda: ${exploration.statesFound ?? 0} estados descobertos.`);
  }
  console.log('\nAgora feche o job (valida, segmenta e indexa):');
  console.log(`  pnpm fila:concluir ${jobId}`);
};

main().catch((err) => {
  console.error(`\nFalha na extração: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
