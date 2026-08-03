export const getModels = () => ({
  extractor: process.env.ANTHROPIC_MODEL_EXTRACTOR ?? 'claude-fable-5',
  classifier: process.env.ANTHROPIC_MODEL_CLASSIFIER ?? 'claude-opus-4-8',
  generator: process.env.ANTHROPIC_MODEL_GENERATOR ?? 'claude-fable-5',
});
