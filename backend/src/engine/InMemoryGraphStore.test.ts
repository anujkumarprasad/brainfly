import { describe, expect, it } from 'bun:test';
import { NotFoundError } from '@bl/shared';
import { tortoiseAndHareNovel } from '../fixtures/tortoise_and_hare';
import { InMemoryGraphStore } from './graph/InMemoryGraphStore';

describe('InMemoryGraphStore', () => {
  it('computes entityFirstChapter matching fixture rules', () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    expect(store.entityFirstChapter('hare')).toBe(1);
    expect(store.entityFirstChapter('tortoise')).toBe(1);
    expect(store.entityFirstChapter('fox')).toBe(1);
    expect(store.entityFirstChapter('meadow')).toBe(1);

    expect(store.entityFirstChapter('sweet_apples')).toBe(2);
    expect(store.entityFirstChapter('apple_tree')).toBe(2);
    expect(store.entityFirstChapter('hare_nap')).toBe(2);

    expect(store.entityFirstChapter('owl')).toBe(3);

    expect(store.entityFirstChapter('finish_line')).toBe(1);
    expect(store.entityFirstChapter('golden_trophy')).toBe(4);

    expect(store.entityFirstChapter('non_existent_entity')).toBe(Infinity);
  });

  it('correctly filters graphUpTo according to chapter fence', () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    // graphUpTo(1) contains hare and tortoise at meadow
    const g1 = store.graphUpTo(1);
    expect(g1.nodes.some((n) => n.id === 'golden_trophy')).toBe(false);
    expect(g1.nodes.some((n) => n.id === 'sweet_apples')).toBe(false);
    expect(g1.nodes.some((n) => n.id === 'hare')).toBe(true);
    expect(g1.nodes.some((n) => n.id === 'tortoise')).toBe(true);
    expect(g1.edges).toHaveLength(2); // f1, f2

    // graphUpTo(2) includes sweet_apples and hare_nap, but no golden_trophy
    const g2 = store.graphUpTo(2);
    expect(g2.nodes.some((n) => n.id === 'sweet_apples')).toBe(true);
    expect(g2.nodes.some((n) => n.id === 'golden_trophy')).toBe(false);
    expect(g2.edges).toHaveLength(5); // f1, f2, f3, f4, f5

    // graphUpTo(5) includes all nodes and facts
    const g5 = store.graphUpTo(5);
    expect(g5.nodes.some((n) => n.id === 'golden_trophy')).toBe(true);
    expect(g5.edges).toHaveLength(10);
  });

  it('applyEdit mutates fact and graph consistently, and reset restores original state', () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    const originalF3 = store.getFact('f3');
    expect(originalF3?.subject).toBe('hare');

    // Mutate f3: tortoise found sweet apples
    const updated = store.applyEdit('f3', { subject: 'tortoise' });
    expect(updated.subject).toBe('tortoise');
    expect(store.getFact('f3')?.subject).toBe('tortoise');

    // Graph edge reflects updated subject
    const graph = store.getGraph();
    expect(graph.hasEdge('f3')).toBe(true);
    expect(graph.source('f3')).toBe('tortoise');
    expect(graph.target('f3')).toBe('sweet_apples');

    // Reset restores the fixture state
    store.reset();
    expect(store.getFact('f3')?.subject).toBe('hare');
    expect(store.getGraph().source('f3')).toBe('hare');
  });

  it('throws NotFoundError when editing a non-existent fact', () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    expect(() => {
      store.applyEdit('non_existent', { subject: 'tortoise' });
    }).toThrow(NotFoundError);
  });
});
