import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
  type ListRenderItem,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';

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
  Description: string | null;
  locale: string;
  Logo: StoreLogo;
  URLS: StoreUrl[];
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
  const search = params.toString();
  return `/api/stores${search ? `?${search}` : ''}`;
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

export default function HomeScreen() {
  const router = useRouter();
  const { apiBaseUrl, defaultStoreSlug, linkOpenMode, ready, storesQuery } = useAppConfig();

  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);

  const loadStores = useCallback(async () => {
    if (!ready) return;

    setError(null);

    try {
      const response = await fetch(`${apiBaseUrl}${createStoresPath(storesQuery, page)}`);

      if (!response.ok) {
        throw new Error(`Could not load stores (${response.status})`);
      }

      const payload = (await response.json()) as StoresApiResponse;
      setStores(payload.data ?? []);
      setPageCount(payload.meta?.pagination?.pageCount ?? 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error while loading stores');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBaseUrl, page, ready, storesQuery]);

  useEffect(() => {
    if (!ready) return;
    loadStores();
  }, [loadStores, ready]);

  useEffect(() => {
    setPage(1);
  }, [apiBaseUrl, storesQuery]);

  const activeStoresCount = useMemo(
    () => stores.reduce((acc, store) => (store.active ? acc + 1 : acc), 0),
    [stores]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadStores();
  }, [loadStores]);

  const goToPreviousPage = useCallback(() => {
    setPage((current) => Math.max(1, current - 1));
  }, []);

  const goToNextPage = useCallback(() => {
    setPage((current) => Math.min(pageCount, current + 1));
  }, [pageCount]);

  const openStoreBySlug = useCallback(
    (slug: string) => {
      router.push({ pathname: '/store/[slug]', params: { slug } } as never);
    },
    [router]
  );

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

  const renderStoreCard: ListRenderItem<Store> = ({ item }) => {
    const tintColors = getTintColors(item.id);

    return (
      <Pressable
        onPress={() => openStoreBySlug(item.slug)}
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
      <View style={styles.header}>
        <ThemedText type="title" style={styles.headerTitle}>
          markket stores
        </ThemedText>
        <ThemedText style={styles.headerSubtitle}>
          Community storefronts. Sorted by latest updates. {stores.length} on this page. {activeStoresCount} live.
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
      </View>

      <FlatList
        data={stores}
        keyExtractor={(item) => item.id.toString()}
        renderItem={renderStoreCard}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <ThemedView style={styles.emptyState}>
            <ThemedText type="subtitle">No stores found</ThemedText>
            <ThemedText>Try pulling down to refresh.</ThemedText>
          </ThemedView>
        }
        ListFooterComponent={
          pageCount > 1 ? (
            <View style={styles.paginationRow}>
              <Pressable
                style={[styles.pageButton, page === 1 && styles.pageButtonDisabled]}
                onPress={goToPreviousPage}
                disabled={page === 1}>
                <ThemedText style={styles.pageButtonText}>Previous</ThemedText>
              </Pressable>
              <ThemedText style={styles.pageLabel}>
                Page {page} of {pageCount}
              </ThemedText>
              <Pressable
                style={[styles.pageButton, page === pageCount && styles.pageButtonDisabled]}
                onPress={goToNextPage}
                disabled={page === pageCount}>
                <ThemedText style={styles.pageButtonText}>Next</ThemedText>
              </Pressable>
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
    backgroundColor: 'rgba(10, 126, 164, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(10, 126, 164, 0.4)',
  },
  quickOpenText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  listContent: {
    paddingHorizontal: 14,
    paddingBottom: 34,
    gap: 14,
  },
  paginationRow: {
    marginTop: 6,
    paddingHorizontal: 8,
    paddingTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pageButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(10, 126, 164, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(10, 126, 164, 0.35)',
  },
  pageButtonDisabled: {
    opacity: 0.45,
  },
  pageButtonText: {
    fontSize: 12,
    fontWeight: '700',
  },
  pageLabel: {
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
    opacity: 0.83,
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
    borderColor: 'rgba(10, 126, 164, 0.45)',
    backgroundColor: 'rgba(10, 126, 164, 0.1)',
  },
  urlChipText: {
    fontSize: 12,
    fontWeight: '600',
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
