import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'markket-community-app-config';

export const DEFAULT_API_BASE_URL = 'https://api.markket.place';
export const DEFAULT_DISPLAY_BASE_URL = 'https://markket.place/';
export const DEFAULT_STORE_SLUG = '';
export const DEFAULT_LINK_OPEN_MODE = 'ask' as const;
export const DEFAULT_STORES_QUERY =
  'populate[]=Logo&populate[]=URLS&sort[0]=updatedAt:desc&pagination[pageSize]=20';
export const DEFAULT_CONTENT_STORE_SLUG = process.env.EXPO_PUBLIC_CONTENT_STORE_SLUG?.trim() || 'markket';

export type LinkOpenMode = 'ask' | 'webview' | 'browser';

type AppConfigValue = {
  apiBaseUrl: string;
  displayBaseUrl: string;
  defaultStoreSlug: string;
  contentStoreSlug: string;
  linkOpenMode: LinkOpenMode;
  storesQuery: string;
  ready: boolean;
  setApiBaseUrl: (value: string) => void;
  setDisplayBaseUrl: (value: string) => void;
  setDefaultStoreSlug: (value: string) => void;
  setContentStoreSlug: (value: string) => void;
  setLinkOpenMode: (value: LinkOpenMode) => void;
  setStoresQuery: (value: string) => void;
  resetDefaults: () => void;
};

type PersistedConfig = {
  apiBaseUrl: string;
  displayBaseUrl: string;
  defaultStoreSlug: string;
  contentStoreSlug: string;
  linkOpenMode: LinkOpenMode;
  storesQuery: string;
};

const AppConfigContext = createContext<AppConfigValue | null>(null);

function withProtocol(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `https://${url}`;
}

function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;
  return withProtocol(trimmed).replace(/\/+$/, '');
}

function normalizeDisplayBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_DISPLAY_BASE_URL;

  const withScheme = withProtocol(trimmed).replace(/\/+$/, '');
  return `${withScheme}/`;
}

function normalizeStoreSlug(value: string): string {
  return value.trim().replace(/^\/+/, '').replace(/\/+$/, '');
}

function normalizeLinkOpenMode(value: unknown): LinkOpenMode {
  if (value === 'webview' || value === 'browser') {
    return value;
  }

  return 'ask';
}

function normalizeStoresQuery(value: string): string {
  const trimmed = value.trim().replace(/^\?+/, '').replace(/^&+/, '');
  return trimmed || DEFAULT_STORES_QUERY;
}

export function AppConfigProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [apiBaseUrl, setApiBaseUrlState] = useState(DEFAULT_API_BASE_URL);
  const [displayBaseUrl, setDisplayBaseUrlState] = useState(DEFAULT_DISPLAY_BASE_URL);
  const [defaultStoreSlug, setDefaultStoreSlugState] = useState(DEFAULT_STORE_SLUG);
  const [contentStoreSlug, setContentStoreSlugState] = useState(DEFAULT_CONTENT_STORE_SLUG);
  const [linkOpenMode, setLinkOpenModeState] = useState<LinkOpenMode>(DEFAULT_LINK_OPEN_MODE);
  const [storesQuery, setStoresQueryState] = useState(DEFAULT_STORES_QUERY);

  useEffect(() => {
    const load = async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) return;

        const parsed = JSON.parse(raw) as Partial<PersistedConfig>;

        if (typeof parsed.apiBaseUrl === 'string') {
          setApiBaseUrlState(normalizeApiBaseUrl(parsed.apiBaseUrl));
        }

        if (typeof parsed.displayBaseUrl === 'string') {
          setDisplayBaseUrlState(normalizeDisplayBaseUrl(parsed.displayBaseUrl));
        }

        if (typeof parsed.defaultStoreSlug === 'string') {
          setDefaultStoreSlugState(normalizeStoreSlug(parsed.defaultStoreSlug));
        }

        if (typeof parsed.contentStoreSlug === 'string') {
          setContentStoreSlugState(normalizeStoreSlug(parsed.contentStoreSlug));
        }

        if (parsed.linkOpenMode) {
          setLinkOpenModeState(normalizeLinkOpenMode(parsed.linkOpenMode));
        }

        if (typeof parsed.storesQuery === 'string') {
          setStoresQueryState(normalizeStoresQuery(parsed.storesQuery));
        }
      } catch {
        // Ignore invalid local settings and keep defaults.
      } finally {
        setReady(true);
      }
    };

    load();
  }, []);

  useEffect(() => {
    if (!ready) return;

    const persist = async () => {
      const value: PersistedConfig = {
        apiBaseUrl,
        displayBaseUrl,
        defaultStoreSlug,
        contentStoreSlug,
        linkOpenMode,
        storesQuery,
      };

      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      } catch {
        // Failing to persist should not block app usage.
      }
    };

    persist();
  }, [apiBaseUrl, contentStoreSlug, displayBaseUrl, defaultStoreSlug, linkOpenMode, ready, storesQuery]);

  const setApiBaseUrl = useCallback((value: string) => {
    setApiBaseUrlState(normalizeApiBaseUrl(value));
  }, []);

  const setDisplayBaseUrl = useCallback((value: string) => {
    setDisplayBaseUrlState(normalizeDisplayBaseUrl(value));
  }, []);

  const setDefaultStoreSlug = useCallback((value: string) => {
    setDefaultStoreSlugState(normalizeStoreSlug(value));
  }, []);

  const setContentStoreSlug = useCallback((value: string) => {
    setContentStoreSlugState(normalizeStoreSlug(value));
  }, []);

  const setLinkOpenMode = useCallback((value: LinkOpenMode) => {
    setLinkOpenModeState(normalizeLinkOpenMode(value));
  }, []);

  const setStoresQuery = useCallback((value: string) => {
    setStoresQueryState(normalizeStoresQuery(value));
  }, []);

  const resetDefaults = useCallback(() => {
    setApiBaseUrlState(DEFAULT_API_BASE_URL);
    setDisplayBaseUrlState(DEFAULT_DISPLAY_BASE_URL);
    setDefaultStoreSlugState(DEFAULT_STORE_SLUG);
    setContentStoreSlugState(DEFAULT_CONTENT_STORE_SLUG);
    setLinkOpenModeState(DEFAULT_LINK_OPEN_MODE);
    setStoresQueryState(DEFAULT_STORES_QUERY);
  }, []);

  const contextValue = useMemo(
    () => ({
      apiBaseUrl,
      displayBaseUrl,
      defaultStoreSlug,
      contentStoreSlug,
      linkOpenMode,
      storesQuery,
      ready,
      setApiBaseUrl,
      setDisplayBaseUrl,
      setDefaultStoreSlug,
      setContentStoreSlug,
      setLinkOpenMode,
      setStoresQuery,
      resetDefaults,
    }),
    [
      apiBaseUrl,
      displayBaseUrl,
      defaultStoreSlug,
      contentStoreSlug,
      linkOpenMode,
      storesQuery,
      ready,
      resetDefaults,
      setApiBaseUrl,
      setDisplayBaseUrl,
      setDefaultStoreSlug,
      setContentStoreSlug,
      setLinkOpenMode,
      setStoresQuery,
    ]
  );

  return <AppConfigContext.Provider value={contextValue}>{children}</AppConfigContext.Provider>;
}

export function useAppConfig() {
  const context = useContext(AppConfigContext);
  if (!context) {
    throw new Error('useAppConfig must be used inside AppConfigProvider');
  }

  return context;
}
