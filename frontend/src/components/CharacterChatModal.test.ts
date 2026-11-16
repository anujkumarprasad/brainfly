import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { app } from '../../../backend/src/index';
import { useStoryStore } from '../store';

describe('CharacterChatModal and Character Chat Flow', () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  beforeAll(async () => {
    try {
      server = Bun.serve({ port: 3001, fetch: app.fetch });
    } catch {
      // server already running
    }
    await useStoryStore.getState().switchNovel('the-great-woodland-race');
  });

  afterAll(() => {
    server?.stop(true);
  });

  it('verifies Tortoise at chapter 2 refuses to acknowledge the golden trophy due to spoiler fence', async () => {
    const store = useStoryStore.getState();
    const res = await store.sendChatMessage('tortoise', 2, 'Do you have the golden trophy?');

    expect(res.character).toBe('tortoise');
    expect(res.fenceChapter).toBe(2);
    expect(res.refused).toBe(true);
    expect(res.factsUsed).toEqual([]);
    expect(res.reply).toContain("I don't know what you mean by that");

    const state = useStoryStore.getState();
    const messages = state.chatThreads['tortoise__ch2'] ?? [];
    const lastMsg = messages[messages.length - 1];
    expect(lastMsg.refused).toBe(true);
  });

  it('verifies Tortoise at chapter 4 gives a grounded answer claiming the golden trophy', async () => {
    const store = useStoryStore.getState();
    const res = await store.sendChatMessage('tortoise', 4, 'Do you have the golden trophy?');

    expect(res.character).toBe('tortoise');
    expect(res.fenceChapter).toBe(4);
    expect(res.refused).toBeFalsy();
    // f8 is established in Chapter 4 (Tortoise HAS golden_trophy)
    expect(res.factsUsed).toContain('f8');
    expect(res.reply).toContain('Golden Trophy');

    const state = useStoryStore.getState();
    const messages = state.chatThreads['tortoise__ch4'] ?? [];
    expect(messages.length).toBe(2);
    expect(messages[1].factsUsed).toContain('f8');
  });

  it('verifies Hare at chapter 1 introduces himself and his location', async () => {
    const store = useStoryStore.getState();
    const res = await store.sendChatMessage('hare', 1, 'Where are you?');

    expect(res.character).toBe('hare');
    expect(res.fenceChapter).toBe(1);
    expect(res.reply.startsWith('Rabbit:')).toBe(true);
    expect(res.reply).toContain('Start Meadow');
    expect(res.factsUsed).toContain('f1');
  });

  it('verifies switching the slider creates separate threads per (character, chapter)', async () => {
    const store = useStoryStore.getState();
    // Thread for Hare ch 1
    await store.sendChatMessage('hare', 1, 'Are you ready to run?');
    // Thread for Hare ch 2
    await store.sendChatMessage('hare', 2, 'Are you tired?');

    const state = useStoryStore.getState();
    const threadCh1 = state.chatThreads['hare__ch1'];
    const threadCh2 = state.chatThreads['hare__ch2'];

    expect(threadCh1).toBeDefined();
    expect(threadCh2).toBeDefined();

    // Verify isolation
    expect(threadCh1[0].text).toBe('Where are you?');
    expect(threadCh2[0].text).toBe('Are you tired?');
  });
});
