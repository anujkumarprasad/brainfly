import type { Fact, Line, Novel, Predicate } from '@bl/shared';

export interface FactExplanationContext {
  before: Fact;
  after: Fact;
  fact: Fact;
  path: string[];
  novel: Novel;
}

export interface LineExplanationContext {
  before: Fact;
  after: Fact;
  line: Line;
  brokenFactIds: string[];
  path: string[];
  novel: Novel;
}

/**
 * An interface for generating human-readable explanations of blast radius impacts.
 * An LLM-backed explainer will implement this later.
 */
export interface Explainer {
  explainLine(ctx: LineExplanationContext): Promise<string>;
  explainFact(ctx: FactExplanationContext): Promise<string>;
}

export function formatPredicate(predicate: Predicate): string {
  switch (predicate) {
    case 'HAS':
      return 'has';
    case 'OPENED':
      return 'opened';
    case 'KNOWS':
      return 'knows';
    case 'LOCATED_AT':
      return 'located at';
  }
}

export function formatFact(fact: Fact, novel: Novel): string {
  const entityMap = new Map(novel.entities.map((e) => [e.id, e.name]));
  const subjectName = entityMap.get(fact.subject) ?? fact.subject;
  const objectName = entityMap.get(fact.object) ?? fact.object;
  const predicateVerb = formatPredicate(fact.predicate);
  return `${subjectName} ${predicateVerb} ${objectName}`;
}

export class TemplateExplainer implements Explainer {
  async explainLine(ctx: LineExplanationContext): Promise<string> {
    const factsMap = new Map(ctx.novel.facts.map((f) => [f.id, f]));
    const beforeDesc = formatFact(ctx.before, ctx.novel);
    const afterDesc = formatFact(ctx.after, ctx.novel);

    if (ctx.path.length <= 1) {
      return `Chapter ${ctx.line.chapter} line depends on "${beforeDesc}" (set in Chapter ${ctx.before.chapter}), which you changed to "${afterDesc}".`;
    }

    const chain = ctx.path
      .map((factId) => {
        const f = factsMap.get(factId);
        return f ? formatFact(f, ctx.novel) : factId;
      })
      .join(' -> ');

    return `Chapter ${ctx.line.chapter} line depends on "${beforeDesc}" (set in Chapter ${ctx.before.chapter}), which you changed to "${afterDesc}". Chain: ${chain}.`;
  }

  async explainFact(ctx: FactExplanationContext): Promise<string> {
    const factsMap = new Map(ctx.novel.facts.map((f) => [f.id, f]));
    const beforeDesc = formatFact(ctx.before, ctx.novel);
    const afterDesc = formatFact(ctx.after, ctx.novel);
    const factDesc = formatFact(ctx.fact, ctx.novel);

    const chain = ctx.path
      .map((factId) => {
        const f = factsMap.get(factId);
        return f ? formatFact(f, ctx.novel) : factId;
      })
      .join(' -> ');

    return `Chapter ${ctx.fact.chapter} fact "${factDesc}" depends on "${beforeDesc}" (set in Chapter ${ctx.before.chapter}), which you changed to "${afterDesc}". Chain: ${chain}.`;
  }
}
