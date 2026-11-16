import { beforeEach, describe, expect, it } from 'bun:test';
import { KiloLlmClient } from './KiloLlmClient';
import { LlmGuard } from './LlmGuard';
import { clearModelCache, pickFreeModel } from './modelSelection';
import { BudgetExhaustedError, CircuitBreakerOpenError, KiloHttpError, type FetchFunction } from './types';

describe('Kilo AI Gateway LLM Integration', () => {
  beforeEach(() => {
    clearModelCache();
    delete process.env.KILO_MODEL;
    delete process.env.KILO_API_KEY;
    delete process.env.KILO_MODEL_BLOCKLIST;
  });

  it('model selection picks a ":free" model and skips an "nvidia/..." model', async () => {
    const fakeModels = [
      { id: 'meta-llama/llama-3.1-8b' },
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct:free' }, // should be skipped because nvidia
      { id: 'mistralai/mistral-7b-instruct:free' }, // should be chosen!
      { id: 'google/gemma-2-9b-it:free' },
    ];

    const fakeFetch: FetchFunction = async (input, init) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify({ data: fakeModels }), { status: 200 });
      }
      return new Response('Not found', { status: 404 });
    };

    const chosen = await pickFreeModel({
      baseUrl: 'https://api.kilo.ai/api/gateway',
      fetchFn: fakeFetch,
      blocklist: ['nvidia'],
    });

    expect(chosen).toBe('mistralai/mistral-7b-instruct:free');
  });

  it('KILO_MODEL set to an nvidia model is rejected', async () => {
    const fakeModels = [
      { id: 'qwen/qwen-2.5-7b-instruct:free' },
    ];

    const fakeFetch: FetchFunction = async () => {
      return new Response(JSON.stringify({ data: fakeModels }), { status: 200 });
    };

    // Preferred model matches blocked keyword nvidia
    const chosen = await pickFreeModel({
      baseUrl: 'https://api.kilo.ai/api/gateway',
      fetchFn: fakeFetch,
      preferred: 'nvidia/llama-3.1-nemotron-70b-instruct:free',
      blocklist: ['nvidia'],
    });

    // Ignored preferred, fell through to fetch models
    expect(chosen).toBe('qwen/qwen-2.5-7b-instruct:free');
  });

  it('a 429 opens the breaker and later calls fail fast without hitting fetch', async () => {
    let fetchCallCount = 0;

    const fakeFetch: FetchFunction = async () => {
      fetchCallCount++;
      return new Response('Too Many Requests', {
        status: 429,
        headers: { 'Retry-After': '60' },
      });
    };

    const client = new KiloLlmClient({
      model: 'test-model:free',
      fetchFn: fakeFetch,
    });
    const guard = new LlmGuard(client, { model: 'test-model:free', hourlyBudget: 10 });

    // First call should hit fetch and receive 429
    await expect(guard.generateText('hello 1')).rejects.toThrow(KiloHttpError);
    expect(fetchCallCount).toBe(1);

    // Second call should immediately fail fast via circuit breaker without calling fetch
    await expect(guard.generateText('hello 2')).rejects.toThrow(CircuitBreakerOpenError);
    expect(fetchCallCount).toBe(1); // Still 1!
  });

  it('the budget is enforced', async () => {
    let callCount = 0;
    const fakeFetch: FetchFunction = async () => {
      callCount++;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: `Response ${callCount}` } }] }),
        { status: 200 }
      );
    };

    const client = new KiloLlmClient({
      model: 'test-model:free',
      fetchFn: fakeFetch,
    });
    // Strict budget of 3 calls
    const guard = new LlmGuard(client, { model: 'test-model:free', hourlyBudget: 3 });

    await guard.generateText('prompt 1');
    await guard.generateText('prompt 2');
    await guard.generateText('prompt 3');
    expect(callCount).toBe(3);

    // 4th call exceeds budget
    await expect(guard.generateText('prompt 4')).rejects.toThrow(BudgetExhaustedError);
    expect(callCount).toBe(3);
  });

  it('identical prompts hit the cache', async () => {
    let fetchCount = 0;
    const fakeFetch: FetchFunction = async () => {
      fetchCount++;
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'Cached result' } }] }),
        { status: 200 }
      );
    };

    const client = new KiloLlmClient({
      model: 'test-model:free',
      fetchFn: fakeFetch,
    });
    const guard = new LlmGuard(client, { model: 'test-model:free', hourlyBudget: 50 });

    const res1 = await guard.generateText('What is 2+2?', { system: 'Math tutor' });
    expect(res1).toBe('Cached result');
    expect(fetchCount).toBe(1);

    // Identical prompt + system
    const res2 = await guard.generateText('What is 2+2?', { system: 'Math tutor' });
    expect(res2).toBe('Cached result');
    expect(fetchCount).toBe(1); // Did not hit network!
  });

  it('the Authorization header is sent only when a key is set', async () => {
    let capturedHeadersWithKey: HeadersInit | undefined;
    let capturedHeadersWithoutKey: HeadersInit | undefined;

    const fakeFetch: FetchFunction = async (_input, init) => {
      return new Response(
        JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
        { status: 200 }
      );
    };

    // 1. Without API key
    const clientNoKey = new KiloLlmClient({
      model: 'test:free',
      fetchFn: async (_input, init) => {
        capturedHeadersWithoutKey = init?.headers;
        return fakeFetch(_input, init);
      },
    });
    await clientNoKey.generateText('test');
    expect((capturedHeadersWithoutKey as Record<string, string>)?.['Authorization']).toBeUndefined();

    // 2. With API key
    const clientWithKey = new KiloLlmClient({
      model: 'test:free',
      apiKey: 'kilo-secret-key-123',
      fetchFn: async (_input, init) => {
        capturedHeadersWithKey = init?.headers;
        return fakeFetch(_input, init);
      },
    });
    await clientWithKey.generateText('test');
    expect((capturedHeadersWithKey as Record<string, string>)?.['Authorization']).toBe('Bearer kilo-secret-key-123');
  });
});
