import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { app } from '../../../backend/src/index';
import {
  selectEditedFactId,
  selectFlaggedFactIds,
  useStoryStore,
} from '../store';

describe('GraphPane and ChapterSlider Integration', () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  beforeAll(async () => {
    try {
      server = Bun.serve({ port: 3001, fetch: app.fetch });
    } catch {
      // already open
    }
    await useStoryStore.getState().switchNovel('the-great-woodland-race');
  });

  afterAll(() => {
    server?.stop(true);
  });

  it('verifies that slider chapter 1..5 grows the graph with expected entities and facts', async () => {
    const store = useStoryStore.getState();

    // 1. Chapter 1: hare, tortoise, fox, meadow, finish_line
    await store.setSlider(1);
    let state = useStoryStore.getState();
    expect(state.graph).not.toBeNull();
    let nodeIds = state.graph!.nodes.map((n) => n.id);
    expect(nodeIds).toContain('hare');
    expect(nodeIds).toContain('tortoise');
    expect(nodeIds).toContain('fox');
    expect(nodeIds).toContain('meadow');
    expect(nodeIds).not.toContain('sweet_apples');
    expect(nodeIds).not.toContain('apple_tree');
    expect(nodeIds).not.toContain('hare_nap');
    expect(nodeIds).not.toContain('owl');
    expect(nodeIds).not.toContain('golden_trophy');

    // 2. Chapter 2: sweet_apples, apple_tree, hare_nap appear
    await store.setSlider(2);
    state = useStoryStore.getState();
    nodeIds = state.graph!.nodes.map((n) => n.id);
    expect(nodeIds).toContain('sweet_apples');
    expect(nodeIds).toContain('apple_tree');
    expect(nodeIds).toContain('hare_nap');
    expect(nodeIds).not.toContain('owl');
    expect(nodeIds).not.toContain('golden_trophy');

    // 3. Chapter 3: owl appears
    await store.setSlider(3);
    state = useStoryStore.getState();
    nodeIds = state.graph!.nodes.map((n) => n.id);
    expect(nodeIds).toContain('owl');
    expect(nodeIds).not.toContain('golden_trophy');

    // 4. Chapter 4: golden_trophy appears
    await store.setSlider(4);
    state = useStoryStore.getState();
    nodeIds = state.graph!.nodes.map((n) => n.id);
    expect(nodeIds).toContain('golden_trophy');

    // 5. Chapter 5: full graph
    await store.setSlider(5);
    state = useStoryStore.getState();
    nodeIds = state.graph!.nodes.map((n) => n.id);
    expect(nodeIds).toContain('golden_trophy');
    expect(state.graph!.edges.length).toBe(10);
  });

  it('verifies link highlighting selectors during fact edit preview and application', async () => {
    const store = useStoryStore.getState();
    await store.setSlider(5);

    // Edit f3 ("Rabbit has Sweet Apples") to Turtle
    await store.previewEdit('f3', { subject: 'tortoise' });

    let state = useStoryStore.getState();
    const flaggedFacts = selectFlaggedFactIds(state);
    const editedFact = selectEditedFactId(state);

    expect(editedFact).toBe('f3');
    // Impacted downstream facts from f3: f5, f6, f7, f8, f9, f10
    expect(flaggedFacts.has('f5')).toBe(true);
    expect(flaggedFacts.has('f6')).toBe(true);
    expect(flaggedFacts.has('f7')).toBe(true);
    expect(flaggedFacts.has('f8')).toBe(true);
    expect(flaggedFacts.has('f9')).toBe(true);
    expect(flaggedFacts.has('f10')).toBe(true);

    // Cancel preview
    store.cancelPreview();
    state = useStoryStore.getState();
    expect(selectEditedFactId(state)).toBeNull();
    expect(selectFlaggedFactIds(state).size).toBe(0);
  });

  it('verifies character click triggers openChat and opens the character chat', () => {
    const store = useStoryStore.getState();
    expect(store.activeChatCharacter).toBeNull();

    store.openChat('hare');
    let state = useStoryStore.getState();
    expect(state.activeChatCharacter).toBe('hare');

    store.closeChat();
    state = useStoryStore.getState();
    expect(state.activeChatCharacter).toBeNull();
  });
});
