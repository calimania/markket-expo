import { Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ReactNode } from 'react';
import { WebView } from 'react-native-webview';
import {
  ActivityIndicator,
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
};

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
  const { apiBaseUrl, ready } = useAppConfig();
  const { slug, store, title } = useLocalSearchParams<{
    slug?: string | string[];
    store?: string | string[];
    title?: string | string[];
  }>();

  const pageSlug = normalizeParam(slug).trim();
  const storeSlug = normalizeParam(store).trim();
  const titleFallback = cleanText(normalizeParam(title)) || 'Page';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<PageRecord | null>(null);

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
    const requests = [
      (() => {
        const params = new URLSearchParams();
        params.set('filters[slug]', pageSlug);
        if (storeSlug) params.set('filters[store][slug]', storeSlug);
        params.set('pagination[pageSize]', '1');
        params.set('populate[]', 'SEO.socialImage');
        return `${apiBaseUrl}/api/pages?${params.toString()}`;
      })(),
      (() => {
        const params = new URLSearchParams();
        params.set('filter[slug]', pageSlug);
        if (storeSlug) params.set('filter[store][slug]', storeSlug);
        params.set('pagination[pageSize]', '1');
        params.set('populate[]', 'SEO.socialImage');
        return `${apiBaseUrl}/api/pages?${params.toString()}`;
      })(),
    ];

    for (const url of requests) {
      const response = await fetch(url);
      if (!response.ok) {
        continue;
      }

      const payload = (await response.json()) as CollectionResponse<PageRecord>;
      const first = payload.data?.[0] ?? null;
      if (first) return first;
    }

    throw new Error('Page not found');
  }, [apiBaseUrl, pageSlug, storeSlug]);

  const load = useCallback(async () => {
    if (!ready || !pageSlug) return;

    setLoading(true);
    setError(null);

    try {
      const result = await fetchPage();
      setPage(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }, [fetchPage, pageSlug, ready]);

  useEffect(() => {
    load();
  }, [load]);

  const blocks = useMemo(() => resolveBlocks(page), [page]);
  const coverUrl = useMemo(() => resolveCoverUrl(page), [page]);
  const screenTitle = useMemo(() => resolveTitle(page, titleFallback), [page, titleFallback]);

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

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
      </ScrollView>
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
  content: {
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 36,
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
