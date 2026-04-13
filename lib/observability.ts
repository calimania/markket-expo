import { PostHog } from 'posthog-react-native';

type EventProperties = Record<string, string | number | boolean | null | undefined>;

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonRecord = Record<string, JsonValue>;

let initialized = false;
let posthog: PostHog | null = null;
let patchedFetch = false;
const ignoredTelemetryOrigins = new Set<string>();
let currentScreenPath = '/';
let posthogUiHost = 'https://us.posthog.com';

function cleanText(value: string | undefined): string {
  return (value || '').trim();
}

function sanitizeUrl(rawUrl: string): string {
  const clean = cleanText(rawUrl);
  if (!clean) return '';
  try {
    const parsed = new URL(clean);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return clean.split('?')[0] || clean;
  }
}

function getOrigin(rawUrl: string): string {
  const clean = cleanText(rawUrl);
  if (!clean) return '';
  try {
    return new URL(clean).origin;
  } catch {
    return '';
  }
}

function getUrlFromRequest(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();

  const maybeRequest = input as Request;
  return cleanText(maybeRequest.url || '');
}

function getMethod(input: RequestInfo | URL, init?: RequestInit): string {
  const methodFromInit = cleanText(init?.method || '');
  if (methodFromInit) return methodFromInit.toUpperCase();

  if (typeof input === 'object' && !(input instanceof URL)) {
    const maybeRequest = input as Request;
    const methodFromRequest = cleanText(maybeRequest.method || '');
    if (methodFromRequest) return methodFromRequest.toUpperCase();
  }

  return 'GET';
}

function toJsonRecord(properties: EventProperties): JsonRecord {
  const next: JsonRecord = {};
  Object.entries(properties).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      next[key] = value;
    }
  });
  return next;
}

function withScreenContext(properties: EventProperties): EventProperties {
  const screen = cleanText(currentScreenPath) || '/';
  const uiHost = cleanText(posthogUiHost);
  return {
    screen,
    url: screen,
    $screen_name: screen,
    $current_url: screen,
    posthog_ui_host: uiHost || undefined,
    ...properties,
  };
}

function captureHttpFailure(eventName: string, properties: EventProperties) {
  const payload = toJsonRecord(withScreenContext(properties));

  if (posthog) {
    posthog.capture(eventName, payload);
  }
}

function patchFetchOnce() {
  if (patchedFetch) return;
  if (typeof globalThis.fetch !== 'function') return;

  const originalFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const startedAt = Date.now();
    const rawUrl = getUrlFromRequest(input);
    const url = sanitizeUrl(rawUrl);
    const method = getMethod(input, init);
    const requestOrigin = getOrigin(rawUrl);

    if (!rawUrl || (requestOrigin && ignoredTelemetryOrigins.has(requestOrigin))) {
      return originalFetch(input, init);
    }

    try {
      const response = await originalFetch(input, init);
      const elapsedMs = Date.now() - startedAt;

      if (!response.ok) {
        captureHttpFailure('http_response_not_ok', {
          method,
          url,
          status: response.status,
          elapsedMs,
        });
      }

      return response;
    } catch (error) {
      const elapsedMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : 'Unknown network error';

      captureHttpFailure('http_request_failed', {
        method,
        url,
        elapsedMs,
        message,
      });

      throw error;
    }
  };

  patchedFetch = true;
}

export function initObservability() {
  if (initialized) return;

  const posthogApiKey = cleanText(process.env.EXPO_PUBLIC_POSTHOG_API_KEY);
  const posthogHostRaw = cleanText(process.env.EXPO_PUBLIC_POSTHOG_API_HOST || process.env.EXPO_PUBLIC_POSTHOG_HOST);
  posthogUiHost = cleanText(process.env.EXPO_PUBLIC_POSTHOG_UI_HOST) || 'https://us.posthog.com';
  const posthogHost =
    posthogHostRaw === 'https://app.posthog.com' || posthogHostRaw === 'http://app.posthog.com'
      ? 'https://us.i.posthog.com'
      : posthogHostRaw || 'https://us.i.posthog.com';

  if (posthogApiKey) {
    const posthogOrigin = getOrigin(posthogHost);
    if (posthogOrigin) {
      ignoredTelemetryOrigins.add(posthogOrigin);
    }

    posthog = new PostHog(posthogApiKey, {
      host: posthogHost,
      captureAppLifecycleEvents: true,
      disabled: false,
    });
  }

  patchFetchOnce();
  initialized = true;
}

export function trackAppEvent(name: string, properties?: EventProperties) {
  if (!posthog) return;
  posthog.capture(name, toJsonRecord(withScreenContext(properties || {})));
}

export function setCurrentScreen(path: string) {
  const cleanPath = cleanText(path) || '/';
  currentScreenPath = cleanPath;
}
