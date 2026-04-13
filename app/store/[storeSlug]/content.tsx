import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';

type ContentKind = 'blog' | 'pages' | 'products' | 'events';
type EventDateFilter = 'future' | 'past' | 'all';
type SortFilter = 'recent' | 'oldest';

type StoreContentItem = {
  key: string;
  title: string;
  hasPrimaryTitle: boolean;
  documentId: string;
  slug: string;
  updatedAt: string;
  createdAt: string;
  startDate: string;
  endDate: string;
  storeSlugs: string[];
};

type EventDateBadgeTone = 'danger' | 'warn' | 'good' | 'neutral';
type QualityBadgeTone = 'danger' | 'warn' | 'neutral';
type QualityBadge = { tone: QualityBadgeTone; label: string };

type MeResponse = {
  id?: number;
  username?: string;
  email?: string;
  displayName?: string | null;
};

type StrapiEntity = {
  id?: number | string;
  documentId?: string;
  slug?: string;
  title?: string;
  name?: string;
  updatedAt?: string;
  attributes?: Record<string, unknown>;
};

type StrapiCollectionResponse = {
  data?: StrapiEntity[];
};

type ContentState = Record<ContentKind, StoreContentItem[]>;
type LoadedState = Record<ContentKind, boolean>;

const EMPTY_CONTENT: ContentState = {
  blog: [],
  pages: [],
  products: [],
  events: [],
};

const EMPTY_LOADED: LoadedState = {
  blog: false,
  pages: false,
  products: false,
  events: false,
};

const KIND_LABELS: Record<ContentKind, string> = {
  blog: 'Blog',
  pages: 'Pages',
  products: 'Products',
  events: 'Events',
};

const KIND_SEGMENTS: Record<ContentKind, string> = {
  blog: 'blog',
  pages: 'about',
  products: 'products',
  events: 'events',
};

const EVENT_FILTER_LABELS: Record<EventDateFilter, string> = {
  future: 'Future',
  past: 'Past',
  all: 'All',
};

