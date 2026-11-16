import type { FetchFunction } from './types';

interface ModelListItem {
  id?: string;
}

interface ModelsResponse {
  data?: ModelListItem[];
}

export interface PickFreeModelOptions {
  baseUrl: string;
  fetchFn?: FetchFunction;
  preferred?: string;
  blocklist?: string[];
}

let cachedModel: { model: string | null; expiresAt: number } | null = null;

export function clearModelCache(): void {
  cachedModel = null;
}

export async function pickFreeModel(opts: PickFreeModelOptions): Promise<string | null> {
  const blocklist = (
    opts.blocklist ??
    (process.env.KILO_MODEL_BLOCKLIST
      ? process.env.KILO_MODEL_BLOCKLIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
      : ['nvidia'])
  ).map((b) => b.toLowerCase());

  const preferred = opts.preferred ?? (process.env.KILO_MODEL ? process.env.KILO_MODEL.trim() : undefined);

  if (preferred) {
    const isBlocked = blocklist.some((blocked) => preferred.toLowerCase().includes(blocked));
    if (isBlocked) {
      console.warn(`Preferred model "${preferred}" matches blocked term; ignoring.`);
    } else {
      return preferred;
    }
  }

  const now = Date.now();
  if (cachedModel && now < cachedModel.expiresAt) {
    return cachedModel.model;
  }

  const fetchFn = opts.fetchFn || fetch;
  const url = `${opts.baseUrl.replace(/\/+$/, '')}/models`;

  const headers: Record<string, string> = {};
  if (process.env.KILO_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.KILO_API_KEY}`;
  }

  try {
    const res = await fetchFn(url, {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      cachedModel = { model: null, expiresAt: now + 3600_000 };
      return null;
    }

    const json = (await res.json()) as ModelsResponse;
    const items = json?.data ?? [];

    const freeModels = items
      .map((item) => item.id)
      .filter((id): id is string => typeof id === 'string' && id.endsWith(':free'))
      .filter((id) => !blocklist.some((blocked) => id.toLowerCase().includes(blocked)));

    const selected = freeModels[0] ?? null;
    cachedModel = { model: selected, expiresAt: now + 3600_000 };
    return selected;
  } catch {
    cachedModel = { model: null, expiresAt: now + 3600_000 };
    return null;
  }
}
