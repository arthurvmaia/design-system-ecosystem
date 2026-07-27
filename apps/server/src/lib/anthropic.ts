import Anthropic from '@anthropic-ai/sdk';

let cached: Anthropic | null = null;

export const getAnthropic = (): Anthropic => {
  if (cached !== null) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY não configurada. Copie apps/server/.env.example para .env e preencha.',
    );
  }
  cached = new Anthropic({ apiKey });
  return cached;
};

export const getModels = () => ({
  extractor: process.env.ANTHROPIC_MODEL_EXTRACTOR ?? 'claude-fable-5',
  classifier: process.env.ANTHROPIC_MODEL_CLASSIFIER ?? 'claude-opus-4-8',
  generator: process.env.ANTHROPIC_MODEL_GENERATOR ?? 'claude-fable-5',
});
