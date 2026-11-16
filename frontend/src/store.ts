import { create } from 'zustand';
import type { BlastReport, ChatResponse, Fact, FactPatch, GraphData, Novel } from '@bl/shared';
import { api, type NovelSummary } from './api';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'character';
  text: string;
  timestamp: number;
  factsUsed?: string[];
  refused?: boolean;
  source?: 'rules' | 'llm';
}

export interface StoryState {
  novel: Novel | null;
  graph: GraphData | null;
  availableNovels: NovelSummary[];
  activeNovelId: string;
  selectedChapter: number;
  sliderChapter: number;
  previewReport: BlastReport | null;
  activeReport: BlastReport | null;
  editingFact: Fact | null;
  editingFactPatch: FactPatch | null;
  highlightedLineId: string | null;
  expandedWhyLineId: string | null;
  activeChatCharacter: string | null;
  toastMessage: string | null;
  chatThreads: Record<string, ChatMessage[]>;
  isDemoActive: boolean;
  demoStep: number;
  isHelpOpen: boolean;
  loading: boolean;
  error: string | null;

  // Actions
  init: (preferredNovelId?: string) => Promise<void>;
  switchNovel: (novelId: string) => Promise<void>;
  navigateToChapter: (chapter: number) => Promise<void>;
  setSelectedChapter: (chapter: number) => void;
  setSlider: (chapter: number) => Promise<void>;
  previewEdit: (factId: string, patch: FactPatch) => Promise<BlastReport | undefined>;
  cancelPreview: () => void;
  applyEdit: (factId?: string, patch?: FactPatch) => Promise<void>;
  resetAll: () => Promise<void>;
  dismissActiveReport: () => void;
  setEditingFact: (fact: Fact | null, patch?: FactPatch | null) => void;
  setHighlightedLineId: (lineId: string | null) => void;
  setExpandedWhyLineId: (lineId: string | null) => void;
  openChat: (characterId: string) => void;
  closeChat: () => void;
  setToastMessage: (msg: string | null) => void;
  sendChatMessage: (character: string, upToChapter: number, message: string) => Promise<ChatResponse>;
  clearChatThread: (character: string, upToChapter: number) => void;
  startDemo: () => void;
  setDemoStep: (step: number) => void;
  exitDemo: () => Promise<void>;
  setIsHelpOpen: (open: boolean) => void;
}

let previewRequestId = 0;
let sliderRequestId = 0;

