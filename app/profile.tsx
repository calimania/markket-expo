import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';
import { clearLocalReceipts, getLocalReceipts, getReceiptViewerKey, type LocalReceiptSummary } from '@/lib/receipt-history';

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

type StoreItem = {
  id?: number;
  title?: string;
  slug?: string;
  active?: boolean;
  Cover?: StoreMedia | StoreMedia[] | null;
  SEO?: {
    socialImage?: StoreMedia | StoreMedia[] | null;
  } | null;
};

type StoreListResponse = {
  data?: StoreItem[];
  meta?: {
    pagination?: {
      page?: number;
      pageSize?: number;
      pageCount?: number;
      total?: number;
    };
  };
};

type StoreMedia = {
  url?: string;
  formats?: {
    thumbnail?: { url?: string };
    small?: { url?: string };
    medium?: { url?: string };
  };
};

const WHATSAPP_MAGIC_NUMBER = '15186291830';
const WHATSAPP_MAGIC_LABEL = '+1 (518) 629 1830';
const WHATSAPP_MAGIC_TEXT = 'magic';
const LOCAL_ORDER_TTL_MS = 1000 * 60 * 60 * 24 * 7;

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

function formatLocalDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function maskSessionId(value: string): string {
  const clean = cleanText(value);
  if (clean.length <= 12) return clean;
  return `${clean.slice(0, 6)}...${clean.slice(-6)}`;
}

function pickStoreMedia(value: StoreMedia | StoreMedia[] | null | undefined): StoreMedia | undefined {
  if (Array.isArray(value)) return value[0];
  return value || undefined;
}

function toAbsoluteAssetUrl(value: string, fallbackBaseUrl?: string): string {
  const clean = cleanText(value);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;

  const base = cleanText(fallbackBaseUrl || 'https://api.markket.place').replace(/\/$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

function getStorePreviewImage(store: StoreItem, fallbackBaseUrl?: string): string {
  const cover = pickStoreMedia(store.Cover);
  const social = pickStoreMedia(store.SEO?.socialImage);
  const media = cover || social;
  const rawUrl = cleanText(
    media?.formats?.thumbnail?.url ||
    media?.formats?.small?.url ||
    media?.formats?.medium?.url ||
    media?.url ||
    ''
  );
  return toAbsoluteAssetUrl(rawUrl, fallbackBaseUrl);
}

function isExpiredByCreatedAt(value: string, ttlMs: number): boolean {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > ttlMs;
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
  const [recentOrders, setRecentOrders] = useState<LocalReceiptSummary[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [loadingStores, setLoadingStores] = useState(false);
  const [authExpired, setAuthExpired] = useState(false);


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
  const localOrdersByStore = useMemo(() => {
    const grouped = new Map<string, LocalReceiptSummary[]>();
    for (const order of recentOrders) {
      const slug = cleanText(order.storeSlug);
      if (!slug) continue;
      const current = grouped.get(slug) || [];
      current.push(order);
      grouped.set(slug, current);
    }
    return grouped;
  }, [recentOrders]);
  const canCreateStore = stores.length < 2;

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

  const expireSessionToMagicLogin = useCallback(async () => {
    setAuthExpired(true);
    setShowEmailMagicForm(true);
    await clearSession();
    setMe(null);
    setDisplayNameInput('');
    setBioInput('');
    setStores([]);
  }, [clearSession]);

  const loadUserStores = useCallback(async () => {
    if (!session?.token) {
      setStores([]);
      return;
    }

    setLoadingStores(true);
    try {
      let userId =
        typeof session.userId === 'number'
          ? session.userId
          : typeof session.userId === 'string' && session.userId.trim()
            ? session.userId.trim()
            : me?.id;

      // markketplace-next /api/markket/store requires markket-user-id header.
      if (userId == null || userId === '') {
        const meResult = await apiGet<MeResponse>('/api/users/me', {
          baseUrl: apiBaseUrl,
          token: session.token,
        });

        if (meResult.ok && typeof meResult.data?.id === 'number') {
          userId = meResult.data.id;
          await saveToken(session.token, session.source || 'store-fetch', {
            userId: meResult.data.id,
            username: cleanText(meResult.data.username || ''),
            email: cleanText(meResult.data.email || ''),
            displayName: cleanText(meResult.data.displayName || ''),
          });
        }
      }

      if (userId == null || userId === '') {
        setStores([]);
        return;
      }

      const headers = {
        Authorization: `Bearer ${session.token}`,
        'markket-user-id': String(userId),
        'Content-Type': 'application/json',
      };
      // Proxy safety contract (Next.js /api/markket/store):
      // 1) Endpoint must require a valid Bearer token.
      // 2) Server must validate owner access from auth identity, not trust only client-provided IDs.
      // 3) Any future search/filter params must stay owner-scoped server-side.
      const storeProxyBase = `${displayBaseUrl}api/markket/store`;

      const allStores: StoreItem[] = [];
      const seenStoreKeys = new Set<string>();
      const pageSize = 50;
      let page = 1;
      let keepPaging = true;

      while (keepPaging) {
        const response = await fetch(
          `${storeProxyBase}?pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
          { headers }
        );

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            await expireSessionToMagicLogin();
          } else {
            setStores([]);
          }
          return;
        }

        const payload = (await response.json()) as StoreListResponse | StoreItem[];
        const pageStores = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

        pageStores.forEach((store, index) => {
          const stableKey = `${String(store.id ?? '')}:${cleanText(store.slug || '')}:${index}`;
          if (!seenStoreKeys.has(stableKey)) {
            seenStoreKeys.add(stableKey);
            allStores.push(store);
          }
        });

        if (Array.isArray(payload)) {
          keepPaging = false;
          continue;
        }

        const pageCount = payload?.meta?.pagination?.pageCount;
        if (typeof pageCount === 'number') {
          keepPaging = page < pageCount;
          page += 1;
          continue;
        }

        keepPaging = pageStores.length >= pageSize;
        page += 1;
      }

      setAuthExpired(false);
      setStores(allStores);
    } catch {
      setStores([]);
    } finally {
      setLoadingStores(false);
    }
  }, [apiBaseUrl, displayBaseUrl, expireSessionToMagicLogin, me?.id, saveToken, session?.source, session?.token, session?.userId]);

  const openStoreEditor = (storeSlug?: string) => {
    if (!storeSlug) {
      Alert.alert('Store unavailable', 'This store link is missing right now.');
      return;
    }

    const storeEditorUrl = `${displayBaseUrl}tienda/${storeSlug}/store?display=embed`;
    router.push({ pathname: '/web', params: { url: storeEditorUrl, captureAuth: '0', closeOnExit: '1' } } as never);
  };

  const openCreateStore = useCallback(() => {
    const createStoreUrl = `${displayBaseUrl}tienda/new?display=embed`;
    router.push({ pathname: '/web', params: { url: createStoreUrl, captureAuth: '0' } } as never);
  }, [displayBaseUrl, router]);

  const openStoresDirectory = () => {
    router.push('/stores' as never);
  };

  const openStoreContentList = (storeSlug?: string) => {
    if (!storeSlug) {
      Alert.alert('Store unavailable', 'This store link is missing right now.');
      return;
    }

    router.push({
      pathname: '/store/[storeSlug]/content',
      params: { storeSlug },
    } as never);
  };

  const openStoreMediaStudio = (storeSlug?: string) => {
    if (!storeSlug) {
      Alert.alert('Store unavailable', 'This store link is missing right now.');
      return;
    }

    router.push({
      pathname: '/store/[storeSlug]/media',
      params: { storeSlug },
    } as never);
  };

  const openStorePreview = (storeSlug?: string) => {
    if (!storeSlug) {
      Alert.alert('Store unavailable', 'This store link is missing right now.');
      return;
    }

    router.push({
      pathname: '/store/[slug]',
      params: { slug: storeSlug },
    } as never);
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
    setStores([]);
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

  const checkMe = useCallback(async () => {
    if (!session?.token) {
      Alert.alert('You are signed out', 'Please sign in again to load your account.');
      return;
    }

    setChecking(true);
    try {
      const result = await apiGet<MeResponse>('/api/users/me', {
        baseUrl: apiBaseUrl,
        token: session.token,
      });

      if (!result.ok) {
        if (result.error.status === 401 || result.error.status === 403) {
          await expireSessionToMagicLogin();
          return;
        }
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
  }, [apiBaseUrl, expireSessionToMagicLogin, magicEmail, saveToken, session?.source, session?.token]);

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

  useEffect(() => {
    if (!session?.token) return;
    void loadUserStores();
  }, [loadUserStores, session?.token]);

  useFocusEffect(
    useCallback(() => {
      if (!session?.token) return undefined;

      void checkMe();
      void loadUserStores();
      void (async () => {
        const viewerKey = getReceiptViewerKey({
          userId: session?.userId,
          email: session?.email,
          token: session?.token,
        });

        const orders = await getLocalReceipts(viewerKey);
        const unexpiredOrders = orders.filter((order) => !isExpiredByCreatedAt(order.createdAt, LOCAL_ORDER_TTL_MS));
        setRecentOrders(unexpiredOrders.slice(0, 8));
      })();

      return undefined;
    }, [checkMe, loadUserStores, session?.email, session?.token, session?.userId])
  );

  useEffect(() => {
    let cancelled = false;

    async function loadLocalOrders() {
      const viewerKey = getReceiptViewerKey({
        userId: session?.userId,
        email: session?.email,
        token: session?.token,
      });

      const orders = await getLocalReceipts(viewerKey);
      const unexpiredOrders = orders.filter((order) => !isExpiredByCreatedAt(order.createdAt, LOCAL_ORDER_TTL_MS));
      if (!cancelled) {
        setRecentOrders(unexpiredOrders.slice(0, 8));
      }
    }

    void loadLocalOrders();

    return () => {
      cancelled = true;
    };
  }, [session?.email, session?.token, session?.userId]);

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

    const profilePatch = {
      bio: cleanText(bioInput),
      displayName: cleanText(displayNameInput),
    };

    const normalizedApiBase = cleanText(apiBaseUrl).replace(/\/$/, '');
    const directUserUrl = `${normalizedApiBase}/api/users/${me.id}`;
    const meUserUrl = `${normalizedApiBase}/api/users/me`;

    const attempts: {
      url: string;
      method: 'PATCH' | 'PUT';
      body: Record<string, unknown>;
    }[] = [
        { url: updateProfileUrl, method: 'PATCH', body: profilePatch },
        { url: updateProfileUrl, method: 'PUT', body: profilePatch },
        { url: updateProfileUrl, method: 'PUT', body: { data: profilePatch } },
        { url: meUserUrl, method: 'PATCH', body: profilePatch },
        { url: meUserUrl, method: 'PUT', body: profilePatch },
        { url: directUserUrl, method: 'PUT', body: profilePatch },
        { url: directUserUrl, method: 'PATCH', body: profilePatch },
      ];

    try {
      let updateSucceeded = false;
      let lastStatus = 0;
      let lastBody = '';

      for (const attempt of attempts) {
        const response = await fetch(attempt.url, {
          method: attempt.method,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.token}`,
          },
          body: JSON.stringify(attempt.body),
        });

        if (response.ok) {
          updateSucceeded = true;
          break;
        }

        lastStatus = response.status;
        lastBody = (await response.text()).slice(0, 220);
        if (response.status !== 400 && response.status !== 401 && response.status !== 404 && response.status !== 405) {
          break;
        }
      }

      if (!updateSucceeded) {
        throw new Error(`Update failed (${lastStatus}) ${lastBody}`.trim());
      }

      setMe((prev) => ({
        ...(prev || {}),
        id: me.id,
        username: cleanText(me.username || me.email || ''),
        email: cleanText(me.email || ''),
        bio: profilePatch.bio,
        displayName: profilePatch.displayName,
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

  const clearRecentOrders = () => {
    Alert.alert('Clear order history on this device?', 'This only clears order history on this phone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const viewerKey = getReceiptViewerKey({
              userId: session?.userId,
              email: session?.email,
              token: session?.token,
            });
            await clearLocalReceipts(viewerKey);
            setRecentOrders([]);
          })();
        },
      },
    ]);
  };

  const openRecentOrder = (order: LocalReceiptSummary) => {
    if (isExpiredByCreatedAt(order.createdAt, LOCAL_ORDER_TTL_MS)) {
      Alert.alert('Order expired', 'This order record has expired on this device.');
      return;
    }

    if (!order.storeSlug) {
      Alert.alert('Store not found', 'This order is missing a store link.');
      return;
    }

    router.push({
      pathname: '/store/[storeSlug]/receipt',
      params: {
        storeSlug: order.storeSlug,
        session_id: order.sessionId,
      },
    } as never);
  };

  const requestMagicLink = async () => {
    if (!canRequestMagic) {
      Alert.alert('Missing details', 'Add a valid email and store first.');
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
        `Check your inbox for the login link, then tap Open in Markket when prompted. If email delivery is slow, message ${WHATSAPP_MAGIC_LABEL} on WhatsApp with "${WHATSAPP_MAGIC_TEXT}" for the faster path.`
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

        {authExpired ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Session expired</ThemedText>
            <ThemedText style={styles.infoLine}>
              Your login expired. Continue with WhatsApp or request an email magic link.
            </ThemedText>
          </View>
        ) : null}

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
                {me?.role?.name || 'Customer'}
              </ThemedText>
            </View>
          </View>

          {session?.token ? (
            <View style={styles.heroActionWrap}>
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
                <ThemedText style={styles.editPillText}>{isEditingProfile ? 'Cancel Edit' : 'Edit Profile'}</ThemedText>
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

        {session?.token ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Your Stores</ThemedText>
            <ThemedText style={styles.infoLine}>
              Your active stores.
            </ThemedText>
            {canCreateStore ? <Button label="Create New Store" variant="secondary" onPress={openCreateStore} /> : null}
            {loadingStores ? (
              <View style={[styles.profileSummaryWrap, { alignItems: 'center' }]}>
                <ActivityIndicator size="small" style={styles.loader} />
                <ThemedText style={styles.infoLine}>Loading your stores...</ThemedText>
              </View>
            ) : stores.length > 0 ? (
              <View style={styles.profileSummaryWrap}>
                {stores.slice(0, 3).map((store) => (
                  <View key={store.id} style={[styles.summaryChip, styles.storeChip]}>
                    <View style={styles.storeChipRow}>
                      {getStorePreviewImage(store, apiBaseUrl) ? (
                        <Image
                          source={{ uri: getStorePreviewImage(store, apiBaseUrl) }}
                          style={styles.storeThumbImage}
                          contentFit="cover"
                          transition={180}
                        />
                      ) : (
                        <View style={styles.storeThumbFallback}>
                          <ThemedText style={styles.storeThumbFallbackText}>
                            {getInitials(store.title || store.slug || 'Store')}
                          </ThemedText>
                        </View>
                      )}

                      <View style={styles.storeChipContent}>
                        <ThemedText style={styles.summaryChipLabel}>Store</ThemedText>
                        <ThemedText style={styles.summaryChipValue}>{store.title || store.slug || 'Unnamed Store'}</ThemedText>
                        {store.slug ? (
                          <ThemedText style={styles.infoLine}>{store.slug}</ThemedText>
                        ) : null}
                        {store.slug ? (
                          <ThemedText style={styles.storeMetaLine}>
                            Orders on this device: {localOrdersByStore.get(store.slug)?.length || 0}
                          </ThemedText>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.storeActionsRow}>
                      <Pressable
                        style={({ pressed }) => [styles.storeActionPill, pressed && styles.storeChipPressed]}
                        onPress={() => openStorePreview(store.slug)}>
                        <ThemedText style={styles.storeActionText}>Preview</ThemedText>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.storeActionPill, pressed && styles.storeChipPressed]}
                        onPress={() => openStoreEditor(store.slug)}>
                        <ThemedText style={styles.storeActionText}>Edit Store</ThemedText>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.storeActionPill, pressed && styles.storeChipPressed]}
                        onPress={() => openStoreMediaStudio(store.slug)}>
                        <ThemedText style={styles.storeActionText}>Media Studio</ThemedText>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [styles.storeActionPill, pressed && styles.storeChipPressed]}
                        onPress={() => openStoreContentList(store.slug)}>
                        <ThemedText style={styles.storeActionText}>Content</ThemedText>
                      </Pressable>
                    </View>
                  </View>
                ))}

                {stores.length > 3 ? (
                  <Button
                    label={`View ${stores.length - 3} More Stores`}
                    variant="secondary"
                    onPress={openStoresDirectory}
                  />
                ) : null}
              </View>
            ) : (
                  <ThemedText style={styles.infoLine}>No stores yet. Create one and it will show up here.</ThemedText>
            )}
            {!loadingStores && !canCreateStore ? (
              <ThemedText style={styles.infoLine}>You have reached the store limit for this account. Reach out if you need more.</ThemedText>
            ) : null}
          </View>
        ) : null}

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Purchase History</ThemedText>
          <ThemedText style={styles.infoLine}>
            Your recent purchases, saved on this device for 7 days.
          </ThemedText>

          {recentOrders.length ? (
            <View style={styles.profileSummaryWrap}>
              {recentOrders.map((order) => (
                <Pressable key={order.sessionId} style={styles.summaryChip} onPress={() => openRecentOrder(order)}>
                  <ThemedText style={styles.summaryChipLabel}>Order</ThemedText>
                  <ThemedText style={styles.summaryChipValue}>
                    {order.amountTotalCents != null ? `$${(order.amountTotalCents / 100).toFixed(2)}` : 'Amount unavailable'}
                  </ThemedText>
                  <ThemedText style={styles.infoLine}>{formatLocalDate(order.createdAt)}</ThemedText>
                  {order.storeSlug ? (
                    <ThemedText style={styles.infoLine}>From: {order.storeSlug}</ThemedText>
                  ) : null}
                  {order.customerEmail ? (
                    <ThemedText style={styles.infoLine}>Email: {order.customerEmail}</ThemedText>
                  ) : null}
                  <ThemedText style={styles.infoLine}>Order ID: {maskSessionId(order.sessionId)}</ThemedText>
                  <ThemedText style={styles.openReceiptHint}>Tap to open receipt</ThemedText>
                </Pressable>
              ))}
            </View>
          ) : (
              <ThemedText style={styles.infoLine}>No purchases yet on this device.</ThemedText>
          )}

          {recentOrders.length ? <Button label="Clear Purchase History" variant="ghost" onPress={clearRecentOrders} /> : null}
        </View>

        {session?.token ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Sales Activity</ThemedText>
            <ThemedText style={styles.infoLine}>
              Orders placed through your stores on this device.
            </ThemedText>

            {stores.length ? (
              <View style={styles.profileSummaryWrap}>
                {stores.slice(0, 3).map((store) => {
                  const slug = cleanText(store.slug);
                  const count = slug ? localOrdersByStore.get(slug)?.length || 0 : 0;

                  return (
                    <View key={`seller-history-${store.id}`} style={styles.summaryChip}>
                      <ThemedText style={styles.summaryChipLabel}>Store</ThemedText>
                      <ThemedText style={styles.summaryChipValue}>{store.title || slug || 'Unnamed Store'}</ThemedText>
                      <ThemedText style={styles.infoLine}>Orders on this device: {count}</ThemedText>
                    </View>
                  );
                })}
              </View>
            ) : (
              <ThemedText style={styles.infoLine}>No sales activity yet on this device.</ThemedText>
            )}
          </View>
        ) : null}

        {!session?.token && showEmailMagicForm ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Email Magic Link</ThemedText>
            <ThemedText style={styles.infoLine}>{storeIdStatus}</ThemedText>
            <ThemedText style={styles.magicHint}>After opening the email link, choose Open in Markket to return here.</ThemedText>
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
  magicHint: {
    fontSize: 12,
    lineHeight: 18,
    opacity: 0.72,
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
  storeChip: {
    borderColor: 'rgba(14,116,144,0.3)',
    backgroundColor: 'rgba(240,249,255,0.95)',
    shadowColor: '#0E7490',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 3,
  },
  storeChipPressed: {
    transform: [{ scale: 0.985 }],
    backgroundColor: 'rgba(224,242,254,1)',
  },
  storeChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  storeChipContent: {
    flex: 1,
    gap: 2,
  },
  storeMetaLine: {
    fontSize: 12,
    lineHeight: 17,
    color: '#0E7490',
    opacity: 0.82,
  },
  storeActionsRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  storeActionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.3)',
    backgroundColor: 'rgba(240,249,255,0.96)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  storeActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.22,
  },
  storeThumbImage: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(186,230,253,0.45)',
  },
  storeThumbFallback: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(186,230,253,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storeThumbFallbackText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0E7490',
    letterSpacing: 0.3,
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
  openReceiptHint: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 4,
    opacity: 0.65,
  },
  loader: {
    marginVertical: 4,
  },
});
