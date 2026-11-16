import { NovelSchema, type Fact, type Novel } from './schema';

export function validateNovel(novel: Novel): string[] {
  const parseResult = NovelSchema.safeParse(novel);
  if (!parseResult.success) {
    return parseResult.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );
  }

  const errors: string[] = [];

  // 1. Entity uniqueness
  const entityIds = new Set<string>();
  for (const entity of novel.entities) {
    if (entityIds.has(entity.id)) {
      errors.push(`Duplicate entity id: "${entity.id}"`);
    }
    entityIds.add(entity.id);
  }

  // 2. Fact uniqueness & mapping
  const factMap = new Map<string, Fact>();
  for (const fact of novel.facts) {
    if (factMap.has(fact.id)) {
      errors.push(`Duplicate fact id: "${fact.id}"`);
    }
    factMap.set(fact.id, fact);
  }

  // 3. Chapter uniqueness
  const chapterNumbers = new Set<number>();
  for (const chapter of novel.chapters) {
    if (chapterNumbers.has(chapter.number)) {
      errors.push(`Duplicate chapter number: ${chapter.number}`);
    }
    chapterNumbers.add(chapter.number);
  }

  // 4. Line uniqueness & references
  const lineIds = new Set<string>();
  const establishedFactIds = new Set<string>();

  for (const chapter of novel.chapters) {
    for (const line of chapter.lines) {
      if (lineIds.has(line.id)) {
        errors.push(`Duplicate line id: "${line.id}"`);
      }
      lineIds.add(line.id);

      if (line.chapter !== chapter.number) {
        errors.push(
          `Line "${line.id}" specifies chapter ${line.chapter} but is inside chapter ${chapter.number}`
        );
      }

      if (line.speaker !== null && !entityIds.has(line.speaker)) {
        errors.push(
          `Line "${line.id}" references unknown speaker entity: "${line.speaker}"`
        );
      }

      for (const mentionId of line.mentions) {
        if (!entityIds.has(mentionId)) {
          errors.push(
            `Line "${line.id}" mentions unknown entity: "${mentionId}"`
          );
        }
      }

      for (const estId of line.establishes) {
        const estFact = factMap.get(estId);
        if (!estFact) {
          errors.push(
            `Line "${line.id}" establishes unknown fact: "${estId}"`
          );
        } else {
          establishedFactIds.add(estId);
          if (estFact.chapter !== line.chapter) {
            errors.push(
              `Line "${line.id}" (chapter ${line.chapter}) establishes fact "${estId}" from chapter ${estFact.chapter}`
            );
          }
        }
      }

      for (const reqId of line.requires) {
        const reqFact = factMap.get(reqId);
        if (!reqFact) {
          errors.push(
            `Line "${line.id}" requires unknown fact: "${reqId}"`
          );
        } else if (reqFact.chapter > line.chapter) {
          errors.push(
            `Line "${line.id}" (chapter ${line.chapter}) requires fact "${reqId}" established in later chapter ${reqFact.chapter}`
          );
        }
      }
    }
  }

  // 5. Fact references, forward-flow rule & establishment
  for (const fact of novel.facts) {
    if (!entityIds.has(fact.subject)) {
      errors.push(
        `Fact "${fact.id}" references unknown subject entity: "${fact.subject}"`
      );
    }
    if (!entityIds.has(fact.object)) {
      errors.push(
        `Fact "${fact.id}" references unknown object entity: "${fact.object}"`
      );
    }

    if (!establishedFactIds.has(fact.id)) {
      errors.push(`Fact "${fact.id}" is not established by any line`);
    }

    for (const depId of fact.dependsOn) {
      const depFact = factMap.get(depId);
      if (!depFact) {
        errors.push(
          `Fact "${fact.id}" depends on unknown fact: "${depId}"`
        );
      } else if (depFact.chapter > fact.chapter) {
        errors.push(
          `Blast radius violation: Fact "${fact.id}" (chapter ${fact.chapter}) depends on future fact "${depId}" (chapter ${depFact.chapter})`
        );
      }
    }
  }

  // 6. Fact dependency cycle detection (DFS)
  const visitState = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited

  function detectCycle(currentId: string, path: string[]): boolean {
    visitState.set(currentId, 1);
    const fact = factMap.get(currentId);
    if (fact) {
      for (const depId of fact.dependsOn) {
        if (!factMap.has(depId)) continue;
        const state = visitState.get(depId) ?? 0;
        if (state === 1) {
          errors.push(
            `Cycle detected in fact dependencies: ${path.join(' -> ')} -> ${depId}`
          );
          return true;
        }
        if (state === 0 && detectCycle(depId, [...path, depId])) {
          return true;
        }
      }
    }
    visitState.set(currentId, 2);
    return false;
  }

  for (const fact of novel.facts) {
    if ((visitState.get(fact.id) ?? 0) === 0) {
      detectCycle(fact.id, [fact.id]);
    }
  }

  return errors;
}
