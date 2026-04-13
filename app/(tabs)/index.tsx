import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ListRenderItem,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { SkeletonBlock, SkeletonCard } from '@/components/ui/skeleton';
import { BrandColors, Colors } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';
import { useAppConfig } from '@/hooks/use-app-config';
import { apiGet } from '@/lib/api';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type StoreUrl = {
  id: number;
  Label: string;
  URL: string;
};

type StoreLogoFormat = {
  url: string;
};

type StoreLogo = {
  url: string;
  formats?: {
    small?: StoreLogoFormat;
    thumbnail?: StoreLogoFormat;
  };
} | null;

type Store = {
  id: number;
  title: string;
  slug: string;
  active: boolean;
  updatedAt?: string;
  Description: string | null;
  locale: string;
  Logo: StoreLogo;
  URLS: StoreUrl[];
};

type Article = {
  id: number;
  slug?: string;
  Title?: string;
  updatedAt?: string;
  cover?: {
    url?: string;
    formats?: {
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  store?: { slug?: string; title?: string } | null;
  SEO?: {
    socialImage?: {
      url?: string;
      formats?: {
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    } | null;
  } | null;
};

type ArticlesApiResponse = {
  data: Article[];
};

type Product = {
  id: number;
  slug?: string;
  Name?: string;
  updatedAt?: string;
  PRICES?: { price?: number; currency?: string }[];
  prices?: { price?: number; currency?: string }[];
  Thumbnail?: {
    url?: string;
    formats?: {
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  thumbnail?: {
    url?: string;
    formats?: {
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  Slides?: {
    url?: string;
    formats?: {
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  }[] | null;
  slides?: {
    url?: string;
    formats?: {
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  }[] | null;
  SEO?: {
    metaUrl?: string | null;
    socialImage?: {
      url?: string;
      formats?: {
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    } | null;
  } | null;
  stores?: { slug?: string; title?: string }[] | null;
};

type ProductsApiResponse = {
  data: Product[];
};

type Event = {
  id: number;
  slug?: string;
  Name?: string;
  Description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  usd_price?: number | null;
  maxCapacity?: number | null;
  PRICES?: { price?: number; currency?: string }[] | null;
  Thumbnail?: {
    url?: string;
    formats?: {
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  SEO?: {
    metaUrl?: string | null;
    socialImage?: {
      url?: string;
      formats?: {
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    } | null;
  } | null;
  stores?: { slug?: string; title?: string }[] | null;
};

type EventsApiResponse = {
  data: Event[];
};

type Page = {
  id: number;
  slug?: string;
  title?: string;
  Title?: string;
  updatedAt?: string;
  SEO?: {
    socialImage?: {
      url?: string;
      formats?: {
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    } | null;
  } | null;
  store?: { slug?: string; title?: string } | null;
};

type PagesApiResponse = {
  data: Page[];
};

type HomeCopy = {
  headerTitle: string;
  headerSubtitle: string;
  featuredLabel: string;
  articlesLabel: string;
  articlesMeta: string;
  productsLabel: string;
  productsMeta: string;
  storiesLabel: string;
  storiesMeta: string;
  eventsLabel: string;
  eventsMeta: string;
};

type HomeSnapshotCache = {
  savedAt: number;
  activeStores: Store[];
  articles: Article[];
  products: Product[];
  pages: Page[];
  events: Event[];
};

const HOME_SNAPSHOT_CACHE_KEY = 'markket-home-snapshot-v1';
const HOME_SNAPSHOT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

const DEFAULT_HOME_COPY: HomeCopy = {
  headerTitle: 'markket',
  headerSubtitle: '',
  featuredLabel: 'Featured',
  articlesLabel: 'Latest Articles',
  articlesMeta: 'across all stores',
  productsLabel: 'Discover New Products',
  productsMeta: 'across all stores',
  storiesLabel: 'Stories & Guides',
  storiesMeta: 'from all stores',
  eventsLabel: 'Upcoming Events',
  eventsMeta: 'sorted by date',
};

type StoresApiResponse = {
  data: Store[];
  meta?: {
    pagination?: {
      page: number;
      pageCount: number;
      pageSize: number;
      total: number;
    };
  };
};

function createStoresPath(query: string, page: number, searchTerm?: string): string {
  const params = new URLSearchParams(query);

  const normalizedSearch = (searchTerm || '').trim();
  if (normalizedSearch) {
    params.set('filters[$or][0][title][$containsi]', normalizedSearch);
    params.set('filters[$or][1][slug][$containsi]', normalizedSearch);
  } else {
    params.delete('filters[$or][0][title][$containsi]');
    params.delete('filters[$or][1][slug][$containsi]');
  }

  params.set('pagination[page]', String(page));
  params.set('sort[0]', 'updatedAt:desc');
  const search = params.toString();
  return `/api/stores${search ? `?${search}` : ''}`;
}

function getUpdatedAtTime(store: Store): number {
  if (!store.updatedAt) return 0;
  const parsed = Date.parse(store.updatedAt);
  return Number.isFinite(parsed) ? parsed : 0;
}

function previewDescription(description: string | null): string {
  if (!description) return '';

  return description
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#*_~`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getLogoUrl(logo: StoreLogo): string | null {
  if (!logo) return null;
  return logo.formats?.small?.url ?? logo.formats?.thumbnail?.url ?? logo.url ?? null;
}

function getTintColors(storeId: number): { top: string; bottom: string } {
  const palette = [
    { top: '#E8F4FF', bottom: '#D8ECFF' },
    { top: '#F4FDE8', bottom: '#E4F8CF' },
    { top: '#FFF2DF', bottom: '#FFE5C2' },
    { top: '#F5ECFF', bottom: '#ECDCFF' },
    { top: '#FFE9F1', bottom: '#FFD8E8' },
  ];

  return palette[storeId % palette.length];
}

function getThumbnailUrl(image: { url?: string; formats?: { small?: { url?: string }; thumbnail?: { url?: string } } } | null): string | null {
  if (!image) return null;
  return image.formats?.small?.url ?? image.formats?.thumbnail?.url ?? image.url ?? null;
}

function dedupeSlides<T extends { url?: string; formats?: { small?: { url?: string }; thumbnail?: { url?: string } } }>(
  items: T[] | null | undefined
): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const seen = new Set<string>();
  const deduped: T[] = [];

  items.forEach((item, index) => {
    const identity = (item.formats?.small?.url ?? item.formats?.thumbnail?.url ?? item.url ?? '').trim() || `index:${index}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    deduped.push(item);
  });

  return deduped;
}

function formatEventDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function normalizeCopyValue(value: unknown, fallback: string, maxLength = 64): string {
  if (typeof value !== 'string') return fallback;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return fallback;
  return clean.slice(0, maxLength);
}

function readStringField(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === 'string' ? value : '';
}

function normalizeSlug(value: string | undefined | null): string {
  return (value || '').trim().toLowerCase();
}

function resolveHomeCopy(page: Page | null): HomeCopy {
  if (!page) return DEFAULT_HOME_COPY;

  const record = page as unknown as Record<string, unknown>;
  const ui = typeof record.ui === 'object' && record.ui ? (record.ui as Record<string, unknown>) : {};
  const labels = typeof record.labels === 'object' && record.labels ? (record.labels as Record<string, unknown>) : {};

  const headerTitleRaw =
    readStringField(record, 'homeTitle') ||
    readStringField(record, 'title') ||
    readStringField(record, 'Title') ||
    readStringField(ui, 'headerTitle');

  const headerSubtitleRaw =
    readStringField(record, 'homeSubtitle') ||
    readStringField(record, 'subtitle') ||
    readStringField(ui, 'headerSubtitle');

  const articlesLabel = normalizeCopyValue(
    readStringField(record, 'articlesLabel') || readStringField(labels, 'articles') || readStringField(ui, 'articlesLabel'),
    DEFAULT_HOME_COPY.articlesLabel,
    40,
  );
  const storiesLabelCandidate = normalizeCopyValue(
    readStringField(record, 'storiesLabel') || readStringField(labels, 'stories') || readStringField(ui, 'storiesLabel'),
    DEFAULT_HOME_COPY.storiesLabel,
    40,
  );
  const storiesLabel =
    storiesLabelCandidate.trim().toLowerCase() === articlesLabel.trim().toLowerCase()
      ? DEFAULT_HOME_COPY.storiesLabel
      : storiesLabelCandidate;

  return {
    headerTitle: normalizeCopyValue(headerTitleRaw, DEFAULT_HOME_COPY.headerTitle, 28),
    headerSubtitle: normalizeCopyValue(headerSubtitleRaw, DEFAULT_HOME_COPY.headerSubtitle, 80),
    featuredLabel: normalizeCopyValue(
      readStringField(record, 'featuredLabel') || readStringField(labels, 'featured') || readStringField(ui, 'featuredLabel'),
      DEFAULT_HOME_COPY.featuredLabel,
      28,
    ),
    articlesLabel,
    articlesMeta: normalizeCopyValue(readStringField(ui, 'articlesMeta'), DEFAULT_HOME_COPY.articlesMeta, 48),
    productsLabel: normalizeCopyValue(
      readStringField(record, 'productsLabel') || readStringField(labels, 'products') || readStringField(ui, 'productsLabel'),
      DEFAULT_HOME_COPY.productsLabel,
      40,
    ),
    productsMeta: normalizeCopyValue(readStringField(ui, 'productsMeta'), DEFAULT_HOME_COPY.productsMeta, 48),
    storiesLabel,
    storiesMeta: normalizeCopyValue(readStringField(ui, 'storiesMeta'), DEFAULT_HOME_COPY.storiesMeta, 48),
    eventsLabel: normalizeCopyValue(
      readStringField(record, 'eventsLabel') || readStringField(labels, 'events') || readStringField(ui, 'eventsLabel'),
      DEFAULT_HOME_COPY.eventsLabel,
      40,
    ),
    eventsMeta: normalizeCopyValue(readStringField(ui, 'eventsMeta'), DEFAULT_HOME_COPY.eventsMeta, 48),
  };
}

export default function HomeScreen() {
  const router = useRouter();
  const { apiBaseUrl, linkOpenMode, ready, storesQuery, defaultStoreSlug, contentStoreSlug } = useAppConfig();
  const insets = useSafeAreaInsets();
  const targetStoreSlug = normalizeSlug(defaultStoreSlug);
  const fallbackContentSlug = normalizeSlug(contentStoreSlug);

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showSearch, setShowSearch] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [homeCopy, setHomeCopy] = useState<HomeCopy>(DEFAULT_HOME_COPY);
  const searchInputRef = useRef<TextInput | null>(null);
  const cacheRef = useRef<HomeSnapshotCache | null>(null);
  const useSnapshotFirstRef = useRef(false);

  const persistSnapshot = useCallback(
    (partial: Partial<Omit<HomeSnapshotCache, 'savedAt'>>) => {
      const current =
        cacheRef.current ??
        ({
          savedAt: Date.now(),
          activeStores: [],
          articles: [],
          products: [],
          pages: [],
          events: [],
        } as HomeSnapshotCache);

      const next: HomeSnapshotCache = {
        ...current,
        ...partial,
        savedAt: Date.now(),
      };

      cacheRef.current = next;
      void AsyncStorage.setItem(HOME_SNAPSHOT_CACHE_KEY, JSON.stringify(next)).catch(() => undefined);
    },
    []
  );

  const loadStores = useCallback(async (targetPage: number, mode: 'replace' | 'append' = 'replace') => {
    if (!ready) return;

    setError(null);

    try {
      const result = await apiGet<StoresApiResponse>(createStoresPath(storesQuery, targetPage, activeSearch), {
        baseUrl: apiBaseUrl,
      });

      if (!result.ok) {
        throw new Error(`Could not load stores (${result.error.status})`);
      }

      const payload = result.data;
      const nextStores = payload.data ?? [];

      setStores((current) => {
        if (mode === 'replace') return nextStores;

        const seen = new Set(current.map((item) => item.id));
        const additions = nextStores.filter((item) => !seen.has(item.id));
        return [...current, ...additions];
      });

      setPage(payload.meta?.pagination?.page ?? targetPage);
      setPageCount(payload.meta?.pagination?.pageCount ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error while loading stores');
    } finally {
      if (mode === 'replace') {
        setLoading(false);
      }

      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [activeSearch, apiBaseUrl, ready, storesQuery]);

  useEffect(() => {
    if (!ready) return;

    setLoading(true);
    setStores([]);
    setPage(1);
    setPageCount(1);
    loadStores(1, 'replace');
  }, [apiBaseUrl, loadStores, ready, storesQuery, activeSearch]);

  const [activeStores, setActiveStores] = useState<Store[]>([]);
  const [activeStoresLoading, setActiveStoresLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function hydrateSnapshot() {
      try {
        const raw = await AsyncStorage.getItem(HOME_SNAPSHOT_CACHE_KEY);
        if (!raw || cancelled) return;

        const parsed = JSON.parse(raw) as Partial<HomeSnapshotCache>;
        if (typeof parsed.savedAt !== 'number') return;
        if (Date.now() - parsed.savedAt > HOME_SNAPSHOT_MAX_AGE_MS) return;

        const cachedActiveStores = Array.isArray(parsed.activeStores) ? parsed.activeStores : [];
        const cachedArticles = Array.isArray(parsed.articles) ? parsed.articles : [];
        const cachedProducts = Array.isArray(parsed.products) ? parsed.products : [];
        const cachedPages = Array.isArray(parsed.pages) ? parsed.pages : [];
        const cachedEvents = Array.isArray(parsed.events) ? parsed.events : [];

        cacheRef.current = {
          savedAt: parsed.savedAt,
          activeStores: cachedActiveStores,
          articles: cachedArticles,
          products: cachedProducts,
          pages: cachedPages,
          events: cachedEvents,
        };

        const hasCachedContent =
          cachedActiveStores.length > 0 ||
          cachedArticles.length > 0 ||
          cachedProducts.length > 0 ||
          cachedPages.length > 0 ||
          cachedEvents.length > 0;
        useSnapshotFirstRef.current = hasCachedContent;

        setActiveStores(cachedActiveStores);
        setArticles(cachedArticles);
        setProducts(cachedProducts);
        setPages(cachedPages);
        setEvents(cachedEvents);

        setActiveStoresLoading(false);
        setArticlesLoading(false);
        setProductsLoading(false);
        setPagesLoading(false);
        setEventsLoading(false);
      } catch {
        // Ignore malformed snapshots.
      }
    }

    void hydrateSnapshot();

    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    if (refreshKey === 0 && useSnapshotFirstRef.current) return;
    setActiveStoresLoading(true);
    const url = `/api/stores?filters[active][$eq]=true&sort[0]=updatedAt:desc&populate[]=Logo&populate[]=URLS&pagination[pageSize]=20`;
    apiGet<StoresApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data) {
          const next = result.data.data ?? [];
          setActiveStores(next);
          persistSnapshot({ activeStores: next });
        } else {
          setActiveStores([]);
          persistSnapshot({ activeStores: [] });
        }
      })
      .catch(() => { })
      .finally(() => setActiveStoresLoading(false));
  }, [apiBaseUrl, persistSnapshot, ready, refreshKey]);

  const activeSortedStores = useMemo(
    () =>
      activeStores.sort((a, b) => getUpdatedAtTime(b) - getUpdatedAtTime(a)),
    [activeStores]
  );

  const featuredStore = activeSortedStores[0] ?? null;
  const thumbStores = activeSortedStores.slice(1, 9);
  const listStores = stores;
  const isSearchActive = activeSearch.trim().length > 0;

  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (refreshKey === 0 && useSnapshotFirstRef.current) return;
    setArticlesLoading(true);
    const url = `/api/articles?sort[0]=updatedAt:desc&populate[]=cover&populate[]=store&pagination[pageSize]=8`;
    apiGet<ArticlesApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data) {
          const next = result.data.data;
          setArticles(next);
          persistSnapshot({ articles: next });
        } else {
          setArticles([]);
          persistSnapshot({ articles: [] });
        }
      })
      .catch(() => setArticles([]))
      .finally(() => setArticlesLoading(false));
  }, [apiBaseUrl, persistSnapshot, ready, refreshKey]);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (refreshKey === 0 && useSnapshotFirstRef.current) return;
    setProductsLoading(true);
    const url = `/api/products?sort[0]=updatedAt:desc&populate[]=PRICES&populate[]=SEO.socialImage&populate[]=Thumbnail&populate[]=Slides&populate[]=stores&pagination[pageSize]=8`;
    apiGet<ProductsApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data) {
          const next = result.data.data;
          setProducts(next);
          persistSnapshot({ products: next });
        } else {
          setProducts([]);
          persistSnapshot({ products: [] });
        }
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [apiBaseUrl, persistSnapshot, ready, refreshKey]);

  const [pages, setPages] = useState<Page[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    const requests = [
      '/api/pages?filters[slug][$eq]=home&filters[active][$eq]=true&populate[]=store&pagination[pageSize]=25',
      '/api/pages?filters[slug][$eq]=home&populate[]=store&pagination[pageSize]=25',
      '/api/pages?filters[slug]=home&populate[]=store&pagination[pageSize]=25',
      '/api/pages?filter[slug][$eq]=home&populate[]=store&pagination[pageSize]=25',
      '/api/pages?filter[slug]=home&populate[]=store&pagination[pageSize]=25',
    ];

    async function loadHomeCopy() {
      for (const path of requests) {
        const result = await apiGet<PagesApiResponse>(path, { baseUrl: apiBaseUrl });
        if (!result.ok) continue;

        const rows = result.data?.data ?? [];
        if (!rows.length) continue;

        const preferred =
          rows.find((entry) => normalizeSlug(entry.store?.slug) === targetStoreSlug) ||
          rows.find((entry) => normalizeSlug(entry.store?.slug) === fallbackContentSlug) ||
          rows.find((entry) => !normalizeSlug(entry.store?.slug)) ||
          rows[0] ||
          null;
        if (!preferred) continue;

        if (!cancelled) {
          setHomeCopy(resolveHomeCopy(preferred));
        }
        return;
      }

      if (!cancelled) {
        setHomeCopy(DEFAULT_HOME_COPY);
      }
    }

    void loadHomeCopy();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, ready, refreshKey, targetStoreSlug, fallbackContentSlug]);

  useEffect(() => {
    if (!ready) return;
    if (refreshKey === 0 && useSnapshotFirstRef.current) return;
    setPagesLoading(true);
    const url = `/api/pages?sort[0]=updatedAt:desc&populate[]=SEO.socialImage&populate[]=store&pagination[pageSize]=8`;
    apiGet<PagesApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data) {
          const next = result.data.data;
          setPages(next);
          persistSnapshot({ pages: next });
        } else {
          setPages([]);
          persistSnapshot({ pages: [] });
        }
      })
      .catch(() => setPages([]))
      .finally(() => setPagesLoading(false));
  }, [apiBaseUrl, persistSnapshot, ready, refreshKey]);

  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (refreshKey === 0 && useSnapshotFirstRef.current) return;
    setEventsLoading(true);
    // Show events from yesterday onward so today's events still appear
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const since = yesterday.toISOString().slice(0, 10); // YYYY-MM-DD, no colons
    const url = `/api/events?sort[0]=startDate:asc&filters[startDate][$gte]=${since}&populate[]=PRICES&populate[]=SEO&populate[]=stores&populate[]=Thumbnail&pagination[pageSize]=10`;
    console.log('[events] fetching', { url, apiBaseUrl });
    apiGet<EventsApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data) {
          console.log('[events] loaded', result.data.data.length, 'events');
          const next = result.data.data.filter((item) => {
            const storeSlugs = (item.stores || []).map((entry) => normalizeSlug(entry?.slug));
            return !targetStoreSlug || storeSlugs.includes(targetStoreSlug);
          });
          setEvents(next);
          persistSnapshot({ events: next });
        } else {
          console.warn('[events] bad result', result);
          setEvents([]);
          persistSnapshot({ events: [] });
        }
      })
      .catch((err) => {
        console.error('[events] fetch error', err);
        setEvents([]);
        persistSnapshot({ events: [] });
      })
      .finally(() => setEventsLoading(false));
  }, [apiBaseUrl, persistSnapshot, ready, refreshKey, targetStoreSlug]);

  // Debounce loading states to avoid flashing skeletons on quick loads (>400ms)
  const [debouncedActiveStoresLoading, setDebouncedActiveStoresLoading] = useState(true);
  const [debouncedArticlesLoading, setDebouncedArticlesLoading] = useState(true);
  const [debouncedProductsLoading, setDebouncedProductsLoading] = useState(true);
  const [debouncedPagesLoading, setDebouncedPagesLoading] = useState(true);
  const [debouncedEventsLoading, setDebouncedEventsLoading] = useState(true);

  useEffect(() => {
    if (!activeStoresLoading) {
      setDebouncedActiveStoresLoading(false);
      return;
    }
    const timer = setTimeout(() => setDebouncedActiveStoresLoading(true), 400);
    return () => clearTimeout(timer);
  }, [activeStoresLoading]);

  useEffect(() => {
    if (!articlesLoading) {
      setDebouncedArticlesLoading(false);
      return;
    }
    const timer = setTimeout(() => setDebouncedArticlesLoading(true), 400);
    return () => clearTimeout(timer);
  }, [articlesLoading]);

  useEffect(() => {
    if (!productsLoading) {
      setDebouncedProductsLoading(false);
      return;
    }
    const timer = setTimeout(() => setDebouncedProductsLoading(true), 400);
    return () => clearTimeout(timer);
  }, [productsLoading]);

  useEffect(() => {
    if (!pagesLoading) {
      setDebouncedPagesLoading(false);
      return;
    }
    const timer = setTimeout(() => setDebouncedPagesLoading(true), 400);
    return () => clearTimeout(timer);
  }, [pagesLoading]);

  useEffect(() => {
    if (!eventsLoading) {
      setDebouncedEventsLoading(false);
      return;
    }
    const timer = setTimeout(() => setDebouncedEventsLoading(true), 400);
    return () => clearTimeout(timer);
  }, [eventsLoading]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    loadStores(1, 'replace');
  }, [loadStores]);

  const onSubmitSearch = useCallback(() => {
    const next = searchDraft.trim();
    setActiveSearch(next);
  }, [searchDraft]);

  const clearSearch = useCallback(() => {
    setSearchDraft('');
    setActiveSearch('');
  }, []);

  useEffect(() => {
    if (!showSearch) return;

    const timer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 60);

    return () => clearTimeout(timer);
  }, [showSearch]);

  const onEndReached = useCallback(() => {
    if (loading || refreshing || loadingMore) return;
    if (page >= pageCount) return;

    setLoadingMore(true);
    loadStores(page + 1, 'append');
  }, [loadStores, loading, loadingMore, page, pageCount, refreshing]);

  const openStoreBySlug = useCallback(
    (slug: string, preview?: Store) => {
      router.push({
        pathname: '/store/[slug]',
        params: {
          slug,
          previewTitle: preview?.title,
          previewDescription: preview?.Description ?? '',
          previewLogo: getLogoUrl(preview?.Logo ?? null) ?? '',
          previewLocale: preview?.locale ?? '',
        },
      } as never);
    },
    [router]
  );

  const openUrlChoice = useCallback(
    (url: string, label: string) => {
      const embedUrl = url.includes('?') ? `${url}&embed=true` : `${url}?embed=true`;

      if (linkOpenMode === 'browser') {
        Linking.openURL(url).catch(() => {
          Alert.alert('Could not open URL', url);
        });
        return;
      }

      // Default to webview (including 'ask' mode)
      router.push({ pathname: '/web', params: { url: embedUrl, title: label || 'Link' } } as never);
    },
    [linkOpenMode, router]
  );

  const renderStoreCard: ListRenderItem<Store> = ({ item, index }) => {
    const tintColors = getTintColors(item.id);

    return (
      <Animated.View entering={FadeInDown.duration(320).delay(Math.min(index, 10) * 40)}>
        <Pressable
          onPress={() => openStoreBySlug(item.slug, item)}
          style={({ pressed }) => [pressed && styles.cardPressed]}>
          <ThemedView
            style={[
              styles.card,
              {
                backgroundColor: tintColors.top,
                borderColor: tintColors.bottom,
              },
            ]}>
          <View style={styles.cardHeader}>
            <View style={styles.brandBlock}>
              {getLogoUrl(item.Logo) ? (
                <Image
                  source={{ uri: getLogoUrl(item.Logo)! }}
                  style={styles.logo}
                  contentFit="cover"
                  transition={250}
                />
              ) : (
                <View style={styles.logoFallback}>
                  <ThemedText style={styles.logoFallbackText}>
                    {item.title.charAt(0).toUpperCase()}
                  </ThemedText>
                </View>
              )}

              <View style={styles.titleBlock}>
                <ThemedText type="subtitle" style={styles.storeTitle}>
                  {item.title}
                  </ThemedText>
              </View>
            </View>

            <View style={[styles.badge, item.active ? styles.badgeActive : styles.badgeInactive]}>
              <ThemedText style={styles.badgeText}>{item.active ? 'LIVE' : 'DRAFT'}</ThemedText>
            </View>
          </View>

            {previewDescription(item.Description) ? (
              <ThemedText style={styles.description} numberOfLines={3}>
                {previewDescription(item.Description)}
              </ThemedText>
            ) : null}

          {item.URLS?.length ? (
            <View style={styles.urlRow}>
              {item.URLS.slice(0, 3).map((entry) => (
                <Pressable
                  key={entry.id}
                  style={styles.urlChip}
                  onPress={() => openUrlChoice(entry.URL, entry.Label || 'Link')}>
                  <ThemedText style={styles.urlChipText}>{entry.Label || 'Link'}</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
          </ThemedView>
        </Pressable>
      </Animated.View>
    );
  };

  if (loading) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
        <ThemedText style={styles.centerText}>Loading stores...</ThemedText>
      </ThemedView>
    );
  }

  if (error && stores.length === 0) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="subtitle">Could not load stores</ThemedText>
        <ThemedText style={styles.centerText}>{error}</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Animated.View
        style={[styles.header, { paddingTop: insets.top + 16 }]}
        entering={FadeIn.duration(360)}>
        <View style={styles.headerRow}>
          <View style={styles.headerTextWrap}>
            <ThemedText type="title" style={styles.headerTitle}>
              {homeCopy.headerTitle}
            </ThemedText>
            {homeCopy.headerSubtitle ? <ThemedText style={styles.headerSubtitle}>{homeCopy.headerSubtitle}</ThemedText> : null}
          </View>
          <Pressable
            style={styles.searchToggle}
            onPress={() => {
              if (showSearch) {
                setShowSearch(false);
                clearSearch();
                return;
              }
              setShowSearch(true);
            }}>
            <ThemedText style={styles.searchToggleText}>{showSearch ? '✕' : '⌕'}</ThemedText>
          </Pressable>
        </View>

        {showSearch ? (
          <Animated.View entering={FadeInDown.duration(220)} style={styles.searchWrap}>
            <TextInput
              ref={searchInputRef}
              value={searchDraft}
              onChangeText={setSearchDraft}
              placeholder="Search stores by name..."
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={onSubmitSearch}
              style={styles.searchInput}
              placeholderTextColor="rgba(15,23,42,0.45)"
            />
            <Pressable style={styles.searchButton} onPress={onSubmitSearch}>
              <ThemedText style={styles.searchButtonText}>Go</ThemedText>
            </Pressable>
          </Animated.View>
        ) : null}
      </Animated.View>

      <FlatList
        data={listStores}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderStoreCard}
        contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 34 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          !isSearchActive ? (
            <View style={styles.heroSection}>
              {featuredStore ? (
              <>
                  <ThemedText type="label" style={styles.heroLabel}>{homeCopy.featuredLabel}</ThemedText>
                <Pressable
                  onPress={() => openStoreBySlug(featuredStore.slug, featuredStore)}
                  style={({ pressed }) => [styles.featuredWrap, pressed && styles.cardPressed]}>
                  <ThemedView
                    style={[
                      styles.featuredCard,
                      {
                        backgroundColor: getTintColors(featuredStore.id).top,
                        borderColor: getTintColors(featuredStore.id).bottom,
                      },
                    ]}>
                    {getLogoUrl(featuredStore.Logo) ? (
                      <Image
                        source={{ uri: getLogoUrl(featuredStore.Logo)! }}
                        style={styles.featuredImage}
                        contentFit="cover"
                        transition={250}
                      />
                    ) : null}

                    <View style={styles.featuredBody}>
                      <ThemedText type="display" numberOfLines={2} style={styles.featuredTitle}>
                        {featuredStore.title}
                      </ThemedText>
                      <ThemedText numberOfLines={2} style={styles.featuredDescription}>
                        {previewDescription(featuredStore.Description)}
                      </ThemedText>
                    </View>
                  </ThemedView>
                </Pressable>

                {thumbStores.length ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.thumbRailContent}
                    style={styles.thumbRail}>
                    {thumbStores.map((store) => (
                      <Pressable
                        key={store.id}
                        onPress={() => openStoreBySlug(store.slug, store)}
                        style={({ pressed }) => [styles.thumbCard, pressed && styles.cardPressed]}>
                        <ThemedView
                          style={[
                            styles.thumbSurface,
                            {
                              backgroundColor: getTintColors(store.id).top,
                              borderColor: getTintColors(store.id).bottom,
                            },
                          ]}>
                          {getLogoUrl(store.Logo) ? (
                            <Image
                              source={{ uri: getLogoUrl(store.Logo)! }}
                              style={styles.thumbLogo}
                              contentFit="cover"
                              transition={200}
                            />
                          ) : (
                            <View style={styles.thumbFallback}>
                              <ThemedText style={styles.thumbFallbackText}>{store.title.charAt(0).toUpperCase()}</ThemedText>
                            </View>
                          )}
                          <ThemedText numberOfLines={1} type="headline" style={styles.thumbTitle}>
                            {store.title}
                          </ThemedText>
                        </ThemedView>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : null}
              </>
              ) : debouncedActiveStoresLoading ? (
              <>
                    <ThemedText type="label" style={styles.heroLabel}>{homeCopy.featuredLabel}</ThemedText>
                <SkeletonCard />
              </>
              ) : null}

              <View style={styles.carouselSection}>
                <View style={styles.carouselHeader}>
                  <ThemedText type="label" style={styles.carouselLabel}>{homeCopy.articlesLabel}</ThemedText>
                  <ThemedText type="mono" style={styles.carouselMeta}>{homeCopy.articlesMeta}</ThemedText>
                </View>
                {debouncedArticlesLoading ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}>
                    {[0, 1, 2, 3].map((i) => (
                      <View key={i} style={styles.articleSkeleton}>
                        <SkeletonBlock height={120} radius={16} />
                        <SkeletonBlock width="60%" height={14} radius={8} />
                        <SkeletonBlock width="90%" height={14} radius={8} />
                      </View>
                    ))}
                  </ScrollView>
                ) : articles.length === 0 ? null : (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.carouselContent}>
                    {articles.map((article) => {
                      const coverUrl =
                        getThumbnailUrl(article.cover ?? null) ??
                        getThumbnailUrl(article.SEO?.socialImage ?? null) ?? null;
                      return (
                        <Pressable
                          key={article.id}
                          style={({ pressed }) => [styles.articleCard, pressed && styles.cardPressed]}
                          onPress={() =>
                            article.slug && article.store?.slug
                              ? router.push({ pathname: '/article/[slug]', params: { slug: article.slug, store: article.store.slug } } as never)
                              : null
                          }>
                          <View style={styles.articleCover}>
                            {coverUrl ? (
                              <Image source={{ uri: coverUrl }} style={styles.articleCoverImage} contentFit="cover" transition={200} />
                            ) : (
                              <View style={[styles.articleCoverImage, styles.articleCoverFallback]} />
                            )}
                            {article.store?.title ? (
                              <View style={styles.articleStoreBadge}>
                                <ThemedText style={styles.articleStoreBadgeText} numberOfLines={1}>
                                  {article.store.title}
                                </ThemedText>
                              </View>
                            ) : null}
                          </View>
                          <ThemedText numberOfLines={2} style={styles.articleTitle}>
                            {article.Title ?? 'Untitled'}
                          </ThemedText>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>
              <View style={styles.carouselSection}>
              <View style={styles.carouselHeader}>
                  <ThemedText type="label" style={styles.carouselLabel}>{homeCopy.productsLabel}</ThemedText>
                  <ThemedText type="mono" style={styles.carouselMeta}>{homeCopy.productsMeta}</ThemedText>
              </View>
              {debouncedProductsLoading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={styles.articleSkeleton}>
                      <SkeletonBlock height={140} radius={16} />
                      <SkeletonBlock width="70%" height={14} radius={8} />
                      <SkeletonBlock width="40%" height={14} radius={8} />
                    </View>
                  ))}
                </ScrollView>
              ) : products.length === 0 ? null : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}>
                  {products.map((product) => {
                    const uniqueSlides = dedupeSlides(product.Slides ?? product.slides ?? []);
                    const firstSlide = uniqueSlides[0] ?? null;
                    const imgUrl =
                      firstSlide?.formats?.small?.url ??
                      firstSlide?.formats?.thumbnail?.url ??
                      firstSlide?.url ??
                      product.Thumbnail?.formats?.small?.url ??
                      product.thumbnail?.formats?.small?.url ??
                      product.Thumbnail?.formats?.thumbnail?.url ??
                      product.thumbnail?.formats?.thumbnail?.url ??
                      product.Thumbnail?.url ??
                      product.thumbnail?.url ??
                      product.SEO?.socialImage?.formats?.small?.url ??
                      product.SEO?.socialImage?.formats?.thumbnail?.url ??
                      product.SEO?.socialImage?.url ?? null;
                    const firstStore = product.stores?.[0];
                    const firstPrice = (product.PRICES ?? product.prices ?? [])[0];
                    return (
                      <Pressable
                        key={product.id}
                        style={({ pressed }) => [styles.productCard, pressed && styles.cardPressed]}
                        onPress={() =>
                          product.slug && firstStore?.slug
                            ? router.push({
                              pathname: '/[storeSlug]/products/[slug]',
                              params: {
                                storeSlug: firstStore.slug,
                                slug: product.slug,
                                title: product.Name || 'Product',
                              },
                            } as never)
                            : null
                        }>
                        <View style={styles.productCover}>
                          {imgUrl ? (
                            <Image source={{ uri: imgUrl }} style={styles.productCoverImage} contentFit="cover" transition={200} />
                          ) : (
                            <View style={[styles.productCoverImage, styles.productCoverFallback]}>
                              <ThemedText style={styles.productFallbackEmoji}>🛍</ThemedText>
                            </View>
                          )}
                          {firstStore?.title ? (
                            <View style={styles.articleStoreBadge}>
                              <ThemedText style={styles.articleStoreBadgeText} numberOfLines={1}>
                                {firstStore.title}
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>
                        <ThemedText numberOfLines={2} style={styles.articleTitle}>
                          {product.Name ?? 'Product'}
                        </ThemedText>
                        {firstPrice?.price != null ? (
                          <ThemedText style={styles.productPrice}>
                            ${firstPrice.price.toFixed(2)}
                          </ThemedText>
                        ) : product.SEO?.metaUrl ? (
                          <ThemedText style={styles.metaUrlLink} numberOfLines={1}>more info →</ThemedText>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={styles.carouselSection}>
              <View style={styles.carouselHeader}>
                  <ThemedText type="label" style={styles.carouselLabel}>{homeCopy.storiesLabel}</ThemedText>
                  <ThemedText type="mono" style={styles.carouselMeta}>{homeCopy.storiesMeta}</ThemedText>
              </View>
              {debouncedPagesLoading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={styles.articleSkeleton}>
                      <SkeletonBlock height={120} radius={16} />
                      <SkeletonBlock width="60%" height={14} radius={8} />
                      <SkeletonBlock width="90%" height={14} radius={8} />
                    </View>
                  ))}
                </ScrollView>
              ) : pages.length === 0 ? null : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}>
                  {pages.map((page) => {
                    const imgUrl = getThumbnailUrl(page.SEO?.socialImage ?? null) ?? null;
                    return (
                      <Pressable
                        key={page.id}
                        style={({ pressed }) => [styles.articleCard, pressed && styles.cardPressed]}
                        onPress={() =>
                          page.slug && page.store?.slug
                            ? router.push({ pathname: '/page/[slug]', params: { slug: page.slug, store: page.store.slug } } as never)
                            : null
                        }>
                        <View style={styles.articleCover}>
                          {imgUrl ? (
                            <Image source={{ uri: imgUrl }} style={styles.articleCoverImage} contentFit="cover" transition={200} />
                          ) : (
                            <View style={[styles.articleCoverImage, styles.articleCoverFallback]} />
                          )}
                          {page.store?.title ? (
                            <View style={styles.articleStoreBadge}>
                              <ThemedText style={styles.articleStoreBadgeText} numberOfLines={1}>
                                {page.store.title}
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>
                        <ThemedText numberOfLines={2} style={styles.articleTitle}>
                          {page.Title ?? 'Page'}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={styles.carouselSection}>
              <View style={styles.carouselHeader}>
                  <ThemedText type="label" style={styles.carouselLabel}>{homeCopy.eventsLabel}</ThemedText>
                  <ThemedText type="mono" style={styles.carouselMeta}>{homeCopy.eventsMeta}</ThemedText>
              </View>
              {debouncedEventsLoading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}>
                  {[0, 1, 2, 3].map((i) => (
                    <View key={i} style={styles.articleSkeleton}>
                      <SkeletonBlock height={120} radius={16} />
                      <SkeletonBlock width="70%" height={14} radius={8} />
                      <SkeletonBlock width="50%" height={14} radius={8} />
                    </View>
                  ))}
                </ScrollView>
              ) : events.length === 0 ? null : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.carouselContent}>
                  {events.map((event) => {
                    const imgUrl =
                      getThumbnailUrl(event.Thumbnail ?? null) ??
                      getThumbnailUrl(event.SEO?.socialImage ?? null);
                    const firstStore = event.stores?.[0];
                    const firstPrice = event.PRICES?.[0];
                    const isFree = !event.usd_price && (!firstPrice?.price || firstPrice.price === 0);
                    const hasMetaUrl = !!event.SEO?.metaUrl;
                    return (
                      <Pressable
                        key={event.id}
                        style={({ pressed }) => [styles.eventCard, pressed && styles.cardPressed]}
                        onPress={() =>
                          event.slug
                            ? router.push({ pathname: '/event/[slug]', params: { slug: event.slug } } as never)
                            : hasMetaUrl
                              ? openUrlChoice(event.SEO!.metaUrl!, event.Name || 'Event')
                              : null
                        }>
                        <View style={styles.eventCover}>
                          {imgUrl ? (
                            <Image source={{ uri: imgUrl }} style={styles.eventCoverImage} contentFit="cover" transition={200} />
                          ) : (
                            <View style={[styles.eventCoverImage, styles.eventCoverFallback]}>
                              <ThemedText style={styles.productFallbackEmoji}>📅</ThemedText>
                            </View>
                          )}
                          {event.startDate ? (
                            <View style={styles.eventDateBadge}>
                              <ThemedText style={styles.eventDateText} numberOfLines={1}>
                                {formatEventDate(event.startDate)}
                              </ThemedText>
                            </View>
                          ) : null}
                        </View>
                        <ThemedText numberOfLines={2} style={styles.articleTitle}>
                          {event.Name ?? 'Event'}
                        </ThemedText>
                        {firstStore?.title ? (
                          <ThemedText style={styles.articleStoreBadgeText} numberOfLines={1}>
                            {firstStore.title}
                          </ThemedText>
                        ) : null}
                        {isFree ? (
                          <ThemedText style={styles.eventFreeTag}>Free</ThemedText>
                        ) : event.usd_price ? (
                          <ThemedText style={styles.productPrice}>${event.usd_price}</ThemedText>
                        ) : firstPrice?.price != null ? (
                          <ThemedText style={styles.productPrice}>
                            ${firstPrice.price.toFixed(2)}
                          </ThemedText>
                        ) : hasMetaUrl ? (
                          <ThemedText style={styles.metaUrlLink}>more info →</ThemedText>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </View>



              {activeSearch ? (
                <View style={styles.searchResultRow}>
                  <ThemedText style={styles.searchResultText}>{`Results for "${activeSearch}"`}</ThemedText>
                  <Pressable onPress={clearSearch} style={styles.searchResultClear}>
                    <ThemedText style={styles.searchResultClearText}>Clear</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          ) : (
              <View style={styles.searchModeHeader}>
              {activeSearch ? (
                <View style={styles.searchResultRow}>
                  <ThemedText style={styles.searchResultText}>{`Results for "${activeSearch}"`}</ThemedText>
                  <Pressable onPress={clearSearch} style={styles.searchResultClear}>
                    <ThemedText style={styles.searchResultClearText}>Clear</ThemedText>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )
        }
        ListEmptyComponent={
          <ThemedView style={styles.emptyState}>
            <ThemedText type="subtitle">No stores yet</ThemedText>
            <ThemedText>{activeSearch ? `Nothing matched "${activeSearch}".` : 'Pull down to refresh.'}</ThemedText>
          </ThemedView>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreRow}>
              <ActivityIndicator size="small" />
              <ThemedText style={styles.loadingMoreText}>Loading more...</ThemedText>
            </View>
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 30,
    lineHeight: 32,
    letterSpacing: -0.8,
    textTransform: 'lowercase',
  },
  headerSubtitle: {
    opacity: 0.62,
    marginTop: 6,
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  searchToggle: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.18)',
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  searchToggleText: {
    fontSize: 18,
    lineHeight: 18,
    color: '#0F172A',
    fontWeight: '700',
  },
  searchWrap: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(15,23,42,0.15)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
  },
  searchButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.45)',
  },
  searchButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0E7490',
  },
  quickOpenButton: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(34, 211, 238, 0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34, 211, 238, 0.55)',
  },
  quickOpenText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#164E63',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 34,
    gap: 14,
  },
  heroSection: {
    gap: 12,
    marginBottom: 8,
  },
  heroLabel: {
    opacity: 0.8,
  },
  featuredWrap: {
    borderRadius: 24,
  },
  featuredCard: {
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
  },
  featuredImage: {
    width: '100%',
    height: 220,
  },
  featuredBody: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 6,
  },
  featuredTitle: {
    fontSize: 34,
    lineHeight: 38,
  },
  featuredDescription: {
    opacity: 0.76,
    lineHeight: 21,
  },
  thumbRail: {
    marginTop: 2,
  },
  thumbRailContent: {
    gap: 10,
    paddingRight: 8,
  },
  thumbCard: {
    width: 132,
  },
  thumbSurface: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 10,
    gap: 8,
  },
  thumbLogo: {
    width: '100%',
    height: 84,
    borderRadius: 12,
  },
  thumbFallback: {
    width: '100%',
    height: 84,
    borderRadius: 12,
    backgroundColor: 'rgba(16,16,16,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallbackText: {
    fontSize: 22,
    fontWeight: '700',
  },
  thumbTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  collectionLabel: {
    marginTop: 8,
    opacity: 0.75,
  },
  searchModeHeader: {
    marginBottom: 8,
  },
  searchResultRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  searchResultText: {
    fontSize: 12,
    opacity: 0.75,
  },
  searchResultClear: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
  },
  searchResultClearText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  carouselSection: {
    marginTop: Spacing.xl,
    gap: Spacing.sm,
  },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  carouselLabel: {
    color: BrandColors.onBackground,
  },
  carouselMeta: {
    fontSize: 11,
    color: Colors.light.onSurfaceVariant,
  },
  carouselContent: {
    gap: Spacing.sm,
    paddingRight: Spacing.md,
  },
  articleCard: {
    width: 180,
    gap: Spacing.xs,
  },
  articleSkeleton: {
    width: 180,
    gap: Spacing.xs,
  },
  articleCover: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.light.surfaceDim,
  },
  articleCoverImage: {
    width: '100%',
    height: '100%',
  },
  articleCoverFallback: {
    backgroundColor: Colors.light.surfaceContainerHighest,
  },
  articleStoreBadge: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    backgroundColor: 'rgba(30,27,75,0.72)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: 140,
  },
  articleStoreBadgeText: {
    color: BrandColors.white,
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'SpaceGrotesk',
    letterSpacing: 0.4,
  },
  articleTitle: {
    fontFamily: 'Manrope',
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 18,
    color: Colors.light.onBackground,
  },
  productCard: {
    width: 160,
    gap: Spacing.xs,
  },
  productCover: {
    width: '100%',
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.light.surfaceDim,
  },
  productCoverImage: {
    width: '100%',
    height: '100%',
  },
  productCoverFallback: {
    backgroundColor: Colors.light.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productFallbackEmoji: {
    fontSize: 36,
  },
  productPrice: {
    fontFamily: 'SpaceGrotesk',
    fontWeight: '700',
    fontSize: 13,
    color: BrandColors.primary,
  },
  metaUrlLink: {
    fontSize: 12,
    color: BrandColors.primary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  eventCard: {
    width: 160,
    marginRight: Spacing.sm,
  },
  eventCover: {
    width: 160,
    height: 110,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
    position: 'relative',
  },
  eventCoverImage: {
    width: '100%',
    height: '100%',
  },
  eventCoverFallback: {
    backgroundColor: '#F5ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eventDateBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  eventDateText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  eventFreeTag: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2a9d4e',
    marginTop: 2,
  },
  loadingMoreRow: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingMoreText: {
    fontSize: 12,
    opacity: 0.7,
  },
  card: {
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    shadowColor: '#111',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 56,
    height: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
  },
  logoFallback: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,16,16,0.08)',
  },
  logoFallbackText: {
    fontSize: 21,
    fontWeight: '700',
  },
  titleBlock: {
    flex: 1,
  },
  storeTitle: {
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: -0.4,
  },
  slug: {
    marginTop: 2,
    opacity: 0.65,
    fontSize: 13,
  },
  description: {
    marginTop: 14,
    lineHeight: 20,
    opacity: 0.9,
    fontSize: 14,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  meta: {
    fontSize: 11,
    opacity: 0.6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  urlRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  urlChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(217, 70, 239, 0.55)',
    backgroundColor: 'rgba(217, 70, 239, 0.12)',
  },
  urlChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#86198F',
  },
  badge: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  badgeActive: {
    backgroundColor: 'rgba(9, 123, 57, 0.15)',
  },
  badgeInactive: {
    backgroundColor: 'rgba(60, 67, 78, 0.15)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  centerText: {
    textAlign: 'center',
    opacity: 0.68,
  },
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 8,
  },
});
