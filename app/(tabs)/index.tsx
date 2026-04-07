import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  PRICES?: Array<{ price?: number; currency?: string }>;
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
  stores?: Array<{ slug?: string; title?: string }> | null;
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
  PRICES?: Array<{ price?: number; currency?: string }> | null;
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
  stores?: Array<{ slug?: string; title?: string }> | null;
};

type EventsApiResponse = {
  data: Event[];
};

type Page = {
  id: number;
  slug?: string;
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

function createStoresPath(query: string, page: number): string {
  const params = new URLSearchParams(query);
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
  if (!description) return 'No description yet.';

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

function formatEventDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function HomeScreen() {
  const router = useRouter();
  const { apiBaseUrl, displayBaseUrl, defaultStoreSlug, linkOpenMode, ready, storesQuery } = useAppConfig();
  const insets = useSafeAreaInsets();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const loadStores = useCallback(async (targetPage: number, mode: 'replace' | 'append' = 'replace') => {
    if (!ready) return;

    setError(null);

    try {
      const result = await apiGet<StoresApiResponse>(createStoresPath(storesQuery, targetPage), {
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
  }, [apiBaseUrl, ready, storesQuery]);

  useEffect(() => {
    if (!ready) return;

    setLoading(true);
    setStores([]);
    setPage(1);
    setPageCount(1);
    loadStores(1, 'replace');
  }, [apiBaseUrl, loadStores, ready, storesQuery]);

  const [activeStores, setActiveStores] = useState<Store[]>([]);
  const [activeStoresLoading, setActiveStoresLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    setActiveStoresLoading(true);
    const url = `/api/stores?filters[active][$eq]=true&sort[0]=updatedAt:desc&populate[]=Logo&populate[]=URLS&pagination[pageSize]=20`;
    apiGet<StoresApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data) {
          setActiveStores(result.data.data ?? []);
        }
      })
      .catch(() => { })
      .finally(() => setActiveStoresLoading(false));
  }, [apiBaseUrl, ready]);

  const activeSortedStores = useMemo(
    () =>
      activeStores.sort((a, b) => getUpdatedAtTime(b) - getUpdatedAtTime(a)),
    [activeStores]
  );

  const featuredStore = activeSortedStores[0] ?? null;
  const thumbStores = activeSortedStores.slice(1, 9);
  const listStores = stores;

  const [articles, setArticles] = useState<Article[]>([]);
  const [articlesLoading, setArticlesLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    setArticlesLoading(true);
    const url = `/api/articles?sort[0]=updatedAt:desc&populate[]=cover&populate[]=store&pagination[pageSize]=8`;
    apiGet<ArticlesApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data) {
          setArticles(result.data.data);
        } else {
          setArticles([]);
        }
      })
      .catch(() => setArticles([]))
      .finally(() => setArticlesLoading(false));
  }, [apiBaseUrl, ready]);

  const [products, setProducts] = useState<Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    setProductsLoading(true);
    const url = `/api/products?sort[0]=updatedAt:desc&populate[]=PRICES&populate[]=SEO.socialImage&populate[]=stores&pagination[pageSize]=8`;
    apiGet<ProductsApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data) {
          setProducts(result.data.data);
        } else {
          setProducts([]);
        }
      })
      .catch(() => setProducts([]))
      .finally(() => setProductsLoading(false));
  }, [apiBaseUrl, ready]);

  const [pages, setPages] = useState<Page[]>([]);
  const [pagesLoading, setPagesLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    setPagesLoading(true);
    const url = `/api/pages?sort[0]=updatedAt:desc&populate[]=SEO.socialImage&populate[]=store&pagination[pageSize]=8`;
    apiGet<PagesApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data) {
          setPages(result.data.data);
        } else {
          setPages([]);
        }
      })
      .catch(() => setPages([]))
      .finally(() => setPagesLoading(false));
  }, [apiBaseUrl, ready]);

  const [events, setEvents] = useState<Event[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
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
          setEvents(result.data.data);
        } else {
          console.warn('[events] bad result', result);
          setEvents([]);
        }
      })
      .catch((err) => {
        console.error('[events] fetch error', err);
        setEvents([]);
      })
      .finally(() => setEventsLoading(false));
  }, [apiBaseUrl, ready]);

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
    loadStores(1, 'replace');
  }, [loadStores]);

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
                <ThemedText style={styles.slug}>/{item.slug}</ThemedText>
              </View>
            </View>

            <View style={[styles.badge, item.active ? styles.badgeActive : styles.badgeInactive]}>
              <ThemedText style={styles.badgeText}>{item.active ? 'LIVE' : 'DRAFT'}</ThemedText>
            </View>
          </View>

          <ThemedText style={styles.description} numberOfLines={3}>
            {previewDescription(item.Description)}
          </ThemedText>

          <View style={styles.metaRow}>
            <ThemedText style={styles.meta}>Locale {item.locale.toUpperCase()}</ThemedText>
            <ThemedText style={styles.meta}>Tap to open</ThemedText>
          </View>

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
        <ThemedText style={styles.centerText}>Loading markket stores...</ThemedText>
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
        <ThemedText type="title" style={styles.headerTitle}>
          markket
        </ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          Featured storefronts sorted by last updated
        </ThemedText>

        {defaultStoreSlug ? (
          <Pressable
            style={styles.quickOpenButton}
            onPress={() => openStoreBySlug(defaultStoreSlug)}>
            <ThemedText style={styles.quickOpenText}>
              Open my store: /{defaultStoreSlug}
            </ThemedText>
          </Pressable>
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
          <View style={styles.heroSection}>
            {featuredStore ? (
              <>
                <ThemedText type="label" style={styles.heroLabel}>Our Fav</ThemedText>
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
                <ThemedText type="label" style={styles.heroLabel}>Our Fav</ThemedText>
                <SkeletonCard />
              </>
            ) : null}

            <View style={styles.carouselSection}>
              <View style={styles.carouselHeader}>
                <ThemedText type="label" style={styles.carouselLabel}>Latest Articles</ThemedText>
                <ThemedText type="mono" style={styles.carouselMeta}>across all stores</ThemedText>
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
                <ThemedText type="label" style={styles.carouselLabel}>Discover New Products</ThemedText>
                <ThemedText type="mono" style={styles.carouselMeta}>across all stores</ThemedText>
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
                    const imgUrl =
                      product.SEO?.socialImage?.formats?.small?.url ??
                      product.SEO?.socialImage?.formats?.thumbnail?.url ??
                      product.SEO?.socialImage?.url ?? null;
                    const firstStore = product.stores?.[0];
                    const firstPrice = product.PRICES?.[0];
                    return (
                      <Pressable
                        key={product.id}
                        style={({ pressed }) => [styles.productCard, pressed && styles.cardPressed]}
                        onPress={() =>
                          product.slug && firstStore?.slug
                            ? openUrlChoice(`${displayBaseUrl}${firstStore.slug}/products/${product.slug}`, product.Name || 'Product')
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
                <ThemedText type="label" style={styles.carouselLabel}>Latest Pages</ThemedText>
                <ThemedText type="mono" style={styles.carouselMeta}>stories & guides</ThemedText>
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
                <ThemedText type="label" style={styles.carouselLabel}>Upcoming Events</ThemedText>
                <ThemedText type="mono" style={styles.carouselMeta}>sorted by date</ThemedText>
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

            {listStores.length ? (
              <ThemedText type="label" style={styles.collectionLabel}>All Stores</ThemedText>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <ThemedView style={styles.emptyState}>
            <ThemedText type="subtitle">No stores found</ThemedText>
            <ThemedText>Try pulling down to refresh.</ThemedText>
          </ThemedView>
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.loadingMoreRow}>
              <ActivityIndicator size="small" />
              <ThemedText style={styles.loadingMoreText}>Loading more stores...</ThemedText>
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
