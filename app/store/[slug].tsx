import { Stack, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';

function safeSlug(value: string): string {
  return value.replace(/^\/+/, '').trim();
}

export default function StoreScreen() {
  const { slug } = useLocalSearchParams<{ slug: string | string[] }>();
  const { displayBaseUrl, ready } = useAppConfig();

  const slugValue = Array.isArray(slug) ? slug[0] : slug;
  const cleanSlug = safeSlug(slugValue ?? '');

  if (!ready) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!cleanSlug) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="subtitle">Invalid store slug</ThemedText>
      </ThemedView>
    );
  }

  const url = `${displayBaseUrl}${cleanSlug}`;

  return (
    <>
      <Stack.Screen
        options={{
          title: cleanSlug ? `/${cleanSlug}` : 'Store',
          headerBackTitle: 'Stores',
        }}
      />
      <View style={styles.container}>
        <View style={styles.urlBar}>
          <ThemedText numberOfLines={1} style={styles.urlText}>
            {url}
          </ThemedText>
        </View>
        <WebView source={{ uri: url }} startInLoadingState />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  urlBar: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120,120,120,0.55)',
    backgroundColor: '#f1f4f8',
  },
  urlText: {
    fontSize: 12,
    opacity: 0.8,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
