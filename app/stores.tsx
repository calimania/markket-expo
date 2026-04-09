import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';

type StoreMedia = {
  url?: string;
  formats?: {
    thumbnail?: { url?: string };
    small?: { url?: string };
    medium?: { url?: string };
  };
};

type StoreItem = {
  id?: number;
  title?: string;
  slug?: string;
  active?: boolean;
  Cover?: StoreMedia | StoreMedia[] | null;
  SEO?: {
    socialImage?: StoreMedia | StoreMedia[] | null;
  } | null;
};

type StoreListResponse = {
  data?: StoreItem[];
  meta?: {
    pagination?: {
      page?: number;
      pageSize?: number;
      pageCount?: number;
      total?: number;
    };
  };
};

type MeResponse = {
  id?: number;
  username?: string;
  email?: string;
  displayName?: string | null;
};

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim();
}

function getInitials(value: string): string {
  const clean = cleanText(value);
  if (!clean) return 'M';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

function pickStoreMedia(value: StoreMedia | StoreMedia[] | null | undefined): StoreMedia | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

function toAbsoluteAssetUrl(value: string, fallbackBaseUrl?: string): string {
  const clean = cleanText(value);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;

  const base = cleanText(fallbackBaseUrl || 'https://api.markket.place').replace(/\/$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

function getStorePreviewImage(store: StoreItem, fallbackBaseUrl?: string): string {
  const cover = pickStoreMedia(store.Cover);
  const social = pickStoreMedia(store.SEO?.socialImage);
  const media = cover || social;
  const rawUrl = cleanText(
    media?.formats?.thumbnail?.url ||
      media?.formats?.small?.url ||
      media?.formats?.medium?.url ||
      media?.url ||
      ''
  );
  return toAbsoluteAssetUrl(rawUrl, fallbackBaseUrl);
}

export default function StoresScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiBaseUrl, displayBaseUrl } = useAppConfig();
  const { ready, session, clearSession, saveToken } = useAuthSession();

  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);

  const openStoreEditor = useCallback(
    (storeSlug?: string) => {
      if (!storeSlug) {
        Alert.alert('Store unavailable', 'This store does not have a slug.');
        return;
      }

      const storeEditorUrl = `${displayBaseUrl}tienda/${storeSlug}/store?display=embed`;
      router.push({ pathname: '/web', params: { url: storeEditorUrl, captureAuth: '0' } } as never);
    },
    [displayBaseUrl, router]
  );

  const openStoreContentList = useCallback(
    (storeSlug?: string) => {
      if (!storeSlug) {
        Alert.alert('Store unavailable', 'This store does not have a slug.');
        return;
      }

      router.push({
        pathname: '/store/[storeSlug]/content',
        params: { storeSlug },
      } as never);
    },
    [router]
  );

  const openStoreMediaStudio = useCallback(
    (storeSlug?: string) => {
      if (!storeSlug) {
        Alert.alert('Store unavailable', 'This store does not have a slug.');
        return;
      }

      router.push({
        pathname: '/store/[storeSlug]/media',
        params: { storeSlug },
      } as never);
    },
    [router]
  );

  const loadUserStores = useCallback(async () => {
    if (!session?.token) {
      setStores([]);
      return;
    }

    setLoadingStores(true);
    try {
      let userId =
        typeof session.userId === 'number'
          ? session.userId
          : typeof session.userId === 'string' && session.userId.trim()
            ? session.userId.trim()
            : undefined;

      if (userId == null || userId === '') {
        const meResult = await apiGet<MeResponse>('/api/users/me', {
          baseUrl: apiBaseUrl,
          token: session.token,
        });

        if (meResult.ok && typeof meResult.data?.id === 'number') {
          userId = meResult.data.id;
          await saveToken(session.token, session.source || 'stores-screen', {
            userId: meResult.data.id,
            username: cleanText(meResult.data.username || ''),
            email: cleanText(meResult.data.email || ''),
            displayName: cleanText(meResult.data.displayName || ''),
          });
        }
      }

      if (userId == null || userId === '') {
        setStores([]);
        return;
      }

      const headers = {
        Authorization: `Bearer ${session.token}`,
        'markket-user-id': String(userId),
        'Content-Type': 'application/json',
      };
      // Proxy safety contract (Next.js /api/markket/store):
      // 1) Endpoint must require a valid Bearer token.
      // 2) Server must validate owner access from auth identity, not trust only client-provided IDs.
      // 3) Any future search/filter params must stay owner-scoped server-side.
      const storeProxyBase = `${displayBaseUrl}api/markket/store`;

      const allStores: StoreItem[] = [];
      const seenStoreKeys = new Set<string>();
      const pageSize = 50;
      let page = 1;
      let keepPaging = true;

      while (keepPaging) {
        const response = await fetch(
          `${storeProxyBase}?pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
          { headers }
        );

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            await clearSession();
            Alert.alert('Session expired', 'Sign in again to continue.', [
              { text: 'OK', onPress: () => router.replace('/profile' as never) },
            ]);
          }
          setStores([]);
          return;
        }

        const payload = (await response.json()) as StoreListResponse | StoreItem[];
        const pageStores = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

        pageStores.forEach((store, index) => {
          const stableKey = `${String(store.id ?? '')}:${cleanText(store.slug || '')}:${index}`;
          if (!seenStoreKeys.has(stableKey)) {
            seenStoreKeys.add(stableKey);
            allStores.push(store);
          }
        });

        if (Array.isArray(payload)) {
          keepPaging = false;
          continue;
        }

        const pageCount = payload?.meta?.pagination?.pageCount;
        if (typeof pageCount === 'number') {
          keepPaging = page < pageCount;
          page += 1;
          continue;
        }

        keepPaging = pageStores.length >= pageSize;
        page += 1;
      }

      setStores(allStores.filter((store) => store.active !== false));
    } catch {
      setStores([]);
    } finally {
      setLoadingStores(false);
    }
  }, [apiBaseUrl, clearSession, displayBaseUrl, router, saveToken, session?.source, session?.token, session?.userId]);

  useEffect(() => {
    if (!session?.token) return;
    void loadUserStores();
  }, [loadUserStores, session?.token]);

  const subtitle = useMemo(() => {
    if (loadingStores) return 'Loading your stores...';
    if (!stores.length) return 'No stores yet. Create one to get started.';
    return `${stores.length} store${stores.length === 1 ? '' : 's'} ready.`;
  }, [loadingStores, stores.length]);

  if (!ready) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backPill} onPress={() => router.back()}>
            <ThemedText style={styles.backPillText}>Back</ThemedText>
          </Pressable>
          <ThemedText type="title" style={styles.title}>
            All Stores
          </ThemedText>
        </View>

        <ThemedText style={styles.subtitle}>{subtitle}</ThemedText>

        {loadingStores ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" style={styles.loader} />
          </View>
        ) : stores.length > 0 ? (
          <View style={styles.listWrap}>
            {stores.map((store) => {
              const imageUrl = getStorePreviewImage(store, apiBaseUrl);
              return (
                <View key={store.id} style={styles.storeCard}>
                  <View style={styles.storeRow}>
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.thumbImage} contentFit="cover" transition={180} />
                    ) : (
                      <View style={styles.thumbFallback}>
                        <ThemedText style={styles.thumbFallbackText}>{getInitials(store.title || store.slug || 'Store')}</ThemedText>
                      </View>
                    )}

                    <View style={styles.cardContent}>
                      <ThemedText style={styles.storeLabel}>Store</ThemedText>
                      <ThemedText style={styles.storeTitle}>{store.title || store.slug || 'Unnamed Store'}</ThemedText>
                      {store.slug ? <ThemedText style={styles.storeSlug}>{store.slug}</ThemedText> : null}
                    </View>
                  </View>

                  <View style={styles.storeActionsRow}>
                    <Pressable
                      style={({ pressed }) => [styles.storeActionPill, pressed && styles.storeCardPressed]}
                      onPress={() => openStoreEditor(store.slug)}>
                      <ThemedText style={styles.storeActionText}>Edit Store</ThemedText>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.storeActionPill, pressed && styles.storeCardPressed]}
                      onPress={() => openStoreMediaStudio(store.slug)}>
                      <ThemedText style={styles.storeActionText}>Media Studio</ThemedText>
                    </Pressable>
                    <Pressable
                      style={({ pressed }) => [styles.storeActionPill, pressed && styles.storeCardPressed]}
                      onPress={() => openStoreContentList(store.slug)}>
                      <ThemedText style={styles.storeActionText}>Lists</ThemedText>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.emptyCard}>
            <ThemedText style={styles.emptyText}>No stores found for this account.</ThemedText>
            <Button label="Open Tienda" variant="secondary" onPress={() => router.push({ pathname: '/web', params: { url: 'https://markket.place/tienda?display=embed', captureAuth: '0' } } as never)} />
          </View>
        )}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 18,
    gap: 12,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.35)',
    backgroundColor: 'rgba(240,249,255,0.96)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  backPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  subtitle: {
    opacity: 0.74,
  },
  loader: {
    marginVertical: 8,
  },
  listWrap: {
    gap: 10,
  },
  storeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.3)',
    backgroundColor: 'rgba(240,249,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: '#0E7490',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  storeCardPressed: {
    transform: [{ scale: 0.985 }],
    backgroundColor: 'rgba(224,242,254,1)',
  },
  storeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardContent: {
    flex: 1,
    gap: 2,
  },
  storeActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  storeActionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.3)',
    backgroundColor: 'rgba(240,249,255,0.96)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  storeActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.2,
  },
  thumbImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(186,230,253,0.45)',
  },
  thumbFallback: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(186,230,253,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumbFallbackText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0E7490',
    letterSpacing: 0.3,
  },
  storeLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    opacity: 0.55,
    textTransform: 'uppercase',
  },
  storeTitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  storeSlug: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.85,
  },
  emptyCard: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  emptyText: {
    opacity: 0.8,
  },
});