import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
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

function isAllowedWebUrl(url: string, baseHost: string): boolean {
  const host = getHost(url);
  if (!host || !baseHost) return false;

  return host === baseHost || host === 'markket.place' || host === 'www.markket.place' || host.endsWith('.markket.place');
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

    const markketAuthRaw = window.localStorage ? window.localStorage.getItem('markket.auth') : '';
    if (markketAuthRaw) {
      try {
        const parsed = JSON.parse(markketAuthRaw);
        const jwt = parsed && typeof parsed === 'object' ? parsed.jwt : '';
        if (typeof jwt === 'string' && jwt.trim()) {
          emit('localStorage:markket.auth.jwt', jwt.trim());
        }
      } catch (_parseErr) {
        // Ignore malformed markket.auth payloads.
      }
    }

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

function buildInjectedSessionScript(
  session:
    | {
      token?: string | null;
      userId?: number | string;
      username?: string;
      email?: string;
      displayName?: string;
    }
    | null
    | undefined
): string | undefined {
  const cleanToken = typeof session?.token === 'string' ? session.token.trim() : '';
  if (!cleanToken) return undefined;

  const authPayload = {
    jwt: cleanToken,
    id: session?.userId,
    username: session?.username,
    email: session?.email,
    displayName: session?.displayName,
  };

  const payload = JSON.stringify(authPayload);
  const quotedToken = JSON.stringify(cleanToken);

  return `
    (() => {
      try {
        const token = ${quotedToken};
        const markketAuth = ${payload};

        if (window.localStorage) {
          window.localStorage.setItem('markket.auth', JSON.stringify(markketAuth));
          window.localStorage.setItem('jwt', token);
          window.localStorage.setItem('token', token);
          window.localStorage.setItem('auth_token', token);
        }

        document.cookie = 'jwt=' + encodeURIComponent(token) + '; path=/';
        document.cookie = 'token=' + encodeURIComponent(token) + '; path=/';
      } catch (_err) {
        // Ignore local injection issues and continue with page load.
      }

      true;
    })();
  `;
}

export default function GenericWebViewScreen() {
  const router = useRouter();
  const { displayBaseUrl } = useAppConfig();
  const { session, saveToken } = useAuthSession();
  const { url, captureAuth } = useLocalSearchParams<{
    url?: string | string[];
    captureAuth?: string | string[];
  }>();

  const [capturedSource, setCapturedSource] = useState<string>('');
  const lastExternalUrlRef = useRef('');

  const targetUrl = normalizeParam(url).trim();
  const captureParam = normalizeParam(captureAuth).trim();
  const shouldCaptureAuth = captureParam !== '0';
  const baseHost = useMemo(() => getHost(displayBaseUrl), [displayBaseUrl]);

  const allowCapture = useMemo(() => {
    return isAllowedWebUrl(targetUrl, baseHost);
  }, [baseHost, targetUrl]);

  const injectedSessionScript = useMemo(() => buildInjectedSessionScript(session), [session]);

  const saveFromSource = useCallback(
    async (token: string, source: string) => {
      await saveToken(token, source);
      setCapturedSource(source);
    },
    [saveToken]
  );

  const openExternalUrl = useCallback(async (externalUrl: string) => {
    const cleanUrl = externalUrl.trim();
    if (!cleanUrl) return;
    if (lastExternalUrlRef.current === cleanUrl) return;

    lastExternalUrlRef.current = cleanUrl;
    try {
      await Linking.openURL(cleanUrl);
    } catch {
      lastExternalUrlRef.current = '';
    }
  }, []);

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

      if (!isAllowedWebUrl(currentUrl, baseHost)) {
        void openExternalUrl(currentUrl);
        return false;
      }

      return true;
    },
    [allowCapture, baseHost, openExternalUrl, saveFromSource, shouldCaptureAuth]
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
        <ThemedText type="subtitle">No URL provided</ThemedText>
        <ThemedText style={styles.centerHint}>Open login from Profile to start auth in WebView.</ThemedText>
        <Pressable style={styles.centerButton} onPress={() => router.push('/profile' as never)}>
          <ThemedText style={styles.centerButtonText}>Go to Profile</ThemedText>
        </Pressable>
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
            ? 'Authenticated in app. This page should open with your session.'
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
        injectedJavaScriptBeforeContentLoaded={allowCapture ? injectedSessionScript : undefined}
        injectedJavaScript={shouldCaptureAuth && allowCapture ? injectedCaptureScript : undefined}
        sharedCookiesEnabled
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
    paddingHorizontal: 20,
    gap: 10,
  },
  centerHint: {
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
  },
  centerButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  centerButtonText: {
    fontWeight: '700',
  },
});
