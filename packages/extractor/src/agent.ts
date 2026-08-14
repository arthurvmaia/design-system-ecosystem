import Anthropic from '@anthropic-ai/sdk';
import { EXTRACT_SYSTEM_PROMPT, PROMPT_VERSION } from './prompt.js';
import { type ToolExecutor, executeTool, getToolDefinitions } from './tools.js';

export type AgentUsage = {
  inputTokens: number;
  outputTokens: number;
};

export type ExtractionEvent =
  | { type: 'start'; promptVersion: number }
  | { type: 'iteration'; index: number; usage: AgentUsage }
  | { type: 'tool_call'; name: string; path?: string; success: boolean; message: string }
  | { type: 'complete'; iterations: number; touchedFiles: string[]; totalUsage: AgentUsage }
  | { type: 'error'; message: string };

export type RunAgentOptions = {
  html: string;
  workDir: string;
  apiKey: string;
  model: string;
  maxIterations?: number;
  onEvent?: (event: ExtractionEvent) => void;
};

/** Roda o processo de extração até completar ou estourar iterações. */
export const runExtractionAgent = async (
  opts: RunAgentOptions,
): Promise<{
  iterations: number;
  touchedFiles: string[];
  totalUsage: AgentUsage;
}> => {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const tools = getToolDefinitions();
  const emit = opts.onEvent ?? (() => {});
  const maxIterations = opts.maxIterations ?? 60;

  emit({ type: 'start', promptVersion: PROMPT_VERSION });

  const ctx: ToolExecutor = {
    workDir: opts.workDir,
    touchedFiles: new Set(),
  };

  // O system prompt e as tools são idênticos nas até 60 iterações. O breakpoint
  // aqui faz o par tools+system ser cobrado como leitura de cache (~10%) a
  // partir da 2ª chamada. Não altera o conteúdo enviado nem a resposta.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: 'text',
      text: EXTRACT_SYSTEM_PROMPT,
      cache_control: { type: 'ephemeral' },
    },
  ];

  // O HTML de entrada também é reenviado a cada iteração e costuma ser o maior
  // bloco do prompt — segundo breakpoint.
  const messages: Anthropic.MessageParam[] = [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `Você vai extrair o design system do HTML abaixo, seguindo o processo definido no system prompt. Trabalhe no workdir atual. Use as ferramentas de arquivo para criar tudo. Quando terminar STEP 6, responda apenas "EXTRACTION_COMPLETE".

=== INPUT HTML ===

${opts.html}

=== FIM DO INPUT ===`,
          cache_control: { type: 'ephemeral' },
        },
      ],
    },
  ];

  const totalUsage: AgentUsage = { inputTokens: 0, outputTokens: 0 };

  // O modelo pensa DENTRO do max_tokens e, em effort max, 16k truncava a
  // resposta no meio; 64k dá o respiro que a Anthropic recomenda para esse
  // nível (o SDK estende o timeout sozinho em requisições grandes). O padrão
  // da extração é o Opus 5 em effort max (ver `getModels` no servidor).
  // Os classificadores de segurança podem recusar uma requisição legítima
  // (stop_reason 'refusal') — nesse caso a MESMA conversa cai para o modelo de
  // fallback e fica nele até o fim do loop.
  const MODELO_FALLBACK = 'claude-opus-4-8';
  let model = opts.model;
  const chamar = () =>
    client.messages.create({
      model,
      max_tokens: 64000,
      output_config: { effort: 'max' },
      system,
      tools,
      messages,
    });

  for (let iter = 0; iter < maxIterations; iter++) {
    let response = await chamar();
    if (response.stop_reason === 'refusal' && model !== MODELO_FALLBACK) {
      model = MODELO_FALLBACK;
      response = await chamar();
    }

    totalUsage.inputTokens += response.usage.input_tokens;
    totalUsage.outputTokens += response.usage.output_tokens;
    emit({
      type: 'iteration',
      index: iter,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    });

    // Adiciona resposta do assistant à história.
    messages.push({ role: 'assistant', content: response.content });

    // Se não houver tool_use, terminou.
    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (toolUses.length === 0) {
      emit({
        type: 'complete',
        iterations: iter + 1,
        touchedFiles: [...ctx.touchedFiles],
        totalUsage,
      });
      return {
        iterations: iter + 1,
        touchedFiles: [...ctx.touchedFiles],
        totalUsage,
      };
    }

    // Executa cada tool_use e coleta results.
    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((use) => {
      const outcome = executeTool(use, ctx);
      emit({
        type: 'tool_call',
        name: use.name,
        path: (use.input as { path?: string }).path,
        success: !outcome.isError,
        message: outcome.content.slice(0, 200),
      });
      return {
        type: 'tool_result',
        tool_use_id: use.id,
        content: outcome.content,
        is_error: outcome.isError,
      };
    });

    // Breakpoint rolante: marca o último tool_result desta rodada e desmarca o
    // da rodada anterior (a API aceita no máximo 4 breakpoints por request).
    // Assim a conversa acumulada das iterações anteriores também vira leitura
    // de cache, em vez de ser recobrada inteira a cada chamada.
    for (const previous of messages) {
      if (!Array.isArray(previous.content)) continue;
      for (const block of previous.content) {
        if (block.type === 'tool_result' && block.cache_control) {
          block.cache_control = undefined;
        }
      }
    }
    const last = results[results.length - 1];
    if (last) last.cache_control = { type: 'ephemeral' };

    messages.push({ role: 'user', content: results });
  }

  const msg = `Extração excedeu ${maxIterations} iterações sem terminar`;
  emit({ type: 'error', message: msg });
  throw new Error(msg);
};
