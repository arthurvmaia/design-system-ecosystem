export const getModels = () => ({
  extractor: process.env.ANTHROPIC_MODEL_EXTRACTOR ?? 'claude-fable-5',
  classifier: process.env.ANTHROPIC_MODEL_CLASSIFIER ?? 'claude-opus-4-8',
  generator: process.env.ANTHROPIC_MODEL_GENERATOR ?? 'claude-fable-5',
});

/**
 * O caminho de API PAGA só abre com decisão EXPLÍCITA, nunca por acidente.
 *
 * Medido na auditoria: com `EXECUTION_MODE=api`, o agente de extração rodaria
 * claude-fable-5 com max_tokens 64000 e até 60 iterações — na ordem de 10 a 35
 * dólares POR SITE, sem nenhum teto de gasto no código, com a chave já
 * preenchida no .env. A regra do produto é custo zero de operação; quem quiser
 * MESMO pagar liga as duas coisas de propósito: o modo E esta permissão.
 */
export const apiPagaPermitida = (): boolean => process.env.DS_PERMITIR_API_PAGA === '1';

export const MENSAGEM_API_BLOQUEADA =
  'O modo api usa a API paga da Anthropic e está bloqueado por padrão (custo estimado de 10 a 35 dólares por site). O caminho normal é o modo fila (EXECUTION_MODE=queue). Para pagar de propósito, defina também DS_PERMITIR_API_PAGA=1.';
