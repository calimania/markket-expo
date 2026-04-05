import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';

type StoreUrl = {
  id?: number;
  Label?: string;
  label?: string;
  URL?: string;
  url?: string;
};

type StoreInfo = {
  id?: number;
  documentId?: string;
  slug?: string;
  title?: string;
  Title?: string;
  Description?: string | null;
  description?: string | null;
  URLS?: StoreUrl[];
};

type Article = {
  id?: number;
  slug?: string;
  title?: string;
  Title?: string;
  Content?: unknown;
  content?: unknown;
};

type Product = {
  id?: number;
  slug?: string;
  name?: string;
  Name?: string;
  Description?: string;
  description?: string;
  usd_price?: number | string;
};

type Page = {
  id?: number;
  slug?: string;
  title?: string;
  Title?: string;
  Content?: unknown;
  content?: unknown;
  Active?: boolean;
  active?: boolean;
};

type CollectionResponse<T> = {
  data?: T[];
};

function safeSlug(value: string): string {
  return value.replace(/^\/+/, '').trim();
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
  if (cleaned.length <= 120) return cleaned;
  return `${cleaned.slice(0, 117)}...`;
}

function titleFromStore(store: StoreInfo | null, fallbackSlug: string): string {
  return cleanText(store?.title || store?.Title || '') || fallbackSlug;
}

function getStorefrontUrl(displayBaseUrl: string, slug: string): string {
  return `${displayBaseUrl}${slug}`;
}

function joinPath(base: string, suffix: string): string {
  return `${base.replace(/\/+$/, '')}/${suffix.replace(/^\/+/, '')}`;
}

function getLabel(item: StoreUrl): string {
  return cleanText(item.Label || item.label || '') || 'Link';
}

function getUrl(item: StoreUrl): string {
  return cleanText(item.URL || item.url || '');
}

