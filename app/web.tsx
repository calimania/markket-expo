import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Alert, Animated, Linking, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';

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

const injectedLinkInterceptorScript = `
(() => {
  const postExternal = (url) => {
    if (!url || !window.ReactNativeWebView) return;
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ type: 'MARKKET_OPEN_EXTERNAL', url: String(url) })
    );
  };

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target || !target.closest) return;

    const anchor = target.closest('a');
    if (!anchor || !anchor.href) return;

    const targetAttr = (anchor.getAttribute('target') || '').toLowerCase();
    const relAttr = (anchor.getAttribute('rel') || '').toLowerCase();
    const isPopup = targetAttr === '_blank' || relAttr.includes('external');

    if (!isPopup) return;

    event.preventDefault();
    event.stopPropagation();
    postExternal(anchor.href);
  }, true);

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
  const insets = useSafeAreaInsets();
  const { displayBaseUrl } = useAppConfig();
  const { session, saveToken } = useAuthSession();
  const { url, captureAuth } = useLocalSearchParams<{
    url?: string | string[];
    captureAuth?: string | string[];
  }>();

  const [capturedSource, setCapturedSource] = useState<string>('');
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const lastExternalUrlRef = useRef('');
  const webViewRef = useRef<WebView | null>(null);
  const commandBarAnim = useRef(new Animated.Value(1)).current;
  const commandBarVisibleRef = useRef(true);
  const lastScrollYRef = useRef(0);

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

  const openCurrentInBrowser = useCallback(() => {
    void openExternalUrl(currentUrl || targetUrl);
  }, [currentUrl, openExternalUrl, targetUrl]);

  const pulseTap = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const copyCurrentUrl = useCallback(async () => {
    const urlToCopy = (currentUrl || targetUrl).trim();
    if (!urlToCopy) return;

    try {
      await Clipboard.setStringAsync(urlToCopy);
      pulseTap();
      Alert.alert('Copied', 'URL copied to clipboard.');
    } catch {
      Alert.alert('Could not copy', 'Try opening in browser instead.');
    }
  }, [currentUrl, pulseTap, targetUrl]);

  const setCommandBarVisible = useCallback(
    (visible: boolean) => {
      if (commandBarVisibleRef.current === visible) return;
      commandBarVisibleRef.current = visible;
      Animated.timing(commandBarAnim, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: false,
      }).start();
    },
    [commandBarAnim]
  );

  const goToTienda = useCallback(() => {
    router.replace({ pathname: '/web', params: { url: 'https://markket.place/tienda?display=embed', captureAuth: shouldCaptureAuth ? '1' : '0' } } as never);
  }, [router, shouldCaptureAuth]);

  const handleOpenWindow = useCallback(
    (event: { nativeEvent?: { targetUrl?: string } }) => {
      const popupUrl = (event.nativeEvent?.targetUrl || '').trim();
      if (!popupUrl) return;

      if (!isAllowedWebUrl(popupUrl, baseHost)) {
        void openExternalUrl(popupUrl);
        return;
      }

      router.replace({ pathname: '/web', params: { url: popupUrl, captureAuth: shouldCaptureAuth ? '1' : '0' } } as never);
    },
    [baseHost, openExternalUrl, router, shouldCaptureAuth]
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
      const rawData = event.nativeEvent?.data;
      if (!rawData) return;

      try {
        const payload = JSON.parse(rawData) as { type?: string; token?: string; source?: string; url?: string };
        if (payload.type === 'MARKKET_OPEN_EXTERNAL' && payload.url) {
          void openExternalUrl(payload.url);
          return;
        }

        if (!shouldCaptureAuth || !allowCapture) return;
        if (payload.type !== 'MARKKET_AUTH_TOKEN') return;
        if (!payload.token) return;

        void saveFromSource(payload.token, payload.source || 'webview');
      } catch {
        // Ignore non-JSON messages from websites.
      }
    },
    [allowCapture, openExternalUrl, saveFromSource, shouldCaptureAuth]
  );

  const handleNavStateChange = useCallback((state: { canGoBack?: boolean; canGoForward?: boolean; url?: string }) => {
    setCanGoBack(Boolean(state.canGoBack));
    setCanGoForward(Boolean(state.canGoForward));
    setCurrentUrl((state.url || '').trim());
  }, []);

  const handleWebScroll = useCallback(
    (event: { nativeEvent?: { contentOffset?: { y?: number } } }) => {
      const y = event.nativeEvent?.contentOffset?.y ?? 0;
      const delta = y - lastScrollYRef.current;
      lastScrollYRef.current = y;

      if (y <= 8) {
        setCommandBarVisible(true);
        return;
      }

      if (delta > 8) {
        setCommandBarVisible(false);
      } else if (delta < -8) {
        setCommandBarVisible(true);
      }
    },
    [setCommandBarVisible]
  );

  const combinedInjectedScript = useMemo(() => {
    const scripts = [];
    if (shouldCaptureAuth && allowCapture) {
      scripts.push(injectedCaptureScript);
    }
    scripts.push(injectedLinkInterceptorScript);
    return scripts.join('\n');
  }, [allowCapture, shouldCaptureAuth]);

  const commandBarBottomPadding = Math.max(insets.bottom, 8);
  const commandBarHeight = 74 + commandBarBottomPadding;

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
          {currentUrl || targetUrl}
        </ThemedText>
      </View>
      {capturedSource ? (
        <View style={styles.captureHint}>
          <ThemedText style={styles.captureHintText}>Session captured from {capturedSource}</ThemedText>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        source={{ uri: targetUrl }}
        startInLoadingState
        onMessage={handleMessage}
        onScroll={handleWebScroll}
        scrollEventThrottle={16}
        onNavigationStateChange={handleNavStateChange}
        onShouldStartLoadWithRequest={handleNavigationAttempt}
        onOpenWindow={handleOpenWindow}
        injectedJavaScriptBeforeContentLoaded={allowCapture ? injectedSessionScript : undefined}
        injectedJavaScript={combinedInjectedScript}
        sharedCookiesEnabled
        setSupportMultipleWindows
        renderLoading={() => (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" />
          </View>
        )}
      />
      <Animated.View
        style={[
          styles.commandBarShell,
          {
            paddingBottom: commandBarBottomPadding,
            height: commandBarAnim.interpolate({ inputRange: [0, 1], outputRange: [0, commandBarHeight] }),
            opacity: commandBarAnim,
          },
        ]}>
        <View style={styles.commandBar}>
          <View style={styles.navCluster}>
            <Pressable
              style={[styles.navButton, !canGoBack && styles.navButtonDisabled]}
              disabled={!canGoBack}
              onPress={() => {
                pulseTap();
                webViewRef.current?.goBack();
              }}>
              <ThemedText style={[styles.navButtonText, !canGoBack && styles.commandButtonTextDisabled]}>{'<'}</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.navButton, !canGoForward && styles.navButtonDisabled]}
              disabled={!canGoForward}
              onPress={() => {
                pulseTap();
                webViewRef.current?.goForward();
              }}>
              <ThemedText style={[styles.navButtonText, !canGoForward && styles.commandButtonTextDisabled]}>{'>'}</ThemedText>
            </Pressable>
          </View>

          <View style={styles.actionCluster}>
            <Pressable style={styles.commandChip} onPress={() => {
              pulseTap();
              goToTienda();
            }}>
              <ThemedText style={styles.commandChipText}>Store</ThemedText>
            </Pressable>
            <Pressable style={styles.commandChip} onPress={() => {
              pulseTap();
              void copyCurrentUrl();
            }}>
              <ThemedText style={styles.commandChipText}>Copy</ThemedText>
            </Pressable>
            <Pressable style={styles.commandChip} onPress={() => {
              pulseTap();
              openCurrentInBrowser();
            }}>
              <ThemedText style={styles.commandChipText}>Open</ThemedText>
            </Pressable>
            <Pressable style={styles.commandChip} onPress={() => {
              pulseTap();
              router.push('/profile' as never);
            }}>
              <ThemedText style={styles.commandChipText}>Me</ThemedText>
            </Pressable>
          </View>
        </View>
      </Animated.View>
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
  commandBar: {
    height: 66,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(252,253,255,0.96)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'nowrap',
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(148,163,184,0.5)',
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  commandBarShell: {
    overflow: 'hidden',
    paddingHorizontal: 12,
    backgroundColor: 'rgba(248,250,252,0.88)',
  },
  navCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionCluster: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.32)',
    backgroundColor: 'rgba(236,253,245,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    borderColor: 'rgba(120,120,120,0.22)',
    backgroundColor: 'rgba(241,245,249,0.92)',
  },
  navButtonText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '800',
    color: '#0E7490',
  },
  commandChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.24)',
    backgroundColor: 'rgba(240,249,255,0.92)',
    paddingHorizontal: 11,
    paddingVertical: 7,
    minWidth: 52,
    alignItems: 'center',
  },
  commandChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.2,
  },
  commandButtonTextDisabled: {
    color: 'rgba(100,116,139,0.75)',
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
