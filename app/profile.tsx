import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { maskToken, useAuthSession } from '@/hooks/use-auth-session';

type MeResponse = {
  id?: number;
  username?: string;
  email?: string;
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiBaseUrl, displayBaseUrl, defaultStoreSlug } = useAppConfig();
  const { ready, session, clearSession } = useAuthSession();

  const [checking, setChecking] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);

  const loginUrl = defaultStoreSlug
    ? `${displayBaseUrl}${defaultStoreSlug}`
    : `${displayBaseUrl}login`;

  const openLogin = () => {
    router.push({ pathname: '/web', params: { url: loginUrl, captureAuth: '1' } } as never);
  };

  const clear = async () => {
    await clearSession();
    setMe(null);
  };

  const checkMe = async () => {
    if (!session?.token) {
      Alert.alert('No session token', 'Log in from WebView first so the app can capture your auth token.');
      return;
    }

    setChecking(true);
    try {
      const response = await fetch(`${apiBaseUrl}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const payload = (await response.json()) as MeResponse;
      setMe(payload);
    } catch (err) {
      Alert.alert('Could not load profile', err instanceof Error ? err.message : 'Unknown API error');
    } finally {
      setChecking(false);
    }
  };

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
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16 }]}
        showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={styles.title}>
          Account
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Native session bridge for login, profile, and future notifications.
        </ThemedText>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Session</ThemedText>
          <ThemedText style={styles.infoLine}>
            {session?.token ? `Signed in (${maskToken(session.token)})` : 'Not signed in'}
          </ThemedText>
          <ThemedText style={styles.infoLine}>
            Source: {session?.source || 'none'}
          </ThemedText>
          <ThemedText style={styles.infoLine}>
            Updated: {session?.updatedAt || 'never'}
          </ThemedText>
        </View>

        <View style={styles.buttonRow}>
          <Pressable style={[styles.button, styles.primaryButton]} onPress={openLogin}>
            <ThemedText style={styles.primaryButtonText}>Open Login WebView</ThemedText>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={checkMe}>
            <ThemedText>Test /users/me</ThemedText>
          </Pressable>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={clear}>
            <ThemedText>Clear Session</ThemedText>
          </Pressable>
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Profile Payload</ThemedText>
          {checking ? (
            <ActivityIndicator style={styles.loader} />
          ) : me ? (
            <>
              <ThemedText style={styles.infoLine}>User: {me.username || 'unknown'}</ThemedText>
              <ThemedText style={styles.infoLine}>Email: {me.email || 'none'}</ThemedText>
              <ThemedText style={styles.infoLine}>ID: {typeof me.id === 'number' ? me.id : 'none'}</ThemedText>
            </>
          ) : (
            <ThemedText style={styles.infoLine}>Run the API test after login to verify token capture.</ThemedText>
          )}
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Next Step (Notifications)</ThemedText>
          <ThemedText style={styles.infoLine}>
            Once session works, add a Strapi endpoint for unread orders/inbox and poll it in-app, then map it to push notifications.
          </ThemedText>
        </View>
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
    paddingBottom: 42,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  subtitle: {
    opacity: 0.7,
    marginTop: 4,
  },
  card: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
    padding: 12,
    gap: 6,
  },
  infoLine: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.85,
  },
  buttonRow: {
    marginTop: 4,
    gap: 10,
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  loader: {
    marginVertical: 4,
  },
});
