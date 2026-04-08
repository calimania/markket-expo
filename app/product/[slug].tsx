import { Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import CheckoutModal, { type Price } from '@/components/ui/checkout-modal';
import { useAppConfig } from '@/hooks/use-app-config';
import { apiGet } from '@/lib/api';

type ProductRecord = {
  id?: number;
  documentId?: string;
  slug?: string;
  updatedAt?: string;
  Name?: string;
  name?: string;
  Description?: string;
  description?: string;
  usd_price?: number | string;
  SKU?: string;
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
    } | null;
  } | null;
  seo?: {
    metaDescription?: string;
    socialImage?: {
      url?: string;
      formats?: {
        medium?: { url?: string };
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    } | null;
  } | null;
  stores?: { slug?: string; title?: string; documentId?: string }[];
};

type ProductsApiResponse = {
  data: ProductRecord[];
};

function productQualityScore(product: ProductRecord): number {
  return (productHasMedia(product) ? 2 : 0) + (productHasPrices(product) ? 1 : 0);
}

const MARKDOWN_TOKEN_REGEX =
  /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`|\*([^*]+)\*|(https?:\/\/[^\s]+))/g;

function productHasMedia(product: ProductRecord): boolean {
  return resolveProductGallery(product).length > 0;
}

function productHasPrices(product: ProductRecord): boolean {
  const prices = product.PRICES ?? product.prices ?? [];
  if (!prices.length) return false;
  return prices.some((price) => {
    const amount = typeof price.Price === 'number' ? price.Price : price.price;
    return typeof amount === 'number' && Number.isFinite(amount);
  });
}

function pickBestProduct(items: ProductRecord[]): ProductRecord | null {
  if (!items.length) return null;

  const sorted = [...items].sort((a, b) => {
    const scoreA = productQualityScore(a);
    const scoreB = productQualityScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;

    const timeA = Date.parse(a.updatedAt || '') || 0;
    const timeB = Date.parse(b.updatedAt || '') || 0;
    return timeB - timeA;
  });

  return sorted[0] ?? null;
}

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function resolveImageAssetUrl(image?: {
  url?: string;
  formats?: {
    medium?: { url?: string };
    small?: { url?: string };
    thumbnail?: { url?: string };
  };
} | null): string {
  if (!image) return '';

  return cleanText(
    image.formats?.medium?.url ||
      image.formats?.small?.url ||
      image.formats?.thumbnail?.url ||
      image.url ||
      ''
  );
}

function normalizeMarkdown(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\r\n/g, '\n').trim();
}

function renderMarkdownInline(value: string, keyPrefix: string): ReactNode[] {
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
          onPress={() => Linking.openURL(url).catch(() => {})}>
          {label}
        </Text>
      );
      tokenIndex += 1;
      lastIndex = start + full.length;
      continue;
    }

    if (match[4]) {
      nodes.push(
        <Text key={`${keyPrefix}-bold-${tokenIndex}`} style={[styles.markdownInline, styles.markdownBold]}>
          {match[4]}
        </Text>
      );
      tokenIndex += 1;
      lastIndex = start + full.length;
      continue;
    }

    if (match[5]) {
      nodes.push(
        <Text key={`${keyPrefix}-code-${tokenIndex}`} style={[styles.markdownInline, styles.markdownCode]}>
          {match[5]}
        </Text>
      );
      tokenIndex += 1;
      lastIndex = start + full.length;
      continue;
    }

    if (match[6]) {
      nodes.push(
        <Text key={`${keyPrefix}-italic-${tokenIndex}`} style={[styles.markdownInline, styles.markdownItalic]}>
          {match[6]}
        </Text>
      );
      tokenIndex += 1;
      lastIndex = start + full.length;
      continue;
    }

    if (match[7]) {
      nodes.push(
        <Text
          key={`${keyPrefix}-url-${tokenIndex}`}
          style={[styles.markdownInline, styles.markdownLink]}
          onPress={() => Linking.openURL(match[7]).catch(() => {})}>
          {match[7]}
        </Text>
      );
      tokenIndex += 1;
      lastIndex = start + full.length;
      continue;
    }

    nodes.push(
      <Text key={`${keyPrefix}-token-${tokenIndex}`} style={styles.markdownInline}>
        {full}
      </Text>
    );
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

function renderMarkdownTextBlocks(value: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const lines = value.split(/\n/);
  let listBuffer: string[] = [];
  let orderedList = false;
  let listIndex = 0;

  const flushList = () => {
    if (!listBuffer.length) return;

    nodes.push(
      <View key={`${keyPrefix}-list-${listIndex}`} style={styles.markdownListGroup}>
        {listBuffer.map((item, itemIndex) => (
          <View key={`${keyPrefix}-list-${listIndex}-${itemIndex}`} style={styles.markdownListRow}>
            <ThemedText style={styles.markdownListBullet}>{orderedList ? `${itemIndex + 1}.` : '•'}</ThemedText>
            <ThemedText style={styles.markdownListText}>
              {renderMarkdownInline(item, `${keyPrefix}-list-item-${listIndex}-${itemIndex}`)}
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
          style={[styles.markdownHeading, level >= 2 ? styles.markdownHeadingSmall : null]}>
          {renderMarkdownInline(headingText, `${keyPrefix}-heading-${index}`)}
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
      <ThemedText key={`${keyPrefix}-paragraph-${index}`} style={styles.description}>
        {renderMarkdownInline(trimmed, `${keyPrefix}-paragraph-${index}`)}
      </ThemedText>
    );
  });

  flushList();

  return nodes;
}

function resolveProductImage(product: ProductRecord | null): string {
  if (!product) return '';

  const slides = product.Slides ?? product.slides ?? [];
  const firstSlide = Array.isArray(slides) ? slides[0] : null;

  return cleanText(
    resolveImageAssetUrl(firstSlide) ||
      resolveImageAssetUrl(product.Thumbnail) ||
      resolveImageAssetUrl(product.thumbnail) ||
      resolveImageAssetUrl(product.SEO?.socialImage) ||
      resolveImageAssetUrl(product.seo?.socialImage) ||
      ''
  );
}

function resolveProductGallery(product: ProductRecord | null): string[] {
  if (!product) return [];

  const slides = product.Slides ?? product.slides ?? [];

  const urls = [
    ...slides.map((slide) => resolveImageAssetUrl(slide)),
    resolveImageAssetUrl(product.Thumbnail),
    resolveImageAssetUrl(product.thumbnail),
    resolveImageAssetUrl(product.SEO?.socialImage),
    resolveImageAssetUrl(product.seo?.socialImage),
  ]
    .filter(Boolean);

  return [...new Set(urls)];
}

export default function ProductScreen() {
  const { apiBaseUrl, ready } = useAppConfig();
  const { slug, store, storeDocumentId, title, productSlug, product_slug, 'product-slug': productSlugDashed } = useLocalSearchParams<{
    slug?: string | string[];
    store?: string | string[];
    storeDocumentId?: string | string[];
    title?: string | string[];
    productSlug?: string | string[];
    product_slug?: string | string[];
    'product-slug'?: string | string[];
  }>();

  const productSlugValue =
    normalizeParam(slug).trim() ||
    normalizeParam(productSlug).trim() ||
    normalizeParam(product_slug).trim() ||
    normalizeParam(productSlugDashed).trim();
  const storeSlug = normalizeParam(store).trim();
  const storeDocFromParams = normalizeParam(storeDocumentId).trim();
  const titleFallback = normalizeParam(title).trim() || 'Product';
  const { width: screenWidth } = useWindowDimensions();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductRecord | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    if (!ready || !productSlugValue) return;

    let active = true;

    setLoading(true);
    setError(null);

    const loadProduct = async () => {
      const params = new URLSearchParams();
      params.set('filters[slug][$eq]', productSlugValue);
      if (storeSlug) {
        params.set('filters[stores][slug][$eq]', storeSlug);
      }
      params.set('pagination[pageSize]', '20');
      params.set('sort[0]', 'updatedAt:desc');
      params.append('populate[]', 'PRICES');
      params.append('populate[]', 'SEO.socialImage');
      params.append('populate[]', 'Thumbnail');
      params.append('populate[]', 'Slides');
      params.append('populate[]', 'stores');

      const path = `/api/products?${params.toString()}`;
      const result = await apiGet<ProductsApiResponse>(path, { baseUrl: apiBaseUrl });

      if (__DEV__) {
        console.log('[product-debug] single query', {
          path,
          count: result.ok ? result.data?.data?.length ?? 0 : 0,
          keys: result.ok ? Object.keys(result.data?.data?.[0] ?? {}) : [],
        });
      }

      if (!active) return;

      if (result.ok && result.data?.data?.length) {
        const selected = pickBestProduct(result.data.data);
        if (selected) {
          setProduct(selected);
          setLoading(false);
          return;
        }
      }

      setError('Product not found');
      setLoading(false);
    };

    loadProduct().catch(() => {
      if (!active) return;
      setError('Could not load product');
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, productSlugValue, ready, storeSlug]);

  const productName = cleanText(product?.Name || product?.name || titleFallback || 'Product');
  const productDescriptionMarkdown =
    normalizeMarkdown(product?.Description || product?.description || product?.SEO?.metaDescription || product?.seo?.metaDescription || '');

  const productImage = resolveProductImage(product);
  const gallery = useMemo(() => resolveProductGallery(product), [product]);
  const prices = product?.PRICES ?? product?.prices ?? [];
  const firstPrice = prices[0];
  const priceFromPrices =
    typeof firstPrice?.Price === 'number'
      ? firstPrice.Price
      : typeof (firstPrice as { price?: number } | undefined)?.price === 'number'
        ? (firstPrice as { price?: number }).price
        : null;
  const priceLabel =
    typeof product?.usd_price === 'number' || typeof product?.usd_price === 'string'
      ? `$${product.usd_price}`
      : priceFromPrices != null
        ? `$${priceFromPrices.toFixed(2)}`
      : null;

  const purchasableOptions = useMemo(
    () => (product?.PRICES ?? product?.prices ?? []).filter((p) => !p.hidden && !(typeof p.inventory === 'number' && p.inventory === 0)),
    [product?.PRICES, product?.prices]
  );

  const resolvedStoreSlug = cleanText(product?.stores?.[0]?.slug || storeSlug);
  const resolvedStoreDocumentId = cleanText(product?.stores?.[0]?.documentId || storeDocFromParams);
  const coverWidth = Math.max(screenWidth, 1);

  useEffect(() => {
    if (!__DEV__ || !product) return;

    const debugPrices = product.PRICES ?? product.prices ?? [];
    const debugGallery = resolveProductGallery(product);
    const slides = product.Slides ?? product.slides ?? [];

    console.log('[product-debug] resolved payload', {
      slug: product.slug,
      id: product.id,
      documentId: product.documentId,
      pricesCount: debugPrices.length,
      firstPrice: debugPrices[0],
      slidesCount: slides.length,
      hasThumbnail: Boolean(product.Thumbnail || product.thumbnail),
      galleryCount: debugGallery.length,
      firstImage: debugGallery[0] ?? null,
    });

    if (debugPrices.length === 0) {
      console.warn('[product-debug] no prices found', {
        slug: product.slug,
        keys: Object.keys(product),
      });
    }

    if (debugGallery.length === 0) {
      console.warn('[product-debug] no images found', {
        slug: product.slug,
        hasSlides: slides.length > 0,
        hasThumbnail: Boolean(product.Thumbnail || product.thumbnail),
        hasSeoImage: Boolean(product.SEO?.socialImage || product.seo?.socialImage),
      });
    }
  }, [product]);

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: productName, headerBackTitle: 'Store' }} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <ThemedText type="subtitle">{error}</ThemedText>
        </View>
      ) : product ? (
        <>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {gallery.length ? (
              <>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(event) => {
                    const width = event.nativeEvent.layoutMeasurement.width || 1;
                    const index = Math.round(event.nativeEvent.contentOffset.x / width);
                    setActiveSlide(index);
                  }}
                >
                  {gallery.map((url, index) => (
                    <Image
                      key={`${url}-${index}`}
                      source={{ uri: url }}
                      style={[styles.cover, { width: coverWidth }]}
                      contentFit="cover"
                      transition={220}
                    />
                  ))}
                </ScrollView>
                {gallery.length > 1 ? (
                  <View style={styles.dotsRow}>
                    {gallery.map((_, index) => (
                      <View key={`dot-${index}`} style={[styles.dot, index === activeSlide && styles.dotActive]} />
                    ))}
                  </View>
                ) : null}
              </>
            ) : productImage ? (
              <Image source={{ uri: productImage }} style={[styles.cover, styles.fullWidthCover]} contentFit="cover" transition={280} />
            ) : (
              <View style={[styles.coverFallback, styles.fullWidthCover]}>
                <ThemedText style={styles.coverFallbackText}>PRODUCT</ThemedText>
              </View>
            )}

            <View style={styles.body}>
              <ThemedText type="display" style={styles.title}>{productName}</ThemedText>

              {priceLabel ? <ThemedText style={styles.priceTag}>{priceLabel}</ThemedText> : null}

              {productDescriptionMarkdown ? (
                <View style={styles.markdownWrap}>
                  {renderMarkdownTextBlocks(productDescriptionMarkdown, 'product-desc')}
                </View>
              ) : (
                <ThemedText style={styles.descriptionMuted}>No description yet.</ThemedText>
              )}

              {purchasableOptions.length ? (
                <Pressable
                  onPress={() => setShowCheckout(true)}
                  style={({ pressed }) => [styles.buyButton, pressed && styles.buyButtonPressed]}
                >
                  <ThemedText style={styles.buyButtonText}>Purchase Options</ThemedText>
                </Pressable>
              ) : (
                <View style={styles.infoBox}>
                  <ThemedText style={styles.infoText}>This product has no purchase options yet.</ThemedText>
                </View>
              )}
            </View>
          </ScrollView>

          <CheckoutModal
            visible={showCheckout}
            product={{ ...product, PRICES: product.PRICES ?? product.prices ?? [] }}
            storeSlug={resolvedStoreSlug}
            storeDocumentId={resolvedStoreDocumentId}
            onClose={() => setShowCheckout(false)}
          />
        </>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 },
  content: { paddingBottom: 36 },
  cover: { aspectRatio: 1.3, backgroundColor: '#eef2ff' },
  fullWidthCover: { width: '100%' },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#cbd5e1',
  },
  dotActive: {
    width: 16,
    backgroundColor: '#2563eb',
  },
  coverFallback: {
    width: '100%',
    aspectRatio: 1.3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  coverFallbackText: { fontSize: 12, letterSpacing: 1.4, color: '#6b7280' },
  body: { paddingHorizontal: 18, paddingTop: 18 },
  title: { marginBottom: 8 },
  priceTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#ecfeff',
    borderColor: '#99f6e4',
    borderWidth: 1,
    color: '#0f766e',
    fontSize: 15,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    marginBottom: 14,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
    marginBottom: 20,
  },
  descriptionMuted: {
    fontSize: 15,
    color: '#64748b',
    marginBottom: 20,
  },
  markdownWrap: {
    gap: 10,
    marginBottom: 20,
  },
  markdownInline: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
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
    color: '#0369A1',
    textDecorationLine: 'underline',
  },
  markdownHeading: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '700',
    color: '#0F172A',
  },
  markdownHeadingSmall: {
    fontSize: 18,
    lineHeight: 24,
  },
  markdownListGroup: {
    gap: 6,
  },
  markdownListRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  markdownListBullet: {
    width: 16,
    fontSize: 14,
    lineHeight: 20,
    color: '#1E293B',
    textAlign: 'center',
  },
  markdownListText: {
    flex: 1,
    lineHeight: 24,
    color: '#334155',
  },
  buyButton: {
    height: 50,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buyButtonPressed: { opacity: 0.85 },
  buyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  infoBox: {
    padding: 14,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
  },
  infoText: { color: '#475569' },
});
