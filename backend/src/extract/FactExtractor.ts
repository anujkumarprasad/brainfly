import type { Fact, Line } from '@bl/shared';

export interface FactExtractor {
  extract(manuscriptText: string): Promise<{ facts: Fact[]; lines: Line[] }>;
}

// Seam for the finale: LLM-based manuscript-to-facts extraction.
export class StubFactExtractor implements FactExtractor {
  async extract(_manuscriptText: string): Promise<{ facts: Fact[]; lines: Line[] }> {
    return { facts: [], lines: [] };
  }
}
