import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ReactNode } from 'react';
import { WebView } from 'react-native-webview';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

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

type BlockNode = {
  type?: string;
  level?: number;
  format?: string;
  children?: InlineNode[];
};

type PageRecord = {
  id?: number;
  slug?: string;
  title?: string;
  Title?: string;
  Active?: boolean;
  active?: boolean;
  content?: BlockNode[];
  Content?: BlockNode[];
  SEO?: {
    socialImage?: {
      url?: string;
      formats?: {
        medium?: { url?: string };
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    } | null;
  } | null;
  store?: {
    id?: number;
    slug?: string;
  } | null;
};

const ABOUT_PAGE_HIDDEN_SLUGS = new Set(['home', 'about', 'blog', 'products']);

type CollectionResponse<T> = {
  data?: T[];
};

const URL_REGEX = /(https?:\/\/[^\s<>()\[\]{}"']+)/g;

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').trim();
}

function resolveTitle(page: PageRecord | null, fallback: string): string {
  return cleanText(page?.title || page?.Title || '') || fallback;
}

function resolveBlocks(page: PageRecord | null): BlockNode[] {
  const content = page?.content ?? page?.Content;
  return Array.isArray(content) ? content : [];
}

function resolveCoverUrl(page: PageRecord | null): string {
  const image = page?.SEO?.socialImage;
  return cleanText(
    image?.formats?.medium?.url ||
      image?.formats?.small?.url ||
      image?.formats?.thumbnail?.url ||
      image?.url ||
      ''
  );
}

function pageMatchesStore(page: PageRecord | null, storeSlug: string, storeId: string): boolean {
  if (!page) return false;

  const targetSlug = cleanText(storeSlug);
  const targetId = cleanText(storeId);

  const directSlug = cleanText(page.store?.slug || '');
  const directId = typeof page.store?.id === 'number' ? String(page.store.id) : '';

  if (targetId && directId) return directId === targetId;
  if (targetSlug && directSlug) return directSlug === targetSlug;

  return !targetSlug && !targetId;
}

function pageHasStoreSignals(page: PageRecord | null): boolean {
  if (!page) return false;
  if (cleanText(page.store?.slug || '')) return true;
  if (typeof page.store?.id === 'number') return true;
  return false;
}

function logPageDebug(label: string, payload?: unknown) {
  if (!__DEV__) return;

  if (payload === undefined) {
    console.log(`[page-debug] ${label}`);
    return;
  }

  console.log(`[page-debug] ${label}`, payload);
}

function inlineText(nodes?: InlineNode[]): string {
  if (!nodes?.length) return '';

  return nodes
    .map((node) => {
      if (typeof node.text === 'string') return node.text;
      if (Array.isArray(node.children)) return inlineText(node.children);
      return '';
    })
    .join('')
    .trim();
}

function firstBlockPreview(blocks: BlockNode[]): string {
  for (const block of blocks) {
    const text = inlineText(block.children);
    if (text) {
      return text.length > 130 ? `${text.slice(0, 127)}...` : text;
    }
  }

  return 'No preview available yet.';
}

function extractUrlsFromNodes(nodes?: InlineNode[]): string[] {
  if (!nodes?.length) return [];

  const urls: string[] = [];

  for (const node of nodes) {
    if (typeof node.url === 'string' && node.url.trim()) {
      urls.push(node.url.trim());
    }

    if (typeof node.text === 'string') {
      const matches = node.text.match(URL_REGEX);
      if (matches?.length) {
        urls.push(...matches.map((item) => item.trim()));
      }
    }

    if (Array.isArray(node.children)) {
      urls.push(...extractUrlsFromNodes(node.children));
    }
  }

  return urls;
}

function getYouTubeId(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();

    if (host.includes('youtu.be')) {
      return parsed.pathname.replace(/^\//, '').split('/')[0] || '';
    }

    if (host.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v')?.trim() || '';
      }

      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/embed/')[1]?.split('/')[0] || '';
      }
    }
  } catch {
    return '';
  }

  return '';
}

function getVimeoId(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    if (!host.includes('vimeo.com')) return '';

    const segments = parsed.pathname.split('/').filter(Boolean);
    const numeric = segments.find((segment) => /^\d+$/.test(segment));
    return numeric || '';
  } catch {
    return '';
  }
}

function getEmbedUrl(url: string): string {
  const youtubeId = getYouTubeId(url);
  if (youtubeId) {
    return `https://www.youtube.com/embed/${youtubeId}`;
  }

  const vimeoId = getVimeoId(url);
  if (vimeoId) {
    return `https://player.vimeo.com/video/${vimeoId}`;
  }

  return '';
}