const SORT_FILTER_LABELS: Record<SortFilter, string> = {
  recent: 'Recent',
  oldest: 'Oldest',
};

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function toIsoDate(value: unknown): string {
  const clean = cleanText(value);
  if (!clean) return '';
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function formatUpdatedAt(value: string): string {
  if (!value) return 'Unknown update date';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown update date';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getEntityString(entity: StrapiEntity, keys: string[]): string {
  for (const key of keys) {
    const direct = cleanText((entity as unknown as Record<string, unknown>)[key]);
    if (direct) return direct;

    const attrs = entity.attributes as Record<string, unknown> | undefined;
    const nested = cleanText(attrs?.[key]);
    if (nested) return nested;
  }
  return '';
}

function mapEntityToItem(entity: StrapiEntity, kind: ContentKind, index: number): StoreContentItem {
  const titleCandidates: Record<ContentKind, string[]> = {
    blog: ['Title', 'title', 'Name', 'name', 'slug'],
    pages: ['Title', 'title', 'name', 'slug'],
    products: ['Name', 'name', 'Title', 'title', 'slug'],
    events: ['Name', 'name', 'Title', 'title', 'slug'],
  };

  const documentId = getEntityString(entity, ['documentId']) || String(entity.id ?? '');
  const slug = getEntityString(entity, ['slug']);
  const primaryTitle = getEntityString(entity, titleCandidates[kind]);
  const title = primaryTitle || `${KIND_LABELS[kind]} ${index + 1}`;
  const updatedAt = toIsoDate(getEntityString(entity, ['updatedAt', 'publishedAt', 'createdAt']));
  const createdAt = toIsoDate(getEntityString(entity, ['createdAt', 'publishedAt', 'updatedAt']));
  const startDate = toIsoDate(getEntityString(entity, ['startDate', 'StartDate', 'eventDate', 'EventDate']));
  const endDate = toIsoDate(getEntityString(entity, ['endDate', 'EndDate']));
  const storeSlugs = extractStoreSlugs(entity);

  return {
    key: `${kind}:${documentId || slug || String(entity.id ?? index)}:${index}`,
    title,
    hasPrimaryTitle: Boolean(primaryTitle),
    documentId,
    slug,
    updatedAt,
    createdAt,
    startDate,
    endDate,
    storeSlugs,
  };
}

function collectSlugsFromRelation(input: unknown, bucket: Set<string>): void {
  if (!input) return;

  if (Array.isArray(input)) {
    input.forEach((item) => collectSlugsFromRelation(item, bucket));
    return;
  }

  if (typeof input !== 'object') return;

  const record = input as Record<string, unknown>;
  const slug = cleanText(record.slug);
  if (slug) bucket.add(slug);

  if (record.attributes && typeof record.attributes === 'object') {
    const nestedSlug = cleanText((record.attributes as Record<string, unknown>).slug);
    if (nestedSlug) bucket.add(nestedSlug);
  }

  if (record.data) {
    collectSlugsFromRelation(record.data, bucket);
  }
}

function extractStoreSlugs(entity: StrapiEntity): string[] {
  const bucket = new Set<string>();
  const attrs = (entity.attributes || {}) as Record<string, unknown>;

  collectSlugsFromRelation((entity as unknown as Record<string, unknown>).store, bucket);
  collectSlugsFromRelation((entity as unknown as Record<string, unknown>).stores, bucket);
  collectSlugsFromRelation(attrs.store, bucket);
  collectSlugsFromRelation(attrs.stores, bucket);

  return Array.from(bucket);
}

function getQualityBadges(kind: ContentKind, item: StoreContentItem): QualityBadge[] {
  const badges: QualityBadge[] = [];

  if (!item.documentId) {
    badges.push({
      tone: 'danger',
      label: 'No ID',
    });
  }

  if (!item.slug) {
    badges.push({
      tone: 'warn',
      label: 'No Slug',
    });
  }

  if (!item.hasPrimaryTitle) {
    badges.push({
      tone: 'warn',
      label: 'Title Fallback',
    });
  }

  return badges;
}

function toTimestamp(value: string): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  return time;
}

function getEventDateBadge(item: StoreContentItem): { tone: EventDateBadgeTone; label: string; hint: string } {
  const now = Date.now();
  const startTs = toTimestamp(item.startDate);
  const endTs = toTimestamp(item.endDate);

  if (!item.startDate) {
    return {
      tone: 'danger',
      label: 'Date Missing',
      hint: 'Add a start date so this event can be filtered correctly.',
    };
  }

  if (startTs == null) {
    return {
      tone: 'danger',
      label: 'Date Invalid',
      hint: 'Start date format is not valid.',
    };
  }

  if (endTs != null && endTs < now) {
    return {
      tone: 'neutral',
      label: 'Ended',
      hint: `Ended ${formatUpdatedAt(new Date(endTs).toISOString())}`,
    };
  }

  if (startTs < now) {
    return {
      tone: 'warn',
      label: 'Started',
      hint: `Started ${formatUpdatedAt(new Date(startTs).toISOString())}`,
    };
  }

  const daysAway = Math.ceil((startTs - now) / (1000 * 60 * 60 * 24));
  if (daysAway <= 7) {
    return {
      tone: 'warn',
      label: 'Soon',
      hint: `Starts in ${daysAway} day${daysAway === 1 ? '' : 's'}`,
    };
  }

  return {
    tone: 'good',
    label: 'Scheduled',
    hint: `Starts ${formatUpdatedAt(new Date(startTs).toISOString())}`,
  };
}

function extractEntities(payload: unknown): StrapiEntity[] {
  if (Array.isArray(payload)) {
    return payload as StrapiEntity[];
  }

  if (payload && typeof payload === 'object') {
    const data = (payload as StrapiCollectionResponse).data;
    if (Array.isArray(data)) return data;
  }

  return [];
}

