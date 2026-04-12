/**
 * Shared API client for the Markket app.
 *
 * All Strapi requests go through `apiGet` / `apiPost` so that base URL,
 * auth headers, and store-scoped filter conventions are applied consistently.
 *
 * GUARDRAILS:
 * - Store-scoped queries MUST include filters[store][slug][$eq] or
 *   filters[stores][slug][$eq] — never omit them except in discovery contexts.
 * - Multi-sort pattern: sort[0]=featured:desc&sort[1]=updatedAt:desc
 * - All list queries must include pagination[pageSize] + pagination[page].
 */

const DEFAULT_API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.markket.place';
let apiAuthToken = '';

export type ApiError = {
  status: number;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

type ApiRequestOptions = {
  baseUrl?: string;
  token?: string | null;
  headers?: Record<string, string>;
};

export function setApiAuthToken(token: string | null | undefined): void {
  apiAuthToken = typeof token === 'string' ? token.trim() : '';
}

export function clearApiAuthToken(): void {
  apiAuthToken = '';
}

export function getApiAuthToken(): string {
  return apiAuthToken;
}

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const segment = path.startsWith('/') ? path : `/${path}`;
  return `${base}${segment}`;
}

function resolveToken(optionToken: string | null | undefined): string {
  if (optionToken === null) return '';
  if (typeof optionToken === 'string') return optionToken.trim();
  return apiAuthToken;
}

function buildHeaders(options?: ApiRequestOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers ?? {}),
  };

  const token = resolveToken(options?.token);
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

async function parseApiResponse<T>(response: Response): Promise<ApiResult<T>> {
  if (!response.ok) {
    return {
      ok: false,
      error: { status: response.status, message: `API error ${response.status}` },
    };
  }

  const data = (await response.json()) as T;
  return { ok: true, data };
}

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  const url = buildUrl(options?.baseUrl ?? DEFAULT_API_BASE, path);
  const headers = buildHeaders(options);

  try {
    const response = await fetch(url, {
      ...(init ?? {}),
      headers: {
        ...headers,
        ...((init?.headers as Record<string, string> | undefined) ?? {}),
      },
    });

    return await parseApiResponse<T>(response);
  } catch (err) {
    return {
      ok: false,
      error: {
        status: 0,
        message: err instanceof Error ? err.message : 'Network error',
      },
    };
  }
}

export async function apiGet<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  return apiRequest<T>(path, { method: 'GET' }, options);
}

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  return apiRequest<T>(
    path,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    options
  );
}

export async function apiPut<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  return apiRequest<T>(
    path,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    options
  );
}

export async function apiPatch<T>(
  path: string,
  body: unknown,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  return apiRequest<T>(
    path,
    {
      method: 'PATCH',
      body: JSON.stringify(body),
    },
    options
  );
}

export async function apiDelete<T>(
  path: string,
  options?: ApiRequestOptions,
): Promise<ApiResult<T>> {
  return apiRequest<T>(path, { method: 'DELETE' }, options);
}