export default function PageScreen() {
  const router = useRouter();
  const { apiBaseUrl, ready } = useAppConfig();
  const { slug, store, storeId, storeDocumentId, title } = useLocalSearchParams<{
    slug?: string | string[];
    store?: string | string[];
    storeId?: string | string[];
    storeDocumentId?: string | string[];
    title?: string | string[];
  }>();

  const pageSlug = normalizeParam(slug).trim();
  const storeSlug = normalizeParam(store).trim();
  const storeIdValue = normalizeParam(storeId).trim();
  const storeDocumentIdValue = normalizeParam(storeDocumentId).trim();
  const titleFallback = cleanText(normalizeParam(title)) || 'Page';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<PageRecord | null>(null);
  const [relatedPages, setRelatedPages] = useState<PageRecord[]>([]);
  const [relatedPagesError, setRelatedPagesError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showThanks, setShowThanks] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollViewRef = useRef<import('react-native').ScrollView>(null);

  const isAboutPage = pageSlug.toLocaleLowerCase() === 'about';
  const isNewsletterPage = pageSlug.toLocaleLowerCase() === 'newsletter';

  useEffect(() => {
    if (!isNewsletterPage) return;
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
    return () => sub.remove();
  }, [isNewsletterPage]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const openExternalUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      // Ignore invalid URLs in content blocks.
    });
  }, []);

  const renderAutoLinkedText = useCallback(
    (value: string, keyPrefix: string, stylesInline: (object | undefined)[]) => {
      const parts = value.split(URL_REGEX);

      return parts
        .map((part, index) => {
          if (!part) return null;
          const key = `${keyPrefix}-part-${index}`;
          const isUrl = /^https?:\/\//i.test(part);

          if (!isUrl) {
            return (
              <Text key={key} style={stylesInline}>
                {part}
              </Text>
            );
          }

          return (
            <Text key={key} style={[...stylesInline, inlineStyles.link]} onPress={() => openExternalUrl(part)}>
              {part}
            </Text>
          );
        })
        .filter(Boolean);
    },
    [openExternalUrl]
  );

  const renderInline = useCallback((nodes?: InlineNode[]): ReactNode[] => {
    if (!nodes?.length) return [];

    return nodes.map((node, index) => {
      const key = `${node.type || 'node'}-${index}`;
      const stylesInline = [
        inlineStyles.base,
        node.bold ? inlineStyles.bold : undefined,
        node.italic ? inlineStyles.italic : undefined,
        node.underline ? inlineStyles.underline : undefined,
        node.strikethrough ? inlineStyles.strike : undefined,
        node.code ? inlineStyles.code : undefined,
      ];

      if (typeof node.text === 'string') {
        return <Text key={key} style={stylesInline}>{renderAutoLinkedText(node.text, key, stylesInline)}</Text>;
      }

      if (node.type === 'link' && node.url) {
        return (
          <Text
            key={key}
            style={[stylesInline, inlineStyles.link]}
            onPress={() => openExternalUrl(node.url || '')}>
            {renderInline(node.children)}
          </Text>
        );
      }

      if (Array.isArray(node.children)) {
        return (
          <Text key={key} style={stylesInline}>
            {renderInline(node.children)}
          </Text>
        );
      }

      return <Text key={key} style={stylesInline} />;
    });
  }, [openExternalUrl, renderAutoLinkedText]);

  const renderEmbeds = useCallback(
    (urls: string[], keyPrefix: string) => {
      const embeds = urls
        .map((url) => ({ sourceUrl: url, embedUrl: getEmbedUrl(url) }))
        .filter((item) => item.embedUrl);

      if (!embeds.length) return null;

      return (
        <View style={styles.embedGroup}>
          {embeds.map((item, index) => (
            <View key={`${keyPrefix}-embed-${index}`} style={styles.embedCard}>
              <WebView
                source={{ uri: item.embedUrl }}
                style={styles.embedWebView}
                allowsInlineMediaPlayback
                mediaPlaybackRequiresUserAction
              />
              <Pressable style={styles.embedLinkRow} onPress={() => openExternalUrl(item.sourceUrl)}>
                <ThemedText style={styles.embedLinkText} numberOfLines={1}>
                  {item.sourceUrl}
                </ThemedText>
              </Pressable>
            </View>
          ))}
        </View>
      );
    },
    [openExternalUrl]
  );

  const fetchPage = useCallback(async () => {
    logPageDebug('route params', {
      pageSlug,
      storeSlug,
      storeIdValue,
    });

    const requests: { url: string; trustScoped: boolean }[] = [];

    const addRequest = (builder: (params: URLSearchParams) => void, trustScoped = false) => {
      const params = new URLSearchParams();
      params.set('filters[slug][$eq]', pageSlug);
      params.set('pagination[pageSize]', '1');
      params.append('populate[]', 'SEO.socialImage');
      params.append('populate[]', 'store');
      builder(params);
      requests.push({ url: `${apiBaseUrl}/api/pages?${params.toString()}`, trustScoped });
    };

    if (storeSlug) {
      addRequest((params) => params.set('filters[store][slug][$eq]', storeSlug), true);
      addRequest((params) => params.set('filters[store][slug]', storeSlug), true);
      addRequest((params) => params.set('filter[store][slug][$eq]', storeSlug), true);
      addRequest((params) => params.set('filter[store][slug]', storeSlug), true);
    }

    if (storeIdValue) {
      addRequest((params) => params.set('filters[store][id][$eq]', storeIdValue), true);
      addRequest((params) => params.set('filters[store][id]', storeIdValue), true);
      addRequest((params) => params.set('filter[store][id][$eq]', storeIdValue), true);
      addRequest((params) => params.set('filter[store][id]', storeIdValue), true);
    }

    logPageDebug('request count', requests.length);

    for (const request of requests) {
      const { url, trustScoped } = request;
      logPageDebug('request start', { url, trustScoped });

      const response = await fetch(url);
      if (!response.ok) {
        let errorBody: unknown = null;

        try {
          errorBody = await response.json();
        } catch {
          try {
            errorBody = await response.text();
          } catch {
            errorBody = null;
          }
        }

        logPageDebug('request failed', {
          url,
          status: response.status,
          errorBody,
        });
        continue;
      }

      const payload = (await response.json()) as CollectionResponse<PageRecord>;
      const first = payload.data?.[0] ?? null;
      logPageDebug('request success', {
        url,
        pageId: first?.id,
        pageSlug: first?.slug,
        pageTitle: first?.title || first?.Title,
        pageStoreSlug: first?.store?.slug,
        pageStoreId: first?.store?.id,
      });

      if (trustScoped && first && !pageHasStoreSignals(first)) {
        logPageDebug('accepting scoped page without relation signals', { url, pageId: first.id });
        return first;
      }

      if (pageMatchesStore(first, storeSlug, storeIdValue)) {
        logPageDebug('accepted page match', { url, pageId: first?.id });
        return first;
      }

      logPageDebug('rejected page mismatch', { url, pageId: first?.id });
    }

    logPageDebug('no page match found');
    throw new Error('Page not found for this store');
  }, [apiBaseUrl, pageSlug, storeIdValue, storeSlug]);

  const fetchRelatedStorePages = useCallback(async (): Promise<PageRecord[]> => {
    if (!storeSlug && !storeIdValue) return [];

    const urls: string[] = [];
    const addRequest = (builder: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams();
      params.set('pagination[pageSize]', '40');
      params.set('sort[0]', 'title:asc');
      params.append('populate[]', 'SEO.socialImage');
      params.append('populate[]', 'store');
      builder(params);
      urls.push(`${apiBaseUrl}/api/pages?${params.toString()}`);
    };

    if (storeSlug) {
      addRequest((params) => params.set('filters[store][slug][$eq]', storeSlug));
      addRequest((params) => params.set('filters[store][slug]', storeSlug));
      addRequest((params) => params.set('filter[store][slug][$eq]', storeSlug));
      addRequest((params) => params.set('filter[store][slug]', storeSlug));
    }

    if (storeIdValue) {
      addRequest((params) => params.set('filters[store][id][$eq]', storeIdValue));
      addRequest((params) => params.set('filters[store][id]', storeIdValue));
      addRequest((params) => params.set('filter[store][id][$eq]', storeIdValue));
      addRequest((params) => params.set('filter[store][id]', storeIdValue));
    }

    for (const url of urls) {
      const response = await fetch(url);
      if (!response.ok) continue;

      const payload = (await response.json()) as CollectionResponse<PageRecord>;
      const rows = Array.isArray(payload.data) ? payload.data : [];
      if (!rows.length) continue;

      return rows.filter((entry) => pageMatchesStore(entry, storeSlug, storeIdValue));
    }

    return [];
  }, [apiBaseUrl, storeIdValue, storeSlug]);

  const load = useCallback(async () => {
    if (!ready || !pageSlug) return;

    setLoading(true);
    setError(null);
    setRelatedPagesError(null);

    try {
      const result = await fetchPage();
      setPage(result);

      if (isAboutPage) {
        try {
          const pagesResult = await fetchRelatedStorePages();
          setRelatedPages(pagesResult);
        } catch (pagesErr) {
          setRelatedPages([]);
          setRelatedPagesError(pagesErr instanceof Error ? pagesErr.message : 'Could not load related pages');
        }
      } else {
        setRelatedPages([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [fetchPage, fetchRelatedStorePages, isAboutPage, pageSlug, ready]);

  useEffect(() => {
    load();
  }, [load]);

  const blocks = useMemo(() => resolveBlocks(page), [page]);
  const coverUrl = useMemo(() => resolveCoverUrl(page), [page]);
  const screenTitle = useMemo(() => resolveTitle(page, titleFallback), [page, titleFallback]);
  const aboutLinkedPages = useMemo(() => {
    if (!isAboutPage) return [];

    return relatedPages
      .filter((item) => {
        const slugValue = cleanText(item.slug || '').toLocaleLowerCase();
        if (!slugValue || ABOUT_PAGE_HIDDEN_SLUGS.has(slugValue)) return false;
        if (item.Active === false || item.active === false) return false;
        return true;
      })
      .sort((a, b) => resolveTitle(a, '').localeCompare(resolveTitle(b, '')));
  }, [isAboutPage, relatedPages]);

  const openRelatedPage = useCallback(
    (item: PageRecord) => {
      const itemSlug = cleanText(item.slug || '');
      if (!itemSlug) return;

      router.push({
        pathname: '/page/[slug]',
        params: {
          slug: itemSlug,
          store: storeSlug,
          storeId: storeIdValue,
          storeDocumentId: storeDocumentIdValue,
          title: resolveTitle(item, 'Page'),
        },
      } as never);
    },
    [router, storeDocumentIdValue, storeIdValue, storeSlug]
  );

  const submitNewsletter = useCallback(async () => {
    const normalizedEmail = cleanText(email).toLocaleLowerCase();
    if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      Alert.alert('Enter a valid email', 'Please add a valid email address to subscribe.');
      return;
    }

    const storeReference = cleanText(storeDocumentIdValue || storeIdValue || '');
    setSubmitting(true);

    try {
      const payload: { data: { Email: string; stores?: string[] } } = {
        data: {
          Email: normalizedEmail,
        },
      };

      if (storeReference) {
        payload.data.stores = [storeReference];
      }

      const response = await fetch('https://api.markket.place/api/subscribers/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Subscribe failed (${response.status})`);
      }

      setShowThanks(true);
      setEmail('');

      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }

      redirectTimerRef.current = setTimeout(() => {
        router.back();
      }, 700);
    } catch {
      Alert.alert('Could not subscribe', 'Please try again in a moment.');
    } finally {
      setSubmitting(false);
    }
  }, [email, router, storeDocumentIdValue, storeIdValue]);

  if (!pageSlug) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="subtitle">Missing page slug</ThemedText>
      </ThemedView>
    );
  }

  if (!ready || loading) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (error) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="subtitle">Could not load page</ThemedText>
        <ThemedText style={styles.errorText}>{error}</ThemedText>
        <Pressable style={styles.retryButton} onPress={load}>
          <ThemedText style={styles.retryButtonText}>Try again</ThemedText>
        </Pressable>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: screenTitle,
          headerBackTitle: 'Store',
        }}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={110}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
        {coverUrl ? (
          <Image
            source={{ uri: coverUrl }}
            style={styles.coverImage}
            contentFit="cover"
            transition={180}
          />
        ) : null}
        <ThemedText type="title" style={styles.title}>
          {screenTitle}
        </ThemedText>
        <ThemedText style={styles.meta}>/{pageSlug}</ThemedText>

        {blocks.length ? (
          blocks.map((block, index) => {
            const key = `${block.type || 'block'}-${index}`;

            if (block.type === 'heading') {
              const level = block.level || 2;
              const headingStyle =
                level <= 1
                  ? styles.h1
                  : level === 2
                    ? styles.h2
                    : level === 3
                      ? styles.h3
                      : styles.h4;

              return (
                <ThemedText key={key} style={headingStyle}>
                  {renderInline(block.children)}
                </ThemedText>
              );
            }

            if (block.type === 'list') {
              const ordered = block.format === 'ordered';
              const items = block.children ?? [];
              const blockUrls = [...new Set(extractUrlsFromNodes(block.children))];

              return (
                <View key={key} style={styles.listGroup}>
                  {items.map((item, itemIndex) => (
                    <View key={`${key}-item-${itemIndex}`} style={styles.listRow}>
                      <ThemedText style={styles.listBullet}>{ordered ? `${itemIndex + 1}.` : '•'}</ThemedText>
                      <ThemedText style={styles.listText}>{renderInline(item.children)}</ThemedText>
                    </View>
                  ))}
                  {renderEmbeds(blockUrls, key)}
                </View>
              );
            }

            if (block.type === 'quote') {
              const blockUrls = [...new Set(extractUrlsFromNodes(block.children))];
              return (
                <View key={key} style={styles.quoteWrap}>
                  <View style={styles.quoteBox}>
                    <ThemedText style={styles.quoteText}>{renderInline(block.children)}</ThemedText>
                  </View>
                  {renderEmbeds(blockUrls, key)}
                </View>
              );
            }

            const paragraph = inlineText(block.children);
            if (!paragraph) return null;

            const blockUrls = [...new Set(extractUrlsFromNodes(block.children))];

            return (
              <View key={key} style={styles.paragraphWrap}>
                <ThemedText style={styles.paragraph}>{renderInline(block.children)}</ThemedText>
                {renderEmbeds(blockUrls, key)}
              </View>
            );
          })
        ) : (
          <ThemedText style={styles.paragraph}>No structured page content available yet.</ThemedText>
        )}

          {isNewsletterPage ? (
            <View style={styles.subscribeCard}>
              <View style={styles.subscribeHero}>
                <View style={styles.subscribeBlob1} />
                <View style={styles.subscribeBlob2} />
                <View style={styles.subscribeBlob3} />
                <Text style={styles.subscribeHeroEmoji}>✉</Text>
                <Text style={styles.subscribeKicker}>NEWSLETTER</Text>
              </View>
              <View style={styles.subscribeContent}>
                <ThemedText type="defaultSemiBold" style={styles.subscribeTitle}>
                  Subscribe to updates
                </ThemedText>
                <ThemedText style={styles.subscribeBody}>
                  Get announcements, product drops, and event alerts by email.
                </ThemedText>
                <Input
                  value={email}
                  onChangeText={setEmail}
                  placeholder="you@example.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  editable={!submitting}
                />
                <Button
                  label={submitting ? 'Submitting...' : 'Subscribe'}
                  onPress={submitNewsletter}
                  disabled={submitting}
                />
              </View>
              <View style={styles.subscribeTrust}>
                <View style={styles.subscribeTrustDot} />
                <ThemedText style={styles.subscribeTrustText}>No spam, ever. Unsubscribe anytime.</ThemedText>
                <View style={styles.subscribeTrustDot} />
              </View>
            </View>
          ) : null}

          {isAboutPage ? (
            <View style={styles.relatedSection}>
              <ThemedText type="defaultSemiBold" style={styles.relatedTitle}>
                More Pages
              </ThemedText>
              {aboutLinkedPages.length ? (
                aboutLinkedPages.map((item, index) => {
                  const itemSlug = cleanText(item.slug || '');
                  const itemTitle = resolveTitle(item, 'Page');
                  const itemPreview = firstBlockPreview(resolveBlocks(item));

                  return (
                    <Pressable
                      key={`${(item.id ?? itemSlug) || 'related'}-${index}`}
                      style={({ pressed }) => [styles.relatedCard, pressed && styles.relatedCardPressed]}
                      onPress={() => openRelatedPage(item)}>
                      <ThemedText style={styles.relatedCardTitle}>{itemTitle}</ThemedText>
                      <ThemedText style={styles.relatedCardMeta}>/{itemSlug}</ThemedText>
                      <ThemedText style={styles.relatedCardBody}>{itemPreview}</ThemedText>
                    </Pressable>
                  );
                })
              ) : (
                <ThemedText style={styles.relatedEmpty}>No additional pages available.</ThemedText>
              )}
              {relatedPagesError ? <ThemedText style={styles.relatedError}>{relatedPagesError}</ThemedText> : null}
            </View>
          ) : null}
      </ScrollView>

        {showThanks ? (
          <View pointerEvents="none" style={styles.toastWrap}>
            <View style={styles.toastCard}>
              <ThemedText style={styles.toastText}>Thank you for subscribing!</ThemedText>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const inlineStyles = StyleSheet.create({
  base: {
    fontFamily: 'Manrope',
  },
  bold: {
    fontWeight: '700',
  },
  italic: {
    fontStyle: 'italic',
  },
  underline: {
    textDecorationLine: 'underline',
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  code: {
    fontFamily: 'RobotoMono',
  },
  link: {
    color: '#0891B2',
    textDecorationLine: 'underline',
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 120,
    gap: 12,
  },
  coverImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: 'rgba(120,120,120,0.16)',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 10,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  meta: {
    opacity: 0.65,
    fontSize: 12,
  },
  paragraph: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.92,
  },
  paragraphWrap: {
    gap: 10,
  },
  subscribeCard: {
    marginTop: 10,
    marginBottom: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.34)',
    backgroundColor: 'rgba(239,246,255,0.95)',
    overflow: 'hidden',
  },
  subscribeHero: {
    backgroundColor: '#0E7490',
    paddingVertical: 32,
    alignItems: 'center',
    gap: 5,
    overflow: 'hidden',
  },
  subscribeBlob1: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.09)',
    top: -70,
    right: -30,
  },
  subscribeBlob2: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.07)',
    bottom: -50,
    left: 10,
  },
  subscribeBlob3: {
    position: 'absolute',
    width: 70,
    height: 70,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: 10,
    left: '40%',
  },
  subscribeHeroEmoji: {
    fontSize: 34,
    color: '#fff',
    zIndex: 1,
  },
  subscribeKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 1.2,
    zIndex: 1,
  },
  subscribeContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 0,
    gap: 12,
  },
  subscribeTrust: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(8,145,178,0.15)',
    backgroundColor: 'rgba(8,145,178,0.05)',
  },
  subscribeTrustDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(8,145,178,0.45)',
  },
  subscribeTrustText: {
    fontSize: 11,
    opacity: 0.65,
    letterSpacing: 0.2,
  },
  subscribeTitle: {
    fontSize: 18,
    lineHeight: 23,
  },
  subscribeBody: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.78,
  },
  emailInput: {
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: 'Manrope',
    fontSize: 15,
    backgroundColor: '#fff',
  },
  subscribeButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    backgroundColor: '#0891B2',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  subscribeButtonPressed: {
    opacity: 0.86,
  },
  subscribeButtonDisabled: {
    opacity: 0.55,
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  toastWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 28,
    alignItems: 'center',
  },
  toastCard: {
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(6,95,70,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.65)',
  },
  toastText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.25,
  },
  relatedSection: {
    marginTop: 8,
    gap: 10,
  },
  relatedTitle: {
    fontSize: 18,
    lineHeight: 23,
  },
  relatedCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.28)',
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 5,
  },
  relatedCardPressed: {
    opacity: 0.8,
  },
  relatedCardTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
  },
  relatedCardMeta: {
    fontSize: 11,
    opacity: 0.62,
  },
  relatedCardBody: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.82,
  },
  relatedEmpty: {
    fontSize: 13,
    opacity: 0.68,
  },
  relatedError: {
    fontSize: 12,
    color: '#B42318',
  },
  h1: {
    fontSize: 30,
    lineHeight: 35,
    fontWeight: '700',
    marginTop: 10,
  },
  h2: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    marginTop: 8,
  },
  h3: {
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '700',
    marginTop: 6,
  },
  h4: {
    fontSize: 18,
    lineHeight: 23,
    fontWeight: '700',
    marginTop: 4,
  },
  listGroup: {
    gap: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  listBullet: {
    width: 20,
    lineHeight: 24,
    fontWeight: '700',
  },
  listText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.92,
  },
  quoteBox: {
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(217,70,239,0.5)',
    backgroundColor: 'rgba(255,216,77,0.16)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quoteWrap: {
    gap: 10,
  },
  quoteText: {
    fontSize: 16,
    lineHeight: 24,
    opacity: 0.9,
  },
  embedGroup: {
    gap: 10,
  },
  embedCard: {
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  embedWebView: {
    width: '100%',
    height: 220,
    backgroundColor: '#000',
  },
  embedLinkRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(120,120,120,0.35)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  embedLinkText: {
    fontSize: 12,
    color: '#0891B2',
    textDecorationLine: 'underline',
  },
  errorText: {
    textAlign: 'center',
    opacity: 0.72,
  },
  retryButton: {
    marginTop: 8,
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
