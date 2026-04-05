import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
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
import { useThemeColor } from '@/hooks/use-theme-color';

export default function SettingsScreen() {
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
  const [queryInput, setQueryInput] = useState(storesQuery);
  const [saved, setSaved] = useState(false);

  const borderColor = useThemeColor({}, 'icon');
  const inputBackground = useThemeColor({}, 'background');

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
      <ThemedText type="title" style={styles.title}>
        Settings
      </ThemedText>
      <ThemedText style={styles.subtitle}>Markket community app configuration</ThemedText>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">API Base URL</ThemedText>
        <TextInput
          value={apiInput}
          onChangeText={setApiInput}
          placeholder="https://api.markket.place"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, { borderColor, backgroundColor: inputBackground }]}
        />
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Display Base URL</ThemedText>
        <TextInput
          value={displayInput}
          onChangeText={setDisplayInput}
          placeholder="https://markket.place/"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, { borderColor, backgroundColor: inputBackground }]}
        />
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Default Store Slug</ThemedText>
        <TextInput
          value={slugInput}
          onChangeText={setSlugInput}
          placeholder="your-store-slug"
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { borderColor, backgroundColor: inputBackground }]}
        />
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Content Store Slug</ThemedText>
        <TextInput
          value={contentSlugInput}
          onChangeText={setContentSlugInput}
          placeholder={DEFAULT_CONTENT_STORE_SLUG}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { borderColor, backgroundColor: inputBackground }]}
        />
        <ThemedText style={styles.inlineHint}>
          Used for shared pages like privacy and terms. Defaults from EXPO_PUBLIC_CONTENT_STORE_SLUG.
        </ThemedText>
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Link Open Mode</ThemedText>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeButton, openModeInput === 'ask' && styles.modeButtonActive]}
            onPress={() => setOpenModeInput('ask')}>
            <ThemedText style={styles.modeButtonText}>Ask</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.modeButton, openModeInput === 'webview' && styles.modeButtonActive]}
            onPress={() => setOpenModeInput('webview')}>
            <ThemedText style={styles.modeButtonText}>WebView</ThemedText>
          </Pressable>
          <Pressable
            style={[styles.modeButton, openModeInput === 'browser' && styles.modeButtonActive]}
            onPress={() => setOpenModeInput('browser')}>
            <ThemedText style={styles.modeButtonText}>Browser</ThemedText>
          </Pressable>
        </View>
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Stores Query String</ThemedText>
        <TextInput
          value={queryInput}
          onChangeText={setQueryInput}
          placeholder={DEFAULT_STORES_QUERY}
          autoCapitalize="none"
          autoCorrect={false}
          multiline
          style={[styles.input, styles.queryInput, { borderColor, backgroundColor: inputBackground }]}
        />
        <ThemedText style={styles.hint}>
          Strapi query params for the stores feed. Page number is handled in-app.
        </ThemedText>
      </View>

      <View style={styles.buttonRow}>
        <Pressable style={[styles.button, styles.primaryButton]} onPress={save}>
          <ThemedText style={styles.primaryButtonText}>Save</ThemedText>
        </Pressable>
        <Pressable style={[styles.button, styles.secondaryButton]} onPress={reset}>
          <ThemedText>Reset</ThemedText>
        </Pressable>
      </View>

      <View style={styles.group}>
        <ThemedText type="defaultSemiBold">Legal Pages</ThemedText>
        <View style={styles.legalRow}>
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.push({ pathname: '/legal/[kind]', params: { kind: 'privacy' } } as never)}>
            <ThemedText>Privacy</ThemedText>
          </Pressable>
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.push({ pathname: '/legal/[kind]', params: { kind: 'terms' } } as never)}>
            <ThemedText>Terms</ThemedText>
          </Pressable>
        </View>
      </View>

          <View style={styles.group}>
            <ThemedText type="defaultSemiBold">Account</ThemedText>
            <View style={styles.legalRow}>
              <Pressable style={[styles.button, styles.secondaryButton]} onPress={() => router.push('/profile' as never)}>
                <ThemedText>Profile & Session</ThemedText>
              </Pressable>
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

          <View style={styles.group}>
            <ThemedText type="defaultSemiBold">Disclaimer</ThemedText>
            <ThemedText style={styles.disclaimer}>
              This app is a community client for the Markket platform. Content, listings, and data published by store owners are their sole responsibility. Markket is not liable for user-generated content or transactions made through third-party stores.
            </ThemedText>
          </View>

          <View style={styles.group}>
            <ThemedText type="defaultSemiBold">Contact</ThemedText>
            <ThemedText style={styles.contactLine}>Legal · legal@markket.place</ThemedText>
            <ThemedText style={styles.contactLine}>Support · support@markket.place</ThemedText>
            <ThemedText style={styles.contactLine}>Orders · orders@markket.place</ThemedText>
            <ThemedText style={styles.contactLine}>Selling · selling@markket.place</ThemedText>
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
    paddingHorizontal: 18,
    paddingBottom: 48,
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  subtitle: {
    marginTop: 6,
    opacity: 0.7,
  },
  group: {
    marginTop: 18,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  queryInput: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  buttonRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  legalRow: {
    flexDirection: 'row',
    gap: 10,
  },
  modeButton: {
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.45)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  modeButtonActive: {
    borderColor: '#D946EF',
    backgroundColor: 'rgba(217, 70, 239, 0.12)',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  primaryButton: {
    backgroundColor: '#D946EF',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.45)',
  },
  hint: {
    marginTop: 16,
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
});
