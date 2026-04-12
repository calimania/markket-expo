import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Animated, { FadeIn, FadeInDown, FadeInUp } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { SkeletonCard } from '@/components/ui/skeleton';

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
  SEO?: {
    metaDescription?: string;
  };
  seo?: {
    metaDescription?: string;
  };
  store?: {
    slug?: string;
  } | null;
  stores?: {
    slug?: string;
  }[];
};

type Price = {
  id?: number;
  STRIPE_ID?: string;
  Price?: number;
  price?: number;
  Name?: string;
  Currency?: string;
  currency?: string;
  Description?: string;
  inventory?: number | null;
  hidden?: boolean;
  ships_to?: string[];
};

type Product = {
  id?: number;
  documentId?: string;
  slug?: string;
  name?: string;
  Name?: string;
  Description?: string;
  description?: string;
  usd_price?: number | string;
  PRICES?: Price[];
  prices?: Price[];
  Slides?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  }[];
  slides?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  }[];
  Thumbnail?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  thumbnail?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  SEO?: {
    metaDescription?: string;
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
    metaDescription?: string;
    socialImage?: {
      url?: string;
      formats?: {
        medium?: { url?: string };
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    };
  };
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
    metaDescription?: string;
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
    metaDescription?: string;
  };
  store?: {
    slug?: string;
  } | null;
  stores?: {
    slug?: string;
  }[];
};

type Event = {
  id?: number;
  documentId?: string;
  slug?: string;
  Name?: string;
  startDate?: string;
  endDate?: string;
  usd_price?: number | string | null;
  PRICES?: { id?: number; price?: number; currency?: string }[];
  Thumbnail?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  SEO?: {
    metaUrl?: string;
    metaDescription?: string;
    socialImage?: {
      url?: string;
      formats?: {
        medium?: { url?: string };
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    };
  };
  stores?: { slug?: string; title?: string }[];
  maxCapacity?: number | null;
  amountSold?: number | null;
};

type CollectionResponse<T> = {
  data?: T[];
};

type InlineNode = {
  type?: string;
  text?: string;
  url?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  children?: InlineNode[];
};

type ContentBlock = {
  type?: string;
  level?: number;
  format?: string;
  children?: InlineNode[];
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

function renderMarkdownTextBlocks(
  value: string,
  keyPrefix: string,
  onLinkPress: (url: string) => void
): ReactNode[] {
  const nodes: ReactNode[] = [];
  const lines = value.split(/\n/);
  let listBuffer: string[] = [];
  let orderedList = false;
  let listIndex = 0;

  const flushList = () => {
    if (!listBuffer.length) return;

    nodes.push(
      <View key={`${keyPrefix}-list-${listIndex}`} style={styles.heroListGroup}>
        {listBuffer.map((item, itemIndex) => (
          <View key={`${keyPrefix}-list-${listIndex}-${itemIndex}`} style={styles.heroListRow}>
            <ThemedText style={styles.heroListBullet}>{orderedList ? `${itemIndex + 1}.` : '•'}</ThemedText>
            <ThemedText style={styles.heroListText}>
              {renderMarkdownInline(item, `${keyPrefix}-list-item-${listIndex}-${itemIndex}`, onLinkPress)}
            </ThemedText>
          </View>
        ))}
      </View>
    );

    listBuffer = [];
    orderedList = false;
    listIndex += 1;
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      return;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2];

      nodes.push(
        <ThemedText
          key={`${keyPrefix}-heading-${index}`}
          style={[
            styles.heroMarkdownHeading,
            level >= 2 ? styles.heroMarkdownHeadingSmall : null,
          ]}>
          {renderMarkdownInline(headingText, `${keyPrefix}-heading-${index}`, onLinkPress)}
        </ThemedText>
      );
      return;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);

    if (bulletMatch || orderedMatch) {
      const nextOrdered = Boolean(orderedMatch);
      const text = bulletMatch?.[1] ?? orderedMatch?.[1] ?? '';

      if (listBuffer.length && orderedList !== nextOrdered) {
        flushList();
      }

      orderedList = nextOrdered;
      listBuffer.push(text);
      return;
    }

    flushList();
    nodes.push(
      <ThemedText key={`${keyPrefix}-paragraph-${index}`} style={styles.heroDescription}>
        {renderMarkdownInline(trimmed, `${keyPrefix}-paragraph-${index}`, onLinkPress)}
      </ThemedText>
    );
  });

  flushList();

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

  // Check if store/stores was populated (key present, even if null/empty)
  const storePopulated = article.store !== undefined;
  const storesPopulated = article.stores !== undefined;

  const direct = cleanText(article.store?.slug || '');
  if (direct) return direct === slug;

  const many = Array.isArray(article.stores)
    ? article.stores.map((entry) => cleanText(entry?.slug || '')).filter(Boolean)
    : [];
  if (many.length) return many.includes(slug);

  // Relation was populated but null/empty → article genuinely has no store → exclude
  if (storePopulated || storesPopulated) return false;

  // Relation was not requested → can't verify → fail-open
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

