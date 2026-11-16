import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { app } from '../../backend/src/index';
import {
  selectEditedFactId,
  selectFlaggedFactIds,
  selectFlaggedLineIds,
  useStoryStore,
} from './store';

describe('The Rabbit and the Turtle Flow', () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  beforeAll(() => {
    try {
      server = Bun.serve({ port: 3001, fetch: app.fetch });
    } catch {
      // Port already in use by another test or process
    }
  });

  afterAll(async () => {
    server?.stop(true);
  });

  beforeEach(async () => {
    await useStoryStore.getState().switchNovel('the-great-woodland-race');
  });

  it('loads The Rabbit and the Turtle and features Rabbit, Turtle, Fox, and Owl', async () => {
    const state = useStoryStore.getState();
    expect(state.novel?.id).toBe('the-great-woodland-race');
    expect(state.novel?.title).toBe('The Rabbit and the Turtle');
    expect(state.novel?.author).toBe('Aesop');
    expect(state.novel?.entities.map((e) => e.id)).toContain('hare');
    expect(state.novel?.entities.map((e) => e.id)).toContain('tortoise');
    expect(state.novel?.entities.map((e) => e.id)).toContain('fox');
    expect(state.novel?.entities.map((e) => e.id)).toContain('owl');
  });

  it('grows graph over chapters 1..5', async () => {
    const store = useStoryStore.getState();

    // Chapter 1: Rabbit & Turtle at meadow
    await store.setSlider(1);
    let graph = useStoryStore.getState().graph!;
    expect(graph.nodes.some((n) => n.id === 'hare')).toBe(true);
    expect(graph.nodes.some((n) => n.id === 'tortoise')).toBe(true);
    expect(graph.nodes.some((n) => n.id === 'golden_trophy')).toBe(false);

    // Chapter 4: Finish line & trophy appear
    await store.setSlider(4);
    graph = useStoryStore.getState().graph!;
    expect(graph.nodes.some((n) => n.id === 'golden_trophy')).toBe(true);
  });

  it('triggers blast radius when changing who found sweet apples in Chapter 2', async () => {
    const store = useStoryStore.getState();

    // Preview changing f3 from hare to tortoise
    const report = await store.previewEdit('f3', { subject: 'tortoise' });
    expect(report).toBeDefined();
    expect(report!.noChange).toBe(false);

    // Blast radius includes downstream chapters
    expect(report!.summary.chaptersAffected).toContain(3);
    expect(report!.summary.chaptersAffected).toContain(4);
    expect(report!.summary.chaptersAffected).toContain(5);

    const state = useStoryStore.getState();
    const flaggedFacts = selectFlaggedFactIds(state);
    // f5 (hare nap), f6 (tortoise crawls past), f7, f8, f9, f10
    expect(flaggedFacts.has('f5')).toBe(true);
    expect(flaggedFacts.has('f6')).toBe(true);
    expect(flaggedFacts.has('f8')).toBe(true);
    expect(selectEditedFactId(state)).toBe('f3');
  });

  it('verifies spoiler fence refusal for Turtle about the golden trophy at Chapter 2', async () => {
    const store = useStoryStore.getState();

    // At chapter 2, golden trophy is unknown
    const res = await store.sendChatMessage('tortoise', 2, 'Did you win the golden trophy?');
    expect(res.refused).toBe(true);
    expect(res.factsUsed).toHaveLength(0);

    // At chapter 4, golden trophy is won
    const res4 = await store.sendChatMessage('tortoise', 4, 'Did you win the golden trophy?');
    expect(res4.refused).toBeFalsy();
    expect(res4.factsUsed).toContain('f8');
  });
});
