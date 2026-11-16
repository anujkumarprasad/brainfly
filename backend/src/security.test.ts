import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { app, aiRateLimiter } from './index';

describe('Security & Deployment Baseline', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('Security Headers', () => {
    it('sets security headers on all responses', async () => {
      const res = await app.request('/api/health');
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
      expect(res.headers.get('permissions-policy')).toBe('microphone=(self)');
    });
  });

  describe('CORS Restrictions', () => {
    it('allows permitted origin', async () => {
      const res = await app.request('/api/health', {
        headers: { Origin: 'http://localhost:5173' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
    });

    it('rejects unauthorized foreign origin', async () => {
      const res = await app.request('/api/health', {
        headers: { Origin: 'http://malicious-site.example.com' },
      });
      expect(res.headers.get('access-control-allow-origin')).toBeNull();
    });
  });

  describe('Finite Request & Schema Limits', () => {
    it('rejects chat messages exceeding 1000 characters with 400 VALIDATION_ERROR', async () => {
      const oversizedMessage = 'a'.repeat(1001);
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'tortoise',
          message: oversizedMessage,
          upToChapter: 1,
        }),
      });

      expect(res.status).toBe(400);
      const data = await res.json() as any;
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('rejects payload exceeding 1MB with 413 PAYLOAD_TOO_LARGE', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': String(2 * 1024 * 1024),
        },
        body: JSON.stringify({ character: 'tortoise', message: 'hi', upToChapter: 1 }),
      });

      expect(res.status).toBe(413);
      const data = await res.json() as any;
      expect(data.error.code).toBe('PAYLOAD_TOO_LARGE');
    });
  });

  describe('Production Read-Only Protection', () => {
    it('blocks mutations in production mode when ALLOW_MUTATIONS is not true', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_MUTATIONS;

      // Edit-fact should return 403
      const resEdit = await app.request('/api/edit-fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: 'f3',
          patch: { subject: 'tortoise' },
        }),
      });
      expect(resEdit.status).toBe(403);
      const editData = await resEdit.json() as any;
      expect(editData.error.code).toBe('FORBIDDEN');

      // Reset should return 403
      const resReset = await app.request('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(resReset.status).toBe(403);

      // Switch novel should return 403
      const resSwitch = await app.request('/api/switch-novel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ novelId: 'the-great-woodland-race' }),
      });
      expect(resSwitch.status).toBe(403);
    });

    it('allows mutations in production when ALLOW_MUTATIONS=true', async () => {
      process.env.NODE_ENV = 'production';
      process.env.ALLOW_MUTATIONS = 'true';

      const resReset = await app.request('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      expect(resReset.status).toBe(200);
    });

    it('allows mutations on localhost in production mode', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_MUTATIONS;

      const resReset = await app.request('/api/reset', {
        method: 'POST',
        headers: {
          'Host': 'localhost:3001',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      expect(resReset.status).toBe(200);

      const resEdit = await app.request('/api/edit-fact', {
        method: 'POST',
        headers: {
          'Host': 'localhost:3001',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          factId: 'f3',
          patch: { subject: 'tortoise' },
        }),
      });
      expect(resEdit.status).toBe(200);
    });

    it('blocks mutations in production mode even if x-demo-mode header is provided', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.ALLOW_MUTATIONS;

      const resReset = await app.request('/api/reset', {
        method: 'POST',
        headers: {
          'Host': 'public-story.example.com',
          'Content-Type': 'application/json',
          'X-Demo-Mode': 'true',
        },
        body: JSON.stringify({}),
      });
      expect(resReset.status).toBe(403);
    });
  });

  describe('Rate Limiting on Expensive Routes', () => {
    it('returns 429 when client exceeds rate limit on chat route', async () => {
      const clientKey = 'rate-limit-test-ip';

      // Exhaust limit
      for (let i = 0; i < 30; i++) {
        aiRateLimiter.isLimited(clientKey);
      }

      // 31st request from same IP should get throttled
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': clientKey,
        },
        body: JSON.stringify({
          character: 'hare',
          message: 'Where are you?',
          upToChapter: 1,
        }),
      });

      expect(res.status).toBe(429);
      expect(res.headers.get('retry-after')).toBeDefined();
      const data = await res.json() as any;
      expect(data.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('prioritizes socket address over spoofed x-forwarded-for header', async () => {
      const socketIp = 'socket-real-client-123';
      const spoofedHeaderIp = 'spoofed-fake-client-999';

      // Exhaust limit for socketIp
      for (let i = 0; i < 30; i++) {
        aiRateLimiter.isLimited(socketIp);
      }

      // Make request with socket address in env and a spoofed header
      const res = await app.request(
        '/api/chat',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Forwarded-For': spoofedHeaderIp,
          },
          body: JSON.stringify({
            character: 'hare',
            message: 'Where are you?',
            upToChapter: 1,
          }),
        },
        {
          server: {
            requestIP: () => ({ address: socketIp }),
          },
        }
      );

      // Must be throttled because real socket address was exhausted
      expect(res.status).toBe(429);
    });
  });
});
