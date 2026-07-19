import { ExecutionMode } from '@ds/shared';

/**
 * Modo de execução do servidor.
 *
 * `queue` (padrão, MVP) — o app registra pedidos em disco. Nada é executado até
 *   uma pessoa abrir o Claude Code e mandar processar. Não consome créditos de
 *   API.
 *
 * `api` (produção) — o app chama a Anthropic direto, como antes. Consome
 *   créditos por uso.
 *
 * Os dois caminhos vivem lado a lado de propósito: migrar do MVP para produção
 * é trocar esta variável, não reescrever o sistema. E, enquanto ambos existem,
 * dá para comparar a qualidade dos dois no mesmo projeto.
 */
export const getExecutionMode = (): ExecutionMode => {
  const parsed = ExecutionMode.safeParse(process.env.EXECUTION_MODE);
  return parsed.success ? parsed.data : 'queue';
};

export const isQueueMode = (): boolean => getExecutionMode() === 'queue';
