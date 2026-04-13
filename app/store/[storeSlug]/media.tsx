import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Keyboard, Modal, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { usePreventRemove } from '@react-navigation/native';
import Animated, { FadeInDown } from 'react-native-reanimated';
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
  colorSeed?: string;
  mediaId?: number | string;
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
  colorSeed?: string;
};

type StockImage = {
  id: string;
  thumbUrl: string;
  fullUrl: string;
  altText: string;
  author: string;
  color?: string;
};

type StockSource = 'unsplash' | 'getty' | 'pexels';

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
  documentId?: string;
  title?: string;
  slug?: string;
  active?: boolean;
  Logo?: StoreMedia | StoreMedia[] | null;
  Cover?: StoreMedia | StoreMedia[] | null;
  Slides?: StoreMedia | StoreMedia[] | null;
  SEO?: {
    id?: number | string;
    documentId?: string;
    socialImage?: StoreMedia | StoreMedia[] | null;
    metaDescription?: string | null;
  } | null;
  seo?: {
    id?: number | string;
    documentId?: string;
    socialImage?: StoreMedia | StoreMedia[] | null;
    metaDescription?: string | null;
  } | null;
};

type HealthTone = 'empty' | 'warn' | 'good' | 'great';

function getSlotHealth(slot: MediaSlot, count: number): { label: string; hint: string; tone: HealthTone } {
  if (slot === 'slides') {
    if (count <= 0) return { label: '', hint: 'Add at least 2 slides', tone: 'empty' };
    if (count === 1) return { label: '', hint: 'Add one more slide', tone: 'warn' };
    return { label: '', hint: `${count} slides`, tone: 'great' };
  }

  if (count <= 0) return { label: '', hint: 'No image yet', tone: 'empty' };
  if (count === 1) return { label: '', hint: 'Set', tone: 'good' };
  return { label: '', hint: `${count} images`, tone: 'great' };
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

type UploadedMediaItem = {
  id?: number | string;
  documentId?: string;
  url?: string;
};

type RelationMediaId = number | string;

type SlotPolicy = {
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  requiresSquare?: boolean;
};

type SlotTarget = {
  width: number;
  height: number;
  compress: number;
};

type UploadTarget = {
  ref: string;
  refId: string;
  field: string;
};

function cleanText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function mergeDraftIntoSlotMedia(
  slotMedia: Record<MediaSlot, LocalMedia[]>,
  draft: LocalMedia | null,
  slot: MediaSlot,
  activeIndex: number,
  mode: 'replace' | 'append' = 'replace'
): Record<MediaSlot, LocalMedia[]> {
  if (!draft) return slotMedia;

  const current = slotMedia[slot];
  if (mode === 'append') {
    return { ...slotMedia, [slot]: [...current, draft] };
  }

  if (!current.length) {
    return { ...slotMedia, [slot]: [draft] };
  }

  const next = [...current];
  const target = Math.min(activeIndex, Math.max(current.length - 1, 0));
  next[target] = draft;
  return { ...slotMedia, [slot]: next };
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

function getMediaIdentity(media: StoreMedia, index: number): string {
  const id = cleanText(media.documentId || media.id || '');
  if (id) return `id:${id}`;

  const url = cleanText(media.url || media.formats?.medium?.url || media.formats?.small?.url || media.formats?.thumbnail?.url || '');
  if (url) return `url:${url}`;

  const name = cleanText(media.name || '');
  if (name) return `name:${name}`;

  return `index:${index}`;
}

function dedupeStoreMedia(items: StoreMedia[]): StoreMedia[] {
  const seen = new Set<string>();
  const deduped: StoreMedia[] = [];

  items.forEach((media, index) => {
    const identity = getMediaIdentity(media, index);
    if (seen.has(identity)) return;
    seen.add(identity);
    deduped.push(media);
  });

  return deduped;
}

function countDuplicateStoreMedia(items: StoreMedia[]): number {
  const seen = new Set<string>();
  let duplicates = 0;

  items.forEach((media, index) => {
    const identity = getMediaIdentity(media, index);
    if (seen.has(identity)) {
      duplicates += 1;
      return;
    }
    seen.add(identity);
  });

  return duplicates;
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

function parseMediaSlot(value: string): MediaSlot | null {
  if (value === 'cover' || value === 'seoSocial' || value === 'logo' || value === 'slides') {
    return value;
  }
  return null;
}

function slotLabel(slot: MediaSlot): string {
  if (slot === 'cover') return 'Cover';
  if (slot === 'seoSocial') return 'SEO Social';
  if (slot === 'logo') return 'Logo';
  return 'Slides';
}

const SLOT_POLICIES: Record<MediaSlot, SlotPolicy> = {
  cover: { maxBytes: 2 * 1024 * 1024, minWidth: 1400, minHeight: 780 },
  seoSocial: { maxBytes: Math.round(1.5 * 1024 * 1024), minWidth: 1100, minHeight: 578 },
  logo: { maxBytes: 1 * 1024 * 1024, minWidth: 768, minHeight: 768, requiresSquare: true },
  slides: { maxBytes: 2 * 1024 * 1024, minWidth: 1200, minHeight: 900 },
};

const SLOT_TARGETS: Record<MediaSlot, SlotTarget> = {
  cover: { width: 1600, height: 900, compress: 0.82 },
  seoSocial: { width: 1200, height: 630, compress: 0.8 },
  logo: { width: 1024, height: 1024, compress: 0.88 },
  slides: { width: 1440, height: 1800, compress: 0.82 },
};

function normalizeHexColor(value: string): string {
  const clean = cleanText(value).toLowerCase();
  if (!clean) return '';
  const withHash = clean.startsWith('#') ? clean : `#${clean}`;
  if (/^#[0-9a-f]{6}$/i.test(withHash)) return withHash.toUpperCase();
  return '';
}

function preferJpegStockUrl(rawUrl: string): string {
  const clean = cleanText(rawUrl);
  if (!clean) return '';

  try {
    const parsed = new URL(clean);
    parsed.searchParams.set('fm', 'jpg');
    if (!parsed.searchParams.get('q')) parsed.searchParams.set('q', '85');
    if (!parsed.searchParams.get('fit')) parsed.searchParams.set('fit', 'max');
    if (!parsed.searchParams.get('w')) parsed.searchParams.set('w', '2000');
    return parsed.toString();
  } catch {
    return clean;
  }
}

function getUploadTargetForSlot(store: StoreItem, slot: MediaSlot): UploadTarget {
  if (slot === 'seoSocial') {
    const seoRecord = store.SEO || store.seo;
    const seoRefId =
      typeof seoRecord?.id === 'number'
        ? String(seoRecord.id)
        : typeof seoRecord?.id === 'string'
          ? seoRecord.id.trim()
          : '';

    if (!seoRefId) {
      throw new Error('Could not resolve the SEO record for social image publishing.');
    }

    return {
      ref: 'common.seo',
      refId: seoRefId,
      field: 'socialImage',
    };
  }

  if (typeof store.id !== 'number') {
    throw new Error('Could not resolve this store ID for publishing.');
  }

  if (slot === 'cover') {
    return { ref: 'api::store.store', refId: String(store.id), field: 'Cover' };
  }
  if (slot === 'logo') {
    return { ref: 'api::store.store', refId: String(store.id), field: 'Logo' };
  }
  return { ref: 'api::store.store', refId: String(store.id), field: 'Slides' };
}

function uploadFieldLabel(field: string): string {
  if (field === 'Cover') return 'Cover';
  if (field === 'Logo') return 'Logo';
  if (field === 'socialImage') return 'SEO Social';
  return 'Slides';
}

function uploadFieldVariants(field: string): string[] {
  if (field === 'Slides') return ['Slides', 'slides'];
  if (field === 'slides') return ['slides', 'Slides'];
  return [field];
}

function shouldRetryWithAlternateField(
  status: number,
  failureText: string,
  fieldCandidates: string[],
  candidateIndex: number
): boolean {
  if (fieldCandidates.length <= 1) return false;
  if (candidateIndex >= fieldCandidates.length - 1) return false;

  const reason = cleanText(failureText).toLowerCase();
  if (!reason) return false;

  if (reason.includes('path or method not allowed') || reason.includes('method not allowed') || reason.includes('route not found')) {
    return false;
  }

  const fieldMismatchHint =
    reason.includes('field') ||
    reason.includes('attribute') ||
    reason.includes('validation') ||
    reason.includes('relation') ||
    reason.includes('slides');

  if (!fieldMismatchHint) return false;
  return status === 400 || status === 422;
}

function slotFromUploadField(field: string): MediaSlot {
  if (field === 'Cover') return 'cover';
  if (field === 'Logo') return 'logo';
  if (field === 'socialImage') return 'seoSocial';
  return 'slides';
}

function getResizeActionForTarget(media: LocalMedia, target: SlotTarget) {
  if (typeof media.width !== 'number' || typeof media.height !== 'number') {
    return [] as { resize: { width: number; height: number } }[];
  }

  const widthScale = target.width / media.width;
  const heightScale = target.height / media.height;
  const scale = Math.min(1, widthScale, heightScale);

  if (scale >= 0.999) {
    return [] as { resize: { width: number; height: number } }[];
  }

  return [
    {
      resize: {
        width: Math.max(1, Math.round(media.width * scale)),
        height: Math.max(1, Math.round(media.height * scale)),
      },
    },
  ];
}

function toRelationMediaId(value: unknown): RelationMediaId | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed) && String(parsed) === trimmed) {
      return parsed;
    }
    return trimmed;
  }

  return null;
}

