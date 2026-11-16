import { FactSchema, LineSchema, type Fact, type Line } from '@bl/shared';
import type { FactExtractor } from './FactExtractor';
import type { LlmClient } from '../llm/types';

function isFeatureEnabled(feature: string): boolean {
  const features = (process.env.LLM_FEATURES || '')
    .split(',')
    .map((f) => f.trim().toLowerCase());
  return features.includes(feature.toLowerCase());
}

export class LlmFactExtractor implements FactExtractor {
  private llmClient: LlmClient | null;

  constructor(llmClient?: LlmClient | null) {
    this.llmClient = llmClient ?? null;
  }

  async extract(manuscriptText: string): Promise<{ facts: Fact[]; lines: Line[] }> {
    if (!this.llmClient || !isFeatureEnabled('extract')) {
      return { facts: [], lines: [] };
    }

    const systemPrompt = `You are an expert story knowledge-graph analyzer.
Extract narrative facts and lines from manuscript chapters.
Output MUST be valid JSON with the schema:
{
  "facts": [
    {
      "id": "f1",
      "chapter": 1,
      "subject": "entity_id",
      "predicate": "HAS" | "KNOWS" | "LOCATED_AT" | "OPENED",
      "object": "entity_id",
      "dependsOn": [],
      "status": "revealed" | "hidden",
      "note": "optional description"
    }
  ],
  "lines": [
    {
      "id": "line_1",
      "chapter": 1,
      "speaker": "entity_id or null",
      "text": "manuscript line text",
      "establishes": ["f1"],
      "requires": [],
      "mentions": ["entity_id"]
    }
  ]
}
Rule: facts can only depend on facts from the SAME or EARLIER chapters (forward-only DAG).`;

    const userPrompt = `Extract story facts and lines from this manuscript text:\n\n${manuscriptText}`;

    try {
      const responseText = await this.llmClient.generateText(userPrompt, {
        system: systemPrompt,
        maxTokens: 2500,
        json: true,
      });

      // Strip potential markdown code fences
      const cleanJson = responseText
        .trim()
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/, '')
        .replace(/\s*```$/, '')
        .trim();

      const parsed = JSON.parse(cleanJson);
      if (!parsed || typeof parsed !== 'object') {
        return { facts: [], lines: [] };
      }

      const rawFacts = Array.isArray(parsed.facts) ? parsed.facts : [];
      const rawLines = Array.isArray(parsed.lines) ? parsed.lines : [];

      // Validate individual facts against FactSchema
      const candidateFacts: Fact[] = [];
      const factIdSet = new Set<string>();

      for (const item of rawFacts) {
        const parsedFact = FactSchema.safeParse(item);
        if (parsedFact.success && !factIdSet.has(parsedFact.data.id)) {
          factIdSet.add(parsedFact.data.id);
          candidateFacts.push(parsedFact.data);
        }
      }

      // Check forward-only DAG constraints and cycles on candidate facts
      const factMap = new Map(candidateFacts.map((f) => [f.id, f]));
      const validFacts: Fact[] = [];

      for (const fact of candidateFacts) {
        let validDependencies = true;
        for (const depId of fact.dependsOn) {
          const dep = factMap.get(depId);
          if (!dep || dep.chapter > fact.chapter || depId === fact.id) {
            validDependencies = false;
            break;
          }
        }
        if (validDependencies) {
          validFacts.push(fact);
        }
      }

      // Cycle detection on remaining facts
      const validFactMap = new Map(validFacts.map((f) => [f.id, f]));
      const visitState = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited

      function hasCycle(id: string): boolean {
        visitState.set(id, 1);
        const f = validFactMap.get(id);
        if (f) {
          for (const depId of f.dependsOn) {
            const state = visitState.get(depId) ?? 0;
            if (state === 1) return true;
            if (state === 0 && hasCycle(depId)) return true;
          }
        }
        visitState.set(id, 2);
        return false;
      }

      const acyclicFacts = validFacts.filter((f) => {
        if ((visitState.get(f.id) ?? 0) === 0) {
          return !hasCycle(f.id);
        }
        return visitState.get(f.id) === 2;
      });

      const acyclicFactIds = new Set(acyclicFacts.map((f) => f.id));

      // Validate individual lines against LineSchema
      const validLines: Line[] = [];
      const lineIdSet = new Set<string>();

      for (const item of rawLines) {
        const parsedLine = LineSchema.safeParse(item);
        if (parsedLine.success && !lineIdSet.has(parsedLine.data.id)) {
          lineIdSet.add(parsedLine.data.id);
          // Only keep lines whose establishes and requires refer to valid acyclic facts
          const filteredEstablishes = parsedLine.data.establishes.filter((id) =>
            acyclicFactIds.has(id)
          );
          const filteredRequires = parsedLine.data.requires.filter((id) =>
            acyclicFactIds.has(id)
          );
          validLines.push({
            ...parsedLine.data,
            establishes: filteredEstablishes,
            requires: filteredRequires,
          });
        }
      }

      return { facts: acyclicFacts, lines: validLines };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`LlmFactExtractor failed: ${msg}`);
      return { facts: [], lines: [] };
    }
  }
}
