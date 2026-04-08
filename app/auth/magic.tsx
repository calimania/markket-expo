import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiPost } from '@/lib/api';

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

export default function MagicAuthBridgeScreen() {
  const router = useRouter();
  const { apiBaseUrl, displayBaseUrl } = useAppConfig();
  const { saveToken } = useAuthSession();
  const { code, next } = useLocalSearchParams<{ code?: string | string[]; next?: string | string[] }>();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('Verifying secure login code...');
  const codeValue = useMemo(() => normalizeParam(code).trim(), [code]);
  const nextValue = useMemo(() => normalizeParam(next).trim() || 'ios', [next]);

  const buildWebMagicUrl = useCallback(() => {
    if (codeValue) {
      return `${displayBaseUrl}auth/magic?code=${encodeURIComponent(codeValue)}&next=${encodeURIComponent(nextValue)}`;
    }

    return `${displayBaseUrl}auth/magic?next=${encodeURIComponent(nextValue)}`;
  }, [codeValue, displayBaseUrl, nextValue]);

  const openMagicWebView = useCallback(() => {
    const url = buildWebMagicUrl();
    router.replace({
      pathname: '/web',
      params: {
        url,
        captureAuth: '1',
      },
    } as never);
  }, [buildWebMagicUrl, router]);

  const openProfile = useCallback(() => {
    router.replace('/profile' as never);
  }, [router]);

  function extractToken(payload: unknown): string {
    if (!payload || typeof payload !== 'object') return '';

    const raw = payload as Record<string, unknown>;

    const direct = typeof raw.jwt === 'string' ? raw.jwt : typeof raw.token === 'string' ? raw.token : '';
    if (direct.trim()) return direct.trim();

    const data = raw.data;
    if (data && typeof data === 'object') {
      const nested = data as Record<string, unknown>;
      const candidate = typeof nested.jwt === 'string' ? nested.jwt : typeof nested.token === 'string' ? nested.token : '';
      return candidate.trim();
    }

    return '';
  }

  function extractUser(payload: unknown): { userId?: number | string; username?: string; email?: string } {
    if (!payload || typeof payload !== 'object') return {};

    const raw = payload as Record<string, unknown>;
    const candidate = raw.user && typeof raw.user === 'object' ? (raw.user as Record<string, unknown>) : raw;

    return {
      userId:
        typeof candidate.id === 'number' || typeof candidate.id === 'string'
          ? (candidate.id as number | string)
          : undefined,
      username: typeof candidate.username === 'string' ? candidate.username : undefined,
      email: typeof candidate.email === 'string' ? candidate.email : undefined,
    };
  }

  useEffect(() => {
    let cancelled = false;

    async function verifyMagicCodeNative() {
      if (!codeValue) {
        setStatus('error');
        setMessage('Missing magic code. Open the latest login link from your email again.');
        return;
      }

      setStatus('loading');
      setMessage('Verifying secure login code...');

      const result = await apiPost<unknown>(
        '/api/auth-magic/verify',
        { code: codeValue },
        { baseUrl: apiBaseUrl }
      );

      if (cancelled) return;

      if (!result.ok) {
        if (result.error.status === 401) {
          setStatus('error');
          setMessage('This magic code is invalid or expired. Request a new link and try again.');
          return;
        }

        setStatus('error');
        setMessage(`Could not verify code (${result.error.status || 'network'}).`);
        return;
      }

      const token = extractToken(result.data);

      if (!token) {
        setStatus('error');
        setMessage('Code verified but no session token was returned.');
        return;
      }

      await saveToken(token, 'auth-magic-native', extractUser(result.data));

      if (cancelled) return;

      setStatus('success');
      setMessage('You are logged in. Opening your account...');
      setTimeout(() => {
        if (!cancelled) openProfile();
      }, 450);
    }

    void verifyMagicCodeNative();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, codeValue, openProfile, saveToken]);

  return (
    <ThemedView style={styles.centerState}>
      <View style={styles.card}>
        {status === 'loading' ? <ActivityIndicator size="large" /> : null}
        <ThemedText type="subtitle" style={styles.title}>
          {status === 'success' ? 'Logged In' : status === 'error' ? 'Login Failed' : 'Signing In'}
        </ThemedText>
        <ThemedText style={styles.text}>{message}</ThemedText>

        {status === 'error' ? (
          <View style={styles.actions}>
            <Pressable style={[styles.button, styles.primaryButton]} onPress={openMagicWebView}>
              <ThemedText style={styles.primaryButtonText}>Open Web Login</ThemedText>
            </Pressable>
            <Pressable style={styles.button} onPress={openProfile}>
              <ThemedText style={styles.buttonText}>Back to Profile</ThemedText>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    width: '100%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.3)',
    paddingHorizontal: 14,
    paddingVertical: 16,
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  title: {
    fontSize: 20,
    lineHeight: 24,
  },
  text: {
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 20,
  },
  actions: {
    marginTop: 4,
    width: '100%',
    gap: 8,
  },
  button: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.35)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButton: {
    backgroundColor: '#0891B2',
    borderColor: '#0891B2',
  },
  buttonText: {
    fontWeight: '700',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
});
