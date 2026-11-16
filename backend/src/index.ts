import { existsSync } from 'fs';
import { resolve } from 'path';
import { Context, Hono } from 'hono';
import { cors } from 'hono/cors';
import {
  BlastRadiusRequestSchema,
  ChatRequestSchema,
  EditFactRequestSchema,
  ExtractRequestSchema,
  NotFoundError,
  ResetRequestSchema,
  SwitchNovelRequestSchema,
  ValidationError,
  VoiceRequestSchema,
  validateNovel,
  z,
} from '@bl/shared';
import { AiChatResponder, TemplateResponder, type ChatResponder } from './chat/index';
import { computeBlastRadius } from './engine/blast/blastRadius';
import { TemplateExplainer, type Explainer } from './engine/blast/explainer';
import { LlmExplainer } from './engine/blast/LlmExplainer';
import { InMemoryGraphStore } from './engine/graph/InMemoryGraphStore';
import { NOVELS_REGISTRY, tortoiseAndHareNovel } from './fixtures/index';
import { createLlmClient } from './llm/index';
import { StubFactExtractor, LlmFactExtractor, type FactExtractor } from './extract/index';
import { StubVoiceResponder, type VoiceResponder } from './voice/VoiceResponder';

const llmClient = await createLlmClient();
let store = new InMemoryGraphStore(tortoiseAndHareNovel);

const isFeatureEnabled = (feat: string): boolean =>
  (process.env.LLM_FEATURES || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .includes(feat.toLowerCase());

const explainer: Explainer =
  llmClient && isFeatureEnabled('explain')
    ? new LlmExplainer(llmClient)
    : new TemplateExplainer();

const chatResponder: ChatResponder =
  llmClient && isFeatureEnabled('chat')
    ? new AiChatResponder(llmClient)
    : new TemplateResponder();

const factExtractor: FactExtractor =
  llmClient && isFeatureEnabled('extract')
    ? new LlmFactExtractor(llmClient)
    : new StubFactExtractor();

const voiceResponder: VoiceResponder = new StubVoiceResponder();

const app = new Hono();

// Security: Global Response Headers
app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'microphone=(self)');
});

// Security: Restricted CORS
const parseAllowedOrigins = (): string[] => {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean);
  }
  return [
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:4173',
    'http://127.0.0.1:3001',
  ];
};

const allowedOrigins = parseAllowedOrigins();

app.use('/api/*', cors({
  origin: (origin) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return origin || '*';
    }
    return null;
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 600,
}));

// In-Memory Rate Limiter for expensive AI & voice routes
// Note: In-memory per process instance. Distributed deployments require external store like Redis.
interface RateLimitBucket {
  count: number;
  resetAt: number;
}

class InMemoryRateLimiter {
  private buckets = new Map<string, RateLimitBucket>();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs = 60_000, maxRequests = 30) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isLimited(clientKey: string): { limited: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const bucket = this.buckets.get(clientKey);

    if (!bucket || now > bucket.resetAt) {
      this.buckets.set(clientKey, { count: 1, resetAt: now + this.windowMs });
      return { limited: false };
    }

    if (bucket.count >= this.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      return { limited: true, retryAfterSeconds };
    }

    bucket.count += 1;
    return { limited: false };
  }

  cleanup() {
    const now = Date.now();
    for (const [key, bucket] of this.buckets.entries()) {
      if (now > bucket.resetAt) {
        this.buckets.delete(key);
      }
    }
  }
}

const aiRateLimiter = new InMemoryRateLimiter(60_000, 30);
setInterval(() => aiRateLimiter.cleanup(), 60_000);

// Production Read-Only Mode Guard
function isProductionReadOnly(): boolean {
  if (process.env.READ_ONLY_MODE === 'true') return true;
  if (process.env.NODE_ENV === 'production') {
    return process.env.ALLOW_MUTATIONS !== 'true';
  }
  return false;
}

function checkWritePermission(c: Context): Response | null {
  // Explicit ALLOW_MUTATIONS=true permits mutations in all environments
  if (process.env.ALLOW_MUTATIONS === 'true') {
    return null;
  }

  // Explicit READ_ONLY_MODE=true forces read-only
  if (process.env.READ_ONLY_MODE === 'true') {
    return c.json(
      {
        error: {
          code: 'FORBIDDEN',
          message:
            'Mutations are disabled in read-only mode.',
        },
      },
      403
    );
  }

  // If in production mode, default public internet traffic to read-only while keeping local testing available
  if (process.env.NODE_ENV === 'production') {
    const host = c.req.header('host') || '';
    const forwardedFor = c.req.header('x-forwarded-for');
    const isLocalHost =
      host.startsWith('localhost:') ||
      host.startsWith('127.0.0.1:') ||
      host.startsWith('localhost.localdomain:') ||
      host.startsWith('0.0.0.0:') ||
      host.startsWith('[::1]:') ||
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === 'localhost.localdomain' ||
      host === '0.0.0.0' ||
      host === '[::1]';

    // If request is from an external public domain / reverse-proxy, protect production write actions
    if (!isLocalHost || forwardedFor) {
      return c.json(
        {
          error: {
            code: 'FORBIDDEN',
            message:
              'Mutations are disabled in public production mode. Set ALLOW_MUTATIONS=true to permit editing.',
          },
        },
        403
      );
    }
  }

  return null;
}

