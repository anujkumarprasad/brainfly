import {
  NotFoundError,
  type ChatRequest,
  type ChatResponse,
} from '@bl/shared';
import type { GraphStore } from '../engine/graph/GraphStore';
import {
  TemplateResponder,
  doesMessageMentionFutureEntity,
  scanTextForFutureEntities,
  type ChatResponder,
} from './ChatResponder';
import type { LlmClient } from '../llm/types';

export type { LlmClient };

/**
 * AiChatResponder integrates LLM calls (via Kilo AI Gateway) with strict
 * deterministic spoiler-fence gating and graceful fallback to TemplateResponder.
 */
export class AiChatResponder implements ChatResponder {
  private llmClient: LlmClient | null;
  private fallbackResponder: TemplateResponder;

  constructor(llmClient?: LlmClient | null) {
    this.llmClient = llmClient ?? null;
    this.fallbackResponder = new TemplateResponder();
  }

  async respond(req: ChatRequest, store: GraphStore): Promise<ChatResponse> {
    const novel = store.getNovel();
    const entity = novel.entities.find((e) => e.id === req.character);

    // Rule 1: character existence check
    if (!entity || entity.type !== 'character') {
      throw new NotFoundError(`Character "${req.character}" not found`);
    }

    // Rule 2: spoiler fence for character appearance
    const charFirstChapter = store.entityFirstChapter(req.character);
    if (charFirstChapter > req.upToChapter) {
      return this.fallbackResponder.respond(req, store);
    }

    // Rule 3: check mentioned entities against spoiler fence
    if (doesMessageMentionFutureEntity(req.message, req.upToChapter, store)) {
      return this.fallbackResponder.respond(req, store);
    }

    // If no LLM client configured, use deterministic template responder
    if (!this.llmClient) {
      return this.fallbackResponder.respond(req, store);
    }

    // Rule 4: LLM character prompt generation
    try {
      const knownFacts = store
        .factsUpTo(req.upToChapter)
        .filter((f) => f.subject === req.character || f.object === req.character);

      const knownEntities = novel.entities.filter(
        (e) => store.entityFirstChapter(e.id) <= req.upToChapter
      );
      const entityMap = new Map(knownEntities.map((e) => [e.id, e.name]));
      const formattedFacts = knownFacts.map((f) => {
        const subj = entityMap.get(f.subject) ?? f.subject;
        const obj = entityMap.get(f.object) ?? f.object;
        return `- In Chapter ${f.chapter}: ${subj} ${f.predicate} ${obj}`;
      });

      const characterDescription =
        charFirstChapter <= req.upToChapter
          ? (entity.description ?? 'A character in this woodland story.')
          : 'A character in this woodland story.';

      const systemInstruction = `You are roleplaying as "${entity.name}" in the story "${novel.title}".
Current timeline boundary: Chapter ${req.upToChapter} of ${novel.chapters.length}.
CRITICAL RULE: You only know facts up to Chapter ${req.upToChapter}. You must NEVER reveal or hint at any events, objects, or secrets from later chapters.
Character description: ${characterDescription}
Grounded facts known to you at this chapter:
${formattedFacts.length > 0 ? formattedFacts.join('\n') : '(No specific personal facts recorded yet)'}

Speak in the first person ("I"). Keep your answer in character, concise (1-2 sentences), and do not break the timeline. Prefix your answer with "${entity.name}: ".`;

      const reply = await this.llmClient.generateText(req.message, {
        system: systemInstruction,
        maxTokens: 200,
      });

      // Output-side check: scan reply for entities whose firstChapter > upToChapter
      if (scanTextForFutureEntities(reply, req.upToChapter, store)) {
        return this.fallbackResponder.respond(req, store);
      }

      const cleanedReply = reply.startsWith(`${entity.name}: `)
        ? reply
        : `${entity.name}: ${reply}`;

      return {
        character: req.character,
        fenceChapter: req.upToChapter,
        factsUsed: knownFacts.map((f) => f.id),
        refused: false,
        source: 'llm',
        reply: cleanedReply,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`LLM call failed: ${message}`);
      return this.fallbackResponder.respond(req, store);
    }
  }
}
