import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';

type StoreMedia = {
  url?: string;
};

type StoreSEO = {
  id?: number | string;
  documentId?: string;
  metaTitle?: string;
  metaDescription?: string;
  socialImage?: StoreMedia | StoreMedia[] | null;
};

type StoreItem = {
  id?: number;
  documentId?: string;
  title?: string;
  slug?: string;
  description?: string;
  Description?: string;
  SEO?: StoreSEO | null;
  seo?: StoreSEO | null;
};

type StoreListResponse = {
  data?: StoreItem[];
  meta?: {
    pagination?: {
      page?: number;
      pageCount?: number;
    };
  };
};

type MeResponse = {
  id?: number;
  username?: string;
  email?: string;
  displayName?: string | null;
};

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function slugify(value: string): string {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function pickSeo(store: StoreItem | null): StoreSEO | null {
  return store?.SEO || store?.seo || null;
}

function getStoreDescription(store: StoreItem | null): string {
  return cleanText(store?.description) || cleanText(store?.Description);
}

export default function StoreSettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { storeSlug } = useLocalSearchParams<{ storeSlug?: string | string[] }>();
  const { apiBaseUrl, displayBaseUrl } = useAppConfig();
  const { ready, session, saveToken } = useAuthSession();

  const resolvedStoreSlug = normalizeParam(storeSlug).trim();
  const [store, setStore] = useState<StoreItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  const resolveUserId = useCallback(async (): Promise<string> => {
    const existing =
      typeof session?.userId === 'number'
        ? String(session.userId)
        : typeof session?.userId === 'string'
          ? session.userId.trim()
          : '';

    if (existing) return existing;
    if (!session?.token) return '';

    const meResult = await apiGet<MeResponse>('/api/users/me', {
      baseUrl: apiBaseUrl,
      token: session.token,
    });

    if (meResult.ok && typeof meResult.data?.id === 'number') {
      await saveToken(session.token, session.source || 'store-settings', {
        userId: meResult.data.id,
        username: cleanText(meResult.data.username),
        email: cleanText(meResult.data.email),
        displayName: cleanText(meResult.data.displayName),
      });
      return String(meResult.data.id);
    }

    return '';
  }, [apiBaseUrl, saveToken, session?.source, session?.token, session?.userId]);

  const loadStore = useCallback(async () => {
    if (!session?.token || !resolvedStoreSlug) return;

    setLoading(true);
    setLoadError('');
    try {
      const userId = await resolveUserId();
      if (!userId) {
        setStore(null);
        setLoadError('Could not validate your account for store settings.');
        return;
      }

      const headers = {
        Authorization: `Bearer ${session.token}`,
        'markket-user-id': String(userId),
        'Content-Type': 'application/json',
      };

      const storeProxyBase = `${displayBaseUrl}api/markket/store`;
      const allStores: StoreItem[] = [];
      let page = 1;
      let keepPaging = true;
      const pageSize = 50;

      while (keepPaging) {
        const response = await fetch(
          `${storeProxyBase}?pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
          { headers }
        );

        if (!response.ok) {
          setStore(null);
          setLoadError(`Could not load store settings (${response.status}).`);
          return;
        }

        const payload = (await response.json()) as StoreListResponse | StoreItem[];
        const pageStores = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

        allStores.push(...pageStores);

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

      const selected = allStores.find((item) => cleanText(item.slug) === resolvedStoreSlug) || null;
      setStore(selected);
      if (!selected) {
        setLoadError('Store not found in your account list.');
      }
    } catch {
      setStore(null);
      setLoadError('Network error loading store settings.');
    } finally {
      setLoading(false);
    }
  }, [displayBaseUrl, resolveUserId, resolvedStoreSlug, session?.token]);

  useEffect(() => {
    if (!ready || !session?.token || !resolvedStoreSlug) return;
    void loadStore();
  }, [loadStore, ready, resolvedStoreSlug, session?.token]);

  useEffect(() => {
    if (!store) return;

    const seo = pickSeo(store);
    const nextTitle = cleanText(store.title);
    const nextSlug = cleanText(store.slug);

    setTitle(nextTitle);
    setSlug(nextSlug);
    setDescription(getStoreDescription(store));
    setSeoTitle(cleanText(seo?.metaTitle));
    setSeoDescription(cleanText(seo?.metaDescription));
    setSlugTouched(false);
  }, [store]);

  useEffect(() => {
    if (slugTouched) return;
    if (cleanText(slug)) return;
    const generated = slugify(title);
    if (!generated) return;
    setSlug(generated);
  }, [slug, slugTouched, title]);

  const normalizedTitle = cleanText(title);
  const normalizedSlug = slugify(slug);
  const normalizedDescription = cleanText(description);
  const normalizedSeoTitle = cleanText(seoTitle);
  const normalizedSeoDescription = cleanText(seoDescription);

  const hasUnsavedChanges = useMemo(() => {
    if (!store) return false;
    const seo = pickSeo(store);
    return (
      normalizedTitle !== cleanText(store.title) ||
      normalizedSlug !== cleanText(store.slug) ||
      normalizedDescription !== getStoreDescription(store) ||
      normalizedSeoTitle !== cleanText(seo?.metaTitle) ||
      normalizedSeoDescription !== cleanText(seo?.metaDescription)
    );
  }, [
    normalizedDescription,
    normalizedSeoDescription,
    normalizedSeoTitle,
    normalizedSlug,
    normalizedTitle,
    store,
  ]);

  const saveButtonLabel = saving ? 'Saving...' : hasUnsavedChanges ? 'Save Changes' : 'No Changes Yet';

  const saveStore = useCallback(async () => {
    if (!session?.token) {
      Alert.alert('Sign in required', 'Please sign in again to save store settings.');
      return;
    }

    if (!store) {
      Alert.alert('Store unavailable', 'Could not resolve this store right now.');
      return;
    }

    if (!normalizedTitle || !normalizedSlug) {
      Alert.alert('Missing required fields', 'Title and slug are required.');
      return;
    }

    setSaving(true);
    try {
      const userId = await resolveUserId();
      if (!userId) {
        Alert.alert('Account required', 'Could not validate your account for saving.');
        return;
      }

      const storeRef = cleanText(store.documentId) || cleanText(store.slug) || String(store.id || '');
      if (!storeRef) {
        Alert.alert('Store missing', 'Could not resolve store reference for save.');
        return;
      }

      const saveUrl = `${displayBaseUrl}api/markket/store?id=${encodeURIComponent(storeRef)}`;
      const headers = {
        Authorization: `Bearer ${session.token}`,
        'markket-user-id': String(userId),
        'Content-Type': 'application/json',
      };

      const payloads = [
        {
          store: {
            title: normalizedTitle,
            Title: normalizedTitle,
            slug: normalizedSlug,
            description: normalizedDescription || null,
            Description: normalizedDescription || null,
            SEO: {
              metaTitle: normalizedSeoTitle || null,
              metaDescription: normalizedSeoDescription || null,
            },
          },
        },
        {
          data: {
            Title: normalizedTitle,
            title: normalizedTitle,
            slug: normalizedSlug,
            description: normalizedDescription || null,
            Description: normalizedDescription || null,
            SEO: {
              metaTitle: normalizedSeoTitle || null,
              metaDescription: normalizedSeoDescription || null,
            },
          },
        },
        {
          body: {
            store: {
              title: normalizedTitle,
              Title: normalizedTitle,
              slug: normalizedSlug,
              description: normalizedDescription || null,
              Description: normalizedDescription || null,
              SEO: {
                metaTitle: normalizedSeoTitle || null,
                metaDescription: normalizedSeoDescription || null,
              },
            },
          },
        },
      ];

      let lastStatus = 0;
      let lastText = '';
      let saved = false;

      for (const payload of payloads) {
        const response = await fetch(saveUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify(payload),
        });

        if (response.ok) {
          saved = true;
          break;
        }

        lastStatus = response.status;
        lastText = (await response.text()).slice(0, 220);
      }

      if (!saved) {
        throw new Error(`Save failed (${lastStatus}) ${lastText}`.trim());
      }

      Alert.alert('Saved', 'Store settings updated.');
      await loadStore();
    } catch (error) {
      Alert.alert('Save failed', error instanceof Error ? error.message : 'Unknown save error');
    } finally {
      setSaving(false);
    }
  }, [
    displayBaseUrl,
    loadStore,
    normalizedDescription,
    normalizedSeoDescription,
    normalizedSeoTitle,
    normalizedSlug,
    normalizedTitle,
    resolveUserId,
    session?.token,
    store,
  ]);

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
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 34 }]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <ThemedText type="title" style={styles.title}>Store Settings</ThemedText>
        </View>

        <ThemedText style={styles.subtitle}>
          Update your store details in one place.
        </ThemedText>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" />
          </View>
        ) : loadError ? (
          <View style={styles.errorCard}>
            <ThemedText style={styles.errorText}>{loadError}</ThemedText>
            <Button label="Retry" variant="secondary" onPress={() => void loadStore()} />
          </View>
        ) : (
          <View style={styles.cardStack}>
            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Identity</ThemedText>
              <ThemedText style={styles.fieldLabel}>Store Title</ThemedText>
              <Input
                value={title}
                onChangeText={setTitle}
                placeholder="Store title"
                autoCapitalize="words"
              />
              <ThemedText style={styles.fieldLabel}>Slug</ThemedText>
              <Input
                value={slug}
                onChangeText={(value) => {
                  setSlugTouched(true);
                  setSlug(value);
                }}
                placeholder="store-slug"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <ThemedText style={styles.helperText}>Slug auto-fills from title while empty.</ThemedText>
            </View>

            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">Store Copy</ThemedText>
              <ThemedText style={styles.fieldLabel}>Description</ThemedText>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Short description"
                placeholderTextColor="rgba(100,116,139,0.72)"
                multiline
                style={styles.multiInput}
              />
            </View>

            <View style={styles.card}>
              <ThemedText type="defaultSemiBold">SEO</ThemedText>
              <ThemedText style={styles.fieldLabel}>SEO Title</ThemedText>
              <Input
                value={seoTitle}
                onChangeText={setSeoTitle}
                placeholder="SEO title"
                autoCapitalize="sentences"
              />
              <ThemedText style={styles.fieldLabel}>SEO Description</ThemedText>
              <TextInput
                value={seoDescription}
                onChangeText={setSeoDescription}
                placeholder="SEO description"
                placeholderTextColor="rgba(100,116,139,0.72)"
                multiline
                style={styles.multiInput}
              />
            </View>

            <View style={styles.actionRow}>
              <Button
                label={saveButtonLabel}
                variant="primary"
                disabled={saving || !hasUnsavedChanges}
                onPress={() => void saveStore()}
              />
            </View>
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
  },
  subtitle: {
    opacity: 0.74,
    lineHeight: 20,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.35)',
    backgroundColor: 'rgba(254,242,242,0.9)',
    padding: 12,
    gap: 10,
  },
  errorText: {
    color: '#B91C1C',
    lineHeight: 20,
  },
  cardStack: {
    gap: 10,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.24)',
    backgroundColor: 'rgba(240,249,255,0.92)',
    padding: 12,
    gap: 10,
  },
  helperText: {
    fontSize: 12,
    opacity: 0.72,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#0E7490',
    fontFamily: 'RobotoMono',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  multiInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.22)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    minHeight: 86,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
    color: '#0F172A',
    fontSize: 15,
    lineHeight: 21,
  },
  actionRow: {
    gap: 10,
  },
});
