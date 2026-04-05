import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

export default function GenericWebViewScreen() {
  const { url } = useLocalSearchParams<{ url?: string | string[] }>();

  const targetUrl = normalizeParam(url).trim();

  if (!targetUrl) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="subtitle">Missing URL</ThemedText>
      </ThemedView>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.urlBar}>
        <ThemedText numberOfLines={1} style={styles.urlText}>
          {targetUrl}
        </ThemedText>
      </View>
      <WebView
        source={{ uri: targetUrl }}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" />
          </View>
        )}
      />
    </View>
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
  loadingState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
