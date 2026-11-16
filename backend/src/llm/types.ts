export type FetchFunction = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface GenerateTextOptions {
  system?: string;
  maxTokens?: number;
  json?: boolean;
}

export interface LlmClient {
  generateText(prompt: string, opts?: GenerateTextOptions | string): Promise<string>;
}

export class KiloHttpError extends Error {
  status: number;
  retryAfterSeconds?: number;

  constructor(status: number, message: string, retryAfterSeconds?: number) {
    super(`Kilo API error ${status}: ${message}`);
    this.name = 'KiloHttpError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class BudgetExhaustedError extends Error {
  constructor(message = 'Hourly LLM budget exhausted') {
    super(message);
    this.name = 'BudgetExhaustedError';
  }
}

export class CircuitBreakerOpenError extends Error {
  cooldownUntil: number;

  constructor(cooldownUntil: number, message?: string) {
    super(message ?? `LLM circuit breaker open until ${new Date(cooldownUntil).toISOString()}`);
    this.name = 'CircuitBreakerOpenError';
    this.cooldownUntil = cooldownUntil;
  }
}

export interface LlmStatus {
  enabled: boolean;
  model: string | null;
  features?: string[];
  callsUsedThisHour: number;
  budget: number;
  cooldownUntil: number | null;
}
