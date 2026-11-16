import { beforeEach, describe, expect, it } from 'bun:test';
import { LlmExplainer } from './LlmExplainer';
import { TemplateExplainer, type FactExplanationContext } from './explainer';
import { tortoiseAndHareNovel } from '../../fixtures/tortoise_and_hare';
import type { LlmClient } from '../../llm/types';

describe('LlmExplainer', () => {
  const originalEnv = process.env.LLM_FEATURES;

  beforeEach(() => {
    delete process.env.LLM_FEATURES;
  });

  const getTestContext = (): FactExplanationContext => {
    const novel = structuredClone(tortoiseAndHareNovel);
    const beforeFact = novel.facts.find((f) => f.id === 'f3')!; // hare HAS sweet_apples
    const afterFact = { ...beforeFact, subject: 'tortoise' };
    const impactedFact = novel.facts.find((f) => f.id === 'f5')!; // hare HAS hare_nap

    return {
      before: beforeFact,
      after: afterFact,
      fact: impactedFact,
      path: ['f3', 'f5'],
      novel,
    };
  };

  it('rewrites deterministic chain into vivid narrative when LLM_FEATURES contains explain', async () => {
    process.env.LLM_FEATURES = 'explain';

    let called = false;
    const mockLlm: LlmClient = {
      async generateText() {
        called = true;
        return 'When Turtle took the sweet apples instead of Rabbit, Rabbit never stopped for a nap.';
      },
    };

    const explainer = new LlmExplainer(mockLlm);
    const ctx = getTestContext();
    const result = await explainer.explainFact(ctx);

    expect(called).toBe(true);
    expect(result).toBe(
      'When Turtle took the sweet apples instead of Rabbit, Rabbit never stopped for a nap.'
    );
  });

  it('falls back to TemplateExplainer silently when LLM returns an error', async () => {
    process.env.LLM_FEATURES = 'explain';

    const failingLlm: LlmClient = {
      async generateText() {
        throw new Error('LLM connection failed');
      },
    };

    const explainer = new LlmExplainer(failingLlm);
    const ctx = getTestContext();
    const result = await explainer.explainFact(ctx);

    // Expected template explanation
    expect(result).toContain('Chain: Rabbit the Hare has');
    expect(result).toContain('depends on');
  });

  it('rejects hallucinations: falls back to template if LLM output mentions an entity outside the chain', async () => {
    process.env.LLM_FEATURES = 'explain';

    // Chain only contains hare, turtle, apple_tree, sweet_apples.
    // LLM hallucinates "Wise Owl" (owl) or "Golden Trophy" (golden_trophy)
    const hallucinatingLlm: LlmClient = {
      async generateText() {
        return 'The Wise Owl watched as the golden trophy was handed out early at the finish line.';
      },
    };

    const explainer = new LlmExplainer(hallucinatingLlm);
    const ctx = getTestContext();
    const result = await explainer.explainFact(ctx);

    // Because it hallucinated Wise Owl / Golden Trophy, it should fall back to template
    expect(result).not.toContain('Wise Owl');
    expect(result).toContain('Chain:');
  });

  it('uses template when LLM_FEATURES does not contain explain', async () => {
    process.env.LLM_FEATURES = 'chat'; // explain is omitted

    let called = false;
    const mockLlm: LlmClient = {
      async generateText() {
        called = true;
        return 'Narrative rewrite';
      },
    };

    const explainer = new LlmExplainer(mockLlm);
    const ctx = getTestContext();
    const result = await explainer.explainFact(ctx);

    expect(called).toBe(false);
    expect(result).toContain('Chain:');
  });
});
