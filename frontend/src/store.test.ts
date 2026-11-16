import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { app } from '../../backend/src/index';
import {
  selectEditedFactId,
  selectFlaggedFactIds,
  selectFlaggedLineIds,
  useStoryStore,
} from './store';

describe('Frontend Store Interactive Flow', () => {
  let server: ReturnType<typeof Bun.serve> | null = null;

  beforeAll(() => {
    try {
      server = Bun.serve({ port: 3001, fetch: app.fetch });
    } catch {
      // Port already in use by another test or process, which is fine
    }
  });

  afterAll(() => {
    server?.stop(true);
  });

  beforeEach(async () => {
    // Reset backend and store
    await useStoryStore.getState().init();
    await useStoryStore.getState().resetAll();
  });

  it('verifies the full editing, preview, apply, and reset flow', async () => {
    const store = useStoryStore.getState();
    await store.init();

    const state = useStoryStore.getState();
    expect(state.novel).not.toBeNull();
    expect(state.novel?.title).toBe('The Rabbit and the Turtle');

    // 1. Open Chapter 2
    store.setSelectedChapter(2);
    expect(useStoryStore.getState().selectedChapter).toBe(2);

    // Find f3 ("Rabbit has Sweet Apples")
    const ch2 = state.novel!.chapters.find((c) => c.number === 2)!;
    const f3Line = ch2.lines.find((l) => l.establishes.includes('f3'))!;
    expect(f3Line).toBeDefined();

    // 2. Set subject to Tortoise -> triggers previewEdit
    const report = await store.previewEdit('f3', { subject: 'tortoise' });
    expect(report).toBeDefined();
    expect(report!.noChange).toBe(false);

    // Verify preview state
    const previewState = useStoryStore.getState();
    expect(previewState.previewReport).not.toBeNull();

    // Chapters affected include chapters 2, 3, 4, 5
    expect(report!.summary.chaptersAffected).toContain(3);
    expect(report!.summary.chaptersAffected).toContain(4);
    expect(report!.summary.chaptersAffected).toContain(5);

    // Flagged lines
    const flaggedLines = selectFlaggedLineIds(previewState);
    expect(flaggedLines.size).toBeGreaterThanOrEqual(5);

    // Flagged facts
    const flaggedFacts = selectFlaggedFactIds(previewState);
    expect(flaggedFacts.has('f5')).toBe(true);
    expect(flaggedFacts.has('f6')).toBe(true);
    expect(flaggedFacts.has('f7')).toBe(true);
    expect(flaggedFacts.has('f8')).toBe(true);

    // Edited fact id is f3
    expect(selectEditedFactId(previewState)).toBe('f3');

    // Check dependency paths in flagged lines
    const ch3FlaggedLine = report!.impactedLines.find((l) => l.chapter === 3 && l.line.requires.includes('f5'));
    expect(ch3FlaggedLine).toBeDefined();
    expect(ch3FlaggedLine!.path).toEqual(['f3', 'f5']);

    // 3. Cancel clears previewReport and all flags
    store.cancelPreview();
    const canceledState = useStoryStore.getState();
    expect(canceledState.previewReport).toBeNull();
    expect(selectFlaggedLineIds(canceledState).size).toBe(0);

    // 4. Preview again and Apply change
    await store.previewEdit('f3', { subject: 'tortoise' });
    await store.applyEdit('f3', { subject: 'tortoise' });

    const appliedState = useStoryStore.getState();
    expect(appliedState.previewReport).toBeNull();
    expect(appliedState.activeReport).not.toBeNull();
    expect(appliedState.novel?.facts.find((f) => f.id === 'f3')?.subject).toBe('tortoise');

    // Persistent flags are active
    const activeFlaggedLines = selectFlaggedLineIds(appliedState);
    expect(activeFlaggedLines.size).toBeGreaterThan(0);

    // 5. Dismiss clears activeReport without reverting novel
    store.dismissActiveReport();
    const dismissedState = useStoryStore.getState();
    expect(dismissedState.activeReport).toBeNull();
    expect(dismissedState.novel?.facts.find((f) => f.id === 'f3')?.subject).toBe('tortoise');

    // 6. Reset restores original novel and clears all state
    await store.resetAll();
    const resetState = useStoryStore.getState();
    expect(resetState.activeReport).toBeNull();
    expect(resetState.previewReport).toBeNull();
    expect(resetState.novel?.facts.find((f) => f.id === 'f3')?.subject).toBe('hare');
  });

  it('synchronizes selectedChapter and sliderChapter via navigateToChapter and slider/chapter actions', async () => {
    const store = useStoryStore.getState();
    await store.init();

    // Navigate to chapter 3
    await store.navigateToChapter(3);
    let state = useStoryStore.getState();
    expect(state.selectedChapter).toBe(3);
    expect(state.sliderChapter).toBe(3);

    // Navigate to chapter 4 via setSlider
    await store.setSlider(4);
    state = useStoryStore.getState();
    expect(state.selectedChapter).toBe(4);
    expect(state.sliderChapter).toBe(4);

    // Navigate to chapter 1 via setSelectedChapter
    store.setSelectedChapter(1);
    state = useStoryStore.getState();
    expect(state.selectedChapter).toBe(1);
    expect(state.sliderChapter).toBe(1);
  });

  it('prevents spoiler leak on first load and novel switch: every node has firstChapter <= sliderChapter', async () => {
    const store = useStoryStore.getState();
    await store.init();
    let state = useStoryStore.getState();

    expect(state.graph).not.toBeNull();
    expect(state.graph.nodes.length).toBeGreaterThan(0);
    for (const node of state.graph.nodes) {
      expect(node.firstChapter).toBeLessThanOrEqual(state.sliderChapter);
    }

    await store.switchNovel(state.activeNovelId ?? 'the-great-woodland-race');
    state = useStoryStore.getState();

    expect(state.graph).not.toBeNull();
    expect(state.graph.nodes.length).toBeGreaterThan(0);
    for (const node of state.graph.nodes) {
      expect(node.firstChapter).toBeLessThanOrEqual(state.sliderChapter);
    }
  });
});
