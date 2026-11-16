import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { app } from '../../../backend/src/index';
import { useStoryStore } from '../store';

describe('GuidedDemo Flow and UI Polish', () => {
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

  it('runs the full guided demo end to end twice in a row without reload', async () => {
    const store = useStoryStore.getState();

    for (let run = 1; run <= 2; run++) {
      // Start demo
      store.startDemo();
      expect(useStoryStore.getState().isDemoActive).toBe(true);
      expect(useStoryStore.getState().demoStep).toBe(1);

      // Step 1: Meet the story
      await store.navigateToChapter(1);
      expect(useStoryStore.getState().selectedChapter).toBe(1);
      expect(useStoryStore.getState().sliderChapter).toBe(1);

      // Step 2: The memory graph
      store.setDemoStep(2);
      expect(useStoryStore.getState().demoStep).toBe(2);

      // Step 3: Change the past
      store.setDemoStep(3);
      await store.navigateToChapter(2);
      const f3 = store.novel!.facts.find((f) => f.id === 'f3')!;
      store.setEditingFact(f3, { subject: 'tortoise' });
      expect(useStoryStore.getState().selectedChapter).toBe(2);
      expect(useStoryStore.getState().sliderChapter).toBe(2);
      expect(useStoryStore.getState().editingFact?.id).toBe('f3');
      expect(useStoryStore.getState().editingFactPatch?.subject).toBe('tortoise');

      // Step 4: Blast radius
      store.setDemoStep(4);
      store.setEditingFact(null);
      await store.previewEdit('f3', { subject: 'tortoise' });
      await store.navigateToChapter(4);
      expect(useStoryStore.getState().selectedChapter).toBe(4);
      expect(useStoryStore.getState().sliderChapter).toBe(4);
      const ch4 = store.novel!.chapters.find((c) => c.number === 4)!;
      const flaggedLine = ch4.lines.find((l) =>
        l.requires.some((r) => r === 'f6' || r === 'f7' || r === 'f8')
      )!;
      store.setHighlightedLineId(flaggedLine.id);
      store.setExpandedWhyLineId(flaggedLine.id);

      let state = useStoryStore.getState();
      expect(state.previewReport).not.toBeNull();
      expect(state.previewReport?.impactedFacts.length).toBeGreaterThan(0);
      expect(state.highlightedLineId).toBe(flaggedLine.id);
      expect(state.expandedWhyLineId).toBe(flaggedLine.id);

      // Step 5: Commit and inspect
      store.setDemoStep(5);
      await store.applyEdit('f3', { subject: 'tortoise' });
      state = useStoryStore.getState();
      expect(state.activeReport).not.toBeNull();
      expect(state.previewReport).toBeNull();

      // Step 6: Spoiler-safe chat
      store.setDemoStep(6);
      store.openChat('tortoise');
      const chatRes = await store.sendChatMessage('tortoise', 2, 'Did you win the golden trophy?');
      expect(chatRes.refused).toBe(true);
      expect(useStoryStore.getState().activeChatCharacter).toBe('tortoise');

      // Step 7: What's next
      store.setDemoStep(7);
      store.closeChat();
      expect(useStoryStore.getState().activeChatCharacter).toBeNull();
      expect(useStoryStore.getState().demoStep).toBe(7);

      // Exit demo
      await store.exitDemo();
      state = useStoryStore.getState();
      expect(state.isDemoActive).toBe(false);
      expect(state.activeReport).toBeNull();
      expect(state.previewReport).toBeNull();
      expect(state.editingFact).toBeNull();
      expect(state.activeChatCharacter).toBeNull();
    }
  });

  it('supports Next and Back freely across steps', async () => {
    const store = useStoryStore.getState();
    store.startDemo();

    store.setDemoStep(2);
    expect(useStoryStore.getState().demoStep).toBe(2);

    store.setDemoStep(3);
    expect(useStoryStore.getState().demoStep).toBe(3);

    // Go back to 2
    store.setDemoStep(2);
    expect(useStoryStore.getState().demoStep).toBe(2);

    // Go back to 1
    store.setDemoStep(1);
    expect(useStoryStore.getState().demoStep).toBe(1);

    store.exitDemo();
  });

  it('toggles Help Sheet via action', () => {
    const store = useStoryStore.getState();
    expect(store.isHelpOpen).toBe(false);

    store.setIsHelpOpen(true);
    expect(useStoryStore.getState().isHelpOpen).toBe(true);

    store.setIsHelpOpen(false);
    expect(useStoryStore.getState().isHelpOpen).toBe(false);
  });
});
