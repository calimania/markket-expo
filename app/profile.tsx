import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';

type MeResponse = {
  id?: number;
  username?: string;
  email?: string;
  bio?: string | null;
  displayName?: string | null;
  updatedAt?: string;
  avatar?: {
    url?: string;
    formats?: {
      thumbnail?: { url?: string };
      small?: { url?: string };
      medium?: { url?: string };
    };
  } | null;
  role?: {
    id?: number;
    name?: string;
    type?: string;
  };
};

type UserDetailResponse = MeResponse;

type StoreLookupResponse = {
  data?: {
    id?: number;
    documentId?: string;
    slug?: string;
  }[];
};

const WHATSAPP_MAGIC_NUMBER = '15186291830';
const WHATSAPP_MAGIC_LABEL = '+1 (518) 629 1830';
const WHATSAPP_MAGIC_TEXT = 'magic';

function cleanText(value: string | null | undefined): string {
  if (!value) return '';
  return value.trim();
}

function getInitials(value: string): string {
  const clean = cleanText(value);
  if (!clean) return 'M';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { apiBaseUrl, displayBaseUrl, defaultStoreSlug } = useAppConfig();
  const { ready, session, clearSession, saveToken } = useAuthSession();

  const [checking, setChecking] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [requestingMagic, setRequestingMagic] = useState(false);
  const [showEmailMagicForm, setShowEmailMagicForm] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [magicStoreId, setMagicStoreId] = useState('');

  const dashboardUrl = `${displayBaseUrl}dashboard/store`;
  const settingsUrl = `${displayBaseUrl}dashboard/settings`;
  const requestMagicUrl = `${displayBaseUrl}api/markket?path=/api/auth-magic/request`;
  const updateProfileUrl = `${displayBaseUrl}api/markket/user`;
  const whatsappMagicUrl = `https://wa.me/${WHATSAPP_MAGIC_NUMBER}?text=${encodeURIComponent(WHATSAPP_MAGIC_TEXT)}`;

  const identityLabel = useMemo(() => {
    return cleanText(displayNameInput || me?.displayName || me?.username || me?.email || '') || 'Markket Member';
  }, [displayNameInput, me?.displayName, me?.email, me?.username]);

  const profileDirty = useMemo(() => {
    const currentName = cleanText(me?.displayName || '');
    const currentBio = cleanText(me?.bio || '');
    return cleanText(displayNameInput) !== currentName || cleanText(bioInput) !== currentBio;
  }, [bioInput, displayNameInput, me?.bio, me?.displayName]);

  const prettyEmail = cleanText(me?.email || me?.username || '');
  const avatarUrl = cleanText(
    me?.avatar?.formats?.thumbnail?.url ||
    me?.avatar?.formats?.small?.url ||
    me?.avatar?.formats?.medium?.url ||
    me?.avatar?.url ||
    ''
  );

  useEffect(() => {
    let cancelled = false;

    async function loadStoreId() {
      if (!defaultStoreSlug || magicStoreId) return;

      const encodedSlug = encodeURIComponent(defaultStoreSlug);
      const result = await apiGet<StoreLookupResponse>(
        `/api/stores?filters[slug][$eq]=${encodedSlug}&pagination[pageSize]=1`,
        { baseUrl: apiBaseUrl }
      );

      if (!result.ok || cancelled) return;

      const store = result.data?.data?.[0];
      if (typeof store?.id === 'number') {
        setMagicStoreId(String(store.id));
      }
    }

    void loadStoreId();

    return () => {
      cancelled = true;
    };
  }, [apiBaseUrl, defaultStoreSlug, magicStoreId]);

  const canRequestMagic = useMemo(() => {
    const hasEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(magicEmail.trim());
    return hasEmail && magicStoreId.trim().length > 0;
  }, [magicEmail, magicStoreId]);

  const storeIdStatus = useMemo(() => {
    if (magicStoreId.trim()) return 'Email login is ready.';
    if (defaultStoreSlug) return 'Setting up email login...';
    return 'Email login is temporarily unavailable.';
  }, [defaultStoreSlug, magicStoreId]);

  const openDashboard = () => {
    router.push({ pathname: '/web', params: { url: dashboardUrl, captureAuth: '1' } } as never);
  };

  const openSettingsWeb = () => {
    router.push({ pathname: '/web', params: { url: settingsUrl, captureAuth: '1' } } as never);
  };

  const openWhatsAppMagic = async () => {
    try {
      await Linking.openURL(whatsappMagicUrl);
    } catch {
      Alert.alert('Could not open WhatsApp', `Message ${WHATSAPP_MAGIC_LABEL} with "${WHATSAPP_MAGIC_TEXT}" to get your login link.`);
    }
  };

  const clear = async () => {
    await clearSession();
    setMe(null);
    setDisplayNameInput('');
    setBioInput('');
  };

  const confirmLogout = () => {
    Alert.alert('Log out?', 'This removes your saved session from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          void clear();
        },
      },
    ]);
  };

  const checkMe = async () => {
    if (!session?.token) {
      Alert.alert('No session token', 'Log in from WebView first so the app can capture your auth token.');
      return;
    }

    setChecking(true);
    try {
      const result = await apiGet<MeResponse>('/api/users/me', {
        baseUrl: apiBaseUrl,
        token: session.token,
      });

      if (!result.ok) {
        throw new Error(`API returned ${result.error.status}`);
      }

      const profile = result.data;

      if (typeof profile.id === 'number') {
        const detailResult = await apiGet<UserDetailResponse>(`/api/users/${profile.id}?populate=avatar`, {
          baseUrl: apiBaseUrl,
          token: session.token,
        });

        if (detailResult.ok) {
          profile.avatar = detailResult.data.avatar;
        }
      }

      setMe(profile);
      setDisplayNameInput(cleanText(profile.displayName || ''));
      setBioInput(cleanText(profile.bio || ''));
      await saveToken(session.token, session.source || 'profile-refresh', {
        userId: profile.id,
        username: cleanText(profile.username || ''),
        email: cleanText(profile.email || ''),
        displayName: cleanText(profile.displayName || ''),
      });
      if (!magicEmail.trim() && cleanText(profile.email || '')) {
        setMagicEmail(cleanText(profile.email || ''));
      }
    } catch (err) {
      Alert.alert('Could not load profile', err instanceof Error ? err.message : 'Unknown API error');
    } finally {
      setChecking(false);
    }
  };

  const uploadAvatar = async () => {
    if (!session?.token) {
      Alert.alert('Not signed in', 'Log in first to upload a profile image.');
      return;
    }

    if (typeof me?.id !== 'number') {
      Alert.alert('Profile unavailable', 'Load your profile first before uploading an image.');
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission required', 'Allow photo library access to upload a profile image.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets?.length) {
      return;
    }

    const asset = result.assets[0];
    if (!asset?.uri) {
      Alert.alert('No image selected', 'Choose an image and try again.');
      return;
    }

    setUploadingAvatar(true);

    try {
      const formData = new FormData();
      formData.append('files', {
        uri: asset.uri,
        name: asset.fileName || 'avatar.jpg',
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);
      formData.append('ref', 'plugin::users-permissions.user');
      formData.append('refId', String(me.id));
      formData.append('field', 'avatar');

      const response = await fetch(`${apiBaseUrl}/api/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed (${response.status})`);
      }

      await checkMe();
      Alert.alert('Avatar updated', 'Your profile image was uploaded successfully.');
    } catch (err) {
      Alert.alert('Could not upload image', err instanceof Error ? err.message : 'Unknown upload error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  useEffect(() => {
    if (!session?.token || checking) return;
    void checkMe();
    // Intentionally run when session changes only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.token]);

  const saveProfile = async () => {
    if (!session?.token) {
      Alert.alert('Not signed in', 'Log in first to update your profile.');
      return;
    }

    if (typeof me?.id !== 'number') {
      Alert.alert('Profile unavailable', 'Load your profile first before saving changes.');
      return;
    }

    setSavingProfile(true);

    const payload = {
      id: me.id,
      username: cleanText(me.username || me.email || ''),
      email: cleanText(me.email || ''),
      bio: cleanText(bioInput),
      displayName: cleanText(displayNameInput),
    };

    try {
      const response = await fetch(updateProfileUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Update failed (${response.status})`);
      }

      setMe((prev) => ({
        ...(prev || {}),
        id: payload.id,
        username: payload.username,
        email: payload.email,
        bio: payload.bio,
        displayName: payload.displayName,
        updatedAt: new Date().toISOString(),
      }));

      setIsEditingProfile(false);

      Alert.alert('Profile updated', 'Your account details were saved successfully.');
    } catch (err) {
      Alert.alert('Could not save profile', err instanceof Error ? err.message : 'Unknown API error');
    } finally {
      setSavingProfile(false);
    }
  };

  const requestMagicLink = async () => {
    if (!canRequestMagic) {
      Alert.alert('Missing fields', 'Add a valid email and store ID first.');
      return;
    }

    setRequestingMagic(true);
    try {
      const response = await fetch(requestMagicUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: magicEmail.trim().toLocaleLowerCase(),
          store_id: magicStoreId.trim(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      Alert.alert(
        'Magic link requested',
        `Check your inbox for the login link. If email delivery is slow, message ${WHATSAPP_MAGIC_LABEL} on WhatsApp with "${WHATSAPP_MAGIC_TEXT}" for the faster path.`
      );
    } catch (err) {
      Alert.alert('Could not request link', err instanceof Error ? err.message : 'Unknown API error');
    } finally {
      setRequestingMagic(false);
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
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 132 }]}
        showsVerticalScrollIndicator={false}>
        <ThemedText type="title" style={styles.title}>
          Account
        </ThemedText>
        <ThemedText style={styles.subtitle}>
          Manage your login and profile details from one place. WhatsApp is the fastest way to get back into your account.
        </ThemedText>

        <View style={styles.heroCard}>
          <View style={styles.heroBlob1} />
          <View style={styles.heroBlob2} />
          <View style={styles.heroTop}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" transition={180} />
            ) : (
              <View style={styles.avatarCircle}>
                <ThemedText style={styles.avatarText}>{getInitials(identityLabel)}</ThemedText>
              </View>
            )}
            <View style={styles.heroTextWrap}>
              <ThemedText type="defaultSemiBold" style={styles.heroName}>
                {identityLabel}
              </ThemedText>
              <ThemedText style={styles.heroMeta}>
                {session?.token ? 'Signed in' : 'Signed out'} · {me?.role?.name || 'Customer'}
              </ThemedText>
            </View>
            <Pressable style={styles.settingsPill} onPress={openSettingsWeb}>
              <ThemedText style={styles.settingsPillText}>Settings</ThemedText>
            </Pressable>
          </View>

          {session?.token ? (
            <View style={styles.heroActionWrap}>
              <Button label="Open Dashboard" variant="secondary" onPress={openDashboard} />
              <Button label="Account Settings" variant="ghost" onPress={openSettingsWeb} />
              <Button label="Log Out" variant="ghost" onPress={confirmLogout} />
            </View>
          ) : (
              <View style={styles.heroActionWrap}>
                <Button label="Continue With WhatsApp" onPress={openWhatsAppMagic} />
                <Button
                  label={showEmailMagicForm ? 'Hide Email Login' : 'Use Email Magic Link'}
                  variant="secondary"
                  onPress={() => setShowEmailMagicForm((prev) => !prev)}
                />
                <ThemedText style={styles.heroHint}>
                  Send &quot;magic&quot; to {WHATSAPP_MAGIC_LABEL}. It usually resolves faster than email on mobile.
                </ThemedText>
              </View>
          )}
        </View>

        {session?.token ? (
          <View style={styles.card}>
            <View style={styles.cardHeaderRow}>
              <ThemedText type="defaultSemiBold">Profile</ThemedText>
              <Pressable style={styles.editPill} onPress={() => setIsEditingProfile((prev) => !prev)}>
                <ThemedText style={styles.editPillText}>{isEditingProfile ? 'Cancel' : 'Edit'}</ThemedText>
              </Pressable>
            </View>

            {isEditingProfile ? (
              <>
                <Button
                  label={uploadingAvatar ? 'Uploading Image...' : 'Upload Profile Image'}
                  variant="secondary"
                  onPress={uploadAvatar}
                  disabled={uploadingAvatar}
                />
                <Input
                  value={displayNameInput}
                  onChangeText={setDisplayNameInput}
                  placeholder="Display name"
                  autoCapitalize="words"
                  autoCorrect={false}
                />
                <Input
                  value={bioInput}
                  onChangeText={setBioInput}
                  placeholder="Bio"
                  autoCapitalize="sentences"
                  autoCorrect={true}
                />
                <Button
                  label={savingProfile ? 'Saving...' : 'Save Profile'}
                  onPress={saveProfile}
                  disabled={!profileDirty || savingProfile}
                />
              </>
            ) : (
              <View style={styles.profileSummaryWrap}>
                <View style={styles.summaryChip}>
                  <ThemedText style={styles.summaryChipLabel}>Email</ThemedText>
                  <ThemedText style={styles.summaryChipValue}>{prettyEmail || 'not available'}</ThemedText>
                </View>
                <View style={styles.summaryChip}>
                  <ThemedText style={styles.summaryChipLabel}>Display name</ThemedText>
                  <ThemedText style={styles.summaryChipValue}>{cleanText(displayNameInput || me?.displayName || '') || 'Add your name'}</ThemedText>
                </View>
                <View style={styles.summaryChip}>
                  <ThemedText style={styles.summaryChipLabel}>Bio</ThemedText>
                  <ThemedText style={styles.summaryChipValue}>{cleanText(bioInput || me?.bio || '') || 'Say a little bit about yourself'}</ThemedText>
                </View>
              </View>
            )}
          </View>
        ) : null}

        {!session?.token && showEmailMagicForm ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Email Magic Link</ThemedText>
            <ThemedText style={styles.infoLine}>{storeIdStatus}</ThemedText>
            <Input
              value={magicEmail}
              onChangeText={setMagicEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Button
              label={requestingMagic ? 'Requesting...' : 'Request Magic Link'}
              onPress={requestMagicLink}
              disabled={!canRequestMagic || requestingMagic}
            />
          </View>
        ) : null}
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
  heroCard: {
    marginTop: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.35)',
    backgroundColor: 'rgba(239,246,255,0.9)',
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  heroBlob1: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    top: -50,
    right: -30,
    backgroundColor: 'rgba(8,145,178,0.08)',
  },
  heroBlob2: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 999,
    bottom: -24,
    left: -12,
    backgroundColor: 'rgba(217,70,239,0.08)',
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,145,178,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.32)',
  },
  avatarImage: {
    width: 48,
    height: 48,
    borderRadius: 999,
    backgroundColor: 'rgba(8,145,178,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.2)',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0E7490',
    letterSpacing: 0.4,
  },
  heroTextWrap: {
    flex: 1,
    gap: 2,
  },
  settingsPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.35)',
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  settingsPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.25,
    color: '#0E7490',
  },
  heroName: {
    fontSize: 18,
    lineHeight: 22,
  },
  heroMeta: {
    fontSize: 12,
    opacity: 0.7,
  },
  heroActionWrap: {
    gap: 8,
  },
  heroHint: {
    fontSize: 13,
    lineHeight: 19,
    opacity: 0.82,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  card: {
    marginTop: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.4)',
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 10,
  },
  infoLine: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.85,
  },
  editPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(8,145,178,0.3)',
    backgroundColor: 'rgba(239,246,255,0.95)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  editPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.25,
  },
  profileSummaryWrap: {
    gap: 10,
  },
  summaryChip: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.22)',
    backgroundColor: 'rgba(255,255,255,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  summaryChipLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
    opacity: 0.55,
    textTransform: 'uppercase',
  },
  summaryChipValue: {
    fontSize: 14,
    lineHeight: 20,
  },
  loader: {
    marginVertical: 4,
  },
});