function getClientAddress(c: Context): string {
  try {
    if (c.env && typeof c.env === 'object') {
      const server = (c.env as any).server;
      if (server && typeof server.requestIP === 'function') {
        const ip = server.requestIP(c.req.raw);
        if (ip?.address) return ip.address;
      }
      const sock = (c.env as any).incoming?.socket?.remoteAddress;
      if (sock) return sock;
    }
  } catch {
    // fallback
  }
  return c.req.header('x-forwarded-for') || c.req.header('cf-connecting-ip') || 'direct';
}

// Error handling to enforce { error: { code, message } } format
app.onError((err, c) => {
  if (err instanceof NotFoundError) {
    return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
  }
  if (err instanceof ValidationError) {
    return c.json({ error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
  }

  // Server-side error logging
  console.error('[SERVER ERROR]', err);

  const isProd = process.env.NODE_ENV === 'production';
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: isProd ? 'Internal server error' : err.message || 'Internal server error',
      },
    },
    500
  );
});

// Helper for parsing and validating JSON body with finite byte size bounds
const MAX_BODY_BYTES = 1024 * 1024; // 1 MB limit

async function parseJsonBody<T>(
  c: Context,
  schema: z.ZodType<T>
): Promise<{ success: true; data: T } | { success: false; response: Response }> {
  const contentLength = c.req.header('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_BODY_BYTES) {
    return {
      success: false,
      response: c.json(
        { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1MB limit' } },
        413
      ),
    };
  }

  let json: unknown;
  try {
    const rawText = await c.req.text();
    if (rawText.length > MAX_BODY_BYTES) {
      return {
        success: false,
        response: c.json(
          { error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body exceeds 1MB limit' } },
          413
        ),
      };
    }
    json = rawText.trim() === '' ? {} : JSON.parse(rawText);
  } catch {
    return {
      success: false,
      response: c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid JSON body' } },
        400
      ),
    };
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    return {
      success: false,
      response: c.json({ error: { code: 'VALIDATION_ERROR', message } }, 400),
    };
  }

  return { success: true, data: result.data };
}

// Health check (available at /health and /api/health)
const getHealthPayload = () => {
  const llmStatus = llmClient?.status();
  const features = (process.env.LLM_FEATURES || '')
    .split(',')
    .map((f) => f.trim().toLowerCase())
    .filter(Boolean);

  return {
    ok: true,
    llm: {
      enabled: llmStatus?.enabled ?? false,
      model: llmStatus?.model ?? null,
      features,
      callsUsedThisHour: llmStatus?.callsUsedThisHour ?? 0,
      budget: llmStatus?.budget ?? parseInt(process.env.LLM_HOURLY_BUDGET || '150', 10),
    },
  };
};

app.get('/health', (c) => c.json(getHealthPayload()));
app.get('/api/health', (c) => c.json(getHealthPayload()));

// GET /api/novels -> list of available novels
app.get('/api/novels', (c) => {
  const list = Object.values(NOVELS_REGISTRY).map((n) => ({
    id: n.id,
    title: n.title,
    author: n.author,
    description: 'The beloved classic fable of Rabbit the Hare and Turtle the Tortoise.',
  }));
  return c.json(list);
});

// GET /api/novel -> current active Novel (read-only; novel switching is POST-only)
app.get('/api/novel', (c) => {
  return c.json(store.getNovel());
});

// POST /api/switch-novel { novelId } -> { novel, graph }
app.post('/api/switch-novel', async (c) => {
  const writeCheck = checkWritePermission(c);
  if (writeCheck) return writeCheck;

  const parsed = await parseJsonBody(c, SwitchNovelRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const novelId = parsed.data.novelId;
  if (!NOVELS_REGISTRY[novelId]) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: `Novel "${novelId}" not found` } },
      404
    );
  }

  store = new InMemoryGraphStore(NOVELS_REGISTRY[novelId]);
  return c.json({
    novel: store.getNovel(),
    graph: store.graphUpTo(store.getNovel().chapters.length),
  });
});

