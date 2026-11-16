import { describe, expect, it } from 'bun:test';
import { app } from './index';

describe('GET /api/health', () => {
  it('returns { ok: true }', async () => {
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);
    expect(body.llm).toBeDefined();
    expect(body.llm.enabled).toBe(false);
  });
});
