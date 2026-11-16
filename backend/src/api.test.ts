import { beforeEach, describe, expect, it } from 'bun:test';
import type { BlastReport, ChatResponse, EditFactResponse, GraphData, Novel } from '@bl/shared';
import { app, store } from './index';

describe('Hono API Routes', () => {
  beforeEach(() => {
    store.reset();
  });

  describe('GET /api/health', () => {
    it('returns { ok: true } on /api/health and /health', async () => {
      const res1 = await app.request('/api/health');
      expect(res1.status).toBe(200);
      const data1 = (await res1.json()) as any;
      expect(data1.ok).toBe(true);
      expect(data1.llm).toBeDefined();

      const res2 = await app.request('/health');
      expect(res2.status).toBe(200);
      const data2 = (await res2.json()) as any;
      expect(data2.ok).toBe(true);
      expect(data2.llm).toBeDefined();
    });
  });

  describe('GET /api/novel', () => {
    it('returns the current novel', async () => {
      const res = await app.request('/api/novel');
      expect(res.status).toBe(200);
      const novel = (await res.json()) as Novel;
      expect(novel.id).toBe('the-great-woodland-race');
      expect(novel.title).toBe('The Rabbit and the Turtle');
      expect(novel.author).toBe('Aesop');
      expect(novel.chapters).toHaveLength(5);
    });
  });

  describe('GET /api/graph', () => {
    it('graph upTo=2 vs 5 differ', async () => {
      const res2 = await app.request('/api/graph?upTo=2');
      expect(res2.status).toBe(200);
      const g2 = (await res2.json()) as GraphData;

      const res5 = await app.request('/api/graph?upTo=5');
      expect(res5.status).toBe(200);
      const g5 = (await res5.json()) as GraphData;

      expect(g2.nodes.length).toBeLessThan(g5.nodes.length);
      expect(g2.edges.length).toBeLessThan(g5.edges.length);
      expect(g2.nodes.some((n) => n.id === 'golden_trophy')).toBe(false);
      expect(g5.nodes.some((n) => n.id === 'golden_trophy')).toBe(true);
    });

    it('defaults to the full graph when upTo is omitted', async () => {
      const resDefault = await app.request('/api/graph');
      expect(resDefault.status).toBe(200);
      const gDefault = (await resDefault.json()) as GraphData;

      const res5 = await app.request('/api/graph?upTo=5');
      const g5 = (await res5.json()) as GraphData;

      expect(gDefault.nodes.length).toBe(g5.nodes.length);
      expect(gDefault.edges.length).toBe(g5.edges.length);
    });

    it('rejects invalid or out of range upTo parameter with ApiError', async () => {
      const resInvalid = await app.request('/api/graph?upTo=abc');
      expect(resInvalid.status).toBe(400);
      expect(await resInvalid.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter upTo must be an integer',
        },
      });

      const resOutOfRange = await app.request('/api/graph?upTo=99');
      expect(resOutOfRange.status).toBe(400);
      expect(await resOutOfRange.json()).toEqual({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'upTo must be an integer between 1 and 5',
        },
      });
    });
  });

  describe('POST /api/blast-radius', () => {
    it('blast-radius for f3 matches the engine test and does not mutate', async () => {
      const res = await app.request('/api/blast-radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: 'f3',
          patch: { subject: 'tortoise' },
        }),
      });

      expect(res.status).toBe(200);
      const report = (await res.json()) as BlastReport;

      expect(report.noChange).toBe(false);
      const impactedFactIds = report.impactedFacts.map((f) => f.id);
      expect(impactedFactIds.sort()).toEqual(['f10', 'f5', 'f6', 'f7', 'f8', 'f9']);

      // Flagged lines across chapters 2..5
      expect(report.summary.chaptersAffected).toEqual([2, 3, 4, 5]);

      // Verify no mutation occurred
      const f3 = store.getFact('f3');
      expect(f3?.subject).toBe('hare');
    });

    it('returns 404 for unknown fact id', async () => {
      const res = await app.request('/api/blast-radius', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: 'non_existent',
          patch: { subject: 'tortoise' },
        }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Fact with id "non_existent" not found',
        },
      });
    });
  });

  describe('POST /api/edit-fact and POST /api/reset', () => {
    it('rejects candidate edits that fail validateNovel with 400 VALIDATION_ERROR', async () => {
      const res = await app.request('/api/edit-fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: 'f3',
          patch: { subject: 'non_existent_entity_id' },
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.code).toBe('VALIDATION_ERROR');
      expect(data.error.message).toContain('references unknown subject entity');
    });

    it('rejects public attempts to modify dependsOn with 400 VALIDATION_ERROR', async () => {
      const res = await app.request('/api/edit-fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: 'f3',
          patch: { dependsOn: ['f1'] },
        }),
      });

      expect(res.status).toBe(400);
      const data = (await res.json()) as { error: { code: string; message: string } };
      expect(data.error.code).toBe('VALIDATION_ERROR');
    });

    it('novel switching is POST-only (GET /api/novel?id=... is read-only and ignores query id)', async () => {
      const initialNovel = store.getNovel().id;
      const resGet = await app.request('/api/novel?id=some-other-id');
      expect(resGet.status).toBe(200);
      expect(store.getNovel().id).toBe(initialNovel);
    });

    it('edit-fact applies then reset restores', async () => {
      // 1. Edit fact f3
      const resEdit = await app.request('/api/edit-fact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          factId: 'f3',
          patch: { subject: 'tortoise' },
        }),
      });

      expect(resEdit.status).toBe(200);
      const editBody = (await resEdit.json()) as EditFactResponse;
      expect(editBody.report.editedFact.before.subject).toBe('hare');
      expect(editBody.report.editedFact.after.subject).toBe('tortoise');

      const f3Edited = editBody.novel.facts.find((f) => f.id === 'f3');
      expect(f3Edited?.subject).toBe('tortoise');
      expect(store.getFact('f3')?.subject).toBe('tortoise');

      // 2. Reset restores
      const resReset = await app.request('/api/reset', { method: 'POST' });
      expect(resReset.status).toBe(200);
      expect(store.getFact('f3')?.subject).toBe('hare');
    });
  });

  describe('POST /api/chat', () => {
    it('asking tortoise about "golden trophy" at upToChapter 2 is refused with no facts', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'tortoise',
          message: 'What do you know about the golden trophy?',
          upToChapter: 2,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ChatResponse;
      expect(data.refused).toBe(true);
      expect(data.factsUsed).toEqual([]);
      expect(data.fenceChapter).toBe(2);
      expect(data.reply).toContain("I don't know what you mean by that.");
    });

    it('asking tortoise about "golden trophy" at upToChapter 4 is answered with f8 in factsUsed', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'tortoise',
          message: 'Did you touch the golden trophy?',
          upToChapter: 4,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ChatResponse;
      expect(data.refused).toBeFalsy();
      expect(data.factsUsed).toContain('f8');
      expect(data.fenceChapter).toBe(4);
      expect(data.reply).toContain('Golden Trophy');
    });

    it('asking hare about sweet apples at chapter 1 is refused', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'hare',
          message: 'Do you have sweet apples?',
          upToChapter: 1,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ChatResponse;
      expect(data.refused).toBe(true);
      expect(data.factsUsed).toEqual([]);
      expect(data.fenceChapter).toBe(1);
    });

    it('asking hare where he is at chapter 1 returns f1', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'hare',
          message: 'Where are you right now?',
          upToChapter: 1,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ChatResponse;
      expect(data.refused).toBeFalsy();
      expect(data.factsUsed).toContain('f1');
      expect(data.fenceChapter).toBe(1);
      expect(data.reply).toContain('Start Meadow');
    });

    it('returns 404 for unknown character id', async () => {
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'unknown_ghost',
          message: 'Hello?',
          upToChapter: 1,
        }),
      });

      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({
        error: {
          code: 'NOT_FOUND',
          message: 'Character "unknown_ghost" not found',
        },
      });
    });

    it('refuses if character has not appeared yet at upToChapter', async () => {
      // Owl first appears in Chapter 3
      const res = await app.request('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: 'owl',
          message: 'Hello Wise Owl',
          upToChapter: 1,
        }),
      });

      expect(res.status).toBe(200);
      const data = (await res.json()) as ChatResponse;
      expect(data.refused).toBe(true);
      expect(data.factsUsed).toEqual([]);
      expect(data.reply).toContain('has not appeared yet at that point in the story');
    });
  });

  describe('POST /api/extract', () => {
    it('returns 404 FEATURE_DISABLED when extract feature is not enabled', async () => {
      const res = await app.request('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manuscriptText: 'Once upon a time...',
        }),
      });

      expect(res.status).toBe(404);
      const data = (await res.json()) as any;
      expect(data.error.code).toBe('FEATURE_DISABLED');
      expect(data.error.message).toContain('Fact extraction is disabled');
    });
  });
});