// GET /api/graph?upTo=N -> GraphData
app.get('/api/graph', (c) => {
  const upToParam = c.req.query('upTo');
  const novel = store.getNovel();
  const totalChapters = novel.chapters.length;

  let upTo = totalChapters;
  if (upToParam !== undefined && upToParam !== '') {
    if (!/^-?\d+$/.test(upToParam)) {
      return c.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Query parameter upTo must be an integer' } },
        400
      );
    }
    upTo = parseInt(upToParam, 10);
    if (upTo < 1 || upTo > totalChapters) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `upTo must be an integer between 1 and ${totalChapters}`,
          },
        },
        400
      );
    }
  }

  const graphData = store.graphUpTo(upTo);
  return c.json(graphData);
});

// POST /api/blast-radius {factId, patch} -> BlastReport (dry run, no mutation)
app.post('/api/blast-radius', async (c) => {
  const parsed = await parseJsonBody(c, BlastRadiusRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const previewExplainer = new TemplateExplainer();
    const report = await computeBlastRadius(store, parsed.data.factId, parsed.data.patch, previewExplainer);
    return c.json(report);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
    }
    throw err;
  }
});

// POST /api/edit-fact {factId, patch} -> {novel, report}
app.post('/api/edit-fact', async (c) => {
  const writeCheck = checkWritePermission(c);
  if (writeCheck) return writeCheck;

  const parsed = await parseJsonBody(c, EditFactRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const existingFact = store.getFact(parsed.data.factId);
    if (!existingFact) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Fact with id "${parsed.data.factId}" not found` } }, 404);
    }

    // Build candidate novel and run validateNovel before applying edit
    const candidateNovel = structuredClone(store.getNovel());
    const factIdx = candidateNovel.facts.findIndex((f) => f.id === parsed.data.factId);
    if (factIdx === -1) {
      return c.json({ error: { code: 'NOT_FOUND', message: `Fact with id "${parsed.data.factId}" not found` } }, 404);
    }
    candidateNovel.facts[factIdx] = {
      ...candidateNovel.facts[factIdx],
      ...parsed.data.patch,
      id: parsed.data.factId,
    };

    const validationErrors = validateNovel(candidateNovel);
    if (validationErrors.length > 0) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: `Candidate edit invalid: ${validationErrors.join('; ')}`,
          },
        },
        400
      );
    }

    const report = await computeBlastRadius(store, parsed.data.factId, parsed.data.patch, explainer);
    store.applyEdit(parsed.data.factId, parsed.data.patch);
    return c.json({
      novel: store.getNovel(),
      report,
    });
  } catch (err) {
    if (err instanceof NotFoundError) {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
    }
    if (err instanceof ValidationError) {
      return c.json({ error: { code: 'VALIDATION_ERROR', message: err.message } }, 400);
    }
    throw err;
  }
});

// POST /api/reset -> {novel}
app.post('/api/reset', async (c) => {
  const writeCheck = checkWritePermission(c);
  if (writeCheck) return writeCheck;

  const parsed = await parseJsonBody(c, ResetRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const targetId = c.req.query('novelId') || parsed.data.novelId;
  if (targetId && NOVELS_REGISTRY[targetId]) {
    store = new InMemoryGraphStore(NOVELS_REGISTRY[targetId]);
  } else {
    store.reset();
  }
  return c.json({ novel: store.getNovel() });
});

// POST /api/chat ChatRequest -> ChatResponse
app.post('/api/chat', async (c) => {
  // Rate limiting check
  const clientIp = getClientAddress(c);
  const throttle = aiRateLimiter.isLimited(clientIp);
  if (throttle.limited) {
    c.header('Retry-After', String(throttle.retryAfterSeconds));
    return c.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many chat requests. Please wait ${throttle.retryAfterSeconds}s before retrying.`,
        },
      },
      429
    );
  }

  const parsed = await parseJsonBody(c, ChatRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const response = await chatResponder.respond(parsed.data, store);
    return c.json(response);
  } catch (err) {
    if (err instanceof NotFoundError) {
      return c.json({ error: { code: 'NOT_FOUND', message: err.message } }, 404);
    }
    throw err;
  }
});