function slugToTitle(value: string): string {
  const clean = cleanText(value).replace(/[-_]+/g, ' ');
  if (!clean) return '';
  return clean
    .split(' ')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function remoteItemToLocalMedia(item: {
  key: string;
  uri?: string;
  width?: number;
  height?: number;
  fileName?: string;
  mime?: string;
  alt?: string;
  sourceLabel?: string;
  colorSeed?: string;
  mediaId?: number | string;
}): LocalMedia {
  return {
    key: item.key,
    uri: cleanText(item.uri),
    width: item.width,
    height: item.height,
    fileName: cleanText(item.fileName),
    mime: cleanText(item.mime),
    altText: cleanText(item.alt),
    sourceLabel: cleanText(item.sourceLabel) || 'remote',
    colorSeed: cleanText(item.colorSeed),
    mediaId: item.mediaId,
  };
}

function mapStockResults(payload: unknown): StockImage[] {
  const root = payload as Record<string, unknown>;
  const candidates = [
    root,
    (root?.data as Record<string, unknown>) || null,
  ].filter(Boolean) as Record<string, unknown>[];

  let items: unknown[] = [];

  // Check for direct URL array (web format: data.urls = [url1, url2, ...])
  for (const candidate of candidates) {
    if (Array.isArray(candidate.urls)) {
      const urls = candidate.urls as string[];
      return urls
        .filter((url): url is string => typeof url === 'string' && url.trim().length > 0)
        .map((url, index) => ({
          id: `unsplash-${index}`,
          thumbUrl: url,
          fullUrl: url,
          altText: '',
          author: 'Unsplash',
          color: '',
        } as StockImage));
    }
  }

  // Check for structured results (Unsplash native format)
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
    if (Array.isArray(candidate.items)) {
      items = candidate.items;
      break;
    }
    if (Array.isArray(candidate.objects)) {
      items = candidate.objects;
      break;
    }
  }

  return items
    .map((item, index) => {
      const source = item as Record<string, unknown>;
      const urls = (source.urls as Record<string, unknown>) || {};
      const images = (source.images as Record<string, unknown>) || {};
      const src = (source.src as Record<string, unknown>) || {};
      const displaySizes = Array.isArray(source.display_sizes)
        ? (source.display_sizes as Record<string, unknown>[])
        : [];
      const firstDisplay = (displaySizes[0] as Record<string, unknown>) || {};
      const thumb = cleanText(
        urls.thumb ||
        urls.small ||
        source.thumb ||
        source.small ||
        source.url ||
        src.small ||
        src.tiny ||
        src.medium ||
        ''
      );
      const full = cleanText(
        urls.regular ||
        urls.full ||
        source.full ||
        source.regular ||
        source.url ||
        source.image ||
        src.original ||
        src.large2x ||
        src.large ||
        src.landscape ||
        src.portrait ||
        images.full ||
        images.large ||
        images.medium ||
        firstDisplay.uri ||
        thumb ||
        ''
      );
      const finalThumb = cleanText(
        thumb ||
        images.thumbnail ||
        images.small ||
        firstDisplay.uri ||
        full ||
        ''
      );
      if (!finalThumb && !full) return null;

      const user = (source.user as Record<string, unknown>) || {};
      const artist = (source.artist as Record<string, unknown>) || {};
      const creator = (source.creator as Record<string, unknown>) || {};
      return {
        id: cleanText(source.id || '') || `stock-${index}`,
        thumbUrl: finalThumb || full,
        fullUrl: full || finalThumb,
        altText: cleanText(source.alt_description || source.description || source.alt || ''),
        author: cleanText(
          user.name ||
          artist.name ||
          creator.name ||
          source.author ||
          source.photographer ||
          source.credit ||
          'Stock'
        ),
        color: normalizeHexColor(cleanText(source.color || '')),
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
  const [stockSource, setStockSource] = useState<StockSource>('unsplash');
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState('');
  const [stockResults, setStockResults] = useState<StockImage[]>([]);
  const [publishingChanges, setPublishingChanges] = useState(false);
  const [slidesDirty, setSlidesDirty] = useState(false);
  const [fixingSlot, setFixingSlot] = useState(false);
  const [replaceUndoSnapshot, setReplaceUndoSnapshot] = useState<{
    slot: MediaSlot;
    previousSlotItems: LocalMedia[];
    previousActiveIndex: number;
    draft: LocalMedia;
  } | null>(null);
  const [showReplaceToast, setShowReplaceToast] = useState(false);
  const undoToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressPreventRemoveRef = useRef(false);
  const lastConsumedDraftKeyRef = useRef('');
  const scrollViewRef = useRef<ScrollView | null>(null);
  const previewAnchorYRef = useRef(0);
  const [localSlotMedia, setLocalSlotMedia] = useState<Record<MediaSlot, LocalMedia[]>>({
    cover: [],
    seoSocial: [],
    logo: [],
    slides: [],
  });

  const effectiveSlotMedia = useMemo(
    () => mergeDraftIntoSlotMedia(localSlotMedia, draftMedia, activeSlot, activeIndex),
    [activeIndex, activeSlot, draftMedia, localSlotMedia]
  );

  const changedSlotCount = useMemo(
    () =>
      Object.values(effectiveSlotMedia).reduce((count, items) => count + (items.length ? 1 : 0), 0) +
      (slidesDirty && effectiveSlotMedia.slides.length === 0 ? 1 : 0),
    [effectiveSlotMedia, slidesDirty]
  );

  const clearUndoToastTimer = useCallback(() => {
    if (undoToastTimerRef.current) {
      clearTimeout(undoToastTimerRef.current);
      undoToastTimerRef.current = null;
    }
  }, []);

  const scheduleUndoToastHide = useCallback(() => {
    clearUndoToastTimer();
    undoToastTimerRef.current = setTimeout(() => {
      setShowReplaceToast(false);
      setReplaceUndoSnapshot(null);
      undoToastTimerRef.current = null;
    }, 4200);
  }, [clearUndoToastTimer]);

  const scrollToPreview = useCallback((animated = true) => {
    const target = Math.max(previewAnchorYRef.current - 18, 0);
    scrollViewRef.current?.scrollTo({ y: target, animated });
  }, []);

  useEffect(() => {
    return () => {
      clearUndoToastTimer();
    };
  }, [clearUndoToastTimer]);

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
  const rawSlidesItems = useMemo(() => toMediaArray(store?.Slides), [store?.Slides]);
  const duplicateSlidesCount = useMemo(() => countDuplicateStoreMedia(rawSlidesItems), [rawSlidesItems]);
  const slidesItems = useMemo(() => dedupeStoreMedia(rawSlidesItems).slice(0, 6), [rawSlidesItems]);

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
        mediaId: media.id || media.documentId,
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
        mediaId: media.id || media.documentId,
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
        mediaId: media.id || media.documentId,
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
        mediaId: media.id || media.documentId,
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
        colorSeed: cleanText(item.colorSeed),
      }));
    }

    return remoteSlotMedia[activeSlot].map((item) => ({ ...item, isLocal: false }));
  }, [activeSlot, localSlotMedia, remoteSlotMedia]);

  useEffect(() => {
    setActiveIndex(0);
  }, [activeSlot, coverItems.length, logoItems.length, slidesItems.length, socialItems.length]);

  const selectedMedia = activeItems[activeIndex];
  const selectedMediaUrl = cleanText(selectedMedia?.uri);
  const selectedMediaIsLocal = Boolean(selectedMedia?.isLocal);
  const selectedAltRaw = cleanText(selectedMedia?.alt);
  const selectedColorSeed = cleanText((selectedMedia as { colorSeed?: string } | undefined)?.colorSeed);
  const hasDraft = Boolean(draftMedia);
  const showDraftPreview = hasDraft && cleanText(draftMedia?.sourceLabel) !== 'composer';
  const bottomDockVisible = showDraftPreview || changedSlotCount > 0;
  const storeTitleSeed = cleanText(store?.title) || slugToTitle(resolvedStoreSlug) || 'Markket Drop';
  const seoAltSeed = cleanText(remoteSlotMedia.seoSocial[0]?.alt);
  const subtitleSeed = cleanText(store?.SEO?.metaDescription || store?.seo?.metaDescription || '');
  const altSeed =
    cleanText(draftMedia?.altText) ||
    selectedAltRaw ||
    seoAltSeed ||
    `${storeTitleSeed} ${slotLabel(activeSlot)}`.trim();

  const hasUnsavedChanges = useMemo(() => {
    if (draftMedia) return true;
    if (slidesDirty) return true;
    return Object.values(localSlotMedia).some((items) => items.length > 0);
  }, [draftMedia, localSlotMedia, slidesDirty]);
  const activeSlotHasLocalPreview = localSlotMedia[activeSlot].length > 0;
  const hasLocalOnlyPreview = selectedMediaIsLocal || activeSlotHasLocalPreview;

  const selectedQuality = useMemo(() => {
    const policy = SLOT_POLICIES[activeSlot];
    let score = 100;
    const notes: string[] = [];

    if (!selectedMedia) {
      return { score: 0, label: 'No image', notes: ['Select an image to score quality.'] };
    }

    if (!selectedAltRaw) {
      score -= 12;
      notes.push('Add alt text for accessibility.');
    }

    if (typeof selectedMedia.width === 'number' && typeof selectedMedia.height === 'number') {
      if (selectedMedia.width < policy.minWidth || selectedMedia.height < policy.minHeight) {
        score -= 28;
        notes.push(`Increase dimensions to at least ${policy.minWidth}x${policy.minHeight}.`);
      }

      if (policy.requiresSquare && Math.abs(selectedMedia.width - selectedMedia.height) > Math.max(4, Math.round(selectedMedia.width * 0.04))) {
        score -= 22;
        notes.push('Use a square logo for cleaner rendering.');
      }
    }

    if (typeof selectedMedia.sizeKb === 'number' && selectedMedia.sizeKb * 1024 > policy.maxBytes) {
      score -= 20;
      notes.push('Compress image to fit slot size limits.');
    }

    const mime = cleanText(selectedMedia.mime || '').toLowerCase();
    if (mime && !mime.includes('jpeg') && !mime.includes('jpg') && !mime.includes('png') && !mime.includes('webp') && !mime.includes('svg')) {
      score -= 10;
      notes.push('Prefer JPG, PNG, WEBP, or SVG.');
    }

    const clamped = Math.max(0, Math.min(100, score));
    const label = clamped >= 85 ? 'Excellent' : clamped >= 70 ? 'Good' : clamped >= 50 ? 'Needs polish' : 'Needs fixes';
    return { score: clamped, label, notes };
  }, [activeSlot, selectedAltRaw, selectedMedia]);

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

  usePreventRemove(hasUnsavedChanges, (event) => {
    if (suppressPreventRemoveRef.current) {
      suppressPreventRemoveRef.current = false;
      navigation.dispatch(event.data.action);
      return;
    }

    Alert.alert('Leave without publishing?', 'You have changes ready to go live.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Save & Publish',
        onPress: () => {
          void (async () => {
            const saved = await publishLocalChanges();
            if (saved) {
              navigation.dispatch(event.data.action);
            }
          })();
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(event.data.action),
      },
    ]);
  });

  const applyIncomingDraftToSlot = useCallback(
    (incomingDraft: LocalMedia, slot: MediaSlot, index: number, mode: 'replace' | 'append' = 'replace') => {
      const slotBaseItems = localSlotMedia[slot].length
        ? [...localSlotMedia[slot]]
        : remoteSlotMedia[slot].map((item) => remoteItemToLocalMedia(item));

      if (slot === 'slides' && mode === 'append' && slotBaseItems.length >= 6) {
        Alert.alert('Slides full', 'Remove a slide before adding another.');
        return;
      }

      const previousSlotItems = [...slotBaseItems];
      const previousActiveIndex = index;
      const nextIndex = mode === 'append' ? previousSlotItems.length : 0;

      setActiveSlot(slot);
      setLocalSlotMedia((prev) => {
        const nextState = { ...prev, [slot]: slotBaseItems };
        return mergeDraftIntoSlotMedia(nextState, incomingDraft, slot, index, mode);
      });
      if (slot === 'slides') {
        setSlidesDirty(true);
      }
      setActiveIndex(nextIndex);
      setDraftMedia(null);
      setReplaceUndoSnapshot({
        slot,
        previousSlotItems,
        previousActiveIndex,
        draft: incomingDraft,
      });
      setShowReplaceToast(true);
      scheduleUndoToastHide();
      requestAnimationFrame(() => scrollToPreview(true));
    },
    [localSlotMedia, remoteSlotMedia, scheduleUndoToastHide, scrollToPreview]
  );

  const applyDraftToSlot = useCallback(() => {
    if (!draftMedia) return;

    applyIncomingDraftToSlot(draftMedia, activeSlot, activeIndex);
  }, [activeIndex, activeSlot, applyIncomingDraftToSlot, draftMedia]);

  const undoReplaceSlotPreview = useCallback(() => {
    if (!replaceUndoSnapshot) return;

    clearUndoToastTimer();
    setLocalSlotMedia((prev) => ({
      ...prev,
      [replaceUndoSnapshot.slot]: replaceUndoSnapshot.previousSlotItems,
    }));
    setActiveSlot(replaceUndoSnapshot.slot);
    const restoredLength = replaceUndoSnapshot.previousSlotItems.length;
    setActiveIndex(restoredLength ? Math.min(replaceUndoSnapshot.previousActiveIndex, restoredLength - 1) : 0);
    setDraftMedia(null);
    setShowReplaceToast(false);
    setReplaceUndoSnapshot(null);
  }, [clearUndoToastTimer, replaceUndoSnapshot]);

  const updateDraftAltText = useCallback((value: string) => {
    setDraftMedia((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        altText: value,
      };
    });
  }, []);

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
    applyIncomingDraftToSlot(localMedia, activeSlot, activeIndex, activeSlot === 'slides' ? 'append' : 'replace');
  }, [activeIndex, activeSlot, applyIncomingDraftToSlot, slotAspect]);

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
    applyIncomingDraftToSlot(localMedia, activeSlot, activeIndex, activeSlot === 'slides' ? 'append' : 'replace');
  }, [activeIndex, activeSlot, applyIncomingDraftToSlot, slotAspect]);

  const clearLocalReplacement = useCallback(() => {
    const clearState = () => {
      setLocalSlotMedia((prev) => ({ ...prev, [activeSlot]: [] }));
      if (activeSlot === 'slides') {
        setSlidesDirty(false);
      }
      setDraftMedia(null);
      setActiveIndex(0);
    };

    if (!draftMedia && !localSlotMedia[activeSlot].length) {
      clearState();
      return;
    }

    Alert.alert(
      'Start over?',
      'Clears your preview changes for this slot.',
      [
        { text: 'Keep Editing', style: 'cancel' },
        {
          text: 'Start Over',
          style: 'destructive',
          onPress: clearState,
        },
      ]
    );
  }, [activeSlot, draftMedia, localSlotMedia]);

  const removeSelectedSlide = useCallback(() => {
    if (activeSlot !== 'slides') return;

    const localSlides = localSlotMedia.slides.length
      ? localSlotMedia.slides
      : remoteSlotMedia.slides.map((item) => remoteItemToLocalMedia(item));

    if (!localSlides.length) {
      Alert.alert('No slides', 'There are no slides to remove.');
      return;
    }

    const target = Math.min(activeIndex, Math.max(localSlides.length - 1, 0));

    Alert.alert('Remove this slide?', 'Removed from your store when you publish.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          const next = localSlides.filter((_, index) => index !== target);
          setLocalSlotMedia((prev) => ({ ...prev, slides: next }));
          setSlidesDirty(true);
          setActiveIndex(next.length ? Math.min(target, next.length - 1) : 0);
          requestAnimationFrame(() => scrollToPreview(true));
        },
      },
    ]);
  }, [activeIndex, activeSlot, localSlotMedia.slides, remoteSlotMedia.slides, scrollToPreview]);

  const moveSelectedSlide = useCallback(
    (direction: 'left' | 'right') => {
      if (activeSlot !== 'slides') return;

      const localSlides = localSlotMedia.slides.length
        ? localSlotMedia.slides
        : remoteSlotMedia.slides.map((item) => remoteItemToLocalMedia(item));

      if (localSlides.length < 2) {
        return;
      }

      const currentIndex = Math.min(activeIndex, localSlides.length - 1);
      const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= localSlides.length) {
        return;
      }

      const next = [...localSlides];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved);
      setLocalSlotMedia((prev) => ({ ...prev, slides: next }));
      setSlidesDirty(true);
      setActiveIndex(targetIndex);
      requestAnimationFrame(() => scrollToPreview(true));
    },
    [activeIndex, activeSlot, localSlotMedia.slides, remoteSlotMedia.slides, scrollToPreview]
  );

  const discardDraftMedia = useCallback(() => {
    if (!draftMedia) return;

    Alert.alert('Clear this draft?', 'Your live store won\'t change.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => setDraftMedia(null),
      },
    ]);
  }, [draftMedia]);

  const searchStockImages = useCallback(async () => {
    setStockLoading(true);
    setStockError('');
    try {
      const query = stockQuery.trim();
      const sourceLabel = stockSource.charAt(0).toUpperCase() + stockSource.slice(1);
      const endpoint = query
        ? `/api/markket/img?action=${stockSource}&query=${encodeURIComponent(query)}&per_page=24&count=24`
        : `/api/markket/img?action=${stockSource}&per_page=24&count=24`;
      const response = await fetch(`${displayBaseUrl}${endpoint.replace(/^\//, '')}`);

      if (!response.ok) {
        setStockResults([]);
        if (response.status === 504) {
          setStockError(`${sourceLabel} is taking longer than usual right now (504). Try again in a few seconds.`);
          return;
        }
        if (response.status === 429) {
          setStockError(`Too many image requests right now. Give it a few seconds, then try again.`);
          return;
        }
        if (response.status >= 500) {
          setStockError(`${sourceLabel} is temporarily unavailable. Please try again shortly.`);
          return;
        }
        setStockError(`We couldn't load ${sourceLabel} images right now (${response.status}). Please try again.`);
        return;
      }

      const payload = (await response.json()) as unknown;
      const mapped = mapStockResults(payload);
      setStockResults(mapped);
      if (!mapped.length) {
        const queryLabel = query || 'that search';
        setStockError(`No ${sourceLabel} images found for "${queryLabel}". Try simpler words like "minimal", "food", or "fashion".`);
      }
    } catch {
      setStockResults([]);
      setStockError(`We couldn't reach ${stockSource} right now. Check connection and try again.`);
    } finally {
      setStockLoading(false);
    }
  }, [displayBaseUrl, stockQuery, stockSource]);

  useEffect(() => {
    setStockResults([]);
    setStockError('');
  }, [stockSource]);

  const selectStockImage = useCallback(
    (image: StockImage) => {
      const preferredFullUrl = preferJpegStockUrl(image.fullUrl || image.thumbUrl);
      const localMedia: LocalMedia = {
        key: `stock-${image.id}-${Date.now()}`,
        uri: preferredFullUrl,
        fileName: image.id,
        mime: 'image/jpeg',
        altText: image.altText,
        sourceLabel: image.author ? `${stockSource}:${image.author}` : stockSource,
        colorSeed: normalizeHexColor(image.color || ''),
      };

      applyIncomingDraftToSlot(localMedia, activeSlot, activeIndex, activeSlot === 'slides' ? 'append' : 'replace');
    },
    [activeIndex, activeSlot, applyIncomingDraftToSlot, stockSource]
  );

  const uploadLocalMediaToProxy = useCallback(
    async (media: LocalMedia, token: string, userId: string, target: UploadTarget): Promise<UploadedMediaItem> => {
      const uri = cleanText(media.uri);
      if (!uri) {
        throw new Error('Missing media URI for upload.');
      }

      let uploadUri = uri;
      const cleanupUris: string[] = [];
      let fileName = cleanText(media.fileName) || `markket-media-${Date.now()}.jpg`;
      let mimeType = cleanText(media.mime) || 'image/jpeg';
      const slot = slotFromUploadField(target.field);
      const slotPolicy = SLOT_POLICIES[slot];
      const slotTarget = SLOT_TARGETS[slot];

      if (/^https?:\/\//i.test(uri)) {
        const extensionMatch = uri.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
        const ext = extensionMatch?.[1]?.toLowerCase() || 'jpg';
        const targetFile = new FileSystem.File(FileSystem.Paths.cache, `markket-publish-${Date.now()}.${ext}`);
        const download = await FileSystem.File.downloadFileAsync(uri, targetFile, { idempotent: true });
        uploadUri = download.uri;
        cleanupUris.push(download.uri);
        fileName = cleanText(media.fileName) || `markket-media-${Date.now()}.${ext}`;
        mimeType = cleanText(media.mime) || `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      }

      const normalizedMime = cleanText(mimeType).toLowerCase();
      const keepPng = slot === 'logo' && (normalizedMime.includes('png') || /\.png$/i.test(fileName));
      const isSvg = normalizedMime.includes('svg') || /\.svg$/i.test(fileName);
      const needsResize =
        (typeof media.width === 'number' && media.width > slotTarget.width) ||
        (typeof media.height === 'number' && media.height > slotTarget.height);
      const needsCompression =
        typeof media.fileSizeBytes !== 'number' ||
        media.fileSizeBytes > slotPolicy.maxBytes ||
        /^https?:\/\//i.test(uri) ||
        (!keepPng && !normalizedMime.includes('jpeg') && !normalizedMime.includes('jpg'));

      if (!isSvg && (needsResize || needsCompression)) {
        const resizeAction = getResizeActionForTarget(media, slotTarget);
        const firstPass = await ImageManipulator.manipulateAsync(uploadUri, resizeAction, {
          compress: keepPng ? 1 : slotTarget.compress,
          format: keepPng ? ImageManipulator.SaveFormat.PNG : ImageManipulator.SaveFormat.JPEG,
        });

        if (firstPass.uri !== uploadUri) {
          cleanupUris.push(firstPass.uri);
        }

        uploadUri = firstPass.uri;
        fileName = cleanText(media.fileName) || `markket-media-${Date.now()}.${keepPng ? 'png' : 'jpg'}`;
        mimeType = keepPng ? 'image/png' : 'image/jpeg';

        if (!keepPng) {
          const firstPassInfo = new FileSystem.File(firstPass.uri).info();
          const firstPassSize = typeof firstPassInfo.size === 'number' ? firstPassInfo.size : undefined;

          if (typeof firstPassSize === 'number' && firstPassSize > slotPolicy.maxBytes) {
            const secondPass = await ImageManipulator.manipulateAsync(firstPass.uri, [], {
              compress: Math.max(0.58, slotTarget.compress - 0.14),
              format: ImageManipulator.SaveFormat.JPEG,
            });

            if (secondPass.uri !== uploadUri) {
              cleanupUris.push(secondPass.uri);
            }

            uploadUri = secondPass.uri;
            fileName = cleanText(media.fileName) || `markket-media-${Date.now()}.jpg`;
            mimeType = 'image/jpeg';
          }
        }
      }

      const proxyUploadUrl = `${displayBaseUrl}api/markket?path=/api/upload`;
      const headers = {
        Authorization: `Bearer ${token}`,
        'markket-user-id': String(userId),
      };

      const fieldCandidates = uploadFieldVariants(target.field);

      try {
        let lastStatus = 0;
        let lastFailureText = '';

        for (let index = 0; index < fieldCandidates.length; index += 1) {
          const fieldName = fieldCandidates[index];
          const formData = new FormData();
          formData.append('files', {
            uri: uploadUri,
            name: fileName,
            type: mimeType,
          } as unknown as Blob);
          formData.append('ref', target.ref);
          formData.append('refId', target.refId);
          formData.append('field', fieldName);
          formData.append(
            'fileInfo',
            JSON.stringify({
              name: fileName,
              alternativeText: cleanText(media.altText) || `${uploadFieldLabel(fieldName)} image`,
              caption: cleanText(media.altText) || `${uploadFieldLabel(fieldName)} image`,
            })
          );

          const proxyResponse = await fetch(proxyUploadUrl, {
            method: 'POST',
            headers,
            body: formData,
          });

          if (proxyResponse.ok) {
            const payload = (await proxyResponse.json()) as unknown;
            const payloadRecord = (payload as Record<string, unknown>) || {};
            const list = Array.isArray(payload)
              ? payload
              : Array.isArray(payloadRecord.data)
                ? (payloadRecord.data as unknown[])
                : [];
            const directItem = !Array.isArray(payload) ? (payload as UploadedMediaItem) : undefined;
            const first = (list[0] as UploadedMediaItem | undefined) || directItem;
            if (first?.id != null) return first;
            throw new Error('Proxy upload response did not include a media ID.');
          }

          lastStatus = proxyResponse.status;
          lastFailureText = (await proxyResponse.text()).slice(0, 220);

          if (!shouldRetryWithAlternateField(lastStatus, lastFailureText, fieldCandidates, index)) {
            throw new Error(`Upload failed (${lastStatus}) ${lastFailureText}`.trim());
          }
        }

        throw new Error(`Upload failed (${lastStatus}) ${lastFailureText}`.trim());
      } finally {
        for (const tempUri of Array.from(new Set(cleanupUris)).filter(Boolean)) {
          try {
            const tempFile = new FileSystem.File(tempUri);
            tempFile.delete();
          } catch {
            // Ignore temp file cleanup failures.
          }
        }
      }
    },
    [displayBaseUrl]
  );

  const openComposer = useCallback(
    async (mode: 'from-scratch' | 'from-photo' | 'edit-existing') => {
      const composerSourceUri =
        mode === 'edit-existing'
          ? cleanText(draftMedia?.uri) || selectedMediaUrl
          : selectedMediaUrl;
      const resolvedMode =
        (mode === 'from-photo' || mode === 'edit-existing') && !composerSourceUri ? 'from-scratch' : mode;

      const params: Record<string, string> = {
        storeSlug: resolvedStoreSlug,
        slot: activeSlot,
        mode: resolvedMode,
        titleSeed: storeTitleSeed,
        subtitleSeed,
        altSeed,
      };

      const colorSeed = normalizeHexColor(cleanText(draftMedia?.colorSeed || '') || selectedColorSeed);
      if (colorSeed) {
        params.colorSeed = colorSeed;
      }

      if (resolvedMode !== 'from-scratch' && composerSourceUri) {
        if (
          composerSourceUri.startsWith('data:image/') ||
          /^https?:\/\//i.test(composerSourceUri) ||
          composerSourceUri.length > 1800
        ) {
          const sourceKey = `markket-media-composer-source:${Date.now()}`;
          await AsyncStorage.setItem(sourceKey, composerSourceUri);
          params.sourceKey = sourceKey;
        } else {
          params.sourceUri = composerSourceUri;
        }
      }

      router.push({
        pathname: '/store/[storeSlug]/composer',
        params,
      } as never);
    },
    [activeSlot, altSeed, draftMedia, resolvedStoreSlug, router, selectedColorSeed, selectedMediaUrl, storeTitleSeed, subtitleSeed]
  );

  const fixSelectedForSlot = useCallback(async () => {
    if (!selectedMediaUrl) {
      Alert.alert('No image selected', 'Pick an image first.');
      return;
    }

    if (selectedMediaUrl.startsWith('data:image/svg+xml')) {
      Alert.alert('Already vector-safe', 'SVG drafts are already scalable. No size fix is required.');
      return;
    }

    setFixingSlot(true);
    let cleanupUri = '';
    try {
      let localUri = selectedMediaUrl;
      if (/^https?:\/\//i.test(selectedMediaUrl)) {
        const extensionMatch = selectedMediaUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i);
        const ext = extensionMatch?.[1]?.toLowerCase() || 'jpg';
        const targetFile = new FileSystem.File(FileSystem.Paths.cache, `markket-fix-source-${Date.now()}.${ext}`);
        const download = await FileSystem.File.downloadFileAsync(selectedMediaUrl, targetFile, { idempotent: true });
        localUri = download.uri;
        cleanupUri = download.uri;
      }

      const target = SLOT_TARGETS[activeSlot];
      const manipulated = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: target.width, height: target.height } }],
        { compress: target.compress, format: ImageManipulator.SaveFormat.JPEG }
      );

      const fileInfo = new FileSystem.File(manipulated.uri).info();
      const fixedMedia: LocalMedia = {
        key: `slot-fix-${Date.now()}`,
        uri: manipulated.uri,
        width: manipulated.width,
        height: manipulated.height,
        fileName: `markket-${activeSlot}-${Date.now()}.jpg`,
        mime: 'image/jpeg',
        fileSizeBytes: typeof fileInfo.size === 'number' ? fileInfo.size : undefined,
        altText: selectedAltRaw || undefined,
        sourceLabel: 'slot-auto-fix',
        colorSeed: selectedColorSeed,
      };

      applyIncomingDraftToSlot(fixedMedia, activeSlot, activeIndex);
      Alert.alert('Slot fixed', 'Image resized and compressed for this slot.');
    } catch {
      Alert.alert('Fix failed', 'Could not process this image right now.');
    } finally {
      if (cleanupUri) {
        try {
          new FileSystem.File(cleanupUri).delete();
        } catch {
          // Ignore cache cleanup failures.
        }
      }
      setFixingSlot(false);
    }
  }, [activeIndex, activeSlot, applyIncomingDraftToSlot, selectedAltRaw, selectedColorSeed, selectedMediaUrl]);

  const copyCurrentImageLink = useCallback(async () => {
    if (!selectedMediaUrl) {
      Alert.alert('No image selected', 'Choose an image first.');
      return;
    }

    await Clipboard.setStringAsync(selectedMediaUrl);
    Alert.alert('Copied', 'Image link copied.');
  }, [selectedMediaUrl]);

  const publishLocalChanges = useCallback(async (): Promise<boolean> => {
    if (!session?.token) {
      Alert.alert('Sign in required', 'Log in again to publish media changes.');
      return false;
    }

    if (changedSlotCount <= 0) {
      Alert.alert('Nothing to publish', 'Stage and apply a slot replacement first.');
      return false;
    }

    if (typeof store?.id !== 'number') {
      Alert.alert('Store missing', 'Could not resolve this store ID for publishing.');
      return false;
    }

    setPublishingChanges(true);
    try {
      const userId = await resolveUserId();
      if (!userId) {
        Alert.alert('Account required', 'Could not validate your account for publishing.');
        return false;
      }

      const slotMediaToPublish = effectiveSlotMedia;
      const uploadedIds: Partial<Record<MediaSlot, RelationMediaId[]>> = {};
      const coverTarget = getUploadTargetForSlot(store, 'cover');
      const seoSocialTarget = getUploadTargetForSlot(store, 'seoSocial');
      const logoTarget = getUploadTargetForSlot(store, 'logo');
      const slidesTarget = getUploadTargetForSlot(store, 'slides');

      if (slotMediaToPublish.cover.length) {
        const uploaded = await uploadLocalMediaToProxy(slotMediaToPublish.cover[0], session.token, userId, coverTarget);
        const coverId = toRelationMediaId(uploaded.documentId ?? uploaded.id);
        if (coverId != null) uploadedIds.cover = [coverId];
      }
      if (slotMediaToPublish.seoSocial.length) {
        const uploaded = await uploadLocalMediaToProxy(
          slotMediaToPublish.seoSocial[0],
          session.token,
          userId,
          seoSocialTarget
        );
        const seoSocialId = toRelationMediaId(uploaded.documentId ?? uploaded.id);
        if (seoSocialId != null) uploadedIds.seoSocial = [seoSocialId];
      }
      if (slotMediaToPublish.logo.length) {
        const uploaded = await uploadLocalMediaToProxy(slotMediaToPublish.logo[0], session.token, userId, logoTarget);
        const logoId = toRelationMediaId(uploaded.documentId ?? uploaded.id);
        if (logoId != null) uploadedIds.logo = [logoId];
      }
      // Build final slides array in exact staged order:
      // keep remote IDs in-place and upload local drafts in-place.
      const finalSlideIds: RelationMediaId[] = [];
      if (slotMediaToPublish.slides.length) {
        const uploadedSlideIds: RelationMediaId[] = [];

        for (const slide of slotMediaToPublish.slides) {
          const isRemote = cleanText(slide.sourceLabel).toLowerCase() === 'remote';
          if (isRemote) {
            const id = toRelationMediaId(slide.mediaId);
            if (id != null) {
              finalSlideIds.push(id);
            }
            continue;
          }

          const uploaded = await uploadLocalMediaToProxy(slide, session.token, userId, slidesTarget);
          const uploadedId = toRelationMediaId(uploaded.documentId ?? uploaded.id);
          if (uploadedId != null) {
            finalSlideIds.push(uploadedId);
            uploadedSlideIds.push(uploadedId);
          }
        }

        if (uploadedSlideIds.length) {
          uploadedIds.slides = uploadedSlideIds;
        }
      }

      // If slides were edited, always sync Slides relation, including empty [] for full delete.
      if (slidesDirty) {
        const storeUpdateHeaders = {
          Authorization: `Bearer ${session.token}`,
          'markket-user-id': String(userId),
          'Content-Type': 'application/json',
        };
        const storeRefs = [cleanText(store.documentId || ''), String(store.id)].filter(Boolean);
        const payloads = [
          { data: { Slides: finalSlideIds } },
          { data: { slides: finalSlideIds } },
          { data: { Slides: { set: finalSlideIds } } },
          { data: { slides: { set: finalSlideIds } } },
        ];

        let slidesSynced = false;
        let lastStatus = 0;
        let lastBody = '';

        for (let attempt = 0; attempt < 2 && !slidesSynced; attempt += 1) {
          for (const ref of storeRefs) {
            for (const payload of payloads) {
              const storeUpdateUrl = `${displayBaseUrl}api/markket?path=/api/stores/${ref}`;
              const updateResponse = await fetch(storeUpdateUrl, {
                method: 'PUT',
                headers: storeUpdateHeaders,
                body: JSON.stringify(payload),
              });

              if (updateResponse.ok) {
                slidesSynced = true;
                break;
              }

              lastStatus = updateResponse.status;
              lastBody = (await updateResponse.text()).slice(0, 220);
            }

            if (slidesSynced) break;
          }
        }

        if (!slidesSynced) {
          throw new Error(`Slides sync failed (${lastStatus}) ${lastBody}`.trim());
        }
      }

      console.info('[MediaStudio] publish success', {
        storeId: store.id,
        storeDocumentId: cleanText(store.documentId || ''),
        seoId:
          typeof (store.SEO || store.seo)?.id === 'number' || typeof (store.SEO || store.seo)?.id === 'string'
            ? String((store.SEO || store.seo)?.id)
            : '',
        uploadedIds,
        finalSlideIds,
      });

      setLocalSlotMedia({
        cover: [],
        seoSocial: [],
        logo: [],
        slides: [],
      });
      setSlidesDirty(false);
      setDraftMedia(null);
      setShowReplaceToast(false);
      setReplaceUndoSnapshot(null);
      await loadStoreMedia();
      Alert.alert('Published', 'Store media was updated successfully.');
      return true;
    } catch (err) {
      Alert.alert('Publish failed', err instanceof Error ? err.message : 'Unknown publish error.');
      return false;
    } finally {
      setPublishingChanges(false);
    }
  }, [
    changedSlotCount,
    displayBaseUrl,
    effectiveSlotMedia,
    slidesDirty,
    loadStoreMedia,
    resolveUserId,
    session?.token,
    store,
    uploadLocalMediaToProxy,
  ]);

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
      if (lastConsumedDraftKeyRef.current === resolvedDraftKey) return;
      lastConsumedDraftKeyRef.current = resolvedDraftKey;

      try {
        const raw = await AsyncStorage.getItem(resolvedDraftKey);
        await AsyncStorage.removeItem(resolvedDraftKey);
        if (!raw || cancelled) return;

        const parsed = JSON.parse(raw) as ComposerDraftPayload;
        if (!parsed?.uri || !parsed?.key) return;

        const incomingDraft: LocalMedia = {
          key: parsed.key,
          uri: parsed.uri,
          width: parsed.width,
          height: parsed.height,
          fileName: parsed.fileName,
          mime: parsed.mime,
          altText: parsed.altText,
          sourceLabel: parsed.sourceLabel || 'composer',
          colorSeed: normalizeHexColor(cleanText(parsed.colorSeed || '')),
        };

        const slotForDraft = resolvedDraftSlot || activeSlot;
        const slotTargetIndex = slotForDraft === activeSlot ? activeIndex : 0;

        applyIncomingDraftToSlot(incomingDraft, slotForDraft, slotTargetIndex);
        requestAnimationFrame(() => scrollToPreview(true));

        await AsyncStorage.removeItem(resolvedDraftKey);

        if (!cancelled) {
          navigation.setParams({
            draftKey: undefined,
            draftSlot: undefined,
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
  }, [activeIndex, activeSlot, applyIncomingDraftToSlot, navigation, resolvedDraftKey, resolvedDraftSlot, scrollToPreview]);

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
        ref={scrollViewRef}
        contentContainerStyle={[
          styles.container,
          {
            paddingTop: insets.top + 16,
            paddingBottom: insets.bottom + (bottomDockVisible ? 168 : 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onScrollBeginDrag={Keyboard.dismiss}
        showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View style={styles.headingWrap}>
            <View style={styles.headerTitleRow}>
              <ThemedText type="title" style={styles.title}>Media Studio</ThemedText>
            </View>
            <ThemedText style={styles.storeTag}>{resolvedStoreSlug || 'Store'}</ThemedText>
          </View>
        </View>

        <ThemedText style={styles.subtitle}>Pick an image, compose, publish.</ThemedText>

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
                  {card.label} · {card.count}
                </ThemedText>
                <ThemedText style={styles.healthCardHint}>{card.health.hint}</ThemedText>
              </Pressable>
            );
          })}
        </View>

        <ThemedText style={styles.sectionEyebrow}>Preview</ThemedText>

        <Animated.View
          entering={FadeInDown.duration(240).delay(60)}
          onLayout={(event) => {
            previewAnchorYRef.current = event.nativeEvent.layout.y;
          }}>
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
                  {hasLocalOnlyPreview ? (
                    <View style={styles.previewStagedPill}>
                      <ThemedText style={styles.previewStagedPillText}>Local preview only</ThemedText>
                    </View>
                  ) : null}
                  {selectedMediaIsLocal ? (
                    <Pressable style={styles.previewDiscardFab} onPress={clearLocalReplacement}>
                      <ThemedText style={styles.previewDiscardFabText}>x</ThemedText>
                    </Pressable>
                  ) : null}
                  {selectedMediaUrl ? (
                    <Pressable
                      style={styles.previewComposerFab}
                      onPress={() => {
                        void openComposer(selectedMediaIsLocal ? 'edit-existing' : 'from-photo');
                      }}>
                      <ThemedText style={styles.previewComposerFabText}>Compose</ThemedText>
                    </Pressable>
                  ) : null}
              <View style={styles.previewHintPill}>
                <ThemedText style={styles.previewHintText}>Tap for full screen</ThemedText>
              </View>
            </Pressable>
          ) : (
            <View style={styles.emptyCard}>
              <ThemedText style={styles.emptyText}>No image assigned for this slot yet.</ThemedText>
            </View>
          )}
        </Animated.View>

        {changedSlotCount > 0 ? (
          <ThemedText style={styles.previewPublishReminder}>Preview changes are local until you tap Publish Changes.</ThemedText>
        ) : null}

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

        {activeSlot !== 'slides' ? (
          <>
            <ThemedText style={styles.sectionEyebrow}>Add Image</ThemedText>
            <View style={styles.actionRow}>
              <Pressable style={styles.actionPill} onPress={() => void pickFromLibrary()}>
                <ThemedText style={styles.actionPillText}>Choose Photo</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void pickFromCamera()}>
                <ThemedText style={styles.actionPillText}>Camera</ThemedText>
              </Pressable>
              {showDraftPreview || activeSlotHasLocalPreview ? (
                <Pressable style={styles.actionPill} onPress={clearLocalReplacement}>
                  <ThemedText style={styles.actionPillText}>Start Over</ThemedText>
                </Pressable>
              ) : null}
              <Pressable
                style={[styles.actionPill, styles.actionPillPrimary]}
                onPress={() => {
                  void openComposer('from-photo');
                }}>
                <ThemedText style={[styles.actionPillText, styles.actionPillTextPrimary]}>Edit in Composer</ThemedText>
              </Pressable>
              <Pressable
                style={[styles.actionPill, styles.actionPillStrong]}
                onPress={() => {
                  void openComposer('from-scratch');
                }}>
                <ThemedText style={styles.actionPillText}>Start Fresh</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void saveCurrentImageToCameraRoll()}>
                <ThemedText style={styles.actionPillText}>Save to Photos</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void fixSelectedForSlot()}>
                <ThemedText style={styles.actionPillText}>{fixingSlot ? 'Fixing...' : 'Auto-fix'}</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void shareCurrentImage()}>
                <ThemedText style={styles.actionPillText}>Share Link</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void copyCurrentImageLink()}>
                <ThemedText style={styles.actionPillText}>Copy Link</ThemedText>
              </Pressable>
            </View>
          </>
        ) : null}

        {activeSlot === 'slides' ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Slides</ThemedText>
            {duplicateSlidesCount > 0 ? (
              <ThemedText style={styles.errorText}>
                {duplicateSlidesCount} duplicate slide record{duplicateSlidesCount === 1 ? '' : 's'} hidden.
              </ThemedText>
            ) : null}
            <ThemedText style={styles.infoLine}>
              {activeItems.length ? `Slide ${Math.min(activeIndex + 1, activeItems.length)} of ${activeItems.length}` : 'Tap a thumbnail to select a slide.'}
            </ThemedText>
            <View style={styles.slideActionRow}>
              <Pressable style={styles.slideActionIcon} onPress={() => moveSelectedSlide('left')}>
                <MaterialIcons name="arrow-back" size={18} color="#0E7490" />
              </Pressable>
              <Pressable style={styles.slideActionIcon} onPress={() => moveSelectedSlide('right')}>
                <MaterialIcons name="arrow-forward" size={18} color="#0E7490" />
              </Pressable>
              <Pressable style={styles.slideActionIcon} onPress={() => void openComposer('from-photo')}>
                <MaterialIcons name="edit" size={18} color="#0E7490" />
              </Pressable>
              <Pressable style={[styles.slideActionIcon, styles.slideActionIconDanger]} onPress={removeSelectedSlide}>
                <MaterialIcons name="delete-outline" size={18} color="#B91C1C" />
              </Pressable>
            </View>
            <ThemedText style={[styles.sectionEyebrow, styles.inlineSectionEyebrow]}>Add Slide</ThemedText>
            <View style={styles.slideActionRow}>
              <Pressable style={styles.slideActionIcon} onPress={() => void pickFromLibrary()}>
                <MaterialIcons name="photo-library" size={18} color="#0E7490" />
              </Pressable>
              <Pressable style={styles.slideActionIcon} onPress={() => void pickFromCamera()}>
                <MaterialIcons name="photo-camera" size={18} color="#0E7490" />
              </Pressable>
              <Pressable style={styles.slideActionIcon} onPress={() => void openComposer('from-scratch')}>
                <MaterialIcons name="auto-awesome" size={18} color="#0E7490" />
              </Pressable>
            </View>
            {activeSlot === 'slides' && (showDraftPreview || activeSlotHasLocalPreview) ? (
              <Pressable style={styles.actionPill} onPress={clearLocalReplacement}>
                <ThemedText style={styles.actionPillText}>Clear Preview</ThemedText>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {activeSlot !== 'slides' ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Edit</ThemedText>
            {selectedMediaUrl ? (
              <View style={styles.actionRow}>
                <Pressable style={styles.actionPill} onPress={() => void saveCurrentImageToCameraRoll()}>
                <ThemedText style={styles.actionPillText}>Save to Photos</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void fixSelectedForSlot()}>
                <ThemedText style={styles.actionPillText}>{fixingSlot ? 'Fixing...' : 'Auto-fix'}</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void shareCurrentImage()}>
                <ThemedText style={styles.actionPillText}>Share Link</ThemedText>
              </Pressable>
              <Pressable style={styles.actionPill} onPress={() => void copyCurrentImageLink()}>
                <ThemedText style={styles.actionPillText}>Copy Link</ThemedText>
              </Pressable>
            </View>
            ) : null}
          </View>
        ) : null}

        {showDraftPreview ? (
          <Animated.View entering={FadeInDown.duration(240).delay(140)} style={styles.card}>
            <ThemedText type="defaultSemiBold">Draft Preview</ThemedText>
            <View style={styles.previewWrap}>
              <Image source={{ uri: draftMedia?.uri }} style={styles.previewImage} contentFit="cover" transition={140} />
            </View>
            <Input
              value={draftMedia?.altText || ''}
              onChangeText={updateDraftAltText}
              placeholder="Alt text (accessibility)"
              autoCapitalize="sentences"
              autoCorrect
            />
            <View style={styles.actionRow}>
              <Pressable
                style={[styles.actionPill, styles.actionPillStrong]}
                onPress={() => {
                  void openComposer('edit-existing');
                }}>
                <ThemedText style={styles.actionPillText}>Continue In Composer</ThemedText>
              </Pressable>
            </View>
          </Animated.View>
        ) : null}

        {changedSlotCount > 0 ? (
          <View style={styles.card}>
            <ThemedText type="defaultSemiBold">Go Live</ThemedText>
            {selectedQuality.notes[0] ? <ThemedText style={styles.infoLine}>{selectedQuality.notes[0]}</ThemedText> : null}
            <ThemedText style={styles.infoLine}>{changedSlotCount} change{changedSlotCount === 1 ? '' : 's'} ready.</ThemedText>
            <Button
              label={publishingChanges ? 'Publishing...' : 'Publish Changes Now'}
              variant="primary"
              disabled={publishingChanges}
              onPress={() => void publishLocalChanges()}
            />
          </View>
        ) : null}

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Stock Photos</ThemedText>
          <View style={styles.stockSourceRow}>
            <Pressable
              style={[styles.stockSourcePill, stockSource === 'unsplash' && styles.stockSourcePillActive]}
              onPress={() => setStockSource('unsplash')}>
              <ThemedText style={[styles.stockSourcePillText, stockSource === 'unsplash' && styles.stockSourcePillTextActive]}>Unsplash</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.stockSourcePill, stockSource === 'getty' && styles.stockSourcePillActive]}
              onPress={() => setStockSource('getty')}>
              <ThemedText style={[styles.stockSourcePillText, stockSource === 'getty' && styles.stockSourcePillTextActive]}>Getty</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.stockSourcePill, stockSource === 'pexels' && styles.stockSourcePillActive]}
              onPress={() => setStockSource('pexels')}>
              <ThemedText style={[styles.stockSourcePillText, stockSource === 'pexels' && styles.stockSourcePillTextActive]}>Pexels</ThemedText>
            </Pressable>
          </View>
          <Input
            value={stockQuery}
            onChangeText={setStockQuery}
            placeholder={`Search ${stockSource} images`}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => {
              if (!stockLoading) {
                void searchStockImages();
              }
            }}
          />
          <View style={styles.actionRow}>
            <Button label={stockLoading ? 'Searching...' : `Search ${stockSource}`} variant="secondary" onPress={() => void searchStockImages()} disabled={stockLoading} />
            <Pressable style={styles.actionPill} onPress={Keyboard.dismiss}>
              <ThemedText style={styles.actionPillText}>Hide Keyboard</ThemedText>
            </Pressable>
          </View>
          {stockError ? <ThemedText style={styles.errorText}>{stockError}</ThemedText> : null}
          {!stockLoading && !stockError && !stockResults.length ? (
            <ThemedText style={styles.infoLine}>Search to pull fresh images. Tip: 1-2 words usually works best.</ThemedText>
          ) : null}

          {stockResults.length ? (
            <View style={styles.stockGrid}>
              {stockResults.map((item) => (
                <Pressable key={item.id} style={styles.stockGridItem} onPress={() => selectStockImage(item)}>
                  <Image source={{ uri: item.thumbUrl }} style={styles.stockThumbImage} contentFit="cover" transition={120} />
                  <ThemedText numberOfLines={1} style={styles.stockMetaText}>
                    {item.author || 'Unsplash'}
                  </ThemedText>
                </Pressable>
              ))}
            </View>
          ) : null}
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

      {showReplaceToast ? (
        <Animated.View entering={FadeInDown.duration(180)} style={[styles.replaceToast, { bottom: insets.bottom + (showDraftPreview ? 114 : 14) }]}>
          <View style={styles.replaceToastDot} />
          <View style={styles.replaceToastInfo}>
            <ThemedText style={styles.replaceToastTitle}>Preview updated</ThemedText>
            <ThemedText style={styles.replaceToastHint}>Not published yet.</ThemedText>
          </View>
          <Pressable style={styles.replaceToastUndoButton} onPress={undoReplaceSlotPreview}>
            <ThemedText style={styles.replaceToastUndoText}>Undo</ThemedText>
          </Pressable>
        </Animated.View>
      ) : null}

      {showDraftPreview ? (
        <Animated.View entering={FadeInDown.duration(220)} style={[styles.unsavedDock, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.dockTopRow}>
            <View style={styles.dockDot} />
            <ThemedText style={styles.dockLabel}>Draft ready</ThemedText>
            <View style={styles.dockDot} />
          </View>
          <View style={styles.dockActionRow}>
            <Pressable style={styles.dockDiscardButton} onPress={discardDraftMedia}>
              <ThemedText style={styles.dockDiscardButtonText}>Discard</ThemedText>
            </Pressable>
            <Pressable style={styles.dockSaveButton} onPress={applyDraftToSlot}>
              <ThemedText style={styles.dockSaveButtonText}>Apply to Slot</ThemedText>
            </Pressable>
          </View>
        </Animated.View>
      ) : changedSlotCount > 0 ? (
          <Animated.View entering={FadeInDown.duration(220)} style={[styles.unsavedDock, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.dockTopRow}>
            <View style={styles.dockDot} />
            <ThemedText style={styles.dockLabel}>{changedSlotCount} change{changedSlotCount === 1 ? '' : 's'} ready</ThemedText>
            <View style={styles.dockDot} />
          </View>
          <View style={styles.dockActionRow}>
            <Pressable style={styles.dockSaveButton} onPress={() => void publishLocalChanges()}>
              <ThemedText style={styles.dockSaveButtonText}>{publishingChanges ? 'Publishing...' : 'Publish Changes'}</ThemedText>
            </Pressable>
          </View>
        </Animated.View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 18,
    gap: 14,
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
    fontFamily: 'GilroyBlack',
    letterSpacing: 0.2,
  },
  storeTag: {
    fontSize: 13,
    lineHeight: 18,
    opacity: 0.7,
    fontFamily: 'Manrope',
  },
  subtitle: {
    opacity: 0.76,
    fontFamily: 'Manrope',
    lineHeight: 20,
  },
  subtitleAccent: {
    marginTop: -2,
    color: '#0369A1',
    opacity: 0.9,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'SpaceGrotesk',
  },
  sectionEyebrow: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'RobotoMono',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
    color: '#0C4A6E',
    opacity: 0.75,
    marginTop: 4,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  previewStagedPill: {
    position: 'absolute',
    left: 10,
    top: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(180,83,9,0.45)',
    backgroundColor: 'rgba(120,53,15,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewStagedPillText: {
    color: '#FFEDD5',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk',
  },
  previewPublishReminder: {
    fontSize: 12,
    lineHeight: 16,
    color: '#9A3412',
    fontFamily: 'Manrope',
    marginTop: 8,
  },
  previewDiscardFab: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(185,28,28,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDiscardFabText: {
    color: '#FEF2F2',
    fontSize: 16,
    lineHeight: 16,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk',
  },
  previewComposerFab: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(14,116,144,0.88)',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  previewComposerFabText: {
    color: '#ECFEFF',
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'SpaceGrotesk',
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
  stockSourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  stockSourcePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.25)',
    backgroundColor: 'rgba(248,250,252,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  stockSourcePillActive: {
    borderColor: '#0E7490',
    backgroundColor: '#0E7490',
  },
  stockSourcePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.2,
  },
  stockSourcePillTextActive: {
    color: '#F0FDFF',
  },
  stockGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  stockGridItem: {
    width: '31%',
    minWidth: 98,
    maxWidth: 132,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.24)',
    padding: 2,
    backgroundColor: 'rgba(240,249,255,0.9)',
  },
  stockThumbImage: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: 'rgba(148,163,184,0.3)',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  slideActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    justifyContent: 'flex-start',
  },
  slideActionIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(14,116,144,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.24)',
  },
  slideActionIconDanger: {
    backgroundColor: 'rgba(220,38,38,0.08)',
    borderColor: 'rgba(220,38,38,0.24)',
  },
  actionPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.22)',
    backgroundColor: 'rgba(248,250,252,0.98)',
    paddingHorizontal: 13,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
  },
  actionPillStrong: {
    borderColor: 'rgba(14,116,144,0.45)',
    backgroundColor: 'rgba(240,249,255,0.98)',
  },
  actionPillPrimary: {
    borderColor: '#0E7490',
    backgroundColor: '#0E7490',
    shadowColor: '#0E7490',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 3,
  },
  actionPillDanger: {
    borderColor: 'rgba(220,38,38,0.55)',
    backgroundColor: 'rgba(254,242,242,0.95)',
  },
  actionPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E7490',
    letterSpacing: 0.2,
  },
  actionPillTextPrimary: {
    color: '#F0FDFF',
  },
  actionPillTextDanger: {
    color: '#B91C1C',
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.26)',
    backgroundColor: 'rgba(248,250,252,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  advancedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  advancedInfoWrap: {
    flex: 1,
  },
  infoLine: {
    fontSize: 13,
    lineHeight: 20,
    opacity: 0.84,
  },
  inlineSectionEyebrow: {
    marginTop: 10,
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
  replaceToast: {
    position: 'absolute',
    left: 14,
    right: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.35)',
    backgroundColor: 'rgba(240,249,255,0.98)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#0E7490',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  replaceToastDot: {
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: '#0891B2',
  },
  replaceToastInfo: {
    flex: 1,
    gap: 1,
  },
  replaceToastTitle: {
    fontSize: 12,
    lineHeight: 16,
    color: '#0C4A6E',
    fontWeight: '700',
    fontFamily: 'SpaceGrotesk',
  },
  replaceToastHint: {
    fontSize: 11,
    lineHeight: 15,
    color: '#0F172A',
    opacity: 0.72,
    fontFamily: 'Manrope',
  },
  replaceToastUndoButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.85)',
    backgroundColor: '#0E7490',
    paddingHorizontal: 12,
    paddingVertical: 7,
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  replaceToastUndoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#ECFEFF',
    letterSpacing: 0.15,
    fontFamily: 'SpaceGrotesk',
  },
  unsavedDock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.45)',
    backgroundColor: 'rgba(236,254,255,0.96)',
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 10,
    shadowColor: '#0E7490',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  dockTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dockDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: '#0891B2',
    opacity: 0.7,
  },
  dockLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#0C4A6E',
    fontFamily: 'RobotoMono',
    letterSpacing: 0.2,
  },
  dockActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  dockDiscardButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.35)',
    backgroundColor: 'rgba(254,242,242,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockDiscardButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B91C1C',
    fontFamily: 'SpaceGrotesk',
  },
  dockSaveButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.88)',
    backgroundColor: '#0E7490',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockSaveButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#ECFEFF',
    fontFamily: 'SpaceGrotesk',
    letterSpacing: 0.15,
  },
});
