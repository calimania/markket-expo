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

export type ApiError = {
  status: number;
  message: string;
};

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const segment = path.startsWith('/') ? path : `/${path}`;
  return `${base}${segment}`;
}

export async function apiGet<T>(
  path: string,
  options?: {
    baseUrl?: string;
    token?: string | null;
  },
): Promise<ApiResult<T>> {
  const url = buildUrl(options?.baseUrl ?? DEFAULT_API_BASE, path);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      return {
        ok: false,
        error: { status: response.status, message: `API error ${response.status}` },
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
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

export async function apiPost<T>(
  path: string,
  body: unknown,
  options?: {
    baseUrl?: string;
    token?: string | null;
  },
): Promise<ApiResult<T>> {
  const url = buildUrl(options?.baseUrl ?? DEFAULT_API_BASE, path);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: { status: response.status, message: `API error ${response.status}` },
      };
    }

    const data = (await response.json()) as T;
    return { ok: true, data };
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