// POST /api/extract { manuscriptText } -> { facts, lines }
app.post('/api/extract', async (c) => {
  if (!isFeatureEnabled('extract')) {
    return c.json(
      {
        error: {
          code: 'FEATURE_DISABLED',
          message: 'Fact extraction is disabled. Enable it with LLM_FEATURES=extract.',
        },
      },
      404
    );
  }

  const clientIp = getClientAddress(c);
  const throttle = aiRateLimiter.isLimited(clientIp);
  if (throttle.limited) {
    c.header('Retry-After', String(throttle.retryAfterSeconds));
    return c.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many extract requests. Please wait ${throttle.retryAfterSeconds}s before retrying.`,
        },
      },
      429
    );
  }

  const parsed = await parseJsonBody(c, ExtractRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  try {
    const result = await factExtractor.extract(parsed.data.manuscriptText);
    return c.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Fact extraction failed';
    return c.json({ error: { code: 'EXTRACTION_ERROR', message } }, 500);
  }
});

// POST /api/voice { characterId, text, audioBase64? } -> { audioUrl?, mimeType?, pitch, rate }
app.post('/api/voice', async (c) => {
  // Rate limiting check
  const clientIp = getClientAddress(c);
  const throttle = aiRateLimiter.isLimited(clientIp);
  if (throttle.limited) {
    c.header('Retry-After', String(throttle.retryAfterSeconds));
    return c.json(
      {
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many voice requests. Please wait ${throttle.retryAfterSeconds}s before retrying.`,
        },
      },
      429
    );
  }

  const parsed = await parseJsonBody(c, VoiceRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const characterId = parsed.data.characterId ?? 'narrator';
  const text = parsed.data.text;

  // Persona voice modulation settings
  const voiceSettings: Record<string, { pitch: number; rate: number }> = {
    hare: { pitch: 1.15, rate: 1.2 },
    tortoise: { pitch: 0.9, rate: 0.85 },
    fox: { pitch: 1.0, rate: 1.05 },
    owl: { pitch: 0.85, rate: 0.9 },
  };

  const settings = voiceSettings[characterId] ?? { pitch: 1.0, rate: 1.0 };
  const result = await voiceResponder.speak(characterId, text);

  return c.json({
    characterId,
    text,
    pitch: settings.pitch,
    rate: settings.rate,
    audioUrl: result.audioUrl,
    mimeType: result.mimeType,
  });
});

// Single-Origin Static File Serving in Production
const findFrontendDist = (): string | null => {
  const candidates = [
    resolve(process.cwd(), 'frontend/dist'),
    resolve(process.cwd(), '../frontend/dist'),
    resolve(__dirname, '../../frontend/dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) {
      return dir;
    }
  }
  return null;
};

// SPA Static File Serving
app.get('*', async (c) => {
  const path = c.req.path;
  // If request is for an unhandled API endpoint, return 404 JSON
  if (path.startsWith('/api/')) {
    return c.json({ error: { code: 'NOT_FOUND', message: 'API route not found' } }, 404);
  }

  // In development mode, redirect browser page requests to Vite dev server (5173) for real-time HMR
  if (process.env.NODE_ENV !== 'production') {
    const accept = c.req.header('accept') || '';
    if (accept.includes('text/html') || path === '/' || path === '/index.html') {
      const host = c.req.header('host') || 'localhost:3001';
      const hostname = host.split(':')[0] || 'localhost';
      return c.redirect(`http://${hostname}:5173${path}`);
    }
  }

  const dist = findFrontendDist();
  if (!dist) {
    // In dev mode fallback to Vite dev server
    if (process.env.NODE_ENV !== 'production') {
      const host = c.req.header('host') || 'localhost:3001';
      const hostname = host.split(':')[0] || 'localhost';
      return c.redirect(`http://${hostname}:5173${path}`);
    }
    return c.json(
      {
        error: {
          code: 'FRONTEND_NOT_BUILT',
          message:
            'Frontend build not found. Please run "bun run build" to compile the production assets.',
        },
      },
      503
    );
  }

  const cleanPath = path === '/' ? 'index.html' : path.replace(/^\/+/, '');
  const filePath = resolve(dist, cleanPath);

  // Serve static file if found inside dist
  if (filePath.startsWith(dist) && existsSync(filePath)) {
    return new Response(Bun.file(filePath));
  }

  // SPA fallback: return index.html for client-side navigation
  const indexPath = resolve(dist, 'index.html');
  if (existsSync(indexPath)) {
    return new Response(Bun.file(indexPath), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return c.json({ error: { code: 'NOT_FOUND', message: 'Route not found' } }, 404);
});

const PORT = parseInt(process.env.PORT || '3001', 10);
// On Linux, the shell often sets $HOST to the hostname (e.g. localhost.localdomain),
// which prevents Bun from binding to IPv4 loopback (127.0.0.1) and breaks Vite proxying.
const isSystemHost =
  process.env.HOST === 'localhost.localdomain' ||
  (process.env.HOSTNAME && process.env.HOST === process.env.HOSTNAME);
const HOST = process.env.SERVER_HOST || (process.env.HOST && !isSystemHost ? process.env.HOST : '0.0.0.0');

if (import.meta.main) {
  console.log(`Brainfly server listening on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
}

export { app, store, explainer, chatResponder, voiceResponder, aiRateLimiter, llmClient };
export * from './engine/blast/explainer';
export * from './llm/index';
export * from './voice/VoiceResponder';

export default {
  port: PORT,
  hostname: HOST,
  fetch: app.fetch,
};