export const useStoryStore = create<StoryState>((set, get) => ({
  novel: null,
  graph: null,
  availableNovels: [],
  activeNovelId: 'the-great-woodland-race',
  selectedChapter: 1,
  sliderChapter: 1,
  previewReport: null,
  activeReport: null,
  editingFact: null,
  editingFactPatch: null,
  highlightedLineId: null,
  expandedWhyLineId: null,
  activeChatCharacter: null,
  toastMessage: null,
  chatThreads: {},
  isDemoActive: false,
  demoStep: 1,
  isHelpOpen: false,
  loading: true,
  error: null,

  init: async (preferredNovelId?: string) => {
    set({ loading: true, error: null });
    try {
      let availableNovels: NovelSummary[] = [];
      try {
        availableNovels = await api.getNovels();
      } catch {
        // backend might not be ready or network issue
      }

      const targetId = preferredNovelId;

      let novel: Novel;
      let graph: GraphData;

      // Fetch active novel read-only
      novel = await api.getNovel();

      if (targetId && novel.id !== targetId) {
        try {
          const switched = await api.switchNovel(targetId);
          novel = switched.novel;
          const firstChapter = novel.chapters[0]?.number ?? 1;
          graph = await api.getGraph(firstChapter);
        } catch {
          // If switching is disabled (e.g. read-only production mode), use current novel
          const firstChapter = novel.chapters[0]?.number ?? 1;
          graph = await api.getGraph(firstChapter);
        }
      } else {
        const firstChapter = novel.chapters[0]?.number ?? 1;
        graph = await api.getGraph(firstChapter);
      }

      const firstChapter = novel.chapters[0]?.number ?? 1;

      set({
        availableNovels,
        activeNovelId: novel.id,
        novel,
        graph,
        selectedChapter: novel.chapters[0]?.number ?? 1,
        sliderChapter: firstChapter,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to connect to backend',
      });
    }
  },

  switchNovel: async (novelId: string) => {
    set({ loading: true, error: null });
    try {
      const switched = await api.switchNovel(novelId);
      const firstChapter = switched.novel.chapters[0]?.number ?? 1;
      const graph = await api.getGraph(firstChapter);

      set({
        novel: switched.novel,
        graph,
        activeNovelId: switched.novel.id,
        selectedChapter: switched.novel.chapters[0]?.number ?? 1,
        sliderChapter: firstChapter,
        previewReport: null,
        activeReport: null,
        editingFact: null,
        editingFactPatch: null,
        highlightedLineId: null,
        expandedWhyLineId: null,
        activeChatCharacter: null,
        toastMessage: null,
        chatThreads: {},
        isDemoActive: false,
        demoStep: 1,
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : `Failed to switch to novel ${novelId}`,
      });
    }
  },

  navigateToChapter: async (chapter: number) => {
    const reqId = ++sliderRequestId;
    set({ selectedChapter: chapter, sliderChapter: chapter });
    try {
      const graph = await api.getGraph(chapter);
      if (reqId === sliderRequestId) {
        set({ graph });
      }
    } catch (err) {
      if (reqId === sliderRequestId) {
        set({ error: err instanceof Error ? err.message : 'Failed to update graph' });
      }
    }
  },

  setSelectedChapter: (chapter: number) => {
    void get().navigateToChapter(chapter);
  },

  setSlider: async (chapter: number) => {
    await get().navigateToChapter(chapter);
  },

  previewEdit: async (factId: string, patch: FactPatch) => {
    const reqId = ++previewRequestId;
    try {
      const report = await api.blastRadius(factId, patch);
      if (reqId === previewRequestId) {
        set({ previewReport: report });
      }
      return report;
    } catch (err) {
      if (reqId === previewRequestId) {
        set({ error: err instanceof Error ? err.message : 'Failed to compute blast radius' });
      }
      return undefined;
    }
  },

  cancelPreview: () => {
    previewRequestId++;
    set({ previewReport: null, editingFact: null, editingFactPatch: null });
  },

  applyEdit: async (factId?: string, patch?: FactPatch) => {
    if (get().loading) return;
    previewRequestId++;

    const state = get();
    let targetFactId = factId;
    let targetPatch = patch;

    if (!targetFactId || !targetPatch) {
      if (state.previewReport) {
        targetFactId = state.previewReport.editedFact.before.id;
        const { id: _ignoredId, ...patchFields } = state.previewReport.editedFact.after;
        targetPatch = patchFields;
      }
    }

    if (!targetFactId || !targetPatch) {
      return;
    }

    set({ loading: true, error: null });
    try {
      const res = await api.editFact(targetFactId, targetPatch);
      const graph = await api.getGraph(get().sliderChapter);
      set({
        novel: res.novel,
        activeReport: res.report,
        previewReport: null,
        editingFact: null,
        graph,
        loading: false,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to apply edit',
      });
    }
  },

  resetAll: async () => {
    set({ loading: true, error: null });
    try {
      const res = await api.reset(get().activeNovelId);
      const demoStillActive = get().isDemoActive;
      const firstChapter = res.novel.chapters[0]?.number ?? 1;
      const targetChapter = demoStillActive ? firstChapter : (get().sliderChapter || firstChapter);
      const graph = await api.getGraph(targetChapter);
      set({
        novel: res.novel,
        activeNovelId: res.novel.id,
        graph,
        selectedChapter: targetChapter,
        sliderChapter: targetChapter,
        previewReport: null,
        activeReport: null,
        editingFact: null,
        editingFactPatch: null,
        highlightedLineId: null,
        expandedWhyLineId: null,
        activeChatCharacter: null,
        toastMessage: null,
        chatThreads: {},
        isDemoActive: demoStillActive,
        ...(demoStillActive ? {} : { demoStep: 1 }),
        loading: false,
        error: null,
      });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : 'Failed to reset novel',
      });
    }
  },

  dismissActiveReport: () => {
    set({ activeReport: null });
  },

  setEditingFact: (fact: Fact | null, patch?: FactPatch | null) => {
    set({ editingFact: fact, editingFactPatch: patch ?? null });
  },

  setHighlightedLineId: (lineId: string | null) => {
    set({ highlightedLineId: lineId });
  },

  setExpandedWhyLineId: (lineId: string | null) => {
    set({ expandedWhyLineId: lineId });
  },

  openChat: (characterId: string) => {
    set({
      activeChatCharacter: characterId,
      toastMessage: null,
    });
  },

  closeChat: () => {
    set({ activeChatCharacter: null });
  },

  setToastMessage: (msg: string | null) => {
    set({ toastMessage: msg });
  },

  startDemo: () => {
    set({ isDemoActive: true, demoStep: 1, error: null });
  },

  setDemoStep: (step: number) => {
    set({ demoStep: step });
  },

  exitDemo: async () => {
    set({ isDemoActive: false, demoStep: 1, expandedWhyLineId: null, editingFactPatch: null });
    await get().resetAll();
  },

  setIsHelpOpen: (open: boolean) => {
    set({ isHelpOpen: open });
  },

  sendChatMessage: async (character: string, upToChapter: number, message: string) => {
    const threadKey = `${character}__ch${upToChapter}`;
    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u-${Math.random().toString(36).slice(2, 6)}`,
      sender: 'user',
      text: message,
      timestamp: Date.now(),
    };

    const currentThreads = get().chatThreads;
    const prevMessages = currentThreads[threadKey] ?? [];

    set({
      chatThreads: {
        ...currentThreads,
        [threadKey]: [...prevMessages, userMsg],
      },
    });

    try {
      const res = await api.chat({
        character,
        upToChapter,
        message,
      });

      const charMsg: ChatMessage = {
        id: `msg-${Date.now()}-c-${Math.random().toString(36).slice(2, 6)}`,
        sender: 'character',
        text: res.reply,
        timestamp: Date.now(),
        factsUsed: res.factsUsed,
        refused: res.refused,
        source: res.source,
      };

      set({
        chatThreads: {
          ...get().chatThreads,
          [threadKey]: [...(get().chatThreads[threadKey] ?? []), charMsg],
        },
      });

      return res;
    } catch (err) {
      throw err;
    }
  },

  clearChatThread: (character: string, upToChapter: number) => {
    const threadKey = `${character}__ch${upToChapter}`;
    const { [threadKey]: _, ...rest } = get().chatThreads;
    set({ chatThreads: rest });
  },
}));

// Derived selectors
export const selectFlaggedLineIds = (state: StoryState): Map<string, string> => {
  const report = state.previewReport ?? state.activeReport;
  const map = new Map<string, string>();
  if (report) {
    for (const item of report.impactedLines) {
      map.set(item.id, item.reason);
    }
  }
  return map;
};

export const selectFlaggedFactIds = (state: StoryState): Map<string, string> => {
  const report = state.previewReport ?? state.activeReport;
  const map = new Map<string, string>();
  if (report) {
    for (const item of report.impactedFacts) {
      map.set(item.id, item.reason);
    }
  }
  return map;
};

export const selectEditedFactId = (state: StoryState): string | null => {
  const report = state.previewReport ?? state.activeReport;
  return report?.editedFact.before.id ?? null;
};
