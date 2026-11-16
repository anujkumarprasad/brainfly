import { z } from 'zod';

export const EntityTypeSchema = z.enum(['character', 'item', 'location', 'secret']);
export type EntityType = z.infer<typeof EntityTypeSchema>;

export const EntitySchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  type: EntityTypeSchema,
  description: z.string().max(2000).optional(),
});
export type Entity = z.infer<typeof EntitySchema>;

export const PredicateSchema = z.enum(['HAS', 'KNOWS', 'LOCATED_AT', 'OPENED']);
export type Predicate = z.infer<typeof PredicateSchema>;

export const FactStatusSchema = z.enum(['hidden', 'revealed']);
export type FactStatus = z.infer<typeof FactStatusSchema>;

export const FactSchema = z.object({
  id: z.string().min(1).max(100),
  chapter: z.number().int().positive().max(1000),
  subject: z.string().min(1).max(100),
  predicate: PredicateSchema,
  object: z.string().min(1).max(100),
  status: FactStatusSchema.optional(),
  dependsOn: z.array(z.string().min(1).max(100)).max(50),
  note: z.string().max(1000).optional(),
});
export type Fact = z.infer<typeof FactSchema>;

export const FactPatchSchema = FactSchema.partial().omit({ id: true, dependsOn: true }).strict();
export type FactPatch = z.infer<typeof FactPatchSchema>;

export const LineSchema = z.object({
  id: z.string().min(1).max(100),
  chapter: z.number().int().positive().max(1000),
  speaker: z.string().min(1).max(100).nullable(),
  text: z.string().min(1).max(5000),
  establishes: z.array(z.string().min(1).max(100)).max(50),
  requires: z.array(z.string().min(1).max(100)).max(50),
  mentions: z.array(z.string().min(1).max(100)).max(50),
});
export type Line = z.infer<typeof LineSchema>;

export const ChapterSchema = z.object({
  number: z.number().int().positive(),
  title: z.string().min(1),
  lines: z.array(LineSchema),
});
export type Chapter = z.infer<typeof ChapterSchema>;

export const NovelSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  entities: z.array(EntitySchema),
  facts: z.array(FactSchema),
  chapters: z.array(ChapterSchema),
});
export type Novel = z.infer<typeof NovelSchema>;

export const GraphNodeSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: EntityTypeSchema,
  description: z.string().optional(),
  firstChapter: z.number(),
});
export type GraphNode = z.infer<typeof GraphNodeSchema>;

export const GraphEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  predicate: PredicateSchema,
  chapter: z.number(),
  status: FactStatusSchema.optional(),
  note: z.string().optional(),
});
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;

export const GraphDataSchema = z.object({
  nodes: z.array(GraphNodeSchema),
  edges: z.array(GraphEdgeSchema),
  links: z.array(GraphEdgeSchema),
});
export type GraphData = z.infer<typeof GraphDataSchema>;

export const ImpactedFactSchema = z.object({
  id: z.string(),
  fact: FactSchema,
  chapter: z.number(),
  path: z.array(z.string()),
  reason: z.string(),
});
export type ImpactedFact = z.infer<typeof ImpactedFactSchema>;

export const ImpactedLineSchema = z.object({
  id: z.string(),
  line: LineSchema,
  chapter: z.number(),
  brokenFactIds: z.array(z.string()),
  path: z.array(z.string()),
  reason: z.string(),
});
export type ImpactedLine = z.infer<typeof ImpactedLineSchema>;

export const BlastSummarySchema = z.object({
  chaptersAffected: z.array(z.number()),
  impactedFactsCount: z.number(),
  impactedLinesCount: z.number(),
});
export type BlastSummary = z.infer<typeof BlastSummarySchema>;

export const BlastReportSchema = z.object({
  noChange: z.boolean(),
  editedFact: z.object({
    before: FactSchema,
    after: FactSchema,
  }),
  impactedFacts: z.array(ImpactedFactSchema),
  impactedLines: z.array(ImpactedLineSchema),
  summary: BlastSummarySchema,
});
export type BlastReport = z.infer<typeof BlastReportSchema>;

export const BlastRadiusRequestSchema = z.object({
  factId: z.string().min(1),
  patch: FactPatchSchema,
});
export type BlastRadiusRequest = z.infer<typeof BlastRadiusRequestSchema>;

export const EditFactRequestSchema = z.object({
  factId: z.string().min(1),
  patch: FactPatchSchema,
});
export type EditFactRequest = z.infer<typeof EditFactRequestSchema>;

export const EditFactResponseSchema = z.object({
  novel: NovelSchema,
  report: BlastReportSchema,
});
export type EditFactResponse = z.infer<typeof EditFactResponseSchema>;

export const ResetResponseSchema = z.object({
  novel: NovelSchema,
});
export type ResetResponse = z.infer<typeof ResetResponseSchema>;

export const SwitchNovelRequestSchema = z.object({
  novelId: z.string().min(1).max(100),
});
export type SwitchNovelRequest = z.infer<typeof SwitchNovelRequestSchema>;

export const ResetRequestSchema = z.object({
  novelId: z.string().min(1).max(100).optional(),
});
export type ResetRequest = z.infer<typeof ResetRequestSchema>;

export const VoiceRequestSchema = z.object({
  characterId: z.string().min(1).max(100).optional(),
  text: z.string().min(1).max(2000),
  audioBase64: z.string().max(2_000_000).optional(),
});
export type VoiceRequest = z.infer<typeof VoiceRequestSchema>;

export const ChatRequestSchema = z.object({
  character: z.string().min(1).max(100),
  message: z.string().min(1).max(1000),
  upToChapter: z.number().int().positive().max(1000),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const ChatResponseSchema = z.object({
  reply: z.string(),
  character: z.string(),
  fenceChapter: z.number().int().positive(),
  factsUsed: z.array(z.string().max(100)).max(100),
  refused: z.boolean().optional(),
  source: z.enum(['rules', 'llm']).optional(),
});
export type ChatResponse = z.infer<typeof ChatResponseSchema>;

export const ExtractRequestSchema = z.object({
  manuscriptText: z.string().min(1).max(50000),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractResponseSchema = z.object({
  facts: z.array(FactSchema),
  lines: z.array(LineSchema),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
