import {
  KiloHttpError,
  type FetchFunction,
  type GenerateTextOptions,
  type LlmClient,
} from './types';

interface ChatCompletionChoice {
  message?: {
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

export interface KiloLlmClientOptions {
  baseUrl?: string;
  model: string;
  apiKey?: string;
  fetchFn?: FetchFunction;
}

export class KiloLlmClient implements LlmClient {
  private baseUrl: string;
  private model: string;
  private apiKey?: string;
  private fetchFn: FetchFunction;

  constructor(opts: KiloLlmClientOptions) {
    this.baseUrl = (opts.baseUrl || process.env.KILO_BASE_URL || 'https://api.kilo.ai/api/gateway').replace(/\/+$/, '');
    this.model = opts.model;
    this.apiKey = opts.apiKey;
    this.fetchFn = opts.fetchFn || fetch;
  }

  async generateText(prompt: string, opts?: GenerateTextOptions | string): Promise<string> {
    const options: GenerateTextOptions = typeof opts === 'string' ? { system: opts } : opts || {};
    const url = `${this.baseUrl}/chat/completions`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const messages: Array<{ role: 'system' | 'user'; content: string }> = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: prompt });

    const payload: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.7,
      max_tokens: options.maxTokens ?? 200,
    };
    if (options.json) {
      payload.response_format = { type: 'json_object' };
    }

    const res = await this.fetchFn(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      const retryHeader = res.headers?.get('retry-after');
      const retrySeconds = retryHeader ? parseInt(retryHeader, 10) : undefined;
      const errText = await res.text().catch(() => '');
      throw new KiloHttpError(
        res.status,
        errText || res.statusText,
        Number.isFinite(retrySeconds) ? retrySeconds : undefined
      );
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Kilo API returned empty content');
    }

    return content.trim();
  }
}
