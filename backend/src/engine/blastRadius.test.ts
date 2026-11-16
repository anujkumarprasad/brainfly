import { describe, expect, it } from 'bun:test';
import { tortoiseAndHareNovel } from '../fixtures/tortoise_and_hare';
import { computeBlastRadius } from './blast/blastRadius';
import { TemplateExplainer } from './blast/explainer';
import { InMemoryGraphStore } from './graph/InMemoryGraphStore';

describe('computeBlastRadius', () => {
  it('editing f3 impacts downstream facts {f5, f6, f7, f8, f9, f10} with correct paths and line impacts', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const report = await computeBlastRadius(store, 'f3', { subject: 'tortoise' });

    expect(report.noChange).toBe(false);
    expect(report.editedFact.before.subject).toBe('hare');
    expect(report.editedFact.after.subject).toBe('tortoise');

    // Impacted facts: {f5, f6, f7, f8, f9, f10}
    const impactedFactIds = report.impactedFacts.map((f) => f.id);
    expect(impactedFactIds.sort()).toEqual(['f10', 'f5', 'f6', 'f7', 'f8', 'f9']);

    // Check paths
    const f5 = report.impactedFacts.find((f) => f.id === 'f5');
    const f6 = report.impactedFacts.find((f) => f.id === 'f6');
    const f7 = report.impactedFacts.find((f) => f.id === 'f7');
    const f8 = report.impactedFacts.find((f) => f.id === 'f8');

    expect(f5?.path).toEqual(['f3', 'f5']);
    expect(f6?.path).toEqual(['f3', 'f5', 'f6']);
    expect(f7?.path).toEqual(['f3', 'f5', 'f6', 'f7']);
    expect(f8?.path).toEqual(['f3', 'f5', 'f6', 'f7', 'f8']);

    // Impacted lines in downstream chapters
    const ch3Lines = report.impactedLines.filter((l) => l.chapter === 3);
    expect(ch3Lines.length).toBeGreaterThanOrEqual(1);

    const ch4Lines = report.impactedLines.filter((l) => l.chapter === 4);
    expect(ch4Lines.length).toBeGreaterThanOrEqual(1);

    const ch5Lines = report.impactedLines.filter((l) => l.chapter === 5);
    expect(ch5Lines.length).toBeGreaterThanOrEqual(1);

    // Affected facts set = { edited fact } ∪ impacted facts
    const affectedSet = new Set(['f3', ...impactedFactIds]);

    for (const line of report.impactedLines) {
      const hasIntersection = line.line.requires.some((r) => affectedSet.has(r));
      expect(hasIntersection).toBe(true);
      expect(line.brokenFactIds.length).toBeGreaterThan(0);
      for (const bId of line.brokenFactIds) {
        expect(affectedSet.has(bId)).toBe(true);
      }
    }

    // No line that establishes f3 is flagged (e.g. ch2-l2 establishes f3)
    const establishesF3Lines = report.impactedLines.filter((l) =>
      l.line.establishes.includes('f3')
    );
    expect(establishesF3Lines).toHaveLength(0);

    // Lines with empty requires are never flagged
    const emptyRequiresFlagged = report.impactedLines.filter(
      (l) => l.line.requires.length === 0
    );
    expect(emptyRequiresFlagged).toHaveLength(0);

    // Summary chaptersAffected: chapters 2, 3, 4, 5
    expect(report.summary.chaptersAffected).toEqual([2, 3, 4, 5]);
  });

  it('editing f4 impacts downstream facts {f9, f10}', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const report = await computeBlastRadius(store, 'f4', { object: 'apple_tree' });

    expect(report.noChange).toBe(false);
    const impactedFactIds = report.impactedFacts.map((f) => f.id);
    expect(impactedFactIds.sort()).toEqual(['f10', 'f9']);
  });

  it('editing f5 impacts exactly {f6, f7, f8, f9, f10}', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const report = await computeBlastRadius(store, 'f5', { subject: 'tortoise' });

    expect(report.noChange).toBe(false);
    const impactedFactIds = report.impactedFacts.map((f) => f.id);
    expect(impactedFactIds.sort()).toEqual(['f10', 'f6', 'f7', 'f8', 'f9']);
  });

  it('editing f10 impacts no downstream facts', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const reportF10 = await computeBlastRadius(store, 'f10', { subject: 'tortoise' });
    expect(reportF10.noChange).toBe(false);
    expect(reportF10.impactedFacts).toHaveLength(0);
  });

  it('a patch identical to current values gives noChange true with empty impacted lists', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const currentF3 = store.getFact('f3')!;

    const report = await computeBlastRadius(store, 'f3', {
      subject: currentF3.subject,
      predicate: currentF3.predicate,
      object: currentF3.object,
    });

    expect(report.noChange).toBe(true);
    expect(report.impactedFacts).toEqual([]);
    expect(report.impactedLines).toEqual([]);
    expect(report.summary.chaptersAffected).toEqual([]);
  });

  it('a patch modifying dependsOn is not reported as noChange', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const report = await computeBlastRadius(store, 'f3', {
      dependsOn: [],
    });
    expect(report.noChange).toBe(false);
  });

  it('note-only or status-only edits are metadata and do not trigger blast radius', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    // Note-only edit
    const noteReport = await computeBlastRadius(store, 'f3', {
      note: 'Updated investigator research note',
    });
    expect(noteReport.noChange).toBe(true);
    expect(noteReport.impactedFacts).toHaveLength(0);
    expect(noteReport.impactedLines).toHaveLength(0);
    expect(noteReport.summary.chaptersAffected).toHaveLength(0);

    // Status-only edit
    const statusReport = await computeBlastRadius(store, 'f3', {
      status: 'revealed',
    });
    expect(statusReport.noChange).toBe(true);
    expect(statusReport.impactedFacts).toHaveLength(0);
    expect(statusReport.impactedLines).toHaveLength(0);
  });

  it('computeBlastRadius does not mutate the store (compare snapshots)', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const snapshotBefore = structuredClone(store.getNovel());

    await computeBlastRadius(store, 'f3', { subject: 'tortoise' });
    await computeBlastRadius(store, 'f5', { predicate: 'HAS' });

    const snapshotAfter = structuredClone(store.getNovel());
    expect(snapshotAfter).toEqual(snapshotBefore);
  });

  it('explainer produces vivid, deterministic chain explanations', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const explainer = new TemplateExplainer();
    const report = await computeBlastRadius(store, 'f3', { subject: 'tortoise' }, explainer);

    // Check fact explanation
    const f8Impact = report.impactedFacts.find((f) => f.id === 'f8')!;
    expect(f8Impact.reason).toContain('depends on');
    expect(f8Impact.reason).toContain('which you changed to');
    expect(f8Impact.reason).toContain('Chain:');

    // Check line explanation
    const ch4LineWithChain = report.impactedLines.find(
      (l) => l.chapter === 4 && l.line.requires.includes('f7')
    )!;
    expect(ch4LineWithChain.reason).toContain('Chain:');
  });
});
