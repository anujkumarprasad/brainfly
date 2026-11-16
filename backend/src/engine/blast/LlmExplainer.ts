import type { Explainer, FactExplanationContext, LineExplanationContext } from './explainer';
import { TemplateExplainer } from './explainer';
import type { LlmClient } from '../../llm/types';
import { getEntityPatterns, normalizeMessage } from '../../chat/ChatResponder';

function isFeatureEnabled(feature: string): boolean {
  const features = (process.env.LLM_FEATURES || '')
    .split(',')
    .map((f) => f.trim().toLowerCase());
  return features.includes(feature.toLowerCase());
}

export class LlmExplainer implements Explainer {
  private llmClient: LlmClient | null;
  private fallback: Explainer;
  private cache = new Map<string, string>();

  constructor(llmClient?: LlmClient | null, fallback?: Explainer) {
    this.llmClient = llmClient ?? null;
    this.fallback = fallback ?? new TemplateExplainer();
  }

  async explainLine(ctx: LineExplanationContext): Promise<string> {
    return this.fallback.explainLine(ctx);
  }

  async explainFact(ctx: FactExplanationContext): Promise<string> {
    const groundTruth = await this.fallback.explainFact(ctx);

    if (!this.llmClient || !isFeatureEnabled('explain')) {
      return groundTruth;
    }

    const cacheKey = `${ctx.before.id}:${ctx.fact.id}:${ctx.path.join('-')}:${ctx.after.subject}:${ctx.after.predicate}:${ctx.after.object}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const allowedEntityIds = new Set<string>([
        ctx.before.subject,
        ctx.before.object,
        ctx.after.subject,
        ctx.after.object,
        ctx.fact.subject,
        ctx.fact.object,
      ]);

      const factMap = new Map(ctx.novel.facts.map((f) => [f.id, f]));
      for (const pId of ctx.path) {
        const f = factMap.get(pId);
        if (f) {
          allowedEntityIds.add(f.subject);
          allowedEntityIds.add(f.object);
        }
      }

      const prompt = `A story fact was edited, causing a chain reaction in the story dependency graph.
Ground truth explanation:
"${groundTruth}"

Chain of impacted facts: ${ctx.path.join(' -> ')}

Rewrite this deterministic chain into a concise, vivid 2-3 sentence narrative paragraph explaining the cascade of cause and effect.
Strict rule: Only mention entities that participate in this chain. Do NOT hallucinate or introduce other characters, locations, or items.`;

      const system =
        'You are an expert story editor analyzing cause-and-effect. Rewrite the provided causal chain into a vivid 2-3 sentence narrative paragraph. Never mention or hallucinate any characters or items outside the specified chain.';

      const result = await this.llmClient.generateText(prompt, {
        system,
        maxTokens: 150,
      });

      // Validate that LLM did not hallucinate entities not in the chain
      const normalizedResult = normalizeMessage(result);
      for (const ent of ctx.novel.entities) {
        if (!allowedEntityIds.has(ent.id)) {
          const patterns = getEntityPatterns(ent.id, ent.name);
          if (patterns.some((p) => p.test(normalizedResult))) {
            console.warn(
              `LlmExplainer: LLM output mentioned entity "${ent.name}" outside chain; falling back to template.`
            );
            return groundTruth;
          }
        }
      }

      const trimmed = result.trim();
      this.cache.set(cacheKey, trimmed);
      return trimmed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`LlmExplainer failed: ${msg}; falling back to template.`);
      return groundTruth;
    }
  }
}
