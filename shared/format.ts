import type { Entity, Fact, Novel, Predicate } from './schema';

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

export function factToText(
  fact: Fact,
  entitiesOrNovel: Entity[] | Novel
): string {
  const entities = Array.isArray(entitiesOrNovel)
    ? entitiesOrNovel
    : entitiesOrNovel.entities;
  const entityMap = new Map(entities.map((e) => [e.id, e.name]));
  const subjectName = entityMap.get(fact.subject) ?? fact.subject;
  const objectName = entityMap.get(fact.object) ?? fact.object;
  const predicateVerb = formatPredicate(fact.predicate);
  return `${subjectName} ${predicateVerb} ${objectName}`;
}
