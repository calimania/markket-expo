import { Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';

type LegalKind = 'privacy' | 'terms';

type PageRecord = {
  id?: number;
  slug?: string;
  title?: string;
  Title?: string;
  content?: unknown;
  Content?: unknown;
  body?: unknown;
  Body?: unknown;
  attributes?: Record<string, unknown>;
};

type PagesResponse = {
  data?: PageRecord[];
};

const PAGE_CANDIDATES: Record<LegalKind, string[]> = {
  privacy: ['privacy', 'privacy-policy', 'privacy_policy'],
  terms: ['terms', 'terms-of-service', 'terms_of_service'],
};

function normalizeKind(value: string | string[] | undefined): LegalKind {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'privacy' ? 'privacy' : 'terms';
}

function getTitle(kind: LegalKind): string {
  return kind === 'privacy' ? 'Privacy Policy' : 'Terms of Use';
}

function buildPagesUrl(apiBaseUrl: string, storeSlug: string, kind: LegalKind): string {
  const params = new URLSearchParams();
  params.set('filters[store][slug][$eq]', storeSlug);

  PAGE_CANDIDATES[kind].forEach((slug, index) => {
    params.set(`filters[slug][$in][${index}]`, slug);
  });

  params.set('sort[0]', 'updatedAt:desc');
  params.set('pagination[pageSize]', '5');

  return `${apiBaseUrl}/api/pages?${params.toString()}`;
}

function flattenText(value: unknown): string {
  if (typeof value === 'string') {
    return value
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (Array.isArray(value)) {
    return value.map(flattenText).filter(Boolean).join('\n\n').trim();
  }

  if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>;

    if (typeof objectValue.text === 'string') {
      return objectValue.text.trim();
    }

    return Object.values(objectValue).map(flattenText).filter(Boolean).join('\n\n').trim();
  }

  return '';
}

function extractPageTitle(page: PageRecord, fallbackTitle: string): string {
  return (
    page.title ||
    page.Title ||
    (typeof page.attributes?.title === 'string' ? page.attributes.title : undefined) ||
    (typeof page.attributes?.Title === 'string' ? page.attributes.Title : undefined) ||
    fallbackTitle
  );
}

function extractPageBody(page: PageRecord): string {
  return (
    flattenText(page.content) ||
    flattenText(page.Content) ||
    flattenText(page.body) ||
    flattenText(page.Body) ||
    flattenText(page.attributes?.content) ||
    flattenText(page.attributes?.Content) ||
    flattenText(page.attributes?.body) ||
    flattenText(page.attributes?.Body)
  );
}

export default function LegalPageScreen() {
  const { kind } = useLocalSearchParams<{ kind?: string | string[] }>();
  const legalKind = normalizeKind(kind);
  const { apiBaseUrl, contentStoreSlug, ready } = useAppConfig();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageTitle, setPageTitle] = useState(getTitle(legalKind));
  const [pageBody, setPageBody] = useState('');

  const loadPage = useCallback(async () => {
    if (!ready) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(buildPagesUrl(apiBaseUrl, contentStoreSlug, legalKind));

      if (!response.ok) {
        throw new Error(`Could not load page (${response.status})`);
      }

      const payload = (await response.json()) as PagesResponse;
      const page = payload.data?.[0];

      if (!page) {
        throw new Error(`No ${legalKind} page found for store ${contentStoreSlug}.`);
      }

      setPageTitle(extractPageTitle(page, getTitle(legalKind)));
      setPageBody(extractPageBody(page));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error while loading page');
      setPageTitle(getTitle(legalKind));
      setPageBody('');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, contentStoreSlug, legalKind, ready]);

  useEffect(() => {
    loadPage();
  }, [loadPage]);

  const emptyMessage = useMemo(() => {
    return `This page was not available from the ${contentStoreSlug} content store.`;
  }, [contentStoreSlug]);

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen
        options={{
          title: pageTitle,
          headerBackTitle: 'Settings',
        }}
      />

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.meta}>Loading from {contentStoreSlug}</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <ThemedText type="subtitle">Could not load {legalKind}</ThemedText>
          <ThemedText style={styles.errorText}>{error}</ThemedText>
          <Pressable style={styles.retryButton} onPress={loadPage}>
            <ThemedText style={styles.retryButtonText}>Try again</ThemedText>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="title" style={styles.title}>
            {pageTitle}
          </ThemedText>
          <ThemedText style={styles.meta}>Source store: {contentStoreSlug}</ThemedText>
          <ThemedText style={styles.body}>{pageBody || emptyMessage}</ThemedText>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 40,
    gap: 12,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
  },
  body: {
    lineHeight: 24,
    opacity: 0.9,
  },
  meta: {
    opacity: 0.65,
    fontSize: 12,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  errorText: {
    textAlign: 'center',
    opacity: 0.72,
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