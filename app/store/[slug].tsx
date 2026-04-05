import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
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
  Logo?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  logo?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  URLS?: StoreUrl[];
};

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
  store?: {
    slug?: string;
  } | null;
  stores?: Array<{
    slug?: string;
  }>;
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
  SEO?: {
    socialImage?: {
      url?: string;
      formats?: {
        medium?: { url?: string };
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    };
  };
  seo?: {
    socialImage?: {
      url?: string;
      formats?: {
        medium?: { url?: string };
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    };
  };
  store?: {
    slug?: string;
  } | null;
  stores?: Array<{
    slug?: string;
  }>;
};

type CollectionResponse<T> = {
  data?: T[];
};

function extractSettledError(result: PromiseSettledResult<unknown>, fallback: string): string | null {
  if (result.status !== 'rejected') return null;

  const reason = result.reason;
  if (reason instanceof Error && reason.message) return reason.message;
  if (typeof reason === 'string' && reason.trim()) return reason;
  return fallback;
}

const MARKDOWN_TOKEN_REGEX =
  /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|(https?:\/\/[^\s]+))/g;

function safeSlug(value: string): string {
  return value.replace(/^\/+/, '').trim();
}

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeMarkdown(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\r\n/g, '\n').trim();
}

function renderMarkdownInline(
  value: string,
  keyPrefix: string,
  onLinkPress: (url: string) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;

  for (const match of value.matchAll(MARKDOWN_TOKEN_REGEX)) {
    const full = match[0] ?? '';
    const start = match.index ?? 0;

    if (start > lastIndex) {
      nodes.push(
        <Text key={`${keyPrefix}-plain-${tokenIndex}`} style={styles.markdownInline}>
          {value.slice(lastIndex, start)}
        </Text>
      );
      tokenIndex += 1;
    }

    if (match[2] && match[3]) {
      const label = match[2];
      const url = match[3];
      nodes.push(
        <Text
          key={`${keyPrefix}-link-${tokenIndex}`}
          style={[styles.markdownInline, styles.markdownLink]}
          onPress={() => onLinkPress(url)}>
          {label}
        </Text>
      );
    } else if (match[4]) {
      nodes.push(
        <Text key={`${keyPrefix}-bold-${tokenIndex}`} style={[styles.markdownInline, styles.markdownBold]}>
          {match[4]}
        </Text>
      );
    } else if (match[5]) {
      nodes.push(
        <Text key={`${keyPrefix}-code-${tokenIndex}`} style={[styles.markdownInline, styles.markdownCode]}>
          {match[5]}
        </Text>
      );
    } else if (match[6]) {
      nodes.push(
        <Text key={`${keyPrefix}-italic-${tokenIndex}`} style={[styles.markdownInline, styles.markdownItalic]}>
          {match[6]}
        </Text>
      );
    } else if (match[7]) {
      const url = match[7];
      nodes.push(
        <Text
          key={`${keyPrefix}-url-${tokenIndex}`}
          style={[styles.markdownInline, styles.markdownLink]}
          onPress={() => onLinkPress(url)}>
          {url}
        </Text>
      );
    }

    tokenIndex += 1;
    lastIndex = start + full.length;
  }

  if (lastIndex < value.length) {
    nodes.push(
      <Text key={`${keyPrefix}-tail-${tokenIndex}`} style={styles.markdownInline}>
        {value.slice(lastIndex)}
      </Text>
    );
  }

  return nodes;
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

function resolveStoreLogo(store: StoreInfo | null): string {
  return cleanText(
    store?.logo?.formats?.medium?.url ||
    store?.Logo?.formats?.medium?.url ||
    store?.logo?.formats?.small?.url ||
    store?.Logo?.formats?.small?.url ||
    store?.logo?.formats?.thumbnail?.url ||
    store?.Logo?.formats?.thumbnail?.url ||
    store?.logo?.url ||
    store?.Logo?.url ||
    ''
  );
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
  if (!slug) return true;

  const direct = cleanText(article.store?.slug || '');
  if (direct) return direct === slug;

  const many = Array.isArray(article.stores)
    ? article.stores.map((entry) => cleanText(entry?.slug || '')).filter(Boolean)
    : [];

  if (many.length) return many.includes(slug);

  // If relation data is not populated, do not block the entry here.
  return true;
}

function hasArticleOwnershipSignals(items: Article[]): boolean {
  return items.some((entry) => {
    const direct = cleanText(entry.store?.slug || '');
    const many = Array.isArray(entry.stores)
      ? entry.stores.map((store) => cleanText(store?.slug || '')).filter(Boolean)
      : [];

    return Boolean(direct) || many.length > 0;
  });
}

function resolvePageImage(page: Page): string {
  return cleanText(
    page.seo?.socialImage?.formats?.medium?.url ||
    page.SEO?.socialImage?.formats?.medium?.url ||
    page.seo?.socialImage?.formats?.small?.url ||
    page.SEO?.socialImage?.formats?.small?.url ||
    page.seo?.socialImage?.formats?.thumbnail?.url ||
    page.SEO?.socialImage?.formats?.thumbnail?.url ||
    page.seo?.socialImage?.url ||
    page.SEO?.socialImage?.url ||
    ''
  );
}

function pageBelongsToStore(page: Page, targetSlug: string): boolean {
  const slug = cleanText(targetSlug);
  if (!slug) return true;

  const direct = cleanText(page.store?.slug || '');
  if (direct) return direct === slug;

  const many = Array.isArray(page.stores)
    ? page.stores.map((entry) => cleanText(entry?.slug || '')).filter(Boolean)
    : [];

  if (many.length) return many.includes(slug);

  // If relation data is not populated, do not block the entry here.
  return true;
}

function hasPageOwnershipSignals(items: Page[]): boolean {
  return items.some((entry) => {
    const direct = cleanText(entry.store?.slug || '');
    const many = Array.isArray(entry.stores)
      ? entry.stores.map((store) => cleanText(store?.slug || '')).filter(Boolean)
      : [];

    return Boolean(direct) || many.length > 0;
  });
}

export default function StoreScreen() {
  const router = useRouter();
  const { slug, previewTitle, previewDescription, previewLogo, previewLocale } =
    useLocalSearchParams<{
      slug: string | string[];
      previewTitle?: string | string[];
      previewDescription?: string | string[];
      previewLogo?: string | string[];
      previewLocale?: string | string[];
    }>();
  const { apiBaseUrl, displayBaseUrl, linkOpenMode, ready } = useAppConfig();

  const slugValue = Array.isArray(slug) ? slug[0] : slug;
  const previewTitleValue = Array.isArray(previewTitle) ? previewTitle[0] : previewTitle;
  const previewDescriptionValue = Array.isArray(previewDescription)
    ? previewDescription[0]
    : previewDescription;
  const previewLogoValue = Array.isArray(previewLogo) ? previewLogo[0] : previewLogo;
  const previewLocaleValue = Array.isArray(previewLocale) ? previewLocale[0] : previewLocale;
  const cleanSlug = safeSlug(slugValue ?? '');
  const initialStore = useMemo<StoreInfo | null>(() => {
    if (!cleanSlug) return null;

    if (!previewTitleValue && !previewDescriptionValue && !previewLogoValue) {
      return null;
    }

    return {
      slug: cleanSlug,
      title: cleanText(previewTitleValue || cleanSlug),
      Description: cleanText(previewDescriptionValue || ''),
      Logo: previewLogoValue ? { url: cleanText(previewLogoValue) } : null,
      URLS: [],
    };
  }, [cleanSlug, previewDescriptionValue, previewLogoValue, previewTitleValue]);

  const [loading, setLoading] = useState(!initialStore);
  const [error, setError] = useState<string | null>(null);
  const [store, setStore] = useState<StoreInfo | null>(initialStore);
  const [articles, setArticles] = useState<Article[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [articlesError, setArticlesError] = useState<string | null>(null);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [pagesError, setPagesError] = useState<string | null>(null);

  const openExternalUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open URL', url);
    });
  }, []);

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

  const fetchStoreInfo = useCallback(async (): Promise<CollectionResponse<StoreInfo>> => {
    const baseQueries = [
      `${apiBaseUrl}/api/stores?filters[slug][$eq]=${encodeURIComponent(cleanSlug)}&pagination[pageSize]=1`,
      `${apiBaseUrl}/api/stores?filters[slug]=${encodeURIComponent(cleanSlug)}&pagination[pageSize]=1`,
      `${apiBaseUrl}/api/stores?filter[slug][$eq]=${encodeURIComponent(cleanSlug)}&pagination[pageSize]=1`,
    ];

    const attempts = baseQueries.flatMap((base) => [
      `${base}&populate[]=URLS&populate[]=Logo`,
      `${base}&populate[]=URLS&populate[]=logo`,
      `${base}&populate[]=URLS&populate=*`,
      `${base}&populate[]=URLS`,
      base,
    ]);

    let lastError: Error | null = null;

    for (const url of attempts) {
      try {
        return await fetchJson<CollectionResponse<StoreInfo>>(url);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Could not load store details');
      }
    }

    throw lastError ?? new Error('Could not load store details');
  }, [apiBaseUrl, cleanSlug, fetchJson]);

  const fetchStoreArticles = useCallback(async (): Promise<CollectionResponse<Article>> => {
    const baseQueries = [
      `${apiBaseUrl}/api/articles?filter[store][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=8`,
      `${apiBaseUrl}/api/articles?filters[store][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=8`,
    ];

    const attempts = baseQueries.flatMap((base) => [
      `${base}&populate[]=cover&populate[]=store&populate[]=stores`,
      `${base}&populate[]=Cover&populate[]=store&populate[]=stores`,
      `${base}&populate[cover]=*`,
      `${base}&populate=*`,
      base,
    ]);

    let lastError: Error | null = null;

    for (const url of attempts) {
      try {
        return await fetchJson<CollectionResponse<Article>>(url);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Could not load store articles');
      }
    }

    throw lastError ?? new Error('Could not load store articles');
  }, [apiBaseUrl, cleanSlug, fetchJson]);

  const fetchStorePages = useCallback(async (): Promise<CollectionResponse<Page>> => {
    const baseQueries = [
      `${apiBaseUrl}/api/pages?filter[store][slug]=${encodeURIComponent(cleanSlug)}`,
      `${apiBaseUrl}/api/pages?filter[store][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filter[store][slug][$eq]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filters[store][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filters[store][slug][$eq]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filter[stores][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filter[stores][slug][$eq]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filters[stores][slug]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filters[stores][slug][$eq]=${encodeURIComponent(cleanSlug)}&sort[0]=menuOrder:asc&pagination[pageSize]=12`,
      `${apiBaseUrl}/api/pages?filters[store][slug]=${encodeURIComponent(cleanSlug)}`,
      `${apiBaseUrl}/api/pages?filter[stores][slug]=${encodeURIComponent(cleanSlug)}`,
      `${apiBaseUrl}/api/pages?filters[stores][slug]=${encodeURIComponent(cleanSlug)}`,
    ];

    const attempts = baseQueries.flatMap((base) => [
      base,
      `${base}&populate[]=SEO.socialImage&populate[]=store&populate[]=stores`,
      `${base}&populate[]=seo.socialImage&populate[]=store&populate[]=stores`,
      `${base}&populate[SEO][populate][socialImage]=*`,
      `${base}&populate[seo][populate][socialImage]=*`,
      `${base}&populate=*`,
    ]);

    let lastError: Error | null = null;

    for (const url of attempts) {
      try {
        return await fetchJson<CollectionResponse<Page>>(url);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error('Could not load store pages');
      }
    }

    throw lastError ?? new Error('Could not load store pages');
  }, [apiBaseUrl, cleanSlug, fetchJson]);

  const load = useCallback(async () => {
    if (!ready || !cleanSlug) return;

    setLoading(true);
    setError(null);
    setArticlesError(null);
    setProductsError(null);
    setPagesError(null);

    try {
      const [storeInfoResult, articlesResult, productsResult, pagesResult] = await Promise.allSettled([
        fetchStoreInfo(),
        fetchStoreArticles(),
        fetchJson<CollectionResponse<Product>>(
          `${apiBaseUrl}/api/products?filters[stores][slug][$eq]=${encodeURIComponent(cleanSlug)}&sort[0]=updatedAt:desc&pagination[pageSize]=5`
        ),
        fetchStorePages(),
      ]);

      if (storeInfoResult.status !== 'fulfilled') {
        throw new Error('Could not load store details');
      }

      setStore(storeInfoResult.value.data?.[0] ?? null);
      if (articlesResult.status === 'fulfilled') {
        const rawArticles = articlesResult.value.data ?? [];
        const strictArticles = hasArticleOwnershipSignals(rawArticles)
          ? rawArticles.filter((entry) => articleBelongsToStore(entry, cleanSlug))
          : rawArticles;
        setArticles(strictArticles);
      } else {
        setArticles([]);
        setArticlesError(extractSettledError(articlesResult, 'Could not load blog posts'));
      }

      if (productsResult.status === 'fulfilled') {
        setProducts(productsResult.value.data ?? []);
      } else {
        setProducts([]);
        setProductsError(extractSettledError(productsResult, 'Could not load products'));
      }

      if (pagesResult.status === 'fulfilled') {
        const rawPages = pagesResult.value.data ?? [];
        const scopedPages = hasPageOwnershipSignals(rawPages)
          ? rawPages.filter((entry) => pageBelongsToStore(entry, cleanSlug))
          : rawPages;
        setPages(scopedPages.filter((entry) => entry.Active !== false && entry.active !== false));
      } else {
        setPages([]);
        setPagesError(extractSettledError(pagesResult, 'Could not load pages'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, cleanSlug, fetchJson, fetchStoreArticles, fetchStoreInfo, fetchStorePages, ready]);

  useEffect(() => {
    load();
  }, [load]);

  const storeTitle = useMemo(() => titleFromStore(store, cleanSlug), [store, cleanSlug]);
  const storeLogo = useMemo(() => resolveStoreLogo(store), [store]);
  const storefrontUrl = useMemo(() => getStorefrontUrl(displayBaseUrl, cleanSlug), [displayBaseUrl, cleanSlug]);
  const storeLinks = useMemo(() => (store?.URLS ?? []).filter((item) => getUrl(item)), [store?.URLS]);
  const storeDescriptionMarkdown = useMemo(
    () => normalizeMarkdown(store?.description || store?.Description || ''),
    [store]
  );

  const openItemInWebView = useCallback(
    (url: string, title: string) => {
      router.push({ pathname: '/web', params: { url, title } } as never);
    },
    [router]
  );

  const openArticle = useCallback(
    (articleSlug: string, articleTitle: string, fallbackUrl: string) => {
      if (!articleSlug) {
        openItemInWebView(fallbackUrl, articleTitle || 'Article');
        return;
      }

      router.push({
        pathname: '/article/[slug]',
        params: {
          slug: articleSlug,
          store: cleanSlug,
          title: articleTitle || 'Article',
        },
      } as never);
    },
    [cleanSlug, openItemInWebView, router]
  );

  const openPage = useCallback(
    (pageSlug: string, pageTitle: string, fallbackUrl: string) => {
      if (!pageSlug) {
        openItemInWebView(fallbackUrl, pageTitle || 'Page');
        return;
      }

      router.push({
        pathname: '/page/[slug]',
        params: {
          slug: pageSlug,
          store: cleanSlug,
          title: pageTitle || 'Page',
        },
      } as never);
    },
    [cleanSlug, openItemInWebView, router]
  );

  const openBlogArchive = useCallback(() => {
    router.push({ pathname: '/store-blog/[slug]', params: { slug: cleanSlug, title: storeTitle } } as never);
  }, [cleanSlug, router, storeTitle]);

  if (!ready || (loading && !store)) {
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

  if (error && !store) {
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
        <Animated.View style={styles.hero} entering={FadeInDown.duration(360)}>
          <View style={styles.heroTopRow}>
            {storeLogo ? (
              <Image source={{ uri: storeLogo }} style={styles.heroLogo} contentFit="cover" transition={250} />
            ) : (
              <View style={styles.heroLogoFallback}>
                <ThemedText style={styles.heroLogoFallbackText}>
                  {storeTitle.charAt(0).toUpperCase()}
                </ThemedText>
              </View>
            )}

            <View style={styles.heroBadge}>
              <ThemedText style={styles.heroBadgeText}>Native Store Hub</ThemedText>
            </View>
          </View>

          <ThemedText type="title" style={styles.heroTitle}>
            {storeTitle}
          </ThemedText>
          <ThemedText style={styles.heroSlug}>/{cleanSlug}</ThemedText>
          {previewLocaleValue && !store?.URLS?.length ? (
            <ThemedText style={styles.heroMeta}>Locale {cleanText(previewLocaleValue).toUpperCase()}</ThemedText>
          ) : null}

          {storeDescriptionMarkdown ? (
            <View style={styles.heroMarkdown}>
              {storeDescriptionMarkdown.split(/\n{2,}/).map((paragraph, index) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return null;

                return (
                  <ThemedText key={`md-${index}`} style={styles.heroDescription}>
                    {renderMarkdownInline(trimmed, `hero-${index}`, openExternalUrl)}
                  </ThemedText>
                );
              })}
            </View>
          ) : (
              <ThemedText style={styles.heroDescription}>
                {firstSentence(
                  cleanText(
                    store?.description ||
                    store?.Description ||
                    'Browse this store in a native hub with clear sections.'
                  )
                )}
              </ThemedText>
          )}

          <Pressable style={styles.primaryButton} onPress={() => openUrlChoice(storefrontUrl, 'Storefront')}>
            <ThemedText style={styles.primaryButtonText}>Open Storefront</ThemedText>
          </Pressable>
        </Animated.View>

        {loading ? (
          <Animated.View style={styles.loadingStage} entering={FadeIn.duration(220)}>
            <ActivityIndicator size="small" />
            <View style={styles.loadingStageTextWrap}>
              <ThemedText type="defaultSemiBold" style={styles.loadingStageTitle}>
                Loading the rest of this store...
              </ThemedText>
              <ThemedText style={styles.loadingStageText}>
                Header is ready. Blog, products, pages, and links are sliding in next.
              </ThemedText>
            </View>
          </Animated.View>
        ) : null}

        {!loading && storeLinks.length ? (
          <Animated.View style={styles.section} entering={FadeIn.duration(320).delay(90)}>
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
          </Animated.View>
        ) : null}

        <Animated.View style={styles.section} entering={FadeInDown.duration(320).delay(130)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionMarker, styles.blogMarker]} />
            <View style={styles.sectionTitleWrap}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                Blog
              </ThemedText>
              <ThemedText style={styles.sectionSubtitle}>Fresh stories from this store</ThemedText>
            </View>
            <View style={[styles.sectionBadge, styles.blogBadge]}>
              <ThemedText style={styles.sectionBadgeText}>new</ThemedText>
            </View>
          </View>
          <Pressable style={styles.seeMoreButton} onPress={openBlogArchive}>
            <ThemedText style={styles.seeMoreText}>Keep reading all articles</ThemedText>
            <ThemedText style={styles.seeMoreArrow}>→</ThemedText>
          </Pressable>
          {loading ? (
            <View style={styles.loadingSectionCard}>
              <ActivityIndicator size="small" />
              <ThemedText style={styles.loadingSectionText}>Loading blog posts...</ThemedText>
            </View>
          ) : articles.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railContent}
              style={styles.railScroll}>
              {articles.slice(0, 8).map((article, index) => {
              const itemSlug = cleanText(article.slug || '');
              const itemTitle = cleanText(article.title || article.Title || 'Untitled article');
              const itemUrl = itemSlug ? joinPath(storefrontUrl, `blog/${itemSlug}`) : storefrontUrl;
                const itemImage = resolveArticleImage(article);

              return (
                <Pressable
                  key={`${article.id ?? 'a'}-${index}`}
                  onPress={() => openArticle(itemSlug, itemTitle, itemUrl)}
                  style={({ pressed }) => [styles.railCard, pressed && styles.itemCardPressed]}>
                  {itemImage ? (
                    <Image source={{ uri: itemImage }} style={styles.railImage} contentFit="cover" transition={180} />
                  ) : (
                    <View style={[styles.railImageFallback, styles.blogMarkerSoft]}>
                      <ThemedText style={styles.railImageFallbackText}>BLOG</ThemedText>
                    </View>
                  )}
                  <ThemedText style={styles.itemTitle}>{itemTitle}</ThemedText>
                  <ThemedText style={styles.itemMeta}>/{itemSlug || 'no-slug'}</ThemedText>
                  <ThemedText style={styles.itemBody}>{firstSentence(flattenText(article.content ?? article.Content)) || 'No preview text yet.'}</ThemedText>
                </Pressable>
              );
              })}
              </ScrollView>
          ) : (
            <View style={styles.emptyStateWrap}>
              <ThemedText style={styles.emptyText}>No blog posts published yet.</ThemedText>
              {articlesError ? <ThemedText style={styles.sectionErrorText}>Debug: {articlesError}</ThemedText> : null}
            </View>
          )}
        </Animated.View>

        <Animated.View style={styles.section} entering={FadeInDown.duration(320).delay(170)}>
          <ThemedText type="defaultSemiBold">Products</ThemedText>
          {loading ? (
            <View style={styles.loadingSectionCard}>
              <ActivityIndicator size="small" />
              <ThemedText style={styles.loadingSectionText}>Loading products...</ThemedText>
            </View>
          ) : products.length ? (
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
            <View style={styles.emptyStateWrap}>
              <ThemedText style={styles.emptyText}>No products listed yet.</ThemedText>
              {productsError ? <ThemedText style={styles.sectionErrorText}>Debug: {productsError}</ThemedText> : null}
            </View>
          )}
        </Animated.View>

        <Animated.View style={styles.section} entering={FadeInDown.duration(320).delay(210)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionMarker, styles.pageMarker]} />
            <View style={styles.sectionTitleWrap}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                Pages
              </ThemedText>
              <ThemedText style={styles.sectionSubtitle}>Useful guides and static info</ThemedText>
            </View>
            <View style={[styles.sectionBadge, styles.pageBadge]}>
              <ThemedText style={styles.sectionBadgeText}>guide</ThemedText>
            </View>
          </View>
          {loading ? (
            <View style={styles.loadingSectionCard}>
              <ActivityIndicator size="small" />
              <ThemedText style={styles.loadingSectionText}>Loading pages...</ThemedText>
            </View>
          ) : pages.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railContent}
              style={styles.railScroll}>
              {pages.slice(0, 12).map((page, index) => {
              const itemSlug = cleanText(page.slug || '');
              const itemTitle = cleanText(page.title || page.Title || 'Untitled page');
              const itemUrl = itemSlug ? joinPath(storefrontUrl, `about/${itemSlug}`) : storefrontUrl;
                const itemImage = resolvePageImage(page);

              return (
                <Pressable
                  key={`${page.id ?? 'g'}-${index}`}
                  onPress={() => openPage(itemSlug, itemTitle, itemUrl)}
                  style={({ pressed }) => [styles.railCard, pressed && styles.itemCardPressed]}>
                  {itemImage ? (
                    <Image source={{ uri: itemImage }} style={styles.railImage} contentFit="cover" transition={180} />
                  ) : (
                    <View style={[styles.railImageFallback, styles.pageMarkerSoft]}>
                      <ThemedText style={styles.railImageFallbackText}>PAGE</ThemedText>
                    </View>
                  )}
                  <ThemedText style={styles.itemTitle}>{itemTitle}</ThemedText>
                  <ThemedText style={styles.itemMeta}>/{itemSlug || 'no-slug'}</ThemedText>
                  <ThemedText style={styles.itemBody}>{firstSentence(flattenText(page.content ?? page.Content)) || 'No page preview available.'}</ThemedText>
                </Pressable>
              );
              })}
              </ScrollView>
          ) : (
            <View style={styles.emptyStateWrap}>
              <ThemedText style={styles.emptyText}>No pages published yet.</ThemedText>
              {pagesError ? <ThemedText style={styles.sectionErrorText}>Debug: {pagesError}</ThemedText> : null}
            </View>
          )}
        </Animated.View>
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
  emptyStateWrap: {
    gap: 6,
  },
  sectionErrorText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#B42318',
    opacity: 0.95,
  },
  hero: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
    padding: 14,
    gap: 8,
    backgroundColor: 'rgba(10,126,164,0.08)',
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  heroLogo: {
    width: 68,
    height: 68,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  heroLogoFallback: {
    width: 68,
    height: 68,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(34,211,238,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.55)',
  },
  heroLogoFallbackText: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '700',
    color: '#155E75',
  },
  heroBadge: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.45)',
    backgroundColor: 'rgba(217,70,239,0.12)',
  },
  heroBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: '#86198F',
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 28,
    lineHeight: 31,
  },
  heroSlug: {
    opacity: 0.65,
    fontSize: 13,
  },
  heroMeta: {
    opacity: 0.7,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroDescription: {
    opacity: 0.8,
    lineHeight: 20,
  },
  loadingStage: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.28)',
    backgroundColor: 'rgba(255,216,77,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingStageTextWrap: {
    flex: 1,
    gap: 2,
  },
  loadingStageTitle: {
    fontSize: 14,
  },
  loadingStageText: {
    fontSize: 12,
    lineHeight: 17,
    opacity: 0.72,
  },
  heroMarkdown: {
    gap: 8,
  },
  markdownInline: {
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  markdownBold: {
    fontWeight: '700',
  },
  markdownItalic: {
    fontStyle: 'italic',
  },
  markdownCode: {
    fontFamily: 'RobotoMono',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  markdownLink: {
    color: '#0891B2',
    textDecorationLine: 'underline',
  },
  section: {
    gap: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 2,
  },
  sectionMarker: {
    width: 10,
    height: 36,
    borderRadius: 999,
  },
  blogMarker: {
    backgroundColor: '#22D3EE',
  },
  pageMarker: {
    backgroundColor: '#D946EF',
  },
  sectionTitleWrap: {
    flex: 1,
    gap: 1,
  },
  sectionTitle: {
    lineHeight: 20,
  },
  sectionSubtitle: {
    fontSize: 12,
    opacity: 0.65,
    lineHeight: 16,
  },
  sectionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  blogBadge: {
    backgroundColor: 'rgba(34,211,238,0.14)',
    borderColor: 'rgba(34,211,238,0.4)',
  },
  pageBadge: {
    backgroundColor: 'rgba(217,70,239,0.12)',
    borderColor: 'rgba(217,70,239,0.35)',
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#4B5563',
  },
  seeMoreButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.28)',
    backgroundColor: 'rgba(255,252,242,0.94)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seeMoreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#86198F',
    letterSpacing: 0.3,
  },
  seeMoreArrow: {
    fontSize: 15,
    lineHeight: 15,
    fontWeight: '700',
    color: '#0891B2',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  railScroll: {
    marginHorizontal: -18,
  },
  railContent: {
    paddingHorizontal: 18,
    gap: 12,
  },
  railCard: {
    width: 260,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.28)',
    padding: 12,
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.62)',
  },
  railImage: {
    width: '100%',
    height: 132,
    borderRadius: 14,
    backgroundColor: 'rgba(120,120,120,0.14)',
  },
  railImageFallback: {
    width: '100%',
    height: 132,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  blogMarkerSoft: {
    backgroundColor: 'rgba(34,211,238,0.16)',
  },
  pageMarkerSoft: {
    backgroundColor: 'rgba(217,70,239,0.14)',
  },
  railImageFallbackText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    color: '#475569',
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
  loadingSectionCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.25)',
    paddingHorizontal: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  loadingSectionText: {
    fontSize: 13,
    opacity: 0.72,
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
    backgroundColor: '#D946EF',
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
    backgroundColor: '#D946EF',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
