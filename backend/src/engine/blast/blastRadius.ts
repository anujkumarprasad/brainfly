import {
  NotFoundError,
  type BlastReport,
  type Fact,
  type ImpactedFact,
  type ImpactedLine,
} from '@bl/shared';
import type { GraphStore } from '../graph/GraphStore';
import { TemplateExplainer, type Explainer } from './explainer';

/**
 * Checks whether the causal fields of two facts are identical.
 * Causal fields are: chapter, subject, predicate, object, and dependsOn.
 * Note-only or status-only edits are metadata, not blast radius.
 */
function causalFieldsEqual(a: Fact, b: Fact): boolean {
  const depsEqual =
    a.dependsOn.length === b.dependsOn.length &&
    a.dependsOn.every((dep, i) => dep === b.dependsOn[i]);

  return (
    a.chapter === b.chapter &&
    a.subject === b.subject &&
    a.predicate === b.predicate &&
    a.object === b.object &&
    depsEqual
  );
}

/**
 * Pure function that computes the downstream blast radius of editing a fact.
 * Does NOT mutate the store.
 */
export async function computeBlastRadius(
  store: GraphStore,
  factId: string,
  patch: Partial<Fact>,
  explainer: Explainer = new TemplateExplainer()
): Promise<BlastReport> {
  const before = store.getFact(factId);
  if (!before) {
    throw new NotFoundError(`Fact with id "${factId}" not found`);
  }

  const after: Fact = { ...before, ...patch, id: factId };

  if (causalFieldsEqual(before, after)) {
    return {
      noChange: true,
      editedFact: { before, after },
      impactedFacts: [],
      impactedLines: [],
      summary: {
        chaptersAffected: [],
        impactedFactsCount: 0,
        impactedLinesCount: 0,
      },
    };
  }

  const novel = store.getNovel();

  // 1. Build reverse dependency map (factId -> facts that list it in dependsOn)
  const revDeps = new Map<string, string[]>();
  for (const fact of novel.facts) {
    for (const depId of fact.dependsOn) {
      const list = revDeps.get(depId) ?? [];
      list.push(fact.id);
      revDeps.set(depId, list);
    }
  }

  // 2. BFS from edited fact to find all transitively dependent facts and their shortest paths
  const paths = new Map<string, string[]>();
  paths.set(factId, [factId]);

  const queue: string[] = [factId];
  const visited = new Set<string>([factId]);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentPath = paths.get(currentId)!;
    const dependents = revDeps.get(currentId) ?? [];

    for (const depId of dependents) {
      if (!visited.has(depId)) {
        visited.add(depId);
        paths.set(depId, [...currentPath, depId]);
        queue.push(depId);
      }
    }
  }

  // 3. Collect impacted facts (excluding the edited fact itself)
  const impactedFacts: ImpactedFact[] = [];
  for (const id of visited) {
    if (id === factId) continue;
    const fact = store.getFact(id);
    if (fact) {
      const path = paths.get(id) ?? [factId, id];
      const reason = await explainer.explainFact({
        before,
        after,
        fact,
        path,
        novel,
      });
      impactedFacts.push({
        id: fact.id,
        fact,
        chapter: fact.chapter,
        path,
        reason,
      });
    }
  }

  impactedFacts.sort((a, b) => {
    if (a.chapter !== b.chapter) {
      return a.chapter - b.chapter;
    }
    return a.id.localeCompare(b.id);
  });

  // 4. Collect impacted lines
  // Every line whose `requires` intersects {edited fact} ∪ impacted facts,
  // EXCEPT lines that `establish` the edited fact.
  const affectedFactIds = new Set<string>([factId, ...impactedFacts.map((f) => f.id)]);
  const impactedLines: ImpactedLine[] = [];

  for (const chapter of novel.chapters) {
    for (const line of chapter.lines) {
      if (line.establishes.includes(factId)) {
        continue;
      }

      const brokenFactIds = line.requires.filter((reqId) => affectedFactIds.has(reqId));
      if (brokenFactIds.length === 0) {
        continue;
      }

      // Use the shortest path to the first broken fact
      let chosenFactId = brokenFactIds[0];
      let shortestPath = paths.get(chosenFactId) ?? [chosenFactId];

      for (let i = 1; i < brokenFactIds.length; i++) {
        const bId = brokenFactIds[i];
        const candidatePath = paths.get(bId) ?? [bId];
        if (candidatePath.length < shortestPath.length) {
          shortestPath = candidatePath;
          chosenFactId = bId;
        }
      }

      const reason = await explainer.explainLine({
        before,
        after,
        line,
        brokenFactIds,
        path: shortestPath,
        novel,
      });

      impactedLines.push({
        id: line.id,
        line,
        chapter: line.chapter,
        brokenFactIds,
        path: shortestPath,
        reason,
      });
    }
  }

  impactedLines.sort((a, b) => {
    if (a.chapter !== b.chapter) {
      return a.chapter - b.chapter;
    }
    return a.id.localeCompare(b.id);
  });

  // 5. Summary
  const chaptersSet = new Set<number>();
  for (const f of impactedFacts) {
    chaptersSet.add(f.chapter);
  }
  for (const l of impactedLines) {
    chaptersSet.add(l.chapter);
  }
  const chaptersAffected = Array.from(chaptersSet).sort((a, b) => a - b);

  return {
    noChange: false,
    editedFact: { before, after },
    impactedFacts,
    impactedLines,
    summary: {
      chaptersAffected,
      impactedFactsCount: impactedFacts.length,
      impactedLinesCount: impactedLines.length,
    },
  };
}