function resolveSeoMetaDescription(entity: { SEO?: { metaDescription?: string }; seo?: { metaDescription?: string } }): string {
  return cleanText(entity.SEO?.metaDescription || entity.seo?.metaDescription || '');
}

function dedupeImageAssets<T extends { url?: string; formats?: { medium?: { url?: string }; small?: { url?: string }; thumbnail?: { url?: string } } }>(
  items: T[] | null | undefined
): T[] {
  if (!Array.isArray(items) || items.length === 0) return [];

  const seen = new Set<string>();
  const deduped: T[] = [];

  items.forEach((item, index) => {
    const identity = cleanText(item.formats?.medium?.url || item.formats?.small?.url || item.formats?.thumbnail?.url || item.url || '') || `index:${index}`;
    if (seen.has(identity)) return;
    seen.add(identity);
    deduped.push(item);
  });

  return deduped;
}

function resolveProductImage(product: Product): string {
  const slides = dedupeImageAssets(product.Slides ?? product.slides ?? []);
  const firstSlide = Array.isArray(slides) ? slides[0] : null;

  return cleanText(
    firstSlide?.formats?.medium?.url ||
    firstSlide?.formats?.small?.url ||
    firstSlide?.formats?.thumbnail?.url ||
    firstSlide?.url ||
    product.Thumbnail?.formats?.medium?.url ||
    product.thumbnail?.formats?.medium?.url ||
    product.Thumbnail?.formats?.small?.url ||
    product.thumbnail?.formats?.small?.url ||
    product.Thumbnail?.formats?.thumbnail?.url ||
    product.thumbnail?.formats?.thumbnail?.url ||
    product.Thumbnail?.url ||
    product.thumbnail?.url ||
    product.SEO?.socialImage?.formats?.medium?.url ||
    product.SEO?.socialImage?.formats?.small?.url ||
    product.SEO?.socialImage?.formats?.thumbnail?.url ||
    product.SEO?.socialImage?.url ||
    product.seo?.socialImage?.formats?.medium?.url ||
    product.seo?.socialImage?.formats?.small?.url ||
    product.seo?.socialImage?.formats?.thumbnail?.url ||
    product.seo?.socialImage?.url ||
    ''
  );
}

