import type { Fact, GraphData, Novel } from '@bl/shared';

export interface GraphStore {
  getNovel(): Novel;
  getFact(id: string): Fact | undefined;
  factsUpTo(chapter: number): Fact[];
  graphUpTo(chapter: number): GraphData;
  entityFirstChapter(entityId: string): number;
  applyEdit(factId: string, patch: Partial<Fact>): Fact;
  reset(): void;
}
