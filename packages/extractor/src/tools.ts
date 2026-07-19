import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Definições das ferramentas que o agente pode chamar durante a extração.
 * Executam operações de arquivo confinadas ao workspace (path traversal proibido).
 */

export type ToolExecutor = {
  workDir: string;
  /** Nome de arquivos criados/modificados (para diagnóstico). */
  touchedFiles: Set<string>;
};

export const getToolDefinitions = (): Anthropic.Tool[] => [
  {
    name: 'create_file',
    description:
      'Cria um novo arquivo com o conteúdo indicado. Cria pastas pai automaticamente. Falha se o arquivo já existir.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Caminho relativo ao workdir. Ex: "assets/css/animations.css"',
        },
        content: { type: 'string', description: 'Conteúdo textual do arquivo.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'str_replace',
    description:
      'Substitui uma ocorrência única de old_str por new_str em um arquivo existente. Falha se old_str não for único.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_str: { type: 'string' },
        new_str: { type: 'string' },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },
  {
    name: 'view',
    description: 'Lê o conteúdo de um arquivo. Útil para revisar output antes de finalizar.',
    input_schema: {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    },
  },
];

const resolveSafe = (workDir: string, unsafePath: string): string => {
  if (isAbsolute(unsafePath)) {
    throw new Error(`Path absoluto não permitido: ${unsafePath}`);
  }
  const abs = resolve(workDir, normalize(unsafePath));
  const rel = relative(workDir, abs);
  if (rel.startsWith('..')) {
    throw new Error(`Path fora do workspace: ${unsafePath}`);
  }
  return abs;
};

export const executeTool = (
  block: Anthropic.ToolUseBlock,
  ctx: ToolExecutor,
): { content: string; isError: boolean } => {
  try {
    switch (block.name) {
      case 'create_file':
        return executeCreateFile(block.input as CreateFileInput, ctx);
      case 'str_replace':
        return executeStrReplace(block.input as StrReplaceInput, ctx);
      case 'view':
        return executeView(block.input as ViewInput, ctx);
      default:
        return { content: `Ferramenta desconhecida: ${block.name}`, isError: true };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { content: `Erro: ${msg}`, isError: true };
  }
};

type CreateFileInput = { path: string; content: string };
type StrReplaceInput = { path: string; old_str: string; new_str: string };
type ViewInput = { path: string };

const executeCreateFile = (
  input: CreateFileInput,
  ctx: ToolExecutor,
): { content: string; isError: boolean } => {
  const full = resolveSafe(ctx.workDir, input.path);
  if (existsSync(full)) {
    return { content: `Arquivo já existe: ${input.path}`, isError: true };
  }
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, input.content, 'utf8');
  ctx.touchedFiles.add(input.path);
  return {
    content: `Arquivo criado: ${input.path} (${input.content.length} bytes)`,
    isError: false,
  };
};

const executeStrReplace = (
  input: StrReplaceInput,
  ctx: ToolExecutor,
): { content: string; isError: boolean } => {
  const full = resolveSafe(ctx.workDir, input.path);
  if (!existsSync(full)) {
    return { content: `Arquivo não encontrado: ${input.path}`, isError: true };
  }
  const original = readFileSync(full, 'utf8');
  const occurrences = original.split(input.old_str).length - 1;
  if (occurrences === 0) {
    return { content: `old_str não encontrado em ${input.path}`, isError: true };
  }
  if (occurrences > 1) {
    return {
      content: `old_str aparece ${occurrences}x em ${input.path}; precisa ser único`,
      isError: true,
    };
  }
  const updated = original.replace(input.old_str, input.new_str);
  writeFileSync(full, updated, 'utf8');
  ctx.touchedFiles.add(input.path);
  return { content: `Substituição aplicada em ${input.path}`, isError: false };
};

const executeView = (
  input: ViewInput,
  ctx: ToolExecutor,
): { content: string; isError: boolean } => {
  const full = resolveSafe(ctx.workDir, input.path);
  if (!existsSync(full)) {
    return { content: `Arquivo não encontrado: ${input.path}`, isError: true };
  }
  const body = readFileSync(full, 'utf8');
  // Trunca para não estourar o contexto do agente com arquivos gigantes.
  const MAX = 40_000;
  if (body.length > MAX) {
    return {
      content: `${body.slice(0, MAX)}\n\n[... truncado, ${body.length - MAX} bytes omitidos ...]`,
      isError: false,
    };
  }
  return { content: body, isError: false };
};

// Silence unused import warning: `join` reserved for future path helpers.
void join;
