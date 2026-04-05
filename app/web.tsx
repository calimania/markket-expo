import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession, maskToken } from '@/hooks/use-auth-session';

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

const TOKEN_KEYS = ['token', 'jwt', 'access_token', 'accessToken', 'auth_token', 'authToken'];

function getHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return '';
  }
}

function readTokenFromUrl(rawUrl: string): { token: string; source: string } | null {
  try {
    const parsed = new URL(rawUrl);

    for (const key of TOKEN_KEYS) {
      const value = parsed.searchParams.get(key)?.trim();
      if (value) {
        return { token: value, source: `url:${key}` };
      }
    }

    // Some providers return token in hash fragment.
    const hash = parsed.hash.replace(/^#/, '');
    if (hash) {
      const params = new URLSearchParams(hash);
      for (const key of TOKEN_KEYS) {
        const value = params.get(key)?.trim();
        if (value) {
          return { token: value, source: `hash:${key}` };
        }
      }
    }

    return null;
  } catch {
    return null;
  }
}

const injectedCaptureScript = `
(() => {
  const keys = ['token', 'jwt', 'access_token', 'accessToken', 'auth_token', 'authToken'];

  const emit = (source, token) => {
    if (!token || !window.ReactNativeWebView) return;
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'MARKKET_AUTH_TOKEN', source, token: String(token) })
    );
  };

  try {
    keys.forEach((key) => {
      const value = window.localStorage ? window.localStorage.getItem(key) : '';
      if (value) emit('localStorage:' + key, value);
    });

    const cookie = document.cookie || '';
    if (cookie) {
      cookie.split(';').forEach((part) => {
        const [rawKey, ...rest] = part.trim().split('=');
        if (!rawKey || !rest.length) return;
        if (!keys.includes(rawKey)) return;
        emit('cookie:' + rawKey, decodeURIComponent(rest.join('=')));
      });
    }
  } catch (_err) {
    // Ignore script errors and continue page flow.
  }

  true;
})();`;

export default function GenericWebViewScreen() {
  const router = useRouter();
  const { displayBaseUrl } = useAppConfig();
  const { session, saveToken } = useAuthSession();
  const { url, captureAuth } = useLocalSearchParams<{
    url?: string | string[];
    captureAuth?: string | string[];
  }>();

  const [capturedSource, setCapturedSource] = useState<string>('');

  const targetUrl = normalizeParam(url).trim();
  const captureParam = normalizeParam(captureAuth).trim();
  const shouldCaptureAuth = captureParam !== '0';

  const allowCapture = useMemo(() => {
    const targetHost = getHost(targetUrl);
    const baseHost = getHost(displayBaseUrl);
    if (!targetHost || !baseHost) return false;
    return targetHost === baseHost || targetHost.endsWith('.markket.place');
  }, [displayBaseUrl, targetUrl]);

  const saveFromSource = useCallback(
    async (token: string, source: string) => {
      await saveToken(token, source);
      setCapturedSource(source);
    },
    [saveToken]
  );

  const handleNavigationAttempt = useCallback(
    (request: { url?: string }) => {
      const currentUrl = (request?.url || '').trim();
      if (!currentUrl) return true;

      if (shouldCaptureAuth && allowCapture) {
        const found = readTokenFromUrl(currentUrl);
        if (found) {
          void saveFromSource(found.token, found.source);
        }
      }

      // If magic login redirects to app scheme, stop web navigation.
      if (currentUrl.startsWith('markket://')) {
        const found = readTokenFromUrl(currentUrl);
        if (found) {
          void saveFromSource(found.token, found.source);
        }
        return false;
      }

      return true;
    },
    [allowCapture, saveFromSource, shouldCaptureAuth]
  );

  const handleMessage = useCallback(
    (event: { nativeEvent?: { data?: string } }) => {
      if (!shouldCaptureAuth || !allowCapture) return;

      const rawData = event.nativeEvent?.data;
      if (!rawData) return;

      try {
        const payload = JSON.parse(rawData) as { type?: string; token?: string; source?: string };
        if (payload.type !== 'MARKKET_AUTH_TOKEN') return;
        if (!payload.token) return;

        void saveFromSource(payload.token, payload.source || 'webview');
      } catch {
        // Ignore non-JSON messages from websites.
      }
    },
    [allowCapture, saveFromSource, shouldCaptureAuth]
  );

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
      <View style={styles.sessionBar}>
        <ThemedText style={styles.sessionText} numberOfLines={1}>
          {session?.token
            ? `Signed in token: ${maskToken(session.token)}`
            : 'Not signed in yet. Log in on this page to sync app session.'}
        </ThemedText>
        <Pressable style={styles.profileButton} onPress={() => router.push('/profile' as never)}>
          <ThemedText style={styles.profileButtonText}>Profile</ThemedText>
        </Pressable>
      </View>
      {capturedSource ? (
        <View style={styles.captureHint}>
          <ThemedText style={styles.captureHintText}>Session captured from {capturedSource}</ThemedText>
        </View>
      ) : null}
      <WebView
        source={{ uri: targetUrl }}
        startInLoadingState
        onMessage={handleMessage}
        onShouldStartLoadWithRequest={handleNavigationAttempt}
        injectedJavaScript={shouldCaptureAuth && allowCapture ? injectedCaptureScript : undefined}
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
  sessionBar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(120,120,120,0.45)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sessionText: {
    flex: 1,
    fontSize: 11,
    opacity: 0.8,
  },
  profileButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profileButtonText: {
    fontSize: 11,
    fontWeight: '700',
  },
  captureHint: {
    backgroundColor: 'rgba(9,123,57,0.14)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  captureHintText: {
    fontSize: 11,
    color: '#086c33',
    fontWeight: '600',
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
