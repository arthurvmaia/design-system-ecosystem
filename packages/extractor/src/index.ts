import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  newDesignSystemId,
  newTaskId,
  vaultExtractedDir,
  vaultSourceDir,
  workspaceTaskDir,
  workspaceTaskInputDir,
  workspaceTaskOutputDir,
} from '@ds/shared';
import { type ExtractionEvent, runExtractionAgent } from './agent.js';
import { fetchUrl } from './fetch-url.js';
import { PROMPT_VERSION } from './prompt.js';
import { parseStackManifest, validateExtraction } from './validate.js';

export type ExtractInput =
  | { kind: 'url'; url: string; name?: string }
  | { kind: 'html'; html: string; name: string };

export type ExtractOptions = {
  apiKey: string;
  model: string;
  onEvent?: (event: ExtractionEvent) => void;
};

export type ExtractResult = {
  designSystemId: `ds_${string}`;
  taskId: `task_${string}`;
  sourceHash: string;
  vaultPath: string;
  stack: { name: string; description: string }[];
  stats: {
    iterations: number;
    touchedFiles: string[];
    designSystemBytes: number;
    cssFiles: number;
    jsFiles: number;
    svgFiles: number;
    totalTokens: number;
  };
};

/** Roda o pipeline completo de extração e devolve o resultado para persistência. */
export const runExtraction = async (
  input: ExtractInput,
  opts: ExtractOptions,
): Promise<ExtractResult> => {
  const taskId = newTaskId();
  const designSystemId = newDesignSystemId();

  const workDir = workspaceTaskDir(taskId);
  const inputDir = workspaceTaskInputDir(taskId);
  const outputDir = workspaceTaskOutputDir(taskId);
  mkdirSync(inputDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  // 1. Obter HTML de entrada.
  let html: string;
  let sourceUrl: string | null = null;
  if (input.kind === 'url') {
    const fetched = await fetchUrl(input.url);
    html = fetched.html;
    sourceUrl = fetched.finalUrl;
  } else {
    html = input.html;
  }

  // Grava o input original para auditoria.
  writeFileSync(join(inputDir, sourceUrl ? 'original.html' : 'original.html'), html, 'utf8');
  if (sourceUrl) {
    writeFileSync(
      join(inputDir, 'source.json'),
      JSON.stringify({ url: sourceUrl, fetchedAt: Date.now() }, null, 2),
    );
  }

  const sourceHash = createHash('sha256').update(html).digest('hex');

  try {
    // 2. Rodar agente no output dir.
    const agentResult = await runExtractionAgent({
      html,
      workDir: outputDir,
      apiKey: opts.apiKey,
      model: opts.model,
      onEvent: opts.onEvent,
    });

    // 3. Validar.
    const validation = validateExtraction(outputDir);
    if (!validation.ok) {
      throw new Error(`Validação falhou: ${validation.errors.join('; ')}`);
    }
    const stack = parseStackManifest(outputDir);

    // 4. Mover para o vault.
    const vaultSrc = vaultSourceDir(designSystemId);
    const vaultExt = vaultExtractedDir(designSystemId);
    mkdirSync(vaultSrc, { recursive: true });
    mkdirSync(vaultExt, { recursive: true });
    cpSync(inputDir, vaultSrc, { recursive: true });
    cpSync(outputDir, vaultExt, { recursive: true });

    // 5. Escrever metadata no vault.
    writeFileSync(
      join(vaultSrc, 'metadata.json'),
      JSON.stringify(
        {
          url: sourceUrl,
          sourceHash,
          fetchedAt: Date.now(),
          promptVersion: PROMPT_VERSION,
        },
        null,
        2,
      ),
    );

    // 6. Limpar workspace.
    rmSync(workDir, { recursive: true, force: true });

    return {
      designSystemId,
      taskId,
      sourceHash,
      vaultPath: vaultExt,
      stack,
      stats: {
        iterations: agentResult.iterations,
        touchedFiles: agentResult.touchedFiles,
        designSystemBytes: validation.stats.designSystemBytes,
        cssFiles: validation.stats.cssFiles,
        jsFiles: validation.stats.jsFiles,
        svgFiles: validation.stats.svgFiles,
        totalTokens: agentResult.totalUsage.inputTokens + agentResult.totalUsage.outputTokens,
      },
    };
  } catch (err) {
    // Em caso de erro, mantém o workspace por 7 dias para debug (não apaga).
    if (existsSync(join(workDir, 'task.json'))) {
      // já tem manifest, deixa como está
    } else {
      writeFileSync(
        join(workDir, 'task.json'),
        JSON.stringify(
          {
            id: taskId,
            failedAt: Date.now(),
            error: err instanceof Error ? err.message : String(err),
          },
          null,
          2,
        ),
      );
    }
    throw err;
  }
};

export { PROMPT_VERSION } from './prompt.js';
export { fetchUrl } from './fetch-url.js';
export { validateExtraction, parseStackManifest } from './validate.js';
export type { ExtractionEvent } from './agent.js';
