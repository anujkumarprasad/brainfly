import { beforeEach, describe, expect, it } from 'bun:test';
import { LlmFactExtractor } from './LlmFactExtractor';
import type { LlmClient } from '../llm/types';
import { Hono } from 'hono';
import { ExtractRequestSchema } from '@bl/shared';

describe('LlmFactExtractor', () => {
  beforeEach(() => {
    delete process.env.LLM_FEATURES;
  });

  it('extracts valid facts and lines when extract feature is enabled', async () => {
    process.env.LLM_FEATURES = 'extract';

    const validJsonOutput = JSON.stringify({
      facts: [
        {
          id: 'f1',
          chapter: 1,
          subject: 'rabbit',
          predicate: 'LOCATED_AT',
          object: 'start_meadow',
          dependsOn: [],
          status: 'revealed',
          note: 'Rabbit is at the start',
        },
        {
          id: 'f2',
          chapter: 2,
          subject: 'turtle',
          predicate: 'HAS',
          object: 'sweet_apples',
          dependsOn: ['f1'],
          status: 'revealed',
        },
      ],
      lines: [
        {
          id: 'l1',
          chapter: 1,
          speaker: 'rabbit',
          text: 'I am waiting at the start line.',
          establishes: ['f1'],
          requires: [],
          mentions: ['start_meadow'],
        },
      ],
    });

    const mockLlm: LlmClient = {
      async generateText() {
        return `\`\`\`json\n${validJsonOutput}\n\`\`\``;
      },
    };

    const extractor = new LlmFactExtractor(mockLlm);
    const result = await extractor.extract('Chapter 1. Rabbit stood at Start Meadow...');

    expect(result.facts.length).toBe(2);
    expect(result.facts[0].id).toBe('f1');
    expect(result.facts[1].id).toBe('f2');
    expect(result.lines.length).toBe(1);
    expect(result.lines[0].id).toBe('l1');
  });

  it('discards invalid facts and lines that fail schema validation or forward DAG', async () => {
    process.env.LLM_FEATURES = 'extract';

    const mixedJsonOutput = JSON.stringify({
      facts: [
        {
          id: 'f1',
          chapter: 1,
          subject: 'rabbit',
          predicate: 'LOCATED_AT',
          object: 'start_meadow',
          dependsOn: [],
        },
        {
          // Invalid: backward dependency f2 (Ch 1) depends on future fact f3 (Ch 3)
          id: 'f2',
          chapter: 1,
          subject: 'rabbit',
          predicate: 'HAS',
          object: 'trophy',
          dependsOn: ['f3'],
        },
        {
          id: 'f3',
          chapter: 3,
          subject: 'rabbit',
          predicate: 'LOCATED_AT',
          object: 'finish_line',
          dependsOn: ['f1'],
        },
        {
          // Invalid schema: invalid predicate 'FLIES_TO'
          id: 'f_bad',
          chapter: 1,
          subject: 'owl',
          predicate: 'FLIES_TO',
          object: 'tree',
          dependsOn: [],
        },
      ],
      lines: [
        {
          id: 'l1',
          chapter: 1,
          speaker: null,
          text: 'Line 1',
          establishes: ['f1'],
          requires: [],
          mentions: [],
        },
        {
          // Requires f2 (which was discarded)
          id: 'l2',
          chapter: 1,
          speaker: null,
          text: 'Line 2',
          establishes: [],
          requires: ['f2'],
          mentions: [],
        },
      ],
    });

    const mockLlm: LlmClient = {
      async generateText() {
        return mixedJsonOutput;
      },
    };

    const extractor = new LlmFactExtractor(mockLlm);
    const result = await extractor.extract('Manuscript text...');

    // f1 (valid) and f3 (valid forward dep on f1) are kept
    // f2 (depends on future f3) and f_bad (invalid predicate) are discarded
    expect(result.facts.map((f) => f.id)).toEqual(['f1', 'f3']);
    // l2's requires list should filter out discarded f2
    const l2 = result.lines.find((l) => l.id === 'l2');
    expect(l2?.requires).toEqual([]);
  });

  it('returns empty arrays when LLM_FEATURES does not contain extract', async () => {
    process.env.LLM_FEATURES = 'chat,explain'; // extract not present

    let called = false;
    const mockLlm: LlmClient = {
      async generateText() {
        called = true;
        return '{}';
      },
    };

    const extractor = new LlmFactExtractor(mockLlm);
    const result = await extractor.extract('Manuscript text...');

    expect(called).toBe(false);
    expect(result.facts).toEqual([]);
    expect(result.lines).toEqual([]);
  });
});
