import { KiloLlmClient } from './KiloLlmClient';
import { LlmGuard } from './LlmGuard';
import { pickFreeModel } from './modelSelection';

export * from './types';
export * from './KiloLlmClient';
export * from './modelSelection';
export * from './LlmGuard';

export async function createLlmClient(
  env: Record<string, string | undefined> = process.env,
  fetchFn?: typeof fetch
): Promise<LlmGuard | null> {
  if (env.LLM_ENABLED !== 'true') {
    return null;
  }

  const baseUrl = env.KILO_BASE_URL || 'https://api.kilo.ai/api/gateway';
  const blocklist = env.KILO_MODEL_BLOCKLIST
    ? env.KILO_MODEL_BLOCKLIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : undefined;

  const model = await pickFreeModel({
    baseUrl,
    fetchFn,
    preferred: env.KILO_MODEL,
    blocklist,
  });

  if (!model) {
    console.warn('Could not discover or select an allowed free Kilo model; running in deterministic template mode.');
    return null;
  }

  const kiloClient = new KiloLlmClient({
    baseUrl,
    model,
    apiKey: env.KILO_API_KEY,
    fetchFn,
  });

  const hourlyBudget = env.LLM_HOURLY_BUDGET ? parseInt(env.LLM_HOURLY_BUDGET, 10) : undefined;
  return new LlmGuard(kiloClient, { model, hourlyBudget });
}