export default function StoreScreen() {
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string | string[] }>();
  const { apiBaseUrl, displayBaseUrl, linkOpenMode, ready } = useAppConfig();

  const slugValue = Array.isArray(slug) ? slug[0] : slug;
  const cleanSlug = safeSlug(slugValue ?? '');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(null);
  const [articles, setArticles] = useState<Article[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pages, setPages] = useState<Page[]>([]);

  const openUrlChoice = useCallback(
    (url: string, label: string) => {
      if (linkOpenMode === 'webview') {
        router.push({ pathname: '/web', params: { url, title: label || 'Link' } } as never);
        return;
      }

      if (linkOpenMode === 'browser') {
        Linking.openURL(url).catch(() => {
          Alert.alert('Could not open URL', url);
        });
        return;
      }

      Alert.alert(label || 'Open link', url, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Open in WebView',
          onPress: () => {
            router.push({ pathname: '/web', params: { url, title: label || 'Link' } } as never);
          },
        },
        {
          text: 'Open in Browser',
          onPress: () => {
            Linking.openURL(url).catch(() => {
              Alert.alert('Could not open URL', url);
            });
          },
        },
      ]);
    },
    [linkOpenMode, router]
  );

  const fetchJson = useCallback(async <T,>(url: string): Promise<T> => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`API error ${response.status}`);
    }

    return (await response.json()) as T;
  }, []);

  const load = useCallback(async () => {
    if (!ready || !cleanSlug) return;

    setLoading(true);
    setError(null);

    try {
      const [storeInfoResult, articlesResult, productsResult, pagesResult] = await Promise.allSettled([
        fetchJson<CollectionResponse<StoreInfo>>(
          `${apiBaseUrl}/api/stores?filters[slug]=${encodeURIComponent(cleanSlug)}&populate[]=URLS&pagination[pageSize]=1`
        ),
        fetchJson<CollectionResponse<Article>>(
          `${apiBaseUrl}/api/articles?filters[store][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=5`
        ),
        fetchJson<CollectionResponse<Product>>(
          `${apiBaseUrl}/api/products?filters[stores][slug][$eq]=${encodeURIComponent(cleanSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=5`
        ),
        fetchJson<CollectionResponse<Page>>(
          `${apiBaseUrl}/api/pages?filters[store][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=5`
        ),
      ]);

      if (storeInfoResult.status !== 'fulfilled') {
        throw new Error('Could not load store details');
      }

      setStore(storeInfoResult.value.data?.[0] ?? null);
      setArticles(articlesResult.status === 'fulfilled' ? (articlesResult.value.data ?? []) : []);
      setProducts(productsResult.status === 'fulfilled' ? (productsResult.value.data ?? []) : []);
      setPages(
        pagesResult.status === 'fulfilled'
          ? (pagesResult.value.data ?? []).filter((entry) => entry.Active !== false && entry.active !== false)
          : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, cleanSlug, fetchJson, ready]);

  useEffect(() => {
    load();
  }, [load]);

  const storeTitle = useMemo(() => titleFromStore(store, cleanSlug), [store, cleanSlug]);
  const storefrontUrl = useMemo(() => getStorefrontUrl(displayBaseUrl, cleanSlug), [displayBaseUrl, cleanSlug]);
  const storeLinks = useMemo(() => (store?.URLS ?? []).filter((item) => getUrl(item)), [store?.URLS]);

  const openItemInWebView = useCallback(
    (url: string, title: string) => {
      router.push({ pathname: '/web', params: { url, title } } as never);
    },
    [router]
  );

  if (!ready || loading) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!cleanSlug) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="subtitle">Invalid store slug</ThemedText>
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="subtitle">Could not load store</ThemedText>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <Pressable style={styles.retryButton} onPress={load}>
          <ThemedText style={styles.retryButtonText}>Try Again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: storeTitle ? `/${cleanSlug}` : 'Store',
          headerBackTitle: 'Stores',
        }}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <ThemedText type="title" style={styles.heroTitle}>
            {storeTitle}
          </ThemedText>
          <ThemedText style={styles.heroSlug}>/{cleanSlug}</ThemedText>
          <ThemedText style={styles.heroDescription}>
            {firstSentence(cleanText(store?.description || store?.Description || 'Browse this store in a native hub with clear sections.'))}
          </ThemedText>
          <Pressable style={styles.primaryButton} onPress={() => openUrlChoice(storefrontUrl, 'Storefront')}>
            <ThemedText style={styles.primaryButtonText}>Open Storefront</ThemedText>
          </Pressable>
        </View>

        {storeLinks.length ? (
          <View style={styles.section}>
            <ThemedText type="defaultSemiBold">Quick Links</ThemedText>
            <View style={styles.chipsRow}>
              {storeLinks.map((item, index) => {
                const label = getLabel(item);
                const url = getUrl(item);
                return (
                  <Pressable key={`${label}-${url}-${index}`} style={styles.chip} onPress={() => openUrlChoice(url, label)}>
                    <ThemedText style={styles.chipText}>{label}</ThemedText>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <ThemedText type="defaultSemiBold">Blog</ThemedText>
          {articles.length ? (
            articles.slice(0, 3).map((article, index) => {
              const itemSlug = cleanText(article.slug || '');
              const itemTitle = cleanText(article.title || article.Title || 'Untitled article');
              const itemUrl = itemSlug ? joinPath(storefrontUrl, `blog/${itemSlug}`) : storefrontUrl;

              return (
                <Pressable
                  key={`${article.id ?? 'a'}-${index}`}
                  onPress={() => openItemInWebView(itemUrl, itemTitle)}
                  style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPressed]}>
                  <ThemedText style={styles.itemTitle}>{itemTitle}</ThemedText>
                  <ThemedText style={styles.itemMeta}>/{itemSlug || 'no-slug'}</ThemedText>
                  <ThemedText style={styles.itemBody}>{firstSentence(flattenText(article.content ?? article.Content)) || 'No preview text yet.'}</ThemedText>
                </Pressable>
              );
            })
          ) : (
            <ThemedText style={styles.emptyText}>No blog posts published yet.</ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="defaultSemiBold">Products</ThemedText>
          {products.length ? (
            products.slice(0, 3).map((product, index) => {
              const name = cleanText(product.name || product.Name || 'Untitled product');
              const itemSlug = cleanText(product.slug || '');
              const price =
                typeof product.usd_price === 'number' || typeof product.usd_price === 'string'
                  ? `$${product.usd_price}`
                  : 'Price not set';
              const itemUrl = itemSlug ? joinPath(storefrontUrl, `products/${itemSlug}`) : storefrontUrl;

              return (
                <Pressable
                  key={`${product.id ?? 'p'}-${index}`}
                  onPress={() => openItemInWebView(itemUrl, name)}
                  style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPressed]}>
                  <View style={styles.itemHeader}>
                    <ThemedText style={styles.itemTitle}>{name}</ThemedText>
                    <ThemedText style={styles.priceTag}>{price}</ThemedText>
                  </View>
                  <ThemedText style={styles.itemMeta}>/{itemSlug || 'no-slug'}</ThemedText>
                  <ThemedText style={styles.itemBody}>{firstSentence(cleanText(product.description || product.Description || 'No product description yet.'))}</ThemedText>
                </Pressable>
              );
            })
          ) : (
            <ThemedText style={styles.emptyText}>No products listed yet.</ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="defaultSemiBold">Pages</ThemedText>
          {pages.length ? (
            pages.slice(0, 4).map((page, index) => {
              const itemSlug = cleanText(page.slug || '');
              const itemTitle = cleanText(page.title || page.Title || 'Untitled page');
              const itemUrl = itemSlug ? joinPath(storefrontUrl, `about/${itemSlug}`) : storefrontUrl;

              return (
                <Pressable
                  key={`${page.id ?? 'g'}-${index}`}
                  onPress={() => openItemInWebView(itemUrl, itemTitle)}
                  style={({ pressed }) => [styles.itemCard, pressed && styles.itemCardPressed]}>
                  <ThemedText style={styles.itemTitle}>{itemTitle}</ThemedText>
                  <ThemedText style={styles.itemMeta}>/{itemSlug || 'no-slug'}</ThemedText>
                  <ThemedText style={styles.itemBody}>{firstSentence(flattenText(page.content ?? page.Content)) || 'No page preview available.'}</ThemedText>
                </Pressable>
              );
            })
          ) : (
            <ThemedText style={styles.emptyText}>No standalone pages configured.</ThemedText>
          )}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 34,
    gap: 16,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    gap: 10,
  },
  hero: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
    padding: 14,
    gap: 8,
    backgroundColor: 'rgba(10,126,164,0.08)',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 31,
  },
  heroSlug: {
    opacity: 0.65,
    fontSize: 13,
  },
  heroDescription: {
    opacity: 0.8,
    lineHeight: 20,
  },
  section: {
    gap: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.45)',
    borderRadius: 999,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  itemCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
    padding: 12,
    gap: 5,
  },
  itemCardPressed: {
    opacity: 0.78,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 11,
    opacity: 0.65,
  },
  itemBody: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.82,
  },
  priceTag: {
    fontSize: 12,
    fontWeight: '700',
    color: '#086c33',
  },
  primaryButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: '#0a7ea4',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  emptyText: {
    opacity: 0.65,
    fontSize: 13,
    lineHeight: 18,
  },
  errorText: {
    opacity: 0.72,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#0a7ea4',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
