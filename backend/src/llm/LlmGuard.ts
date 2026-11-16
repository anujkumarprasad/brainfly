import {
  BudgetExhaustedError,
  CircuitBreakerOpenError,
  KiloHttpError,
  type GenerateTextOptions,
  type LlmClient,
  type LlmStatus,
} from './types';

export interface LlmGuardOptions {
  model: string;
  hourlyBudget?: number;
}

export class LlmGuard implements LlmClient {
  private inner: LlmClient;
  private model: string;
  private hourlyBudget: number;
  private callTimestamps: number[] = [];
  private consecutiveFailures = 0;
  private cooldownUntil = 0;
  private cache = new Map<string, string>();
  private readonly maxCacheEntries = 100;

  constructor(inner: LlmClient, opts: LlmGuardOptions) {
    this.inner = inner;
    this.model = opts.model;
    this.hourlyBudget =
      opts.hourlyBudget ??
      parseInt(process.env.LLM_HOURLY_BUDGET || '150', 10);
  }

  private makeCacheKey(prompt: string, opts?: GenerateTextOptions | string): string {
    const options: GenerateTextOptions = typeof opts === 'string' ? { system: opts } : opts || {};
    return `${this.model}:::${options.system ?? ''}:::${options.json ? 'json' : ''}:::${prompt}`;
  }

  status(): LlmStatus {
    const now = Date.now();
    this.callTimestamps = this.callTimestamps.filter((t) => now - t < 3600_000);
    return {
      enabled: true,
      model: this.model,
      callsUsedThisHour: this.callTimestamps.length,
      budget: this.hourlyBudget,
      cooldownUntil: this.cooldownUntil > now ? this.cooldownUntil : null,
    };
  }

  async generateText(prompt: string, opts?: GenerateTextOptions | string): Promise<string> {
    const cacheKey = this.makeCacheKey(prompt, opts);

    // LRU Cache hit
    if (this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      // Refresh key position in Map
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, cached);
      return cached;
    }

    const now = Date.now();

    // Circuit breaker check
    if (now < this.cooldownUntil) {
      throw new CircuitBreakerOpenError(this.cooldownUntil);
    }

    // Hourly budget check
    this.callTimestamps = this.callTimestamps.filter((t) => now - t < 3600_000);
    if (this.callTimestamps.length >= this.hourlyBudget) {
      throw new BudgetExhaustedError();
    }

    try {
      const result = await this.inner.generateText(prompt, opts);
      this.consecutiveFailures = 0;
      this.callTimestamps.push(Date.now());

      // Save to LRU cache
      if (this.cache.size >= this.maxCacheEntries) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }
      this.cache.set(cacheKey, result);

      return result;
    } catch (err) {
      this.consecutiveFailures += 1;

      if (err instanceof KiloHttpError && err.status === 429) {
        const cooldownSeconds =
          err.retryAfterSeconds && err.retryAfterSeconds > 0
            ? err.retryAfterSeconds
            : 10 * 60;
        this.cooldownUntil = Date.now() + cooldownSeconds * 1000;
      } else if (this.consecutiveFailures >= 3) {
        this.cooldownUntil = Date.now() + 10 * 60 * 1000;
      }

      throw err;
    }
  }
}
