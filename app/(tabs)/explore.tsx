import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SectionHeader } from '@/components/ui/section-header';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Colors, Radii } from '@/constants/theme';
import { Spacing } from '@/constants/spacing';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_CONTENT_STORE_SLUG,
  DEFAULT_DISPLAY_BASE_URL,
  DEFAULT_LINK_OPEN_MODE,
  DEFAULT_STORES_QUERY,
  DEFAULT_STORE_SLUG,
  type LinkOpenMode,
  useAppConfig,
} from '@/hooks/use-app-config';

type DefaultStoreInfo = {
  id: number;
  title: string;
  Logo?: { url?: string; formats?: { small?: { url?: string }; thumbnail?: { url?: string } } } | null;
  URLS?: { id: number; Label: string; URL: string }[];
};

export default function SettingsScreen() {
  const readOnlyCommunityEdition = true;

  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    apiBaseUrl,
    displayBaseUrl,
    defaultStoreSlug,
    contentStoreSlug,
    linkOpenMode,
    storesQuery,
    setApiBaseUrl,
    setDisplayBaseUrl,
    setDefaultStoreSlug,
    setContentStoreSlug,
    setLinkOpenMode,
    setStoresQuery,
    resetDefaults,
    ready,
  } = useAppConfig();

  const [apiInput, setApiInput] = useState(apiBaseUrl);
  const [displayInput, setDisplayInput] = useState(displayBaseUrl);
  const [slugInput, setSlugInput] = useState(defaultStoreSlug);
  const [contentSlugInput, setContentSlugInput] = useState(contentStoreSlug);
  const [openModeInput, setOpenModeInput] = useState<LinkOpenMode>(linkOpenMode);
  const [displayModeInput] = useState<'match-device' | 'dark'>('match-device');
  const [queryInput, setQueryInput] = useState(storesQuery);
  const [saved, setSaved] = useState(false);
  const [defaultStoreInfo, setDefaultStoreInfo] = useState<DefaultStoreInfo | null>(null);
  const defaultStoreLogoUrl =
    defaultStoreInfo?.Logo?.formats?.small?.url ??
    defaultStoreInfo?.Logo?.formats?.thumbnail?.url ??
    defaultStoreInfo?.Logo?.url ?? null;

  useEffect(() => {
    if (!ready || !defaultStoreSlug) { setDefaultStoreInfo(null); return; }
    const url = `${apiBaseUrl}/api/stores?filters[slug][$eq]=${encodeURIComponent(defaultStoreSlug)}&populate[]=Logo&populate[]=URLS&pagination[pageSize]=1`;
    fetch(url)
      .then((r) => r.json())
      .then((j: { data?: DefaultStoreInfo[] }) => setDefaultStoreInfo(j.data?.[0] ?? null))
      .catch(() => { });
  }, [apiBaseUrl, defaultStoreSlug, ready]);

  useEffect(() => {
    setApiInput(apiBaseUrl);
    setDisplayInput(displayBaseUrl);
    setSlugInput(defaultStoreSlug);
    setContentSlugInput(contentStoreSlug);
    setOpenModeInput(linkOpenMode);
    setQueryInput(storesQuery);
  }, [apiBaseUrl, contentStoreSlug, defaultStoreSlug, displayBaseUrl, linkOpenMode, storesQuery]);

  const save = () => {
    setApiBaseUrl(apiInput);
    setDisplayBaseUrl(displayInput);
    setDefaultStoreSlug(slugInput);
    setContentStoreSlug(contentSlugInput);
    setLinkOpenMode(openModeInput);
    setStoresQuery(queryInput);
    setSaved(true);
  };

  const reset = () => {
    resetDefaults();
    setApiInput(DEFAULT_API_BASE_URL);
    setDisplayInput(DEFAULT_DISPLAY_BASE_URL);
    setSlugInput(DEFAULT_STORE_SLUG);
    setContentSlugInput(DEFAULT_CONTENT_STORE_SLUG);
    setOpenModeInput(DEFAULT_LINK_OPEN_MODE);
    setQueryInput(DEFAULT_STORES_QUERY);
    setSaved(true);
  };

  if (!ready) {
    return (
      <ThemedView style={[styles.flex, { paddingTop: insets.top + 20, paddingHorizontal: 18 }]}>
        <ThemedText>Loading settings...</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <ThemedText type="title" style={styles.title}>Settings</ThemedText>
          <ThemedText style={styles.subtitle}>Markket community app configuration</ThemedText>
          <ThemedText style={styles.communityHint}>Community Edition · read-only configuration</ThemedText>

          {defaultStoreInfo ? (
            <View style={styles.storeBanner}>
              {defaultStoreLogoUrl ? (
                <Image
                  source={{ uri: defaultStoreLogoUrl }}
                  style={styles.storeBannerLogo}
                  contentFit="contain"
                  transition={200}
                />
              ) : null}
              <ThemedText type="headline" style={styles.storeBannerTitle}>{defaultStoreInfo.title}</ThemedText>
              {defaultStoreInfo.URLS?.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeBannerLinks}>
                  {defaultStoreInfo.URLS.slice(0, 4).map((u) => (
                    <Pressable key={u.id} style={styles.storeBannerPill} onPress={() => Linking.openURL(u.URL)}>
                      <ThemedText style={styles.storeBannerPillText}>{u.Label || 'Link'}</ThemedText>
                    </Pressable>
                  ))}
                </ScrollView>
              ) : null}
            </View>
          ) : null}

          <View style={styles.sectionCard}>
            <SectionHeader
              eyebrow="network"
              title="Connection"
              subtitle="Point this app to the right Markket instance."
            />

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">API Base URL</ThemedText>
              <Input
                value={apiInput}
                onChangeText={setApiInput}
                placeholder="https://api.markket.place"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!readOnlyCommunityEdition}
              />
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Display Base URL</ThemedText>
              <Input
                value={displayInput}
                onChangeText={setDisplayInput}
                placeholder="https://markket.place/"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                editable={!readOnlyCommunityEdition}
              />
      </View>
          </View>

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="store" title="Store Defaults" subtitle="Scope content and legal pages intentionally." />

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Default Store Slug</ThemedText>
              <Input
                value={slugInput}
                onChangeText={setSlugInput}
                placeholder="your-store-slug"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!readOnlyCommunityEdition}
              />
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Content Store Slug</ThemedText>
              <Input
                value={contentSlugInput}
                onChangeText={setContentSlugInput}
                placeholder={DEFAULT_CONTENT_STORE_SLUG}
                autoCapitalize="none"
                autoCorrect={false}
                editable={!readOnlyCommunityEdition}
              />
        <ThemedText style={styles.inlineHint}>
          Used for shared pages like privacy and terms. Defaults from EXPO_PUBLIC_CONTENT_STORE_SLUG.
        </ThemedText>
      </View>
          </View>

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="behavior" title="Link Open Mode" subtitle="Choose where external links resolve." />

      <View style={styles.group}>
              <SegmentedControl
                options={[
                  { label: 'Ask', value: 'ask' },
                  { label: 'WebView', value: 'webview' },
                  { label: 'Browser', value: 'browser' },
                ]}
                value={openModeInput}
                onChange={setOpenModeInput}
                disabled={readOnlyCommunityEdition}
              />
            </View>
      </View>

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="appearance" title="Display Mode" subtitle="Temporarily locked while dark mode is tuned." />
            <View style={styles.group}>
              <SegmentedControl
                disabled
                options={[
                  { label: 'Match Device', value: 'match-device' },
                  { label: 'Dark', value: 'dark' },
                ]}
                value={displayModeInput}
                onChange={() => { }}
              />
              <ThemedText style={styles.inlineHint}>
                Disabled for now. App is temporarily forced to bright mode while we tune dark mode styles.
              </ThemedText>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="data" title="Stores Feed Query" subtitle="Fine-tune the stores feed query string." />

      <View style={styles.group}>
              <Input
                value={queryInput}
                onChangeText={setQueryInput}
                placeholder={DEFAULT_STORES_QUERY}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
                style={styles.queryInput}
                editable={!readOnlyCommunityEdition}
              />
        <ThemedText style={styles.hint}>
          Strapi query params for the stores feed. Page number is handled in-app.
        </ThemedText>
      </View>
          </View>

      <View style={styles.buttonRow}>
            <Button
              label="Save"
              onPress={save}
              style={[styles.actionButton, readOnlyCommunityEdition ? styles.actionButtonDisabled : undefined]}
              disabled={readOnlyCommunityEdition}
            />
            <Button
              label="Reset"
              variant="secondary"
              onPress={reset}
              style={[styles.actionButton, readOnlyCommunityEdition ? styles.actionButtonDisabled : undefined]}
              disabled={readOnlyCommunityEdition}
            />
      </View>

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="legal" title="Legal Pages" subtitle="Quick access for legal document verification." />
        <View style={styles.legalRow}>
              <Pressable style={styles.pillButton} onPress={() => router.push({ pathname: '/legal/[kind]', params: { kind: 'privacy' } } as never)}>
            <ThemedText>Privacy</ThemedText>
          </Pressable>
              <Pressable style={styles.pillButton} onPress={() => router.push({ pathname: '/legal/[kind]', params: { kind: 'terms' } } as never)}>
            <ThemedText>Terms</ThemedText>
          </Pressable>
        </View>
      </View>

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="account" title="Account" subtitle="Profile and session tooling for auth testing." />
            <View style={styles.legalRow}>
              <Pressable style={styles.pillButton} onPress={() => router.push('/profile' as never)}>
                <ThemedText>Profile & Session</ThemedText>
              </Pressable>
              {__DEV__ ? (
                <Pressable style={styles.pillButton} onPress={() => router.push('/(dev)/design-system' as never)}>
                  <ThemedText>Design System</ThemedText>
                </Pressable>
              ) : null}
            </View>
            <ThemedText style={styles.inlineHint}>
              Use this to capture magic-login sessions from WebView and test native API auth.
            </ThemedText>
          </View>



      {saved ? (
        <ThemedText style={styles.hint}>Saved. Return to Home and pull to refresh.</ThemedText>
      ) : (
        <ThemedText style={styles.hint}>Change URLs and query params to point this app at your own Markket instance.</ThemedText>
      )}

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="policy" title="Disclaimer" />
            <ThemedText style={styles.disclaimer}>
              This app is a community client for the Markket platform. Content, listings, and data published by store owners are their sole responsibility. Markket is not liable for user-generated content or transactions made through third-party stores.
            </ThemedText>
          </View>

          <View style={styles.sectionCard}>
            <SectionHeader eyebrow="support" title="Contact" subtitle="Direct channels by intent." />
            <ThemedText style={styles.contactLine}>Legal · legal@markket.place</ThemedText>
            <ThemedText style={styles.contactLine}>Support · support@markket.place</ThemedText>
            <ThemedText style={styles.contactLine}>Orders · orders@markket.place</ThemedText>
            <ThemedText style={styles.contactLine}>Selling · selling@markket.place</ThemedText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.md,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: Spacing.xs,
    opacity: 0.7,
  },
  communityHint: {
    opacity: 0.8,
    color: Colors.light.secondary,
  },
  sectionCard: {
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    backgroundColor: Colors.light.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  group: {
    gap: Spacing.sm,
  },
  queryInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  actionButtonDisabled: {
    opacity: 0.45,
  },
  legalRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  pillButton: {
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    borderRadius: Radii.full,
    backgroundColor: Colors.light.surfaceContainerHigh,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  hint: {
    marginTop: Spacing.xs,
    opacity: 0.75,
  },
  inlineHint: {
    opacity: 0.7,
    lineHeight: 18,
  },
  disclaimer: {
    opacity: 0.7,
    lineHeight: 20,
    fontSize: 13,
  },
  contactLine: {
    opacity: 0.75,
    fontSize: 13,
    lineHeight: 22,
  },
  storeBanner: {
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    backgroundColor: Colors.light.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
    alignItems: 'center',
  },
  storeBannerLogo: {
    width: 72,
    height: 72,
    borderRadius: Radii.md,
    backgroundColor: Colors.light.surfaceDim,
  },
  storeBannerTitle: {
    textAlign: 'center',
  },
  storeBannerLinks: {
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  storeBannerPill: {
    borderWidth: 1,
    borderColor: Colors.light.outlineVariant,
    borderRadius: Radii.full,
    backgroundColor: Colors.light.surfaceContainerHigh,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  storeBannerPillText: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'SpaceGrotesk',
  },
});
