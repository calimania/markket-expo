import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RichEditor, RichToolbar, actions } from 'react-native-pell-rich-editor';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';
import {
  buildStrapiRichTextPayloads,
  extractPlainText,
  normalizeHtmlForCompare,
  richValueToHtml,
} from '@/lib/rich-text';

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
  description?: unknown;
  Description?: unknown;
  Cover?: unknown;
  cover?: unknown;
  Logo?: unknown;
  logo?: unknown;
  Slides?: unknown;
  slides?: unknown;
  active?: unknown;
  Active?: unknown;
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

function slugToTitle(slug: string): string {
  return cleanText(slug)
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function pickSeo(store: StoreItem | null): StoreSEO | null {
  return store?.SEO || store?.seo || null;
}

function getStoreDescription(store: StoreItem | null): string {
  return extractPlainText(store?.description) || extractPlainText(store?.Description);
}

function getStoreDescriptionHtml(store: StoreItem | null): string {
  if (!store) return '<p></p>';
  const first = richValueToHtml(store.description);
  if (first !== '<p></p>') return first;
  return richValueToHtml(store.Description);
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
  const [descriptionHtml, setDescriptionHtml] = useState('<p></p>');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const descriptionEditorRef = useRef<RichEditor | null>(null);

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

      if (!selected) {
        setStore(null);
        setLoadError('Store not found in your account list.');
        return;
      }

      // Enrich with public Strapi endpoint to get full rich text content (description, SEO).
      // The owner proxy list endpoint may return a leaner shape that strips rich block fields.
      try {
        const publicUrl =
          `${apiBaseUrl}/api/stores?filters[slug][$eq]=${encodeURIComponent(resolvedStoreSlug)}` +
          `&populate[SEO][populate]=socialImage&populate[Logo]=true&populate[Cover]=true&populate[Slides]=true`;
        const publicResponse = await fetch(publicUrl);
        if (publicResponse.ok) {
          type PublicStorePayload = { data?: StoreItem[] };
          const publicPayload = (await publicResponse.json()) as PublicStorePayload;
          const publicStore = Array.isArray(publicPayload?.data) ? publicPayload.data[0] : null;
          if (publicStore) {
            setStore({
              ...selected,
              description: publicStore.description ?? publicStore.Description ?? selected.description,
              Description: publicStore.Description ?? publicStore.description ?? selected.Description,
              SEO: publicStore.SEO ?? publicStore.seo ?? selected.SEO ?? selected.seo,
              seo: publicStore.seo ?? publicStore.SEO ?? selected.seo ?? selected.SEO,
              Cover: publicStore.Cover ?? publicStore.cover ?? selected.Cover,
              cover: publicStore.cover ?? publicStore.Cover ?? selected.cover,
              Logo: publicStore.Logo ?? publicStore.logo ?? selected.Logo,
              logo: publicStore.logo ?? publicStore.Logo ?? selected.logo,
              Slides: publicStore.Slides ?? publicStore.slides ?? selected.Slides,
              slides: publicStore.slides ?? publicStore.Slides ?? selected.slides,
            });
            return;
          }
        }
      } catch {
        // Public enrichment failed — fall back to proxy data, which may lack rich content.
        console.warn('[StoreSettings] Public enrich failed, using proxy store data');
      }

      setStore(selected);
    } catch {
      setStore(null);
      setLoadError('Network error loading store settings.');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, displayBaseUrl, resolveUserId, resolvedStoreSlug, session?.token]);

  useEffect(() => {
    if (!ready || !session?.token || !resolvedStoreSlug) return;
    void loadStore();
  }, [loadStore, ready, resolvedStoreSlug, session?.token]);

  useEffect(() => {
    if (!store) return;

    const seo = pickSeo(store);
    const nextTitle = cleanText(store.title);
    const nextSlug = cleanText(store.slug);
    const nextDescriptionHtml = getStoreDescriptionHtml(store);

    setTitle(nextTitle);
    setSlug(nextSlug);
    setDescriptionHtml(nextDescriptionHtml);
    descriptionEditorRef.current?.setContentHTML(nextDescriptionHtml);
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
  const normalizedDescription = extractPlainText(descriptionHtml);
  const normalizedSeoTitle = cleanText(seoTitle);
  const normalizedSeoDescription = cleanText(seoDescription);
  const normalizedDescriptionHtml = normalizeHtmlForCompare(descriptionHtml);
  const preservedStoreFields = useMemo(() => {
    if (!store) return {};

    const preserved: Record<string, unknown> = {};
    const put = (key: string, value: unknown) => {
      if (value !== undefined) preserved[key] = value;
    };

    put('Cover', store.Cover ?? store.cover);
    put('cover', store.cover ?? store.Cover);
    put('Logo', store.Logo ?? store.logo);
    put('logo', store.logo ?? store.Logo);
    put('Slides', store.Slides ?? store.slides);
    put('slides', store.slides ?? store.Slides);

    const active = store.active ?? store.Active;
    put('active', active);
    put('Active', active);

    const seoSource = store.SEO || store.seo;
    const socialImage =
      seoSource && typeof seoSource === 'object' ? (seoSource as { socialImage?: unknown }).socialImage : undefined;
    if (socialImage !== undefined) {
      preserved.SEO = { socialImage };
      preserved.seo = { socialImage };
    }

    return preserved;
  }, [store]);

  const hasUnsavedChanges = useMemo(() => {
    if (!store) return false;
    const seo = pickSeo(store);
    const originalDescriptionHtml = normalizeHtmlForCompare(getStoreDescriptionHtml(store));
    return (
      normalizedTitle !== cleanText(store.title) ||
      normalizedSlug !== cleanText(store.slug) ||
      normalizedDescriptionHtml !== originalDescriptionHtml ||
      normalizedDescription !== getStoreDescription(store) ||
      normalizedSeoTitle !== cleanText(seo?.metaTitle) ||
      normalizedSeoDescription !== cleanText(seo?.metaDescription)
    );
  }, [
    normalizedDescriptionHtml,
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

      const payloads = buildStrapiRichTextPayloads({
        title: normalizedTitle,
        slug: normalizedSlug,
        descriptionHtml,
        seoTitle: normalizedSeoTitle,
        seoDescription: normalizedSeoDescription,
        preserveStore: preservedStoreFields,
      });

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
    descriptionHtml,
    displayBaseUrl,
    loadStore,
    normalizedDescription,
    normalizedSeoDescription,
    normalizedSeoTitle,
    normalizedSlug,
    normalizedTitle,
    preservedStoreFields,
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

  const navTitle = cleanText(store?.title) || slugToTitle(resolvedStoreSlug) || 'Store Settings';

  return (
    <ThemedView style={styles.flex}>
      <Stack.Screen options={{ title: navTitle }} />
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
                  <View style={styles.richEditorCard}>
                    <RichToolbar
                      editor={descriptionEditorRef}
                      actions={[
                        actions.setBold,
                        actions.setItalic,
                        actions.setUnderline,
                        actions.insertBulletsList,
                        actions.insertOrderedList,
                        actions.undo,
                        actions.redo,
                      ]}
                      iconTint="#0E7490"
                      selectedIconTint="#0F172A"
                      selectedButtonStyle={styles.richToolbarSelected}
                      style={styles.richToolbar}
                    />
                    <RichEditor
                      ref={descriptionEditorRef}
                      initialContentHTML={descriptionHtml}
                      placeholder="Write your store description"
                      onChange={setDescriptionHtml}
                      editorStyle={{
                        backgroundColor: '#FFFFFF',
                        color: '#0F172A',
                        placeholderColor: '#64748B',
                        contentCSSText: 'font-size:15px; line-height:1.5; padding: 8px 6px; min-height: 140px;',
                      }}
                      style={styles.richEditor}
                    />
                  </View>
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
  richEditorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.22)',
    backgroundColor: 'rgba(255,255,255,0.95)',
    overflow: 'hidden',
    height: 220,
  },
  richEditor: {
    flex: 1,
  },
  richToolbar: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(14,116,144,0.18)',
    backgroundColor: 'rgba(240,249,255,0.95)',
  },
  richToolbarSelected: {
    backgroundColor: 'rgba(186,230,253,0.9)',
    borderRadius: 6,
  },
  actionRow: {
    gap: 10,
  },
});
