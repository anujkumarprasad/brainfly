import { describe, expect, it } from 'bun:test';
import { InMemoryGraphStore } from '../engine/graph/InMemoryGraphStore';
import { tortoiseAndHareNovel } from '../fixtures/tortoise_and_hare';
import { AiChatResponder, type LlmClient } from './AiChatResponder';

describe('AiChatResponder', () => {
  it('throws NotFoundError for unknown character', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const responder = new AiChatResponder(null);

    expect(
      responder.respond(
        { character: 'dragon', message: 'Hello', upToChapter: 1 },
        store
      )
    ).rejects.toThrow('Character "dragon" not found');
  });

  it('strictly enforces spoiler fence refusal before invoking LLM', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    let llmCalled = false;
    const mockLlm: LlmClient = {
      async generateText() {
        llmCalled = true;
        return 'I know about the trophy!';
      },
    };

    const responder = new AiChatResponder(mockLlm);

    // Tortoise asked about golden trophy at Chapter 2 (trophy first appears in Ch 4)
    const res = await responder.respond(
      {
        character: 'tortoise',
        message: 'Did you touch the golden trophy?',
        upToChapter: 2,
      },
      store
    );

    expect(res.refused).toBe(true);
    expect(res.reply).toContain("I don't know what you mean by that.");
    expect(llmCalled).toBe(false); // LLM was not called due to strict fence!
  });

  it('uses LLM client when available and question is within spoiler boundary', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    let capturedPrompt = '';
    let capturedSystem = '';
    const mockLlm: LlmClient = {
      async generateText(prompt, opts) {
        capturedPrompt = prompt;
        capturedSystem = typeof opts === 'string' ? opts : (opts?.system ?? '');
        return 'I am steady and ready for the woodland race.';
      },
    };

    const responder = new AiChatResponder(mockLlm);

    const res = await responder.respond(
      {
        character: 'tortoise',
        message: 'Are you ready for the race?',
        upToChapter: 1,
      },
      store
    );

    expect(res.refused).toBe(false);
    expect(res.reply).toBe('Turtle the Tortoise: I am steady and ready for the woodland race.');
    expect(capturedPrompt).toBe('Are you ready for the race?');
    expect(capturedSystem).toContain('Chapter 1 of 5');
    expect(capturedSystem).toContain('Turtle the Tortoise');
  });

  it('falls back to deterministic TemplateResponder on LLM failure', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    const failingLlm: LlmClient = {
      async generateText() {
        throw new Error('API Rate Limit Exceeded');
      },
    };

    const responder = new AiChatResponder(failingLlm);

    const res = await responder.respond(
      {
        character: 'hare',
        message: 'Where are you right now?',
        upToChapter: 1,
      },
      store
    );

    expect(Boolean(res.refused)).toBe(false);
    // TemplateResponder output for hare location in Ch 1
    expect(res.reply).toContain('Rabbit: I am at Start Meadow.');
    expect(res.factsUsed).toContain('f1');
  });

  it('normalizes punctuation, case, hyphens and underscores for spoiler fence refusal', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);
    const responder = new AiChatResponder(null);

    const variants = [
      'Tell me about the golden-trophy',
      'What about the GOLDEN TROPHY!!',
      'Do you have the golden_trophy?',
    ];

    for (const msg of variants) {
      const res = await responder.respond(
        {
          character: 'tortoise',
          message: msg,
          upToChapter: 2,
        },
        store
      );
      expect(res.refused).toBe(true);
      expect(res.reply).toContain("I don't know what you mean by that.");
    }
  });

  it('output-side check: discards LLM reply if it leaks future entities and falls back to template', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    // LLM attempts to hallucinate or leak the Golden Trophy (Ch 4 entity) at Chapter 2
    const leakingLlm: LlmClient = {
      async generateText() {
        return 'I am on my way to claim the Golden Trophy at the finish summit.';
      },
    };

    const responder = new AiChatResponder(leakingLlm);

    const res = await responder.respond(
      {
        character: 'tortoise',
        message: 'How is the race going?',
        upToChapter: 2,
      },
      store
    );

    // Because the LLM reply leaked "Golden Trophy", it must be discarded
    expect(res.reply).not.toContain('claim the Golden Trophy');
    // Fallback template answer returned
    expect(res.reply).toContain("Turtle: ");
  });

  it('does not include descriptions of future entities when building LLM prompt', async () => {
    const store = new InMemoryGraphStore(tortoiseAndHareNovel);

    let capturedSystem = '';
    const inspectLlm: LlmClient = {
      async generateText(_prompt, opts) {
        capturedSystem = typeof opts === 'string' ? opts : (opts?.system ?? '');
        return 'Ready to run!';
      },
    };

    const responder = new AiChatResponder(inspectLlm);

    await responder.respond(
      {
        character: 'tortoise',
        message: 'Are you ready?',
        upToChapter: 1,
      },
      store
    );

    // Future entities from Ch 2, 3, 4 should not have descriptions in the prompt
    expect(capturedSystem).not.toContain('wild sweet apples');
    expect(capturedSystem).not.toContain('gleaming championship cup');
    expect(capturedSystem).not.toContain('decision to sleep');
  });
});