function buildStoreScopedPaths(kind: ContentKind, storeSlug: string, eventFilter: EventDateFilter, sortFilter: SortFilter): string[] {
  const encodedSlug = encodeURIComponent(storeSlug);
  const today = new Date().toISOString().slice(0, 10);
  const sortDir = sortFilter === 'oldest' ? 'asc' : 'desc';
  const includeStores = '&populate[]=store&populate[]=stores';
  switch (kind) {
    case 'blog':
      return [
        `/api/articles?filters[store][slug][$eq]=${encodedSlug}&sort[0]=updatedAt:${sortDir}&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
        `/api/articles?filters[stores][slug][$eq]=${encodedSlug}&sort[0]=updatedAt:${sortDir}&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
      ];
    case 'pages':
      return [
        `/api/pages?filters[store][slug][$eq]=${encodedSlug}&sort[0]=updatedAt:${sortDir}&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
        `/api/pages?filters[stores][slug][$eq]=${encodedSlug}&sort[0]=updatedAt:${sortDir}&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
      ];
    case 'products':
      return [
        `/api/products?filters[stores][slug][$eq]=${encodedSlug}&sort[0]=updatedAt:${sortDir}&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
        `/api/products?filters[store][slug][$eq]=${encodedSlug}&sort[0]=updatedAt:${sortDir}&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
      ];
    case 'events':
      if (eventFilter === 'future') {
        return [
          `/api/events?filters[stores][slug][$eq]=${encodedSlug}&filters[startDate][$gte]=${today}&sort[0]=startDate:asc&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
          `/api/events?filters[store][slug][$eq]=${encodedSlug}&filters[startDate][$gte]=${today}&sort[0]=startDate:asc&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
        ];
      }

      if (eventFilter === 'past') {
        return [
          `/api/events?filters[stores][slug][$eq]=${encodedSlug}&filters[startDate][$lt]=${today}&sort[0]=startDate:desc&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
          `/api/events?filters[store][slug][$eq]=${encodedSlug}&filters[startDate][$lt]=${today}&sort[0]=startDate:desc&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
        ];
      }

      return [
        `/api/events?filters[stores][slug][$eq]=${encodedSlug}&sort[0]=startDate:desc&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
        `/api/events?filters[store][slug][$eq]=${encodedSlug}&sort[0]=startDate:desc&pagination[pageSize]=40&pagination[page]=1${includeStores}`,
      ];
    default:
      return [];
  }
}

function buildProxyUrl(displayBaseUrl: string, rawPath: string, kind: ContentKind, storeSlug: string): string {
  const parsed = new URL(rawPath, 'https://proxy.local');
  const params = new URLSearchParams();
  params.set('path', parsed.pathname);

  // Forward the Strapi query at top-level, which is how the proxy builds targetUrl.search.
  for (const [key, value] of parsed.searchParams.entries()) {
    params.append(key, value);
  }

  // Keep one explicit, typed store filter per content relation.
  const relation = kind === 'products' || kind === 'events' ? 'stores' : 'store';
  params.set(`filters[${relation}][slug][$eq]`, storeSlug);

  return `${displayBaseUrl}api/markket?${params.toString()}`;
}

export default function StoreContentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storeSlug } = useLocalSearchParams<{ storeSlug?: string | string[] }>();
  const { apiBaseUrl, displayBaseUrl } = useAppConfig();
  const { ready, session, saveToken } = useAuthSession();

  const resolvedStoreSlug = normalizeParam(storeSlug).trim();
  const [activeKind, setActiveKind] = useState<ContentKind>('blog');
  const [contentByKind, setContentByKind] = useState<ContentState>(EMPTY_CONTENT);
  const [loadedByKind, setLoadedByKind] = useState<LoadedState>(EMPTY_LOADED);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadNotice, setLoadNotice] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const [showDebugInfo, setShowDebugInfo] = useState(false);
  const [eventDateFilter, setEventDateFilter] = useState<EventDateFilter>('future');
  const [sortFilter, setSortFilter] = useState<SortFilter>('recent');

  const activeItems = contentByKind[activeKind];

  const subtitle = useMemo(() => {
    if (loading) return `Loading ${KIND_LABELS[activeKind]}...`;
    if (!activeItems.length) return `No ${KIND_LABELS[activeKind].toLowerCase()} found for this store.`;
    return `${activeItems.length} ${KIND_LABELS[activeKind].toLowerCase()} item${activeItems.length === 1 ? '' : 's'}.`;
  }, [activeItems.length, activeKind, loading]);

  const resolveUserId = useCallback(async (): Promise<string> => {
    const existing =
      typeof session?.userId === 'number'
        ? String(session.userId)
        : typeof session?.userId === 'string'
          ? session.userId.trim()
          : '';

    if (existing) return existing;

    if (!session?.token) return '';

    const meResult = await apiGet<MeResponse>('/api/users/me', {
      baseUrl: apiBaseUrl,
      token: session.token,
    });

    if (meResult.ok && typeof meResult.data?.id === 'number') {
      await saveToken(session.token, session.source || 'content-list', {
        userId: meResult.data.id,
        username: cleanText(meResult.data.username),
        email: cleanText(meResult.data.email),
        displayName: cleanText(meResult.data.displayName),
      });
      return String(meResult.data.id);
    }

    return '';
  }, [apiBaseUrl, saveToken, session?.source, session?.token, session?.userId]);

  const loadKind = useCallback(async (kind: ContentKind) => {
    if (!session?.token || !resolvedStoreSlug) return;

    setLoading(true);
    setLoadError('');
    setLoadNotice('');
    setDebugInfo('');
    setShowDebugInfo(false);
    try {
      const userId = await resolveUserId();
      if (!userId) {
        setContentByKind((prev) => ({ ...prev, [kind]: [] }));
        setLoadedByKind((prev) => ({ ...prev, [kind]: true }));
        setLoadError('Could not validate your account for this store.');
        setDebugInfo(`kind=${kind}\nstoreSlug=${resolvedStoreSlug}\nreason=missing user id`);
        return;
      }

      const storePaths = buildStoreScopedPaths(kind, resolvedStoreSlug, eventDateFilter, sortFilter);
      let lastErrorMessage = '';
      let lastDebug = '';

      for (const storePath of storePaths) {
        const proxyUrl = buildProxyUrl(displayBaseUrl, storePath, kind, resolvedStoreSlug);
        const response = await fetch(proxyUrl, {
          headers: {
            Authorization: `Bearer ${session.token}`,
            'markket-user-id': String(userId),
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const payload = (await response.json()) as unknown;
          const entities = extractEntities(payload);
          const mapped = entities.map((entity, index) => mapEntityToItem(entity, kind, index));
          const scoped = mapped.filter((item) => item.storeSlugs.includes(resolvedStoreSlug));
          const removed = mapped.length - scoped.length;

          setContentByKind((prev) => ({ ...prev, [kind]: scoped }));
          setLoadedByKind((prev) => ({ ...prev, [kind]: true }));
          if (removed > 0) {
            setLoadNotice(`Scoped to this store. Filtered out ${removed} unrelated item${removed === 1 ? '' : 's'}.`);
          }
          return;
        }

        const responseText = (await response.text()).slice(0, 500);
        const pathBlocked =
          response.status === 403 &&
          /Path or method is not allowed for proxy access/i.test(responseText);

        if (pathBlocked) {
          const fallbackResponse = await fetch(`${apiBaseUrl}${storePath}`, {
            headers: {
              Authorization: `Bearer ${session.token}`,
              'Content-Type': 'application/json',
            },
          });

          if (fallbackResponse.ok) {
            const fallbackPayload = (await fallbackResponse.json()) as unknown;
            const fallbackEntities = extractEntities(fallbackPayload);
            const fallbackMapped = fallbackEntities.map((entity, index) => mapEntityToItem(entity, kind, index));
            const scopedFallback = fallbackMapped.filter((item) => item.storeSlugs.includes(resolvedStoreSlug));
            const removed = fallbackMapped.length - scopedFallback.length;

            setContentByKind((prev) => ({ ...prev, [kind]: scopedFallback }));
            setLoadedByKind((prev) => ({ ...prev, [kind]: true }));
            setLoadNotice(
              removed > 0
                ? `Loaded via fallback and scoped to this store (filtered out ${removed} unrelated item${removed === 1 ? '' : 's'}).`
                : 'Loaded via public list read fallback while proxy list rule is restricted.'
            );
            setDebugInfo(
              [
                'proxy=blocked-by-rule',
                `proxyStatus=${response.status}`,
                `fallbackStatus=${fallbackResponse.status}`,
                `kind=${kind}`,
                `eventFilter=${kind === 'events' ? eventDateFilter : 'n/a'}`,
                `sortFilter=${sortFilter}`,
                `storeSlug=${resolvedStoreSlug}`,
                `proxyPath=${storePath}`,
                `fallbackUrl=${apiBaseUrl}${storePath}`,
                `proxyResponse=${responseText || '[empty]'}`,
              ].join('\n')
            );
            setShowDebugInfo(true);
            return;
          }

          const fallbackText = (await fallbackResponse.text()).slice(0, 500);
          lastErrorMessage = `Proxy blocked and fallback failed (${fallbackResponse.status}).`;
          lastDebug =
            [
              'proxy=blocked-by-rule',
              `proxyStatus=${response.status}`,
              `fallbackStatus=${fallbackResponse.status}`,
              `kind=${kind}`,
              `eventFilter=${kind === 'events' ? eventDateFilter : 'n/a'}`,
              `sortFilter=${sortFilter}`,
              `storeSlug=${resolvedStoreSlug}`,
              `proxyPath=${storePath}`,
              `fallbackUrl=${apiBaseUrl}${storePath}`,
              `proxyResponse=${responseText || '[empty]'}`,
              `fallbackResponse=${fallbackText || '[empty]'}`,
            ].join('\n');
          continue;
        }

        lastErrorMessage = `Could not load ${KIND_LABELS[kind].toLowerCase()} right now (${response.status}).`;
        lastDebug =
          [
            `status=${response.status}`,
            `kind=${kind}`,
            `eventFilter=${kind === 'events' ? eventDateFilter : 'n/a'}`,
            `sortFilter=${sortFilter}`,
            `storeSlug=${resolvedStoreSlug}`,
            `proxyUrl=${proxyUrl}`,
            `proxyPath=${storePath}`,
            `markketUserId=${String(userId)}`,
            `response=${responseText || '[empty]'}`,
          ].join('\n');
      }

      setContentByKind((prev) => ({ ...prev, [kind]: [] }));
      setLoadedByKind((prev) => ({ ...prev, [kind]: true }));
      setLoadError(lastErrorMessage || `Could not load ${KIND_LABELS[kind].toLowerCase()} right now.`);
      setDebugInfo(lastDebug);
      setShowDebugInfo(Boolean(lastDebug));
    } catch {
      setContentByKind((prev) => ({ ...prev, [kind]: [] }));
      setLoadedByKind((prev) => ({ ...prev, [kind]: true }));
      setLoadError('Network error loading this list.');
      setDebugInfo(
        [
          'status=network-error',
          `kind=${kind}`,
          `eventFilter=${kind === 'events' ? eventDateFilter : 'n/a'}`,
          `sortFilter=${sortFilter}`,
          `storeSlug=${resolvedStoreSlug}`,
        ].join('\n')
      );
      setShowDebugInfo(true);
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, displayBaseUrl, eventDateFilter, resolveUserId, resolvedStoreSlug, session?.token, sortFilter]);

  useEffect(() => {
    if (activeKind !== 'events') return;
    setLoadedByKind((prev) => ({ ...prev, events: false }));
    setContentByKind((prev) => ({ ...prev, events: [] }));
  }, [activeKind, eventDateFilter]);

  useEffect(() => {
    if (activeKind === 'events') return;
    setLoadedByKind((prev) => ({ ...prev, [activeKind]: false }));
    setContentByKind((prev) => ({ ...prev, [activeKind]: [] }));
  }, [activeKind, sortFilter]);

  useEffect(() => {
    if (!ready || !session?.token || !resolvedStoreSlug) return;
    if (loadedByKind[activeKind]) return;
    void loadKind(activeKind);
  }, [activeKind, loadKind, loadedByKind, ready, resolvedStoreSlug, session?.token]);

  const openItemInTienda = useCallback((kind: ContentKind, item: StoreContentItem) => {
    if (!resolvedStoreSlug) return;

    const segment = KIND_SEGMENTS[kind];
    const recordKey = cleanText(item.documentId) || cleanText(item.slug);
    const path = recordKey
      ? `${displayBaseUrl}tienda/${resolvedStoreSlug}/${segment}/${recordKey}?display=embed`
      : `${displayBaseUrl}tienda/${resolvedStoreSlug}/${segment}?display=embed`;

    router.push({ pathname: '/web', params: { url: path, captureAuth: '0' } } as never);
  }, [displayBaseUrl, resolvedStoreSlug, router]);

  if (!ready) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!session?.token) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="defaultSemiBold">Sign in required</ThemedText>
        <ThemedText style={styles.centerHint}>Open your account to continue managing store content.</ThemedText>
        <Button label="Go to Account" onPress={() => router.replace('/profile' as never)} />
      </ThemedView>
    );
  }

  if (!resolvedStoreSlug) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="defaultSemiBold">Store missing</ThemedText>
        <ThemedText style={styles.centerHint}>Open this screen from one of your store cards.</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 26 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headingWrap}>
            <ThemedText type="title" style={styles.title}>Content Lists</ThemedText>
            <ThemedText style={styles.storeTag}>{resolvedStoreSlug}</ThemedText>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kindRowContent}
          style={styles.kindRowScroll}>
          {(Object.keys(KIND_LABELS) as ContentKind[]).map((kind) => {
            const active = activeKind === kind;
            return (
              <Pressable
                key={kind}
                style={({ pressed }) => [styles.kindPill, active && styles.kindPillActive, pressed && styles.kindPillPressed]}
                onPress={() => setActiveKind(kind)}>
                <ThemedText style={[styles.kindPillText, active && styles.kindPillTextActive]}>{KIND_LABELS[kind]}</ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRowContent}
          style={styles.filterRowScroll}>
          {activeKind === 'events' ? (
            <View style={styles.filterGroupTag}>
              <ThemedText style={styles.filterGroupTagText}>When</ThemedText>
            </View>
          ) : null}

          {activeKind === 'events'
            ? (Object.keys(EVENT_FILTER_LABELS) as EventDateFilter[]).map((filterValue) => {
                const active = eventDateFilter === filterValue;
                return (
                  <Pressable
                    key={`date-${filterValue}`}
                    style={({ pressed }) => [styles.eventFilterPill, active && styles.eventFilterPillActive, pressed && styles.kindPillPressed]}
                    onPress={() => setEventDateFilter(filterValue)}>
                    <ThemedText style={[styles.eventFilterText, active && styles.eventFilterTextActive]}>
                      {EVENT_FILTER_LABELS[filterValue]}
                    </ThemedText>
                  </Pressable>
                );
              })
            : null}

          <View style={styles.filterGroupTag}>
            <ThemedText style={styles.filterGroupTagText}>Sort</ThemedText>
          </View>

          {(Object.keys(SORT_FILTER_LABELS) as SortFilter[]).map((filterValue) => {
            const active = sortFilter === filterValue;
            return (
              <Pressable
                key={`sort-${filterValue}`}
                style={({ pressed }) => [styles.eventFilterPill, active && styles.eventFilterPillActive, pressed && styles.kindPillPressed]}
                onPress={() => setSortFilter(filterValue)}>
                <ThemedText style={[styles.eventFilterText, active && styles.eventFilterTextActive]}>
                  {SORT_FILTER_LABELS[filterValue]}
                </ThemedText>
              </Pressable>
            );
          })}
        </ScrollView>

        <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>

        {!loading && loadNotice ? (
          <View style={styles.noticeCard}>
            <ThemedText style={styles.noticeText}>{loadNotice}</ThemedText>
          </View>
        ) : null}

        {!loading && loadError ? (
          <View style={styles.errorCard}>
            <ThemedText style={styles.errorText}>{loadError}</ThemedText>
            <Button label="Retry" variant="secondary" onPress={() => void loadKind(activeKind)} />
            {debugInfo ? (
              <Pressable style={styles.debugToggle} onPress={() => setShowDebugInfo((prev) => !prev)}>
                <ThemedText style={styles.debugToggleText}>{showDebugInfo ? 'Hide Debug' : 'Show Debug'}</ThemedText>
              </Pressable>
            ) : null}
            {showDebugInfo && debugInfo ? (
              <View style={styles.debugCard}>
                <ThemedText style={styles.debugText}>{debugInfo}</ThemedText>
              </View>
            ) : null}
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator size="small" />
          </View>
        ) : activeItems.length ? (
          <View style={styles.listWrap}>
            {activeItems.map((item) => {
              const hasUpdated = Boolean(item.updatedAt);
              const hasCreated = Boolean(item.createdAt);
              const shouldShowCreated = hasCreated && (!hasUpdated || item.createdAt !== item.updatedAt);
              const eventBadge = activeKind === 'events' ? getEventDateBadge(item) : null;
              const qualityBadges = getQualityBadges(activeKind, item);
              const hasCriticalIssue = qualityBadges.some((badge) => badge.tone === 'danger');
              const hasWarningIssue = !hasCriticalIssue && qualityBadges.some((badge) => badge.tone === 'warn');
              const eventBadgeStyle =
                eventBadge?.tone === 'danger'
                  ? styles.eventBadgeDanger
                  : eventBadge?.tone === 'warn'
                    ? styles.eventBadgeWarn
                    : eventBadge?.tone === 'good'
                      ? styles.eventBadgeGood
                      : styles.eventBadgeNeutral;

              return (
                <Pressable
                  key={item.key}
                  style={({ pressed }) => [
                    styles.itemCard,
                    hasCriticalIssue && styles.itemCardIssueDanger,
                    hasWarningIssue && styles.itemCardIssueWarn,
                    pressed && styles.itemCardPressed,
                  ]}
                  onPress={() => openItemInTienda(activeKind, item)}>
                  {activeKind === 'events' ? null : (
                    <ThemedText style={styles.itemLabel}>{KIND_LABELS[activeKind].slice(0, -1) || KIND_LABELS[activeKind]}</ThemedText>
                  )}
                  <ThemedText style={styles.itemTitle}>{item.title}</ThemedText>
                  {eventBadge ? (
                    <View style={styles.eventBadgeRow}>
                      <View style={[styles.eventBadge, eventBadgeStyle]}>
                        <ThemedText style={styles.eventBadgeText}>{eventBadge.label}</ThemedText>
                      </View>
                      <ThemedText style={styles.eventBadgeHint}>{eventBadge.hint}</ThemedText>
                    </View>
                  ) : null}
                  {item.slug ? <ThemedText style={styles.itemMeta}>Slug: {item.slug}</ThemedText> : null}
                  {item.documentId ? <ThemedText style={styles.itemMeta}>ID: {item.documentId}</ThemedText> : null}
                  {!item.storeSlugs.includes(resolvedStoreSlug) ? <ThemedText style={styles.itemMeta}>Scope: Not linked to this store</ThemedText> : null}
                  {activeKind === 'events' && item.startDate ? <ThemedText style={styles.itemMeta}>Starts: {formatUpdatedAt(item.startDate)}</ThemedText> : null}
                  {activeKind === 'events' && item.endDate ? <ThemedText style={styles.itemMeta}>Ends: {formatUpdatedAt(item.endDate)}</ThemedText> : null}
                  {hasUpdated ? <ThemedText style={styles.itemMeta}>Last change: {formatUpdatedAt(item.updatedAt)}</ThemedText> : null}
                  {shouldShowCreated ? <ThemedText style={styles.itemMeta}>Created: {formatUpdatedAt(item.createdAt)}</ThemedText> : null}
                  <ThemedText style={styles.itemHint}>Tap to preview/edit in Tienda</ThemedText>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <ThemedText style={styles.emptyText}>No records yet for this type.</ThemedText>
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 18,
    gap: 12,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 10,
  },
  centerHint: {
    textAlign: 'center',
    opacity: 0.72,
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headingWrap: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  storeTag: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
  },
  kindRowScroll: {
    marginTop: 2,
  },
  kindRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  kindPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(240,249,255,0.92)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  kindPillActive: {
    backgroundColor: 'rgba(14,116,144,0.95)',
    borderColor: 'rgba(14,116,144,1)',
  },
  kindPillPressed: {
    transform: [{ scale: 0.98 }],
  },
  kindPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.2,
  },
  kindPillTextActive: {
    color: '#E0F2FE',
  },
  filterRowScroll: {
    marginTop: 2,
  },
  filterRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  filterGroupTag: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.18)',
    backgroundColor: 'rgba(240,249,255,0.62)',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  filterGroupTagText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.25,
    color: '#0369A1',
    opacity: 0.78,
    textTransform: 'uppercase',
  },
  eventFilterPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(30,64,175,0.2)',
    backgroundColor: 'rgba(239,246,255,0.9)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  eventFilterPillActive: {
    borderColor: 'rgba(30,64,175,0.8)',
    backgroundColor: 'rgba(30,64,175,0.95)',
  },
  eventFilterText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
    letterSpacing: 0.2,
  },
  eventFilterTextActive: {
    color: '#DBEAFE',
  },
  subtitle: {
    opacity: 0.76,
  },
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(2,132,199,0.24)',
    backgroundColor: 'rgba(224,242,254,0.75)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noticeText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#075985',
  },
  loaderWrap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  listWrap: {
    gap: 10,
  },
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(240,249,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 2,
  },
  itemCardIssueWarn: {
    borderColor: 'rgba(202,138,4,0.36)',
  },
  itemCardIssueDanger: {
    borderColor: 'rgba(220,38,38,0.45)',
  },
  itemCardPressed: {
    transform: [{ scale: 0.985 }],
    backgroundColor: 'rgba(224,242,254,1)',
  },
  itemLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.25,
    opacity: 0.55,
  },
  itemTitle: {
    fontSize: 15,
    lineHeight: 21,
  },
  eventBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
    marginBottom: 2,
    flexWrap: 'wrap',
  },
  eventBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  eventBadgeDanger: {
    borderColor: 'rgba(220,38,38,0.42)',
    backgroundColor: 'rgba(254,226,226,0.9)',
  },
  eventBadgeWarn: {
    borderColor: 'rgba(202,138,4,0.42)',
    backgroundColor: 'rgba(254,249,195,0.9)',
  },
  eventBadgeGood: {
    borderColor: 'rgba(22,163,74,0.42)',
    backgroundColor: 'rgba(220,252,231,0.88)',
  },
  eventBadgeNeutral: {
    borderColor: 'rgba(100,116,139,0.34)',
    backgroundColor: 'rgba(241,245,249,0.9)',
  },
  eventBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    color: '#0F172A',
    textTransform: 'uppercase',
  },
  eventBadgeHint: {
    fontSize: 11,
    lineHeight: 16,
    opacity: 0.72,
  },
  itemMeta: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.72,
  },
  itemHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    opacity: 0.64,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.28)',
    backgroundColor: 'rgba(248,250,252,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyText: {
    opacity: 0.78,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.28)',
    backgroundColor: 'rgba(254,242,242,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#991B1B',
  },
  debugToggle: {
    marginTop: 2,
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(153,27,27,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  debugToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#991B1B',
  },
  debugCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(153,27,27,0.2)',
    backgroundColor: 'rgba(255,255,255,0.74)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  debugText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#7F1D1D',
    fontFamily: 'RobotoMono',
  },
});
