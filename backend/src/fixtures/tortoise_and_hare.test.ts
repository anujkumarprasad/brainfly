import { describe, expect, it } from 'bun:test';
import { validateNovel } from '@bl/shared';
import { tortoiseAndHareNovel } from './tortoise_and_hare';

describe('tortoiseAndHareNovel fixture', () => {
  it('passes validateNovel with zero errors', () => {
    const errors = validateNovel(tortoiseAndHareNovel);
    expect(errors).toEqual([]);
  });

  it('contains exactly 5 chapters with 8 lines each', () => {
    expect(tortoiseAndHareNovel.chapters).toHaveLength(5);
    for (const chapter of tortoiseAndHareNovel.chapters) {
      expect(chapter.lines.length).toBeGreaterThanOrEqual(7);
      expect(chapter.lines.length).toBeLessThanOrEqual(9);
    }
  });

  it('has all 10 required facts established', () => {
    const established = new Set<string>();
    for (const chapter of tortoiseAndHareNovel.chapters) {
      for (const line of chapter.lines) {
        for (const fId of line.establishes) {
          established.add(fId);
        }
      }
    }
    for (const fact of tortoiseAndHareNovel.facts) {
      expect(established.has(fact.id)).toBe(true);
    }
  });

  it('satisfies forward-only DAG constraints', () => {
    for (const fact of tortoiseAndHareNovel.facts) {
      for (const depId of fact.dependsOn) {
        const depFact = tortoiseAndHareNovel.facts.find((f) => f.id === depId);
        expect(depFact).toBeDefined();
        expect(depFact!.chapter).toBeLessThanOrEqual(fact.chapter);
      }
    }
  });

  it('rejects a line requiring a fact established in a later chapter', () => {
    // Clone novel and mutate chapter 1 line 1 to require f8 (established in ch 4)
    const invalidNovel = JSON.parse(JSON.stringify(tortoiseAndHareNovel));
    invalidNovel.chapters[0].lines[0].requires.push('f8');

    const errors = validateNovel(invalidNovel);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e: string) => e.includes('requires fact "f8" established in later chapter 4'))).toBe(true);
  });

  it('rejects line requiring an unknown fact id', () => {
    const invalidNovel = JSON.parse(JSON.stringify(tortoiseAndHareNovel));
    invalidNovel.chapters[0].lines[0].requires.push('f999_nonexistent');

    const errors = validateNovel(invalidNovel);
    expect(errors.some((e: string) => e.includes('requires unknown fact: "f999_nonexistent"'))).toBe(true);
  });
});
