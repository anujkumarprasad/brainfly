import type {
  BlastReport,
  ChatRequest,
  ChatResponse,
  EditFactResponse,
  FactPatch,
  GraphData,
  Novel,
  ResetResponse,
} from '@bl/shared';

export class ApiClientError extends Error {
  code: string;
  status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

const BASE_URL = typeof window !== 'undefined' ? '' : 'http://localhost:3001';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options?.headers ?? {}),
      },
    });
  } catch (err) {
    throw new ApiClientError(
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network request failed',
      0
    );
  }

  if (!res.ok) {
    let errorCode = 'API_ERROR';
    let errorMessage = `HTTP ${res.status}: ${res.statusText}`;
    try {
      const errorJson = await res.json();
      if (errorJson && typeof errorJson === 'object' && 'error' in errorJson) {
        errorCode = errorJson.error.code ?? errorCode;
        errorMessage = errorJson.error.message ?? errorMessage;
      }
    } catch {
      // Body was not JSON
    }
    throw new ApiClientError(errorCode, errorMessage, res.status);
  }

  return (await res.json()) as T;
}

export interface NovelSummary {
  id: string;
  title: string;
  author: string;
  description: string;
}

export const api = {
  getNovels(): Promise<NovelSummary[]> {
    return request<NovelSummary[]>('/api/novels');
  },

  getNovel(): Promise<Novel> {
    return request<Novel>('/api/novel');
  },

  switchNovel(novelId: string): Promise<{ novel: Novel; graph: GraphData }> {
    return request<{ novel: Novel; graph: GraphData }>('/api/switch-novel', {
      method: 'POST',
      body: JSON.stringify({ novelId }),
    });
  },

  getGraph(upTo?: number): Promise<GraphData> {
    const query = upTo !== undefined ? `?upTo=${upTo}` : '';
    return request<GraphData>(`/api/graph${query}`);
  },

  blastRadius(factId: string, patch: FactPatch): Promise<BlastReport> {
    return request<BlastReport>('/api/blast-radius', {
      method: 'POST',
      body: JSON.stringify({ factId, patch }),
    });
  },

  editFact(factId: string, patch: FactPatch): Promise<EditFactResponse> {
    return request<EditFactResponse>('/api/edit-fact', {
      method: 'POST',
      body: JSON.stringify({ factId, patch }),
    });
  },

  reset(novelId?: string): Promise<ResetResponse> {
    return request<ResetResponse>('/api/reset', {
      method: 'POST',
      body: JSON.stringify(novelId ? { novelId } : {}),
    });
  },

  chat(req: ChatRequest): Promise<ChatResponse> {
    return request<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(req),
    });
  },
};