function pageBelongsToStore(page: Page, targetSlug: string): boolean {
  const slug = cleanText(targetSlug);
  if (!slug) return true;

  // Check if store/stores was populated (key present, even if null/empty)
  const storePopulated = page.store !== undefined;
  const storesPopulated = page.stores !== undefined;

  const direct = cleanText(page.store?.slug || '');
  if (direct) return direct === slug;

  const many = Array.isArray(page.stores)
    ? page.stores.map((entry) => cleanText(entry?.slug || '')).filter(Boolean)
    : [];
  if (many.length) return many.includes(slug);

  // Relation was populated but null/empty → page genuinely has no store → exclude
  if (storePopulated || storesPopulated) return false;

  // Relation was not requested → can't verify → fail-open
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

const MAGIC_PAGE_SLUGS = new Set(['newsletter', 'products', 'blog', 'home']);

function getPageSlugValue(page: Page): string {
  return cleanText(page.slug || '').toLocaleLowerCase();
}

function getPageBodyContent(page: Page | undefined): string {
  if (!page) return '';
  const raw = typeof page.content === 'string' ? page.content : typeof page.Content === 'string' ? page.Content : '';
  if (raw) return normalizeMarkdown(raw);
  return normalizeMarkdown(flattenText(page.content ?? page.Content));
}

function getPageContentBlocks(page: Page | undefined): ContentBlock[] {
  if (!page) return [];
  const value = page.content ?? page.Content;
  if (!Array.isArray(value)) return [];
  return value as ContentBlock[];
}

function inlineNodesText(nodes?: InlineNode[]): string {
  if (!nodes?.length) return '';

  return nodes
    .map((node) => {
      if (typeof node.text === 'string') return node.text;
      if (Array.isArray(node.children)) return inlineNodesText(node.children);
      return '';
    })
    .join(' ')
    .trim();
}

function getSpecialPagePreview(page: Page | undefined): string {
  const blocks = getPageContentBlocks(page);
  for (const block of blocks) {
    const text = inlineNodesText(block.children);
    if (text) return firstSentence(text);
  }

  return firstSentence(getPageBodyContent(page));
}

function isMagicPageSlug(slug: string): boolean {
  return MAGIC_PAGE_SLUGS.has(slug);
}

function sortPagesByTitle(items: Page[]): Page[] {
  return [...items].sort((left, right) => {
    const leftTitle = cleanText(left.title || left.Title || '').toLocaleLowerCase();
    const rightTitle = cleanText(right.title || right.Title || '').toLocaleLowerCase();
    return leftTitle.localeCompare(rightTitle);
  });
}

function formatEventDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function resolveEventImage(event: Event): string {
  return cleanText(
    event.Thumbnail?.formats?.medium?.url ||
    event.Thumbnail?.formats?.small?.url ||
    event.Thumbnail?.formats?.thumbnail?.url ||
    event.Thumbnail?.url ||
    event.SEO?.socialImage?.formats?.medium?.url ||
    event.SEO?.socialImage?.formats?.small?.url ||
    event.SEO?.socialImage?.formats?.thumbnail?.url ||
    event.SEO?.socialImage?.url ||
    ''
  );
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
  const { session } = useAuthSession();

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
  const [events, setEvents] = useState<Event[]>([]);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [userOwnedStores, setUserOwnedStores] = useState<Set<string>>(new Set());
  const [checkingOwnership, setCheckingOwnership] = useState(false);

  const openExternalUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Could not open URL', url);
    });
  }, []);

  const checkStoreOwnership = useCallback(async () => {
    if (!session?.token || !cleanSlug) return;

    setCheckingOwnership(true);
    try {
      let userId =
        typeof session.userId === 'number'
          ? session.userId
          : typeof session.userId === 'string' && session.userId.trim()
            ? session.userId.trim()
            : null;

      if (!userId) {
        const meResult = await apiGet<{ id?: number }>('/api/users/me', {
          baseUrl: apiBaseUrl,
          token: session.token,
        });
        if (meResult.ok && typeof meResult.data?.id === 'number') {
          userId = meResult.data.id;
        }
      }

      if (!userId) return;

      const headers = {
        Authorization: `Bearer ${session.token}`,
        'markket-user-id': String(userId),
        'Content-Type': 'application/json',
      };

      const storeProxyBase = `${displayBaseUrl}api/markket/store`;
      const response = await fetch(`${storeProxyBase}?pagination[pageSize]=100`, { headers });

      if (response.ok) {
        const payload = (await response.json()) as { data?: { slug?: string }[] } | { slug?: string }[];
        const stores = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];
        const ownedSlugs = new Set(
          stores
            .map((s) => {
              const slug = s?.slug;
              return typeof slug === 'string' ? slug.trim() : '';
            })
            .filter(Boolean)
        );
        setUserOwnedStores(ownedSlugs);
      }
    } finally {
      setCheckingOwnership(false);
    }
  }, [apiBaseUrl, displayBaseUrl, session?.token, session?.userId, cleanSlug]);

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
    const encoded = encodeURIComponent(cleanSlug);
    const attempts = [
      `${apiBaseUrl}/api/articles?filters[store][slug][$eq]=${encoded}&sort[0]=updatedAt:desc&pagination[pageSize]=8&populate[]=cover&populate[]=store&populate[]=SEO`,
      `${apiBaseUrl}/api/articles?filters[store][slug]=${encoded}&sort[0]=updatedAt:desc&pagination[pageSize]=8&populate[]=cover&populate[]=store&populate[]=SEO`,
      `${apiBaseUrl}/api/articles?filter[store][slug][$eq]=${encoded}&sort[0]=updatedAt:desc&pagination[pageSize]=8&populate[]=cover&populate[]=store&populate[]=SEO`,
      `${apiBaseUrl}/api/articles?filter[store][slug]=${encoded}&sort[0]=updatedAt:desc&pagination[pageSize]=8&populate[]=cover&populate[]=store&populate[]=SEO`,
    ];

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

  const fetchStorePages = useCallback(async (resolvedStoreId?: string): Promise<CollectionResponse<Page>> => {
    const encoded = encodeURIComponent(cleanSlug);
    const attempts = [
      `${apiBaseUrl}/api/pages?filters[store][slug][$eq]=${encoded}&pagination[pageSize]=12&populate[]=SEO.socialImage`,
      `${apiBaseUrl}/api/pages?filters[store][slug]=${encoded}&pagination[pageSize]=12&populate[]=SEO.socialImage`,
      `${apiBaseUrl}/api/pages?filter[store][slug][$eq]=${encoded}&pagination[pageSize]=12&populate[]=SEO.socialImage`,
      `${apiBaseUrl}/api/pages?filter[store][slug]=${encoded}&pagination[pageSize]=12&populate[]=SEO.socialImage`,
    ];

    if (resolvedStoreId) {
      attempts.unshift(
        `${apiBaseUrl}/api/pages?filters[store][id][$eq]=${encodeURIComponent(resolvedStoreId)}&pagination[pageSize]=12&populate[]=SEO.socialImage`,
        `${apiBaseUrl}/api/pages?filter[store][id][$eq]=${encodeURIComponent(resolvedStoreId)}&pagination[pageSize]=12&populate[]=SEO.socialImage`,
      );
    }

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
    setEventsError(null);
    void checkStoreOwnership();

    try {
      const storeInfoResult = await fetchStoreInfo();
      const resolvedStore = storeInfoResult.data?.[0] ?? null;
      const resolvedStoreId = typeof resolvedStore?.id === 'number' ? String(resolvedStore.id) : '';

      setStore(resolvedStore);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const since = yesterday.toISOString().slice(0, 10);
      const encodedSlug = encodeURIComponent(cleanSlug);

      const [articlesResult, productsResult, pagesResult, eventsResult] = await Promise.allSettled([
        fetchStoreArticles(),
        fetchJson<CollectionResponse<Product>>(
          `${apiBaseUrl}/api/products?filters[stores][slug][$eq]=${encodedSlug}&sort[0]=updatedAt:desc&pagination[pageSize]=12&populate[]=SEO.socialImage&populate[]=Thumbnail&populate[]=Slides&populate[]=PRICES`
        ),
        fetchStorePages(resolvedStoreId),
        fetchJson<CollectionResponse<Event>>(
          `${apiBaseUrl}/api/events?filters[stores][slug][$eq]=${encodedSlug}&sort[0]=startDate:asc&filters[startDate][$gte]=${since}&populate[]=PRICES&populate[]=SEO&populate[]=Thumbnail&pagination[pageSize]=10`
        ),
      ]);
      if (articlesResult.status === 'fulfilled') {
        const rawArticles = articlesResult.value.data ?? [];
        const hasSignals = hasArticleOwnershipSignals(rawArticles);

        if (!hasSignals && rawArticles.length > 0) {
          setArticles([]);
          setArticlesError('Unscoped articles response: missing store relation in payload');
        } else {
          const strictArticles = rawArticles.filter((entry) => articleBelongsToStore(entry, cleanSlug));
          setArticles(strictArticles);
        }
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
        const visiblePages = rawPages.filter((entry) => entry.Active !== false && entry.active !== false);
        const hasSignals = hasPageOwnershipSignals(visiblePages);
        const scopedPages = hasSignals
          ? visiblePages.filter((entry) => pageBelongsToStore(entry, cleanSlug))
          : visiblePages;

        setPages(sortPagesByTitle(scopedPages));
        setPagesError(null);
      } else {
        setPages([]);
        setPagesError(extractSettledError(pagesResult, 'Could not load pages'));
      }

      if (eventsResult.status === 'fulfilled') {
        setEvents(eventsResult.value.data ?? []);
        setEventsError(null);
      } else {
        setEvents([]);
        setEventsError(extractSettledError(eventsResult, 'Could not load events'));
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
  const storeId = useMemo(() => {
    if (typeof store?.id === 'number') return String(store.id);
    return '';
  }, [store?.id]);
  const storeDocumentId = useMemo(() => cleanText(store?.documentId || ''), [store?.documentId]);
  const storeLogo = useMemo(() => resolveStoreLogo(store), [store]);
  const storefrontUrl = useMemo(() => getStorefrontUrl(displayBaseUrl, cleanSlug), [displayBaseUrl, cleanSlug]);
  const storeLinks = useMemo(() => (store?.URLS ?? []).filter((item) => getUrl(item)), [store?.URLS]);
  const storeDescriptionMarkdown = useMemo(
    () => normalizeMarkdown(store?.description || store?.Description || ''),
    [store]
  );
  const normalPages = useMemo(() => pages.filter((page) => !isMagicPageSlug(getPageSlugValue(page))), [pages]);
  const homePage = useMemo(() => pages.find((page) => getPageSlugValue(page) === 'home'), [pages]);
  const blogPage = useMemo(() => pages.find((page) => getPageSlugValue(page) === 'blog'), [pages]);
  const productsPage = useMemo(() => pages.find((page) => getPageSlugValue(page) === 'products'), [pages]);
  const newsletterPage = useMemo(() => pages.find((page) => getPageSlugValue(page) === 'newsletter'), [pages]);

  const homePageBody = useMemo(() => getPageBodyContent(homePage), [homePage]);
  const blogPageBody = useMemo(() => getSpecialPagePreview(blogPage), [blogPage]);
  const productsPageBody = useMemo(() => getSpecialPagePreview(productsPage), [productsPage]);
  const productsPageTitle = useMemo(() => cleanText(productsPage?.title || productsPage?.Title || '') || 'Products', [productsPage]);
  const newsletterPageBody = useMemo(() => getSpecialPagePreview(newsletterPage), [newsletterPage]);

  const openItemInWebView = useCallback(
    (url: string, title: string) => {
      router.push({ pathname: '/web', params: { url, title } } as never);
    },
    [router]
  );

  const shareStore = useCallback(() => {
    Share.share({
      title: `${storeTitle} on Markket`,
      message: `${storeTitle} on Markket: ${storefrontUrl}`,
      url: storefrontUrl,
    }).catch(() => {
      Alert.alert('Could not share store right now');
    });
  }, [storeTitle, storefrontUrl]);

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
          storeId,
          title: articleTitle || 'Article',
        },
      } as never);
    },
    [cleanSlug, openItemInWebView, router, storeId]
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
          storeId,
          storeDocumentId,
          title: pageTitle || 'Page',
        },
      } as never);
    },
    [cleanSlug, openItemInWebView, router, storeDocumentId, storeId]
  );

  const openBlogArchive = useCallback(() => {
    router.push({ pathname: '/store-blog/[slug]', params: { slug: cleanSlug, title: storeTitle } } as never);
  }, [cleanSlug, router, storeTitle]);

  const renderSpecialInline = useCallback(
    (nodes: InlineNode[] | undefined, keyPrefix: string): ReactNode[] => {
      if (!nodes?.length) return [];

      return nodes.map((node, index) => {
        const key = `${keyPrefix}-${node.type || 'node'}-${index}`;
        const textStyle = [
          styles.specialCardText,
          node.bold ? styles.markdownBold : null,
          node.italic ? styles.markdownItalic : null,
          node.underline || node.strikethrough ? styles.specialTextDecorated : null,
          node.code ? styles.markdownCode : null,
        ];

        if (typeof node.text === 'string' && node.text.trim()) {
          return <Text key={key} style={textStyle}>{node.text}</Text>;
        }

        if (node.type === 'link' && node.url) {
          return (
            <Text key={key} style={[...textStyle, styles.markdownLink]} onPress={() => openExternalUrl(node.url || '')}>
              {renderSpecialInline(node.children, `${key}-children`)}
            </Text>
          );
        }

        if (Array.isArray(node.children)) {
          return (
            <Text key={key} style={textStyle}>
              {renderSpecialInline(node.children, `${key}-children`)}
            </Text>
          );
        }

        return null;
      });
    },
    [openExternalUrl]
  );

  const renderSpecialPageContent = useCallback(
    (page: Page | undefined, keyPrefix: string) => {
      const blocks = getPageContentBlocks(page);

      if (blocks.length) {
        return blocks.map((block, index) => {
          const key = `${keyPrefix}-${block.type || 'block'}-${index}`;

          if (block.type === 'heading') {
            return (
              <ThemedText key={key} style={styles.specialHeading}>
                {renderSpecialInline(block.children, `${key}-heading`)}
              </ThemedText>
            );
          }

          if (block.type === 'list') {
            const items = block.children ?? [];
            const ordered = block.format === 'ordered';
            return (
              <View key={key} style={styles.specialListGroup}>
                {items.map((item, itemIndex) => (
                  <View key={`${key}-item-${itemIndex}`} style={styles.specialListRow}>
                    <ThemedText style={styles.specialListBullet}>{ordered ? `${itemIndex + 1}.` : '•'}</ThemedText>
                    <ThemedText style={styles.specialListText}>
                      {renderSpecialInline(item.children, `${key}-item-content-${itemIndex}`)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            );
          }

          return (
            <ThemedText key={key} style={styles.specialCardText}>
              {renderSpecialInline(block.children, `${key}-paragraph`)}
            </ThemedText>
          );
        });
      }

      return getPageBodyContent(page)
        .split(/\n{2,}/)
        .map((paragraph, index) => {
          const trimmed = paragraph.trim();
          if (!trimmed) return null;
          return (
            <ThemedText key={`${keyPrefix}-md-${index}`} style={styles.specialCardText}>
              {renderMarkdownInline(trimmed, `${keyPrefix}-md-${index}`, openExternalUrl)}
            </ThemedText>
          );
        });
    },
    [openExternalUrl, renderSpecialInline]
  );

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
        <Animated.View style={styles.hero} entering={FadeInDown.duration(400)}>
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

            <Badge label="MARKKET STORE" />
          </View>

          <ThemedText type="title" style={styles.heroTitle}>
            {storeTitle}
          </ThemedText>
          <ThemedText style={styles.heroSlug}>/{cleanSlug}</ThemedText>
          <ThemedText style={styles.heroTagline}>Curated products, pages, events, and stories in one place.</ThemedText>
          {previewLocaleValue && !store?.URLS?.length ? (
            <ThemedText style={styles.heroMeta}>Locale {cleanText(previewLocaleValue).toUpperCase()}</ThemedText>
          ) : null}

          {storeDescriptionMarkdown ? (
            <View style={styles.heroMarkdown}>
              {renderMarkdownTextBlocks(storeDescriptionMarkdown, 'hero', openExternalUrl)}
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

          <View style={styles.heroActions}>
            {userOwnedStores.has(cleanSlug) && (
              <>
                <Pressable
                  style={styles.secondaryHeroButton}
                  onPress={() => router.push({ pathname: `/store/${cleanSlug}/media` } as never)}
                >
                  <ThemedText style={styles.secondaryHeroButtonText}>Edit Media</ThemedText>
                </Pressable>
                <Pressable
                  style={styles.secondaryHeroButton}
                  onPress={() => router.push({ pathname: '/profile' } as never)}
                >
                  <ThemedText style={styles.secondaryHeroButtonText}>Dashboard</ThemedText>
                </Pressable>
              </>
            )}
            <Pressable style={styles.secondaryHeroButton} onPress={shareStore}>
              <ThemedText style={styles.secondaryHeroButtonText}>Share Store</ThemedText>
            </Pressable>
            <ThemedText style={styles.heroUrlHint}>{storefrontUrl.replace('https://', '')}</ThemedText>
          </View>
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

        <Animated.View style={styles.section} entering={FadeInUp.duration(340).delay(130)}>
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
          {blogPageBody ? (
            <View style={styles.inlineInfoCard}>
              <ThemedText style={styles.inlineInfoText}>{firstSentence(blogPageBody)}</ThemedText>
            </View>
          ) : null}
          {loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent} style={styles.railScroll}>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
            </ScrollView>
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
                const itemSummary = resolveSeoMetaDescription(article) || firstSentence(flattenText(article.content ?? article.Content)) || 'No preview text yet.';
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
                  <ThemedText style={styles.itemBody}>{itemSummary}</ThemedText>
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

        <Animated.View style={styles.section} entering={FadeInUp.duration(340).delay(170)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionMarker, styles.productMarker]} />
            <View style={styles.sectionTitleWrap}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                {productsPageTitle}
              </ThemedText>
              <ThemedText style={styles.sectionSubtitle}>
                {productsPageBody ? firstSentence(productsPageBody) : 'Shop from this store'}
              </ThemedText>
            </View>
            <View style={[styles.sectionBadge, styles.productBadge]}>
              <ThemedText style={styles.sectionBadgeText}>shop</ThemedText>
            </View>
          </View>
          {loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent} style={styles.railScroll}>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
            </ScrollView>
          ) : products.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.railContent}
                style={styles.railScroll}>
                {products.map((product, index) => {
                  const name = cleanText(product.name || product.Name || 'Untitled product');
                  const itemSlug = cleanText(product.slug || '');
                  const itemImage = resolveProductImage(product);
                  const itemSummary = resolveSeoMetaDescription(product) || firstSentence(cleanText(product.description || product.Description || 'No product description yet.'));
                  const firstPrice = (product.PRICES ?? product.prices ?? [])[0];
                  const resolvedPrice =
                    typeof firstPrice?.Price === 'number'
                      ? firstPrice.Price
                      : typeof firstPrice?.price === 'number'
                        ? firstPrice.price
                        : null;
                  const price =
                    typeof product.usd_price === 'number' || typeof product.usd_price === 'string'
                      ? `$${product.usd_price}`
                      : resolvedPrice != null
                        ? `$${resolvedPrice.toFixed(2)}`
                      : 'Price not set';
                  const itemUrl = itemSlug ? joinPath(storefrontUrl, `products/${itemSlug}`) : storefrontUrl;

                  return (
                    <Pressable
                      key={`${product.id ?? 'p'}-${index}`}
                      onPress={() =>
                        itemSlug
                          ? router.push({
                            pathname: '/[storeSlug]/products/[slug]',
                            params: {
                              storeSlug: cleanSlug,
                              slug: itemSlug,
                              title: name,
                            },
                          } as never)
                          : openItemInWebView(itemUrl, name)
                      }
                      style={({ pressed }) => [styles.railCard, pressed && styles.itemCardPressed]}>
                      {itemImage ? (
                        <Image source={{ uri: itemImage }} style={styles.railImage} contentFit="cover" transition={180} />
                      ) : (
                        <View style={[styles.railImageFallback, styles.productMarkerSoft]}>
                          <ThemedText style={styles.railImageFallbackText}>PRODUCT</ThemedText>
                        </View>
                      )}
                      <View style={styles.itemHeader}>
                        <ThemedText style={styles.itemTitle}>{name}</ThemedText>
                        <ThemedText style={styles.priceTag}>{price}</ThemedText>
                      </View>
                      <ThemedText style={styles.itemMeta}>/{itemSlug || 'no-slug'}</ThemedText>
                      <ThemedText style={styles.itemBody}>{itemSummary}</ThemedText>
                    </Pressable>
                  );
                })}
              </ScrollView>
          ) : (
            <View style={styles.emptyStateWrap}>
              <ThemedText style={styles.emptyText}>No products listed yet.</ThemedText>
              {productsError ? <ThemedText style={styles.sectionErrorText}>Debug: {productsError}</ThemedText> : null}
            </View>
          )}
        </Animated.View>

        <Animated.View style={styles.section} entering={FadeInUp.duration(340).delay(210)}>
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent} style={styles.railScroll}>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
            </ScrollView>
          ) : normalPages.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railContent}
              style={styles.railScroll}>
                {normalPages.slice(0, 12).map((page, index) => {
              const itemSlug = cleanText(page.slug || '');
              const itemTitle = cleanText(page.title || page.Title || 'Untitled page');
                  const itemSummary = resolveSeoMetaDescription(page) || firstSentence(flattenText(page.content ?? page.Content)) || 'No page preview available.';
                  const itemUrl = itemSlug
                    ? itemSlug === 'about'
                      ? joinPath(storefrontUrl, 'about')
                      : joinPath(storefrontUrl, `about/${itemSlug}`)
                    : storefrontUrl;
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
                  <ThemedText style={styles.itemBody}>{itemSummary}</ThemedText>
                </Pressable>
              );
              })}
              </ScrollView>
          ) : (
            <View style={styles.emptyStateWrap}>
                  <ThemedText style={styles.emptyText}>No additional pages published yet.</ThemedText>
              {pagesError ? <ThemedText style={styles.sectionErrorText}>Debug: {pagesError}</ThemedText> : null}
            </View>
          )}
        </Animated.View>

        <Animated.View style={styles.section} entering={FadeInUp.duration(340).delay(250)}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionMarker, styles.eventMarker]} />
            <View style={styles.sectionTitleWrap}>
              <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                Events
              </ThemedText>
              <ThemedText style={styles.sectionSubtitle}>Upcoming from this store</ThemedText>
            </View>
            <View style={[styles.sectionBadge, styles.eventBadge]}>
              <ThemedText style={[styles.sectionBadgeText, styles.eventBadgeText]}>soon</ThemedText>
            </View>
          </View>

          {loading ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.railContent} style={styles.railScroll}>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
              <View style={styles.skeletonCardWrap}><SkeletonCard /></View>
            </ScrollView>
          ) : events.length ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.railContent}
              style={styles.railScroll}>
              {events.map((event, index) => {
                const eventSlug = cleanText(event.slug || '');
                const eventTitle = cleanText(event.Name || 'Untitled event');
                const eventSummary = resolveSeoMetaDescription(event);
                const coverUrl = resolveEventImage(event);
                const firstPrice = event.PRICES?.[0];
                const isFree = !event.usd_price && (!firstPrice?.price || firstPrice.price === 0);
                return (
                  <Pressable
                    key={`${event.id ?? 'e'}-${index}`}
                    style={({ pressed }) => [styles.railCard, pressed && styles.itemCardPressed]}
                    onPress={() =>
                      eventSlug
                        ? router.push({ pathname: '/event/[slug]', params: { slug: eventSlug } } as never)
                        : null
                    }>
                    {coverUrl ? (
                      <Image source={{ uri: coverUrl }} style={styles.railImage} contentFit="cover" transition={180} />
                    ) : (
                      <View style={[styles.railImageFallback, styles.eventMarkerSoft]}>
                        <ThemedText style={styles.railImageFallbackText}>EVENT</ThemedText>
                      </View>
                    )}
                    {event.startDate ? (
                      <ThemedText style={styles.eventDateLabel}>
                        {formatEventDate(event.startDate)}
                      </ThemedText>
                    ) : null}
                    <ThemedText style={styles.itemTitle} numberOfLines={2}>{eventTitle}</ThemedText>
                    {eventSummary ? <ThemedText style={styles.itemBody}>{eventSummary}</ThemedText> : null}
                    {isFree ? (
                      <ThemedText style={styles.eventFreeTag}>Free</ThemedText>
                    ) : event.usd_price ? (
                      <ThemedText style={styles.priceTag}>${event.usd_price}</ThemedText>
                    ) : firstPrice?.price != null ? (
                      <ThemedText style={styles.priceTag}>${firstPrice.price.toFixed(2)}</ThemedText>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : (
            <View style={styles.emptyStateWrap}>
              <ThemedText style={styles.emptyText}>No upcoming events yet.</ThemedText>
              {eventsError ? <ThemedText style={styles.sectionErrorText}>Debug: {eventsError}</ThemedText> : null}
            </View>
          )}
        </Animated.View>

        {homePageBody ? (
          <Animated.View style={styles.specialSection} entering={FadeInUp.duration(340).delay(280)}>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionMarker, styles.homeMarker]} />
              <View style={styles.sectionTitleWrap}>
                <ThemedText type="defaultSemiBold" style={styles.sectionTitle}>
                  Home Notes
                </ThemedText>
                <ThemedText style={styles.sectionSubtitle}>From this store home page</ThemedText>
              </View>
            </View>
            <View style={styles.specialCard}>
              {renderSpecialPageContent(homePage, 'home')}
            </View>
          </Animated.View>
        ) : null}

        {newsletterPageBody || newsletterPage?.slug ? (
          <Animated.View style={styles.section} entering={FadeInUp.duration(340).delay(300)}>
            <Pressable
              style={styles.newsletterCard}
              onPress={() =>
                openPage(
                  cleanText(newsletterPage?.slug || ''),
                  cleanText(newsletterPage?.title || newsletterPage?.Title || 'Newsletter'),
                  joinPath(storefrontUrl, 'about/newsletter')
                )
              }>
              <ThemedText style={styles.newsletterKicker}>Stay in the loop</ThemedText>
              <ThemedText type="defaultSemiBold" style={styles.newsletterTitle}>
                Newsletter
              </ThemedText>
              <ThemedText style={styles.newsletterBody} numberOfLines={2}>
                {firstSentence(newsletterPageBody || 'Subscribe for drops, events, and updates from this store.')}
              </ThemedText>
              <ThemedText style={styles.newsletterCta}>Open newsletter page →</ThemedText>
            </Pressable>
          </Animated.View>
        ) : null}
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
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(120,120,120,0.28)',
    alignItems: 'center',
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

  heroTitle: {
    fontSize: 28,
    lineHeight: 31,
  },
  heroSlug: {
    opacity: 0.65,
    fontSize: 13,
  },
  heroTagline: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.78,
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
  heroActions: {
    marginTop: 6,
    gap: 8,
  },
  secondaryHeroButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.4)',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  secondaryHeroButtonText: {
    color: '#0E7490',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  heroUrlHint: {
    fontSize: 11,
    opacity: 0.62,
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
  heroMarkdownHeading: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '700',
    color: '#0E7490',
  },
  heroMarkdownHeadingSmall: {
    fontSize: 16,
    lineHeight: 22,
  },
  heroListGroup: {
    gap: 6,
  },
  heroListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  heroListBullet: {
    width: 16,
    fontSize: 14,
    lineHeight: 20,
    color: '#155E75',
    textAlign: 'center',
  },
  heroListText: {
    flex: 1,
    opacity: 0.84,
    lineHeight: 20,
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
  specialSection: {
    gap: 10,
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
  productMarker: {
    backgroundColor: '#10B981',
  },
  pageMarker: {
    backgroundColor: '#D946EF',
  },
  aboutMarker: {
    backgroundColor: '#0891B2',
  },
  homeMarker: {
    backgroundColor: '#2563EB',
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
  productBadge: {
    backgroundColor: 'rgba(16,185,129,0.12)',
    borderColor: 'rgba(16,185,129,0.35)',
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
  specialCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.28)',
    backgroundColor: 'rgba(239,246,255,0.72)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  specialCardText: {
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  specialHeading: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  specialTextDecorated: {
    textDecorationLine: 'underline',
  },
  specialListGroup: {
    gap: 8,
  },
  specialListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  specialListBullet: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1E3A8A',
    fontWeight: '700',
    minWidth: 16,
  },
  specialListText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    opacity: 0.9,
  },
  newsletterCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(217,70,239,0.32)',
    backgroundColor: 'rgba(255,252,242,0.95)',
    paddingHorizontal: 13,
    paddingVertical: 12,
    gap: 5,
  },
  newsletterKicker: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#A21CAF',
    textTransform: 'uppercase',
  },
  newsletterTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  newsletterBody: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.82,
  },
  newsletterCta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: '#0891B2',
  },
  inlineInfoCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.25)',
    backgroundColor: 'rgba(255,255,255,0.58)',
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  inlineInfoText: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.78,
  },
  railScroll: {
    marginHorizontal: -18,
  },
  railContent: {
    paddingHorizontal: 18,
    gap: 12,
  },
  skeletonCardWrap: {
    width: 260,
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
  productMarkerSoft: {
    backgroundColor: 'rgba(16,185,129,0.12)',
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
  emptyText: {
    opacity: 0.55,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
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
  eventMarker: {
    backgroundColor: '#F59E0B',
  },
  eventMarkerSoft: {
    backgroundColor: 'rgba(245,158,11,0.15)',
  },
  eventBadge: {
    backgroundColor: 'rgba(245,158,11,0.14)',
    borderColor: 'rgba(245,158,11,0.4)',
  },
  eventBadgeText: {
    color: '#92400E',
  },
  eventDateLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    color: '#92400E',
    textTransform: 'uppercase',
  },
  eventFreeTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
    letterSpacing: 0.3,
  },
});
