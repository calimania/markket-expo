import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';

type Article = {
  id?: number;
  slug?: string;
  title?: string;
  Title?: string;
  Content?: unknown;
  content?: unknown;
  cover?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  };
  Cover?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  };
  updatedAt?: string;
  store?: {
    slug?: string;
  } | null;
  stores?: Array<{
    slug?: string;
  }>;
};

type CollectionResponse<T> = {
  data?: T[];
  meta?: {
    pagination?: {
      page?: number;
      pageCount?: number;
    };
  };
};

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function flattenText(value: unknown): string {
  if (typeof value === 'string') return cleanText(value);

  if (Array.isArray(value)) {
    return value.map(flattenText).filter(Boolean).join(' ').trim();
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;

    if (typeof objectValue.text === 'string') {
      return cleanText(objectValue.text);
    }

    return Object.values(objectValue).map(flattenText).filter(Boolean).join(' ').trim();
  }

  return '';
}

function firstSentence(value: string): string {
  const cleaned = cleanText(value);
  if (!cleaned) return '';
  if (cleaned.length <= 140) return cleaned;
  return `${cleaned.slice(0, 137)}...`;
}

function resolveArticleImage(article: Article): string {
  return cleanText(
    article.cover?.formats?.medium?.url ||
      article.Cover?.formats?.medium?.url ||
      article.cover?.formats?.small?.url ||
      article.Cover?.formats?.small?.url ||
      article.cover?.formats?.thumbnail?.url ||
      article.Cover?.formats?.thumbnail?.url ||
      article.cover?.url ||
      article.Cover?.url ||
      ''
  );
}

function articleBelongsToStore(article: Article, targetSlug: string): boolean {
  const slug = cleanText(targetSlug);
  if (!slug) return false;

  const direct = cleanText(article.store?.slug || '');
  if (direct) return direct === slug;

  const many = Array.isArray(article.stores)
    ? article.stores.map((entry) => cleanText(entry?.slug || '')).filter(Boolean)
    : [];

  if (many.length) return many.includes(slug);

  // If relation data is missing from the payload, caller decides whether to trust scoped query.
  return true;
}

function hasOwnershipSignals(items: Article[]): boolean {
  return items.some((entry) => {
    const direct = cleanText(entry.store?.slug || '');
    const many = Array.isArray(entry.stores)
      ? entry.stores.map((store) => cleanText(store?.slug || '')).filter(Boolean)
      : [];

    return Boolean(direct) || many.length > 0;
  });
}

