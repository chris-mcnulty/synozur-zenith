import { AI_MODEL_INFO, AI_PROVIDERS, type AIProvider } from '@shared/ai-schema';

export function estimateCostUsd(
  provider: AIProvider,
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  if (provider === AI_PROVIDERS.AZURE_FOUNDRY) {
    return 0;
  }

  const info = AI_MODEL_INFO[model as keyof typeof AI_MODEL_INFO];
  if (!info) return 0;

  const inputCost = (inputTokens / 1000) * info.inputPricePer1k;
  const outputCost = (outputTokens / 1000) * info.outputPricePer1k;
  return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000;
}
