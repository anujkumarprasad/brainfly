import {
  NotFoundError,
  type ChatRequest,
  type ChatResponse,
  type Fact,
  type Novel,
  type Predicate,
} from '@bl/shared';
import type { GraphStore } from '../engine/graph/GraphStore';

/**
 * An interface for generating chat responses from characters.
 * An LLM persona responder will replace this in later phases.
 */
export interface ChatResponder {
  respond(req: ChatRequest, store: GraphStore): ChatResponse | Promise<ChatResponse>;
}

interface CharacterProfile {
  name: string;
  prefix: string;
  deflection: string;
  confusion: string;
  nothingToAdd: string;
  specialRefusal?: (message: string) => { reply: string; refused: boolean } | null;
}

const CHARACTER_PROFILES: Record<string, CharacterProfile> = {
  hare: {
    name: 'Rabbit the Hare',
    prefix: 'Rabbit: ',
    deflection: 'I am far too swift to discuss that! I have a race to win.',
    confusion: "What are you talking about? I don't know what you mean.",
    nothingToAdd: 'I am ready to dash to victory!',
  },
  tortoise: {
    name: 'Turtle the Tortoise',
    prefix: 'Turtle: ',
    deflection: "One step at a time, friend. I'd rather focus on the trail.",
    confusion: "I don't know what you mean by that.",
    nothingToAdd: 'Patience and steady feet will tell the tale.',
  },
  fox: {
    name: 'Judge Fox',
    prefix: 'Judge Fox: ',
    deflection: 'As the official referee, I must maintain race neutrality.',
    confusion: 'That is not documented in the official Whispering Woods race rules.',
    nothingToAdd: 'The race proceeds according to forest bylaws.',
  },
  owl: {
    name: 'Wise Owl',
    prefix: 'Wise Owl: ',
    deflection: 'Hoo! Secrets ripen like acorns in their own good time.',
    confusion: 'Hoo? I have observed no such thing in this forest.',
    nothingToAdd: 'I keep watch from the branches above.',
  },
};

function getProfile(entityId: string, entityName: string): CharacterProfile {
  return (
    CHARACTER_PROFILES[entityId] ?? {
      name: entityName,
      prefix: `${entityName}: `,
      deflection: "I'd rather not say.",
      confusion: "I don't know what you mean by that.",
      nothingToAdd: 'I have nothing to add yet.',
    }
  );
}

export function normalizeMessage(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function getEntityPatterns(entityId: string, entityName: string): RegExp[] {
  const terms: string[] = [
    normalizeMessage(entityId),
    normalizeMessage(entityName),
  ];

  if (entityId === 'sweet_apples') {
    terms.push('sweet apples', 'crisp apples', 'the apples', 'apple tree', 'apples');
  } else if (entityId === 'golden_trophy') {
    terms.push('golden trophy', 'the trophy', 'golden cup', 'trophy cup', 'championship trophy', 'victory trophy', 'trophy');
  } else if (entityId === 'hare_nap') {
    terms.push('the hare s nap', 'hare nap', 'taking a nap', 'fell asleep', 'hare sleeping', 'nap');
  }

  const normalizedTerms = terms.map((t) => normalizeMessage(t)).filter(Boolean);
  return Array.from(new Set(normalizedTerms)).map((t) => {
    const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i');
  });
}

export function findMentionedEntities(message: string, entities: Novel['entities']): string[] {
  const normalized = normalizeMessage(message);
  const mentioned: string[] = [];

  for (const ent of entities) {
    const patterns = getEntityPatterns(ent.id, ent.name);
    if (patterns.some((p) => p.test(normalized))) {
      mentioned.push(ent.id);
    }
  }

  return mentioned;
}

export function doesMessageMentionFutureEntity(
  message: string,
  upToChapter: number,
  store: GraphStore
): boolean {
  const novel = store.getNovel();
  const mentioned = findMentionedEntities(message, novel.entities);
  return mentioned.some((entId) => store.entityFirstChapter(entId) > upToChapter);
}

export function scanTextForFutureEntities(
  text: string,
  upToChapter: number,
  store: GraphStore
): boolean {
  const novel = store.getNovel();
  const normalized = normalizeMessage(text);
  for (const ent of novel.entities) {
    if (store.entityFirstChapter(ent.id) > upToChapter) {
      const patterns = getEntityPatterns(ent.id, ent.name);
      if (patterns.some((p) => p.test(normalized))) {
        return true;
      }
    }
  }
  return false;
}

function formatFactFirstPerson(fact: Fact, novel: Novel): string {
  const entityMap = new Map(novel.entities.map((e) => [e.id, e.name]));
  const objName = entityMap.get(fact.object) ?? fact.object;
  switch (fact.predicate) {
    case 'LOCATED_AT':
      return `I am at ${objName}.`;
    case 'HAS':
      return `I have ${objName}.`;
    case 'KNOWS':
      return `I know about ${objName}.`;
    case 'OPENED':
      return `I opened ${objName}.`;
  }
}

export class TemplateResponder implements ChatResponder {
  respond(req: ChatRequest, store: GraphStore): ChatResponse {
    const novel = store.getNovel();
    const entity = novel.entities.find((e) => e.id === req.character);

    // Rule 1: character is an entity id of type character. Unknown -> 404
    if (!entity || entity.type !== 'character') {
      throw new NotFoundError(`Character "${req.character}" not found`);
    }

    const profile = getProfile(entity.id, entity.name);

    // Rule 1 (cont.): If entityFirstChapter(character) > upToChapter: refused:true
    const charFirstChapter = store.entityFirstChapter(req.character);
    if (charFirstChapter > req.upToChapter) {
      return {
        character: req.character,
        fenceChapter: req.upToChapter,
        factsUsed: [],
        refused: true,
        source: 'rules',
        reply: `${profile.prefix}${entity.name} has not appeared yet at that point in the story.`,
      };
    }

    // Special character-specific refusal rule if defined
    if (profile.specialRefusal) {
      const special = profile.specialRefusal(req.message);
      if (special) {
        return {
          character: req.character,
          fenceChapter: req.upToChapter,
          factsUsed: [],
          refused: special.refused,
          source: 'rules',
          reply: `${profile.prefix}${special.reply}`,
        };
      }
    }

    // Rule 2: Known facts = store.factsUpTo(upToChapter) where subject === character
    const knownFacts = store
      .factsUpTo(req.upToChapter)
      .filter((f) => f.subject === req.character);

    // Rule 3: Scan normalized message for entity names/ids.
    // If it mentions any entity whose firstChapter > upToChapter: spoiler fence!
    const normalizedMessage = normalizeMessage(req.message);
    const mentionedEntities = findMentionedEntities(req.message, novel.entities);

    for (const entId of mentionedEntities) {
      const entFirstChapter = store.entityFirstChapter(entId);
      if (entFirstChapter > req.upToChapter) {
        return {
          character: req.character,
          fenceChapter: req.upToChapter,
          factsUsed: [],
          refused: true,
          source: 'rules',
          reply: `${profile.prefix}${profile.confusion}`,
        };
      }
    }

    // Rule 4: Intent detection
    // 4a. Who are you / yourself
    if (/\b(who are you|yourself|who you are)\b/i.test(normalizedMessage)) {
      return {
        character: req.character,
        fenceChapter: req.upToChapter,
        factsUsed: [],
        source: 'rules',
        reply: `${profile.prefix}I am ${entity.name}. ${entity.description ?? ''}`,
      };
    }

    // 4b. Find matching facts by mentioned entity and/or keywords
    const entityFacts = knownFacts.filter((f) => mentionedEntities.includes(f.object));

    let intentPredicate: Predicate | null = null;
    if (/\b(where|location|place)\b/i.test(normalizedMessage)) {
      intentPredicate = 'LOCATED_AT';
    } else if (/\b(have|hold|carry|key|keep|possess|got)\b/i.test(normalizedMessage)) {
      intentPredicate = 'HAS';
    } else if (/\b(know|knows|aware|secret|heard)\b/i.test(normalizedMessage)) {
      intentPredicate = 'KNOWS';
    } else if (/\b(open|opened|unlock|unlocked)\b/i.test(normalizedMessage)) {
      intentPredicate = 'OPENED';
    }

    let matchingFacts: Fact[] = [];
    if (entityFacts.length > 0) {
      if (intentPredicate) {
        const filtered = entityFacts.filter((f) => f.predicate === intentPredicate);
        matchingFacts = filtered.length > 0 ? filtered : entityFacts;
      } else {
        matchingFacts = entityFacts;
      }
    } else if (intentPredicate) {
      matchingFacts = knownFacts.filter((f) => f.predicate === intentPredicate);
    }

    // 4c. Compose response
    if (matchingFacts.length > 0) {
      const factsUsed = matchingFacts.map((f) => f.id);
      const allHidden = matchingFacts.every((f) => f.status === 'hidden');

      if (allHidden) {
        return {
          character: req.character,
          fenceChapter: req.upToChapter,
          factsUsed,
          source: 'rules',
          reply: `${profile.prefix}${profile.deflection}`,
        };
      }

      const parts = matchingFacts.map((f) => {
        if (f.status === 'hidden') {
          return "As for some other details, I'd rather not say.";
        }
        return formatFactFirstPerson(f, novel);
      });

      return {
        character: req.character,
        fenceChapter: req.upToChapter,
        factsUsed,
        source: 'rules',
        reply: `${profile.prefix}${parts.join(' ')}`,
      };
    }

    // 4d. Nothing matched: summarise up to 3 known facts or say nothing to add yet
    if (knownFacts.length === 0) {
      return {
        character: req.character,
        fenceChapter: req.upToChapter,
        factsUsed: [],
        source: 'rules',
        reply: `${profile.prefix}${profile.nothingToAdd}`,
      };
    }

    const upToThree = knownFacts.slice(0, 3);
    const factsUsed = upToThree.map((f) => f.id);
    const parts = upToThree.map((f) => {
      if (f.status === 'hidden') {
        return "There are things I'd rather keep to myself.";
      }
      return formatFactFirstPerson(f, novel);
    });

    return {
      character: req.character,
      fenceChapter: req.upToChapter,
      factsUsed,
      source: 'rules',
      reply: `${profile.prefix}${parts.join(' ')}`,
    };
  }
}