function joinPath(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

export default function StoreBlogScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiBaseUrl, displayBaseUrl, ready } = useAppConfig();
  const { slug, title } = useLocalSearchParams<{ slug?: string | string[]; title?: string | string[] }>();

  const storeSlug = cleanText(normalizeParam(slug));
  const storeTitle = cleanText(normalizeParam(title)) || storeSlug;

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const loadArticles = useCallback(
    async (targetPage: number, mode: 'replace' | 'append' = 'replace') => {
      if (!ready || !storeSlug) return;

      setError(null);

      try {
        const attempts = [
          `${apiBaseUrl}/api/articles?filters[store][slug]=${encodeURIComponent(storeSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=12&pagination[page]=${targetPage}&populate[]=cover&populate[]=store&populate[]=stores`,
          `${apiBaseUrl}/api/articles?filters[store][slug]=${encodeURIComponent(storeSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=12&pagination[page]=${targetPage}&populate[cover]=*&populate[]=store&populate[]=stores`,
          `${apiBaseUrl}/api/articles?filter[store][slug]=${encodeURIComponent(storeSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=12&pagination[page]=${targetPage}&populate[]=cover&populate[]=store&populate[]=stores`,
          `${apiBaseUrl}/api/articles?filters[store][slug]=${encodeURIComponent(storeSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=12&pagination[page]=${targetPage}&populate=*`,
          `${apiBaseUrl}/api/articles?filters[store][slug]=${encodeURIComponent(storeSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=12&pagination[page]=${targetPage}`,
          `${apiBaseUrl}/api/articles?filter[store][slug]=${encodeURIComponent(storeSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=12&pagination[page]=${targetPage}`,
        ];

        let payload: CollectionResponse<Article> | null = null;
        let lastError: Error | null = null;

        for (const url of attempts) {
          try {
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Could not load articles (${response.status})`);
            }

            payload = (await response.json()) as CollectionResponse<Article>;
            break;
          } catch (err) {
            lastError = err instanceof Error ? err : new Error('Unexpected error while loading articles');
          }
        }

        if (!payload) {
          throw lastError ?? new Error('Unexpected error while loading articles');
        }

        const rawArticles = payload.data ?? [];
        const nextArticles = hasOwnershipSignals(rawArticles)
          ? rawArticles.filter((entry) => articleBelongsToStore(entry, storeSlug))
          : rawArticles;

        setArticles((current) => {
          if (mode === 'replace') return nextArticles;

          const seen = new Set(current.map((item) => item.id));
          const additions = nextArticles.filter((item) => !seen.has(item.id));
          return [...current, ...additions];
        });

        setPage(payload.meta?.pagination?.page ?? targetPage);
        setPageCount(payload.meta?.pagination?.pageCount ?? 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unexpected error while loading articles');
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [apiBaseUrl, ready, storeSlug]
  );

  useEffect(() => {
    if (!ready || !storeSlug) return;

    setLoading(true);
    setArticles([]);
    setPage(1);
    setPageCount(1);
    loadArticles(1, 'replace');
  }, [loadArticles, ready, storeSlug]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadArticles(1, 'replace');
  }, [loadArticles]);

  const onEndReached = useCallback(() => {
    if (loading || refreshing || loadingMore) return;
    if (page >= pageCount) return;

    setLoadingMore(true);
    loadArticles(page + 1, 'append');
  }, [loadArticles, loading, loadingMore, page, pageCount, refreshing]);

  const openArticle = useCallback(
    (article: Article) => {
      const articleSlug = cleanText(article.slug || '');
      const articleTitle = cleanText(article.title || article.Title || 'Article');
      const fallbackUrl = articleSlug ? joinPath(`${displayBaseUrl}${storeSlug}`, `blog/${articleSlug}`) : `${displayBaseUrl}${storeSlug}`;

      if (!articleSlug) {
        router.push({ pathname: '/web', params: { url: fallbackUrl, title: articleTitle } } as never);
        return;
      }

      router.push({
        pathname: '/article/[slug]',
        params: {
          slug: articleSlug,
          store: storeSlug,
          title: articleTitle,
        },
      } as never);
    },
    [displayBaseUrl, router, storeSlug]
  );

  const renderArticle: ListRenderItem<Article> = ({ item, index }) => {
    const titleValue = cleanText(item.title || item.Title || 'Untitled article');
    const slugValue = cleanText(item.slug || '');
    const previewText = firstSentence(flattenText(item.content ?? item.Content)) || 'No preview text yet.';
    const imageUrl = resolveArticleImage(item);

    return (
      <Animated.View entering={FadeInDown.duration(260).delay(Math.min(index, 8) * 35)}>
        <Pressable onPress={() => openArticle(item)} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.cardImage} contentFit="cover" transition={180} />
          ) : (
            <View style={styles.cardImageFallback}>
              <ThemedText style={styles.cardImageFallbackText}>ARTICLE</ThemedText>
            </View>
          )}
          <ThemedText type="defaultSemiBold" style={styles.cardTitle}>
            {titleValue}
          </ThemedText>
          <ThemedText style={styles.cardMeta}>/{slugValue || 'no-slug'}</ThemedText>
          <ThemedText style={styles.cardBody}>{previewText}</ThemedText>
        </Pressable>
      </Animated.View>
    );
  };

  if (!ready || (loading && articles.length === 0 && !error)) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: `${storeTitle || 'Store'} Articles`,
          headerBackTitle: 'Store',
        }}
      />

      <FlatList
        data={articles}
        keyExtractor={(item, index) => `${item.id ?? 'article'}-${item.slug ?? index}`}
        renderItem={renderArticle}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.45}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 18, paddingBottom: insets.bottom + 30 }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="title" style={styles.headerTitle}>
              Keep reading
            </ThemedText>
            <ThemedText style={styles.headerSubtitle}>
              Infinite article feed for /{storeSlug}. This one pulls from the articles collection.
            </ThemedText>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.centerState}>
              <ThemedText type="subtitle">Could not load articles</ThemedText>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          ) : (
            <View style={styles.centerState}>
              <ThemedText type="subtitle">No articles yet</ThemedText>
              <ThemedText style={styles.errorText}>This store has not published any articles.</ThemedText>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreRow}>
              <ActivityIndicator size="small" />
              <ThemedText style={styles.loadingMoreText}>Loading more articles...</ThemedText>
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
  content: {
    paddingHorizontal: 18,
    gap: 14,
  },
  header: {
    gap: 6,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 30,
    lineHeight: 34,
  },
  headerSubtitle: {
    fontSize: 13,
    opacity: 0.72,
    lineHeight: 18,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.3)',
    padding: 12,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.72)',
  },
  cardPressed: {
    opacity: 0.82,
  },
  cardImage: {
    width: '100%',
    height: 170,
    borderRadius: 14,
    backgroundColor: 'rgba(120,120,120,0.14)',
  },
  cardImageFallback: {
    width: '100%',
    height: 170,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.14)',
  },
  cardImageFallbackText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#475569',
  },
  cardTitle: {
    fontSize: 18,
    lineHeight: 22,
  },
  cardMeta: {
    fontSize: 11,
    opacity: 0.65,
  },
  cardBody: {
    fontSize: 14,
    lineHeight: 19,
    opacity: 0.82,
  },
  loadingMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  loadingMoreText: {
    fontSize: 12,
    opacity: 0.7,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  errorText: {
    textAlign: 'center',
    opacity: 0.72,
    lineHeight: 20,
  },
});