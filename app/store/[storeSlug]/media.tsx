import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiGet } from '@/lib/api';

type MediaSlot = 'cover' | 'seoSocial' | 'logo' | 'slides';

type LocalMedia = {
  key: string;
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
  mime?: string;
  fileSizeBytes?: number;
  altText?: string;
  sourceLabel?: string;
};

type ComposerDraftPayload = {
  key: string;
  uri: string;
  width?: number;
  height?: number;
  fileName?: string;
  mime?: string;
  altText?: string;
  sourceLabel?: string;
};

type StockImage = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  altText: string;
  author: string;
};

type StoreMedia = {
  id?: number | string;
  documentId?: string;
  name?: string;
  alternativeText?: string;
  caption?: string;
  width?: number;
  height?: number;
  ext?: string;
  mime?: string;
  size?: number;
  createdAt?: string;
  updatedAt?: string;
  url?: string;
  formats?: {
    thumbnail?: { url?: string };
    small?: { url?: string };
    medium?: { url?: string };
  };
};

type StoreItem = {
  id?: number;
  title?: string;
  slug?: string;
  active?: boolean;
  Logo?: StoreMedia | StoreMedia[] | null;
  Cover?: StoreMedia | StoreMedia[] | null;
  Slides?: StoreMedia | StoreMedia[] | null;
  SEO?: {
    socialImage?: StoreMedia | StoreMedia[] | null;
  } | null;
};

type HealthTone = 'empty' | 'warn' | 'good' | 'great';

function getSlotHealth(slot: MediaSlot, count: number): { label: string; hint: string; tone: HealthTone } {
  if (slot === 'slides') {
    if (count <= 0) return { label: 'Slides Empty', hint: 'Add at least 2 for stronger storytelling', tone: 'empty' };
    if (count === 1) return { label: 'Slides Half', hint: '1 of 2+ suggested', tone: 'warn' };
    return { label: 'Slides Strong', hint: `${count} images ready`, tone: 'great' };
  }

  if (count <= 0) return { label: 'Empty', hint: 'Missing primary image', tone: 'empty' };
  if (count === 1) return { label: 'Complete', hint: 'Primary image set', tone: 'good' };
  return { label: 'Strong', hint: `${count} options available`, tone: 'great' };
}

type StoreListResponse = {
  data?: StoreItem[];
  meta?: {
    pagination?: {
      page?: number;
      pageCount?: number;
    };
  };
};

type MeResponse = {
  id?: number;
  username?: string;
  email?: string;
  displayName?: string | null;
};

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function toMediaArray(value: StoreMedia | StoreMedia[] | null | undefined): StoreMedia[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return [value];
}

function toAbsoluteAssetUrl(value: string, fallbackBaseUrl?: string): string {
  const clean = cleanText(value);
  if (!clean) return '';
  if (/^https?:\/\//i.test(clean)) return clean;

  const base = cleanText(fallbackBaseUrl || 'https://api.markket.place').replace(/\/$/, '');
  return `${base}${clean.startsWith('/') ? '' : '/'}${clean}`;
}

function pickMediaUrl(media: StoreMedia, fallbackBaseUrl?: string): string {
  const raw = cleanText(
    media.formats?.medium?.url || media.formats?.small?.url || media.formats?.thumbnail?.url || media.url || ''
  );
  return toAbsoluteAssetUrl(raw, fallbackBaseUrl);
}

function getMediaKey(media: StoreMedia, index: number): string {
  const id = media.documentId || media.id;
  return id != null ? String(id) : `media-${index}`;
}

function makeLocalMedia(asset: ImagePicker.ImagePickerAsset): LocalMedia {
  return {
    key: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    fileName: asset.fileName || undefined,
    mime: asset.mimeType || undefined,
    fileSizeBytes: typeof asset.fileSize === 'number' ? asset.fileSize : undefined,
    sourceLabel: 'camera-roll',
  };
}

function formatBytesFromKb(sizeKb?: number): string {
  if (typeof sizeKb !== 'number' || !Number.isFinite(sizeKb) || sizeKb <= 0) return 'n/a';
  const bytes = sizeKb * 1024;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(value?: string): string {
  const clean = cleanText(value);
  if (!clean) return 'n/a';
  const date = new Date(clean);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString();
}

function parseMediaSlot(value: string): MediaSlot | null {
  if (value === 'cover' || value === 'seoSocial' || value === 'logo' || value === 'slides') {
    return value;
  }
  return null;
}

function mapStockResults(payload: unknown): StockImage[] {
  const root = payload as Record<string, unknown>;
  const candidates = [
    root,
    (root?.data as Record<string, unknown>) || null,
  ].filter(Boolean) as Record<string, unknown>[];

  let items: unknown[] = [];
  for (const candidate of candidates) {
    if (Array.isArray(candidate.results)) {
      items = candidate.results;
      break;
    }
    if (Array.isArray(candidate.photos)) {
      items = candidate.photos;
      break;
    }
    if (Array.isArray(candidate.data)) {
      items = candidate.data;
      break;
    }
  }

  return items
    .map((item, index) => {
      const source = item as Record<string, unknown>;
      const urls = (source.urls as Record<string, unknown>) || {};
      const thumb = cleanText(urls.thumb || urls.small || source.thumb || source.small || source.url || '');
      const full = cleanText(urls.regular || urls.full || source.full || source.regular || source.url || thumb || '');
      if (!thumb && !full) return null;

      const user = (source.user as Record<string, unknown>) || {};
      return {
        id: cleanText(source.id || '') || `stock-${index}`,
        thumbUrl: thumb || full,
        fullUrl: full || thumb,
        altText: cleanText(source.alt_description || source.description || source.alt || ''),
        author: cleanText(user.name || source.author || source.photographer || ''),
      } as StockImage;
    })
    .filter((item): item is StockImage => Boolean(item));
}

export default function StoreMediaStudioScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { storeSlug, draftKey, draftSlot } = useLocalSearchParams<{
    storeSlug?: string | string[];
    draftKey?: string | string[];
    draftSlot?: string | string[];
  }>();
  const { apiBaseUrl, displayBaseUrl } = useAppConfig();
  const { ready, session, saveToken } = useAuthSession();

  const resolvedStoreSlug = normalizeParam(storeSlug).trim();
  const resolvedDraftKey = normalizeParam(draftKey).trim();
  const resolvedDraftSlot = parseMediaSlot(normalizeParam(draftSlot).trim());

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [store, setStore] = useState<StoreItem | null>(null);
  const [activeSlot, setActiveSlot] = useState<MediaSlot>('cover');
  const [activeIndex, setActiveIndex] = useState(0);
  const [fullPreviewVisible, setFullPreviewVisible] = useState(false);
  const [draftMedia, setDraftMedia] = useState<LocalMedia | null>(null);
  const [stockQuery, setStockQuery] = useState('');
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState('');
  const [stockResults, setStockResults] = useState<StockImage[]>([]);
  const [localSlotMedia, setLocalSlotMedia] = useState<Record<MediaSlot, LocalMedia[]>>({
    cover: [],
    seoSocial: [],
    logo: [],
    slides: [],
  });

  const resolveUserId = useCallback(async (): Promise<string> => {
    const existing =
      typeof session?.userId === 'number'
        ? String(session.userId)
        : typeof session?.userId === 'string'
          ? session.userId.trim()
          : '';

    if (existing) return existing;
    if (!session?.token) return '';

    const meResult = await apiGet<MeResponse>('/api/users/me', {
      baseUrl: apiBaseUrl,
      token: session.token,
    });

    if (meResult.ok && typeof meResult.data?.id === 'number') {
      await saveToken(session.token, session.source || 'media-studio', {
        userId: meResult.data.id,
        username: cleanText(meResult.data.username),
        email: cleanText(meResult.data.email),
        displayName: cleanText(meResult.data.displayName),
      });
      return String(meResult.data.id);
    }

    return '';
  }, [apiBaseUrl, saveToken, session?.source, session?.token, session?.userId]);

  const loadStoreMedia = useCallback(async () => {
    if (!session?.token || !resolvedStoreSlug) return;

    setLoading(true);
    setLoadError('');
    try {
      const userId = await resolveUserId();
      if (!userId) {
        setStore(null);
        setLoadError('Could not validate your account for media studio.');
        return;
      }

      const headers = {
        Authorization: `Bearer ${session.token}`,
        'markket-user-id': String(userId),
        'Content-Type': 'application/json',
      };

      const storeProxyBase = `${displayBaseUrl}api/markket/store`;
      const allStores: StoreItem[] = [];
      const pageSize = 50;
      let page = 1;
      let keepPaging = true;

      while (keepPaging) {
        const response = await fetch(
          `${storeProxyBase}?pagination[page]=${page}&pagination[pageSize]=${pageSize}`,
          { headers }
        );

        if (!response.ok) {
          setStore(null);
          setLoadError(`Could not load store media (${response.status}).`);
          return;
        }

        const payload = (await response.json()) as StoreListResponse | StoreItem[];
        const pageStores = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : [];

        allStores.push(...pageStores);

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

      const selected = allStores.find((item) => cleanText(item.slug) === resolvedStoreSlug) || null;
      setStore(selected);
      if (!selected) {
        setLoadError('Store not found in your account list.');
      }
    } catch {
      setStore(null);
      setLoadError('Network error loading media studio.');
    } finally {
      setLoading(false);
    }
  }, [displayBaseUrl, resolveUserId, resolvedStoreSlug, session?.token]);

  useEffect(() => {
    if (!ready || !session?.token || !resolvedStoreSlug) return;
    void loadStoreMedia();
  }, [loadStoreMedia, ready, resolvedStoreSlug, session?.token]);

  const coverItems = useMemo(() => toMediaArray(store?.Cover), [store?.Cover]);
  const socialItems = useMemo(() => toMediaArray(store?.SEO?.socialImage), [store?.SEO?.socialImage]);
  const logoItems = useMemo(() => toMediaArray(store?.Logo), [store?.Logo]);
  const slidesItems = useMemo(() => toMediaArray(store?.Slides), [store?.Slides]);

  const remoteSlotMedia = useMemo(
    () => ({
      cover: coverItems.map((media, index) => ({
        key: getMediaKey(media, index),
        uri: pickMediaUrl(media, apiBaseUrl),
        alt: cleanText(media.alternativeText),
        fileName: cleanText(media.name),
        caption: cleanText(media.caption),
        mime: cleanText(media.mime || media.ext),
        width: media.width,
        height: media.height,
        sizeKb: media.size,
        createdAt: cleanText(media.createdAt),
        updatedAt: cleanText(media.updatedAt),
      })),
      seoSocial: socialItems.map((media, index) => ({
        key: getMediaKey(media, index),
        uri: pickMediaUrl(media, apiBaseUrl),
        alt: cleanText(media.alternativeText),
        fileName: cleanText(media.name),
        caption: cleanText(media.caption),
        mime: cleanText(media.mime || media.ext),
        width: media.width,
        height: media.height,
        sizeKb: media.size,
        createdAt: cleanText(media.createdAt),
        updatedAt: cleanText(media.updatedAt),
      })),
      logo: logoItems.map((media, index) => ({
        key: getMediaKey(media, index),
        uri: pickMediaUrl(media, apiBaseUrl),
        alt: cleanText(media.alternativeText),
        fileName: cleanText(media.name),
        caption: cleanText(media.caption),
        mime: cleanText(media.mime || media.ext),
        width: media.width,
        height: media.height,
        sizeKb: media.size,
        createdAt: cleanText(media.createdAt),
        updatedAt: cleanText(media.updatedAt),
      })),
      slides: slidesItems.map((media, index) => ({
        key: getMediaKey(media, index),
        uri: pickMediaUrl(media, apiBaseUrl),
        alt: cleanText(media.alternativeText),
        fileName: cleanText(media.name),
        caption: cleanText(media.caption),
        mime: cleanText(media.mime || media.ext),
        width: media.width,
        height: media.height,
        sizeKb: media.size,
        createdAt: cleanText(media.createdAt),
        updatedAt: cleanText(media.updatedAt),
      })),
    }),
    [apiBaseUrl, coverItems, logoItems, slidesItems, socialItems]
  );

  const activeItems = useMemo(() => {
    const local = localSlotMedia[activeSlot];
    if (local.length) {
      return local.map((item) => ({
        key: item.key,
        uri: item.uri,
        alt: cleanText(item.altText),
        fileName: cleanText(item.fileName),
        caption: '',
        mime: cleanText(item.mime),
        width: item.width,
        height: item.height,
        sizeKb: typeof item.fileSizeBytes === 'number' ? item.fileSizeBytes / 1024 : undefined,
        createdAt: '',
        updatedAt: '',
        isLocal: true,
        sourceLabel: cleanText(item.sourceLabel),
      }));
    }

    return remoteSlotMedia[activeSlot].map((item) => ({ ...item, isLocal: false }));
  }, [activeSlot, localSlotMedia, remoteSlotMedia]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeSlot, coverItems.length, logoItems.length, slidesItems.length, socialItems.length]);

  const selectedMedia = activeItems[activeIndex];
  const selectedMediaUrl = cleanText(selectedMedia?.uri);
  const selectedAlt = cleanText(selectedMedia?.alt) || 'n/a';
  const selectedFilename = cleanText(selectedMedia?.fileName) || 'n/a';
  const selectedCaption = cleanText(selectedMedia?.caption) || 'n/a';
  const selectedMime = cleanText(selectedMedia?.mime) || 'n/a';
  const selectedDimensions =
    typeof selectedMedia?.width === 'number' && typeof selectedMedia?.height === 'number'
      ? `${selectedMedia.width} x ${selectedMedia.height}`
      : 'n/a';
  const selectedFileSize = formatBytesFromKb(selectedMedia?.sizeKb);
  const hasUnsavedChanges = useMemo(() => {
    if (draftMedia) return true;
    return Object.values(localSlotMedia).some((items) => items.length > 0);
  }, [draftMedia, localSlotMedia]);

  const slotSummary = useMemo(
    () => ({
      cover: activeSlot === 'cover' ? activeItems.length : localSlotMedia.cover.length || remoteSlotMedia.cover.length,
      seoSocial: activeSlot === 'seoSocial' ? activeItems.length : localSlotMedia.seoSocial.length || remoteSlotMedia.seoSocial.length,
      logo: activeSlot === 'logo' ? activeItems.length : localSlotMedia.logo.length || remoteSlotMedia.logo.length,
      slides: activeSlot === 'slides' ? activeItems.length : localSlotMedia.slides.length || remoteSlotMedia.slides.length,
    }),
    [
      activeItems.length,
      activeSlot,
      localSlotMedia.cover.length,
      localSlotMedia.logo.length,
      localSlotMedia.seoSocial.length,
      localSlotMedia.slides.length,
      remoteSlotMedia.cover.length,
      remoteSlotMedia.logo.length,
      remoteSlotMedia.seoSocial.length,
      remoteSlotMedia.slides.length,
    ]
  );

  const slotCards = useMemo(
    () => [
      { slot: 'cover' as const, label: 'Cover', count: slotSummary.cover, health: getSlotHealth('cover', slotSummary.cover) },
      {
        slot: 'seoSocial' as const,
        label: 'SEO.socialImage',
        count: slotSummary.seoSocial,
        health: getSlotHealth('seoSocial', slotSummary.seoSocial),
      },
      { slot: 'logo' as const, label: 'Logo', count: slotSummary.logo, health: getSlotHealth('logo', slotSummary.logo) },
      { slot: 'slides' as const, label: 'Slides', count: slotSummary.slides, health: getSlotHealth('slides', slotSummary.slides) },
    ],
    [slotSummary.cover, slotSummary.logo, slotSummary.seoSocial, slotSummary.slides]
  );

  const slotAspect = useMemo((): [number, number] => {
    if (activeSlot === 'cover') return [16, 9];
    if (activeSlot === 'seoSocial') return [1200, 630];
    if (activeSlot === 'logo') return [1, 1];
    return [4, 5];
  }, [activeSlot]);

  const confirmDiscardChanges = useCallback((onConfirm: () => void) => {
    if (!hasUnsavedChanges) {
      onConfirm();
      return;
    }

    Alert.alert('Discard unsaved changes?', 'You have local media changes that are not uploaded yet.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: onConfirm,
      },
    ]);
  }, [hasUnsavedChanges]);

  usePreventRemove(hasUnsavedChanges, (event) => {
    Alert.alert('Discard unsaved changes?', 'You have local media changes that are not uploaded yet.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(event.data.action),
      },
    ]);
  });

  const applyDraftToSlot = useCallback(() => {
    if (!draftMedia) return;

    setLocalSlotMedia((prev) => {
      const current = prev[activeSlot];
      if (!current.length) {
        return { ...prev, [activeSlot]: [draftMedia] };
      }

      const next = [...current];
      const target = Math.min(activeIndex, Math.max(current.length - 1, 0));
      next[target] = draftMedia;
      return { ...prev, [activeSlot]: next };
    });
    setActiveIndex(0);
    setDraftMedia(null);
  }, [activeIndex, activeSlot, draftMedia]);

  const pickFromLibrary = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: slotAspect,
      quality: 0.85,
      selectionLimit: 1,
    });

    if (result.canceled || !result.assets.length) return;

    const localMedia = makeLocalMedia(result.assets[0]);
    setDraftMedia(localMedia);
  }, [slotAspect]);

  const pickFromCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission required', 'Enable camera access to capture images from the app.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: slotAspect,
      quality: 0.85,
    });

    if (result.canceled || !result.assets.length) return;

    const localMedia = { ...makeLocalMedia(result.assets[0]), sourceLabel: 'camera' };
    setDraftMedia(localMedia);
  }, [slotAspect]);

  const clearLocalReplacement = useCallback(() => {
    setLocalSlotMedia((prev) => ({ ...prev, [activeSlot]: [] }));
    setDraftMedia(null);
    setActiveIndex(0);
  }, [activeSlot]);

  const searchStockImages = useCallback(async () => {
    setStockLoading(true);
    setStockError('');
    try {
      const query = stockQuery.trim();
      const endpoint = query
        ? `/api/markket/img?action=unsplash&query=${encodeURIComponent(query)}`
        : '/api/markket/img?action=unsplash';
      const response = await fetch(`${displayBaseUrl}${endpoint.replace(/^\//, '')}`);

      if (!response.ok) {
        setStockResults([]);
        setStockError(`Could not load stock images (${response.status}).`);
        return;
      }

      const payload = (await response.json()) as unknown;
      const mapped = mapStockResults(payload);
      setStockResults(mapped);
      if (!mapped.length) {
        setStockError('No stock images found for this search.');
      }
    } catch {
      setStockResults([]);
      setStockError('Network error loading stock images.');
    } finally {
      setStockLoading(false);
    }
  }, [displayBaseUrl, stockQuery]);

  const selectStockImage = useCallback(
    (image: StockImage) => {
      const localMedia: LocalMedia = {
        key: `stock-${image.id}-${Date.now()}`,
        uri: image.fullUrl,
        fileName: image.id,
        mime: 'image/jpeg',
        altText: image.altText,
        sourceLabel: image.author ? `unsplash:${image.author}` : 'unsplash',
      };

      setDraftMedia(localMedia);
    },
    []
  );

  const openStoreEditor = useCallback(() => {
    if (!resolvedStoreSlug) {
      Alert.alert('Store missing', 'This store does not have a slug.');
      return;
    }

    const storeEditorUrl = `${displayBaseUrl}tienda/${resolvedStoreSlug}/store?display=embed`;
    confirmDiscardChanges(() => {
      router.push({ pathname: '/web', params: { url: storeEditorUrl, captureAuth: '0' } } as never);
    });
  }, [confirmDiscardChanges, displayBaseUrl, resolvedStoreSlug, router]);

  const openComposer = useCallback(
    (mode: 'from-scratch' | 'from-photo' | 'edit-existing') => {
      const params: Record<string, string> = {
        storeSlug: resolvedStoreSlug,
        slot: activeSlot,
        mode,
      };

      if (mode !== 'from-scratch' && selectedMediaUrl) {
        params.sourceUri = selectedMediaUrl;
      }

      router.push({
        pathname: '/store/[storeSlug]/composer',
        params,
      } as never);
    },
    [activeSlot, resolvedStoreSlug, router, selectedMediaUrl]
  );

  const copyCurrentImageLink = useCallback(async () => {
    if (!selectedMediaUrl) {
      Alert.alert('No image selected', 'Choose an image first.');
      return;
    }

    await Clipboard.setStringAsync(selectedMediaUrl);
    Alert.alert('Copied', 'Image link copied.');
  }, [selectedMediaUrl]);

  const shareCurrentImage = useCallback(async () => {
    if (!selectedMediaUrl) {
      Alert.alert('No image selected', 'Choose an image first.');
      return;
    }

    try {
      await Share.share({
        message: selectedMediaUrl,
        url: selectedMediaUrl,
      });
    } catch {
      Alert.alert('Share unavailable', 'Could not open the share sheet right now.');
    }
  }, [selectedMediaUrl]);

  const saveCurrentImageToCameraRoll = useCallback(async () => {
    if (!selectedMediaUrl) {
      Alert.alert('No image selected', 'Choose an image first.');
      return;
    }

    if (selectedMediaUrl.startsWith('data:image/svg+xml')) {
      Alert.alert(
        'Save not available for this draft yet',
        'This draft can still be shared or copied right now. Direct save will be enabled with the next export update.'
      );
      return;
    }

    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Photos permission required', 'Allow photo access so Markket can save images to your camera roll.');
        return;
      }

      let localUri = selectedMediaUrl;
      let tempUri = '';

      if (/^https?:\/\//i.test(selectedMediaUrl)) {
        const extensionMatch = selectedMediaUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
        const ext = extensionMatch?.[1]?.toLowerCase() || 'jpg';
        const targetFile = new FileSystem.File(FileSystem.Paths.cache, `markket-media-${Date.now()}.${ext}`);
        const download = await FileSystem.File.downloadFileAsync(selectedMediaUrl, targetFile, { idempotent: true });
        localUri = download.uri;
        tempUri = download.uri;
      }

      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Image saved to your camera roll.');

      if (tempUri) {
        const tempFile = new FileSystem.File(tempUri);
        tempFile.delete();
      }
    } catch {
      Alert.alert('Save failed', 'Could not save this image right now.');
    }
  }, [selectedMediaUrl]);

  useEffect(() => {
    let cancelled = false;

    async function consumeComposerDraft() {
      if (!resolvedDraftKey) return;

      try {
        const raw = await AsyncStorage.getItem(resolvedDraftKey);
        if (!raw || cancelled) return;

        const parsed = JSON.parse(raw) as ComposerDraftPayload;
        if (!parsed?.uri || !parsed?.key) return;

        if (resolvedDraftSlot) {
          setActiveSlot(resolvedDraftSlot);
        }

        setDraftMedia({
          key: parsed.key,
          uri: parsed.uri,
          width: parsed.width,
          height: parsed.height,
          fileName: parsed.fileName,
          mime: parsed.mime,
          altText: parsed.altText,
          sourceLabel: parsed.sourceLabel || 'composer',
        });

        await AsyncStorage.removeItem(resolvedDraftKey);

        if (!cancelled) {
          router.replace({
            pathname: '/store/[storeSlug]/media',
            params: { storeSlug: resolvedStoreSlug },
          } as never);
        }
      } catch {
        // Ignore malformed drafts and keep current state.
      }
    }

    void consumeComposerDraft();

    return () => {
      cancelled = true;
    };
  }, [resolvedDraftKey, resolvedDraftSlot, resolvedStoreSlug, router]);

  if (!ready) {
    return (
      <ThemedView style={styles.centerState}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  if (!session?.token) {
    return (
      <ThemedView style={styles.centerState}>
        <ThemedText type="defaultSemiBold">Sign in required</ThemedText>
        <ThemedText style={styles.centerHint}>Open your account to continue.</ThemedText>
        <Button label="Go to Account" onPress={() => router.replace('/profile' as never)} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headingWrap}>
            <View style={styles.headerTitleRow}>
              <ThemedText type="title" style={styles.title}>Media Studio</ThemedText>
            </View>
            <ThemedText style={styles.storeTag}>{resolvedStoreSlug || 'Store'}</ThemedText>
          </View>
        </View>

        <ThemedText style={styles.subtitle}>Manage your store visuals in one place.</ThemedText>
        <ThemedText style={styles.subtitleAccent}>Preview, edit, save, and share in a few taps.</ThemedText>

        <View style={styles.healthRow}>
          {slotCards.map((card) => {
            const toneStyle =
              card.health.tone === 'empty'
                ? styles.healthCardMagenta
                : card.health.tone === 'warn'
                  ? styles.healthCardYellow
                  : styles.healthCardBlue;
            const selected = activeSlot === card.slot;

            return (
              <Pressable
                key={card.slot}
                style={({ pressed }) => [
                  styles.healthCard,
                  toneStyle,
                  selected && styles.healthCardSelected,
                  pressed && styles.healthCardPressed,
                ]}
                onPress={() => setActiveSlot(card.slot)}>
                <ThemedText style={styles.healthCardTitle}>
                  {card.label} · {card.health.label} ({card.count})
                </ThemedText>
                <ThemedText style={styles.healthCardHint}>{card.health.hint}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <View style={styles.centerState}>
            <ActivityIndicator size="small" />
          </View>
        ) : loadError ? (
          <View style={styles.errorCard}>
            <ThemedText style={styles.errorText}>{loadError}</ThemedText>
            <Button label="Retry" variant="secondary" onPress={() => void loadStoreMedia()} />
          </View>
        ) : selectedMediaUrl ? (
          <Pressable style={styles.previewWrap} onPress={() => setFullPreviewVisible(true)}>
            <Image source={{ uri: selectedMediaUrl }} style={styles.previewImage} contentFit="cover" transition={180} />
            <View style={styles.previewHintPill}>
              <ThemedText style={styles.previewHintText}>Tap for full screen</ThemedText>
            </View>
          </Pressable>
        ) : (
          <View style={styles.emptyCard}>
            <ThemedText style={styles.emptyText}>No image assigned for this slot yet.</ThemedText>
          </View>
        )}

        <View style={styles.actionRow}>
          <Pressable style={styles.actionPill} onPress={() => void pickFromLibrary()}>
            <ThemedText style={styles.actionPillText}>Choose Photo</ThemedText>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={() => void pickFromCamera()}>
            <ThemedText style={styles.actionPillText}>Camera</ThemedText>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={clearLocalReplacement}>
            <ThemedText style={styles.actionPillText}>Reset View</ThemedText>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={() => openComposer('from-photo')}>
            <ThemedText style={styles.actionPillText}>Compose From Image</ThemedText>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={() => openComposer('from-scratch')}>
            <ThemedText style={styles.actionPillText}>Compose From Scratch</ThemedText>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={() => void saveCurrentImageToCameraRoll()}>
            <ThemedText style={styles.actionPillText}>Save to Photos</ThemedText>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={() => void shareCurrentImage()}>
            <ThemedText style={styles.actionPillText}>Share Link</ThemedText>
          </Pressable>
          <Pressable style={styles.actionPill} onPress={() => void copyCurrentImageLink()}>
            <ThemedText style={styles.actionPillText}>Copy Link</ThemedText>
          </Pressable>
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Draft</ThemedText>
          {draftMedia ? (
            <>
              <View style={styles.previewWrap}>
                <Image source={{ uri: draftMedia.uri }} style={styles.previewImage} contentFit="cover" transition={140} />
              </View>
              <ThemedText style={styles.infoLine}>Source: {draftMedia.sourceLabel || 'local'}</ThemedText>
              {draftMedia.fileName ? <ThemedText style={styles.infoLine}>File: {draftMedia.fileName}</ThemedText> : null}
              {draftMedia.altText ? <ThemedText style={styles.infoLine}>Alt: {draftMedia.altText}</ThemedText> : null}
              <View style={styles.actionRow}>
                <Pressable style={styles.actionPill} onPress={applyDraftToSlot}>
                  <ThemedText style={styles.actionPillText}>Apply To Slot</ThemedText>
                </Pressable>
                <Pressable style={styles.actionPill} onPress={() => setDraftMedia(null)}>
                  <ThemedText style={styles.actionPillText}>Discard Draft</ThemedText>
                </Pressable>
                <Pressable style={styles.actionPill} onPress={() => openComposer('edit-existing')}>
                  <ThemedText style={styles.actionPillText}>Open Composer</ThemedText>
                </Pressable>
              </View>
            </>
          ) : (
            <ThemedText style={styles.infoLine}>Choose from camera, photo library, or stock to stage a draft.</ThemedText>
          )}
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Stock Search (Unsplash)</ThemedText>
          <Input
            value={stockQuery}
            onChangeText={setStockQuery}
            placeholder="Search public stock images"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Button label={stockLoading ? 'Searching...' : 'Search Images'} variant="secondary" onPress={() => void searchStockImages()} disabled={stockLoading} />
          {stockError ? <ThemedText style={styles.errorText}>{stockError}</ThemedText> : null}

          {stockResults.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
              {stockResults.map((item) => (
                <Pressable key={item.id} style={styles.thumbItem} onPress={() => selectStockImage(item)}>
                  <Image source={{ uri: item.thumbUrl }} style={styles.thumbImage} contentFit="cover" transition={120} />
                  <ThemedText numberOfLines={1} style={styles.stockMetaText}>
                    {item.author || 'Unsplash'}
                  </ThemedText>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>

        {activeItems.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbRow}>
            {activeItems.map((item, index) => {
              const imageUrl = cleanText(item.uri);
              const selected = index === activeIndex;
              return (
                <Pressable
                  key={getMediaKey(item, index)}
                  style={[styles.thumbItem, selected && styles.thumbItemSelected]}
                  onPress={() => setActiveIndex(index)}>
                  {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.thumbImage} contentFit="cover" transition={120} />
                  ) : (
                    <View style={styles.thumbFallback}>
                      <ThemedText style={styles.thumbFallbackText}>No Image</ThemedText>
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Image Metadata</ThemedText>
          <ThemedText style={styles.infoLine}>Alt text: {selectedAlt}</ThemedText>
          <ThemedText style={styles.infoLine}>Filename: {selectedFilename}</ThemedText>
          <ThemedText style={styles.infoLine}>Caption: {selectedCaption}</ThemedText>
          <ThemedText style={styles.infoLine}>Type: {selectedMime}</ThemedText>
          <ThemedText style={styles.infoLine}>Dimensions: {selectedDimensions}</ThemedText>
          <ThemedText style={styles.infoLine}>Size: {selectedFileSize}</ThemedText>
          <ThemedText style={styles.infoLine}>Updated: {formatDate(selectedMedia?.updatedAt)}</ThemedText>
          <ThemedText style={styles.infoLine}>Created: {formatDate(selectedMedia?.createdAt)}</ThemedText>
          {selectedMedia?.isLocal ? <ThemedText style={styles.infoLine}>Source: local preview replacement</ThemedText> : null}
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Suggested Sizes</ThemedText>
          <ThemedText style={styles.infoLine}>Cover: 1600x900, JPG/WEBP, up to 2MB.</ThemedText>
          <ThemedText style={styles.infoLine}>SEO.socialImage: 1200x630, JPG/WEBP, up to 1.5MB.</ThemedText>
          <ThemedText style={styles.infoLine}>Logo: 1024x1024 square PNG/WEBP, up to 1MB.</ThemedText>
          <ThemedText style={styles.infoLine}>Slides: 1440x1800 (4:5) or 1600x900, up to 2MB each.</ThemedText>
          <ThemedText style={styles.infoLine}>Keep central subjects inside safe margins for social crops.</ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Publishing (Coming Soon)</ThemedText>
          <ThemedText style={styles.infoLine}>Direct upload and publish will arrive in the next update.</ThemedText>
          <ThemedText style={styles.infoLine}>For now, you can save to Photos, share links, and prepare polished drafts.</ThemedText>
          <Button label="Publish Changes (Soon)" variant="secondary" disabled onPress={() => {}} />
          <Button label="Open Store Editor" variant="secondary" onPress={openStoreEditor} />
        </View>

        <Modal visible={fullPreviewVisible} animationType="fade" transparent onRequestClose={() => setFullPreviewVisible(false)}>
          <View style={styles.previewModalBackdrop}>
            <Pressable style={styles.previewModalClose} onPress={() => setFullPreviewVisible(false)}>
              <ThemedText style={styles.previewModalCloseText}>Close</ThemedText>
            </Pressable>
            {selectedMediaUrl ? (
              <Image source={{ uri: selectedMediaUrl }} style={styles.previewModalImage} contentFit="contain" transition={120} />
            ) : null}
          </View>
        </Modal>
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
    gap: 12,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  centerHint: {
    textAlign: 'center',
    opacity: 0.72,
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headingWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.42)',
    backgroundColor: 'rgba(224,242,254,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconText: {
    fontSize: 12,
    lineHeight: 13,
    color: '#0E7490',
    fontWeight: '800',
  },
  backIconButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.35)',
    backgroundColor: 'rgba(240,249,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIconText: {
    fontSize: 15,
    lineHeight: 16,
    fontWeight: '700',
    color: '#0E7490',
  },
  title: {
    fontSize: 30,
    lineHeight: 34,
  },
  storeTag: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
  },
  subtitle: {
    opacity: 0.76,
  },
  subtitleAccent: {
    marginTop: -2,
    color: '#0369A1',
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 18,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  healthCard: {
    minWidth: 132,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  healthCardSelected: {
    borderColor: 'rgba(2,132,199,0.95)',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 3,
  },
  healthCardPressed: {
    transform: [{ scale: 0.985 }],
  },
  healthCardBlue: {
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(224,242,254,0.7)',
  },
  healthCardYellow: {
    borderColor: 'rgba(202,138,4,0.32)',
    backgroundColor: 'rgba(254,249,195,0.88)',
  },
  healthCardMagenta: {
    borderColor: 'rgba(192,38,211,0.32)',
    backgroundColor: 'rgba(250,232,255,0.86)',
  },
  healthCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  healthCardHint: {
    fontSize: 11,
    lineHeight: 16,
    color: '#334155',
  },
  previewWrap: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.22)',
    backgroundColor: 'rgba(240,249,255,0.78)',
    overflow: 'hidden',
  },
  previewHintPill: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(15,23,42,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewHintText: {
    color: '#E2E8F0',
    fontSize: 11,
    fontWeight: '700',
  },
  previewImage: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: 'rgba(148,163,184,0.3)',
  },
  thumbRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  thumbItem: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.24)',
    padding: 2,
    backgroundColor: 'rgba(240,249,255,0.88)',
  },
  thumbItemSelected: {
    borderColor: 'rgba(14,116,144,0.9)',
    backgroundColor: 'rgba(186,230,253,0.8)',
  },
  thumbImage: {
    width: 78,
    height: 64,
    borderRadius: 8,
    backgroundColor: 'rgba(148,163,184,0.3)',
  },
  thumbFallback: {
    width: 78,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(226,232,240,0.95)',
  },
  thumbFallbackText: {
    fontSize: 10,
    fontWeight: '700',
    opacity: 0.7,
  },
  stockMetaText: {
    marginTop: 4,
    fontSize: 10,
    lineHeight: 14,
    opacity: 0.72,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.3)',
    backgroundColor: 'rgba(240,249,255,0.96)',
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.26)',
    backgroundColor: 'rgba(248,250,252,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 6,
  },
  infoLine: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.84,
  },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.28)',
    backgroundColor: 'rgba(248,250,252,0.9)',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyText: {
    opacity: 0.78,
  },
  errorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.28)',
    backgroundColor: 'rgba(254,242,242,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  errorText: {
    fontSize: 12,
    lineHeight: 18,
    color: '#991B1B',
  },
  previewModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 24,
  },
  previewModalClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(15,23,42,0.55)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    zIndex: 2,
  },
  previewModalCloseText: {
    color: '#E2E8F0',
    fontSize: 12,
    fontWeight: '700',
  },
  previewModalImage: {
    width: '100%',
    height: '100%',
  },
});
