import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image as RNImage, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOutDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { captureRef as captureViewRef } from 'react-native-view-shot';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Input } from '@/components/ui/input';

type ComposerMode = 'from-scratch' | 'from-photo' | 'edit-existing';
type MediaSlot = 'cover' | 'seoSocial' | 'logo' | 'slides';
type PresetKey = 'story' | 'feed' | 'link' | 'cover' | 'favicon';
type ToolPanel = 'none' | 'format' | 'look' | 'text' | 'frame' | 'details';
type TextStyleKey = 'impact' | 'elegant' | 'mono';

type Preset = {
  key: PresetKey;
  label: string;
  width: number;
  height: number;
};

const PRESETS: Preset[] = [
  { key: 'story', label: 'Story 1200x2133', width: 1200, height: 2133 },
  { key: 'feed', label: 'Feed 1440x1800', width: 1440, height: 1800 },
  { key: 'cover', label: 'Cover 1600x900', width: 1600, height: 900 },
  { key: 'favicon', label: 'Square 320x320', width: 320, height: 320 },
];

const COLOR_SWATCHES = ['#0EA5E9', '#F59E0B', '#D946EF', '#10B981', '#0F172A', '#E2E8F0'];

const QUICK_HEADLINES = ['New arrivals', 'Just dropped', 'Fresh favorites', 'Shop the edit'];

const QUICK_SUBTITLES = ['Now live in the storefront', 'Tap through to explore more', 'Styled for social sharing', 'Built to catch attention fast'];

const QUICK_LOOKS = [
  { label: 'Cotton Candy', bgA: '#FBCFE8', bgB: '#BFDBFE' },
  { label: 'Peach Tea', bgA: '#FED7AA', bgB: '#FDE68A' },
  { label: 'Mint Cloud', bgA: '#A7F3D0', bgB: '#BAE6FD' },
  { label: 'Lavender Pop', bgA: '#DDD6FE', bgB: '#FBCFE8' },
];

const TEXT_STYLES: { key: TextStyleKey; label: string; fontFamily: string; titleScale: number; subtitleScale: number }[] = [
  { key: 'impact', label: 'Impact', fontFamily: 'Arial, sans-serif', titleScale: 1, subtitleScale: 1 },
  { key: 'elegant', label: 'Elegant', fontFamily: 'Georgia, serif', titleScale: 0.92, subtitleScale: 0.98 },
  { key: 'mono', label: 'Mono', fontFamily: 'Courier New, monospace', titleScale: 0.9, subtitleScale: 0.9 },
];

const FRAME_OFFSET_PX = 80;
const IMAGE_COMPOSITION_ENABLED = true;
const COMPOSER_MAX_SOURCE_DIMENSION = 1800;
const COMPOSER_MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const COMPOSER_SOURCE_COMPRESS = 0.8;
const DEFAULT_TEXT_CLARITY_WASH_OPACITY = 0.08;
const COMPOSER_EXPORT_SETTINGS: Record<MediaSlot, { compress: number; fallbackCompress: number; maxBytes: number }> = {
  cover: { compress: 0.8, fallbackCompress: 0.68, maxBytes: Math.round(1.6 * 1024 * 1024) },
  seoSocial: { compress: 0.78, fallbackCompress: 0.64, maxBytes: Math.round(1.15 * 1024 * 1024) },
  logo: { compress: 0.86, fallbackCompress: 0.74, maxBytes: Math.round(0.9 * 1024 * 1024) },
  slides: { compress: 0.8, fallbackCompress: 0.68, maxBytes: Math.round(1.6 * 1024 * 1024) },
};

type SourceAssetMeta = {
  width?: number;
  height?: number;
  mime: string;
  fileSizeBytes?: number;
  normalized: boolean;
};

type FrameDefaults = {
  presetKey: PresetKey;
  photoScale: number;
  photoOffsetY: number;
};

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function cleanText(value: string | string[] | undefined): string {
  return normalizeParam(value).trim();
}

function getSourceBaseName(uri: string): string {
  const cleanUri = cleanText(uri);
  if (!cleanUri) return '';
  const withoutQuery = cleanUri.split('?')[0] || '';
  const fileName = withoutQuery.split('/').pop() || '';
  const withoutExtension = fileName.replace(/\.[^.]+$/, '');
  return withoutExtension.replace(/[-_]+/g, ' ').trim();
}

function parseMode(value: string): ComposerMode {
  if (value === 'from-photo' || value === 'edit-existing') return value;
  return 'from-scratch';
}

function parseSlot(value: string): MediaSlot {
  if (value === 'seoSocial' || value === 'logo' || value === 'slides') return value;
  return 'cover';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getFrameDefaultsForSlot(slot: MediaSlot): FrameDefaults {
  if (slot === 'cover') {
    return { presetKey: 'cover', photoScale: 1.08, photoOffsetY: -0.08 };
  }

  if (slot === 'seoSocial') {
    return { presetKey: 'link', photoScale: 1.04, photoOffsetY: -0.04 };
  }

  if (slot === 'slides') {
    return { presetKey: 'feed', photoScale: 1.1, photoOffsetY: -0.02 };
  }

  return { presetKey: 'favicon', photoScale: 1, photoOffsetY: 0 };
}

function normalizeHexColor(value: string): string {
  const clean = value.trim().toLowerCase();
  if (!clean) return '';
  const withHash = clean.startsWith('#') ? clean : `#${clean}`;
  if (/^#[0-9a-f]{6}$/i.test(withHash)) return withHash.toUpperCase();
  return '';
}

function shiftColor(hex: string, shift: number): string {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return '#0F172A';
  const value = normalized.slice(1);
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const adjust = (channel: number) => Math.max(0, Math.min(255, channel + shift));
  return `#${adjust(r).toString(16).padStart(2, '0')}${adjust(g).toString(16).padStart(2, '0')}${adjust(b)
    .toString(16)
    .padStart(2, '0')}`.toUpperCase();
}

function readImageDimensions(uri: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    RNImage.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      () => resolve(null)
    );
  });
}

async function normalizeComposerSourceUri(rawUri: string): Promise<{ uri: string; meta: SourceAssetMeta }> {
  const cleanUri = cleanText(rawUri);
  if (!cleanUri) {
    throw new Error('Missing source image URI.');
  }

  let workingUri = cleanUri;
  let ext = 'jpg';

  if (/^https?:\/\//i.test(cleanUri)) {
    const extensionMatch = cleanUri.match(/\.(jpg|jpeg|png|webp|heic|heif)(\?|$)/i);
    ext = (extensionMatch?.[1] || 'jpg').toLowerCase();
    const targetFile = new FileSystem.File(FileSystem.Paths.cache, `markket-composer-source-${Date.now()}.${ext}`);
    const download = await FileSystem.File.downloadFileAsync(cleanUri, targetFile, { idempotent: true });
    workingUri = download.uri;
  }

  const dimensions = await readImageDimensions(workingUri);
  const sourceWidth = dimensions?.width;
  const sourceHeight = dimensions?.height;
  const largestDimension = Math.max(sourceWidth || 0, sourceHeight || 0);
  const resizeScale = largestDimension > COMPOSER_MAX_SOURCE_DIMENSION ? COMPOSER_MAX_SOURCE_DIMENSION / largestDimension : 1;
  const resizeAction =
    sourceWidth && sourceHeight
      ? [{ resize: { width: Math.max(1, Math.round(sourceWidth * resizeScale)), height: Math.max(1, Math.round(sourceHeight * resizeScale)) } }]
      : [];

  try {
    const normalized = await ImageManipulator.manipulateAsync(workingUri, resizeAction, {
      compress: COMPOSER_SOURCE_COMPRESS,
      format: ImageManipulator.SaveFormat.JPEG,
    });

    const normalizedInfo = new FileSystem.File(normalized.uri).info();
    const normalizedSize = typeof normalizedInfo.size === 'number' ? normalizedInfo.size : undefined;

    return {
      uri: normalized.uri,
      meta: {
        width: normalized.width,
        height: normalized.height,
        mime: 'image/jpeg',
        fileSizeBytes: normalizedSize,
        normalized: true,
      },
    };
  } catch {
    // Some remote formats (e.g. avif/webp variants) may fail manipulation;
    // fall back to original URI so composer still opens.
    const fallbackDimensions = await readImageDimensions(cleanUri);
    return {
      uri: cleanUri,
      meta: {
        width: fallbackDimensions?.width,
        height: fallbackDimensions?.height,
        mime: 'image/*',
        normalized: false,
      },
    };
  }
}

function buildAutoLooks(seed: string): { label: string; bgA: string; bgB: string }[] {
  const normalized = normalizeHexColor(seed);
  if (!normalized) return [];
  return [
    { label: 'Source Pop', bgA: shiftColor(normalized, 28), bgB: shiftColor(normalized, -56) },
    { label: 'Soft Blend', bgA: shiftColor(normalized, 46), bgB: shiftColor(normalized, -24) },
    { label: 'Deep Focus', bgA: shiftColor(normalized, -8), bgB: shiftColor(normalized, -84) },
  ];
}

export default function StoreComposerScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const titleInputRef = useRef<TextInput | null>(null);
  const subtitleInputRef = useRef<TextInput | null>(null);
  const compositionRef = useRef<View>(null);
  const { storeSlug, slot, mode, sourceUri, sourceKey, colorSeed, titleSeed, subtitleSeed, altSeed } = useLocalSearchParams<{
    storeSlug?: string | string[];
    slot?: string | string[];
    mode?: string | string[];
    sourceUri?: string | string[];
    sourceKey?: string | string[];
    colorSeed?: string | string[];
    titleSeed?: string | string[];
    subtitleSeed?: string | string[];
    altSeed?: string | string[];
  }>();

  const resolvedStoreSlug = cleanText(storeSlug);
  const resolvedSlot = parseSlot(cleanText(slot));
  const resolvedMode = parseMode(cleanText(mode));
  const resolvedSourceUri = cleanText(sourceUri);
  const resolvedSourceKey = cleanText(sourceKey);
  const resolvedColorSeed = normalizeHexColor(cleanText(colorSeed));

  const frameDefaults = useMemo(() => getFrameDefaultsForSlot(resolvedSlot), [resolvedSlot]);
  const [sourceImageUri, setSourceImageUri] = useState(resolvedSourceUri);
  const [sourceMeta, setSourceMeta] = useState<SourceAssetMeta | null>(null);
  const [sourceNormalizationWarning, setSourceNormalizationWarning] = useState('');

  const hasSourceImage = Boolean(sourceImageUri);
  const canUseImageComposition = IMAGE_COMPOSITION_ENABLED && hasSourceImage && (resolvedMode === 'from-photo' || resolvedMode === 'edit-existing');

  const titlePlaceholder = resolvedStoreSlug ? `${resolvedStoreSlug.replace(/[-_]+/g, ' ')} spotlight` : 'Highlight what matters most';
  const subtitlePlaceholder = 'Short supporting line for storefront or social';
  const modeLabel =
    resolvedMode === 'from-photo'
      ? 'From Current Image'
      : resolvedMode === 'edit-existing'
        ? 'From Draft Image'
        : 'From Scratch';

  const autoLooks = useMemo(() => buildAutoLooks(resolvedColorSeed), [resolvedColorSeed]);
  const seededLook = autoLooks[0] || null;
  const defaultTitle = cleanText(titleSeed) || titlePlaceholder;
  const defaultSubtitle = cleanText(subtitleSeed) || subtitlePlaceholder;
  const defaultAltText = cleanText(altSeed);
  const defaultShowTextOverlay = resolvedSlot === 'seoSocial' || resolvedSlot === 'slides';

  const [presetKey, setPresetKey] = useState<PresetKey>(frameDefaults.presetKey);
  const [bgA, setBgA] = useState(seededLook?.bgA || '#FBCFE8');
  const [bgB, setBgB] = useState(seededLook?.bgB || '#BFDBFE');
  const [title, setTitle] = useState(defaultTitle);
  const [subtitle, setSubtitle] = useState(defaultSubtitle);
  const [altText, setAltText] = useState(defaultAltText);
  const [showTextOverlay, setShowTextOverlay] = useState(defaultShowTextOverlay);
  const [showTitle, setShowTitle] = useState(true);
  const [showSubtitle, setShowSubtitle] = useState(true);
  const [activePanel, setActivePanel] = useState<ToolPanel>('none');
  const [textStyleKey, setTextStyleKey] = useState<TextStyleKey>('impact');
  const [textOffsetX, setTextOffsetX] = useState(0);
  const [textOffsetY, setTextOffsetY] = useState(0);
  const [photoScale, setPhotoScale] = useState(frameDefaults.photoScale);
  const [photoOffsetY, setPhotoOffsetY] = useState(frameDefaults.photoOffsetY);
  const [applyTextClarityWash, setApplyTextClarityWash] = useState(true);
  const [textClarityWashOpacity, setTextClarityWashOpacity] = useState(DEFAULT_TEXT_CLARITY_WASH_OPACITY);
  const suppressPreventRemoveRef = useRef(false);
  const haloPulse = useSharedValue(0);
  const scanProgress = useSharedValue(0);
  const tBaseX = useSharedValue(0);
  const tBaseY = useSharedValue(0);
  const tActiveX = useSharedValue(0);
  const tActiveY = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;

    async function hydrateSourceUri() {
      setSourceNormalizationWarning('');
      try {
        const incomingUri = resolvedSourceUri || (resolvedSourceKey ? await AsyncStorage.getItem(resolvedSourceKey) : '');
        const normalizedInput = cleanText(incomingUri || '');

        if (!normalizedInput) {
          if (!cancelled) {
            setSourceImageUri('');
            setSourceMeta(null);
          }
          return;
        }

        const normalizedResult = await normalizeComposerSourceUri(normalizedInput);

        if (!cancelled) {
          setSourceImageUri(normalizedResult.uri);
          setSourceMeta(normalizedResult.meta);
          if (
            typeof normalizedResult.meta.fileSizeBytes === 'number' &&
            normalizedResult.meta.fileSizeBytes > COMPOSER_MAX_SOURCE_BYTES
          ) {
            const mb = (normalizedResult.meta.fileSizeBytes / (1024 * 1024)).toFixed(1);
            setSourceNormalizationWarning(`Source still heavy (${mb}MB). We will tune this further.`);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setSourceImageUri('');
          setSourceMeta(null);
          const reason = error instanceof Error ? cleanText(error.message) : '';
          setSourceNormalizationWarning(
            reason
              ? `Could not normalize source image: ${reason}`
              : 'Could not normalize source image. Using color + text mode.'
          );
        }
      } finally {
        if (resolvedSourceKey) {
          await AsyncStorage.removeItem(resolvedSourceKey).catch(() => undefined);
        }
      }
    }

    void hydrateSourceUri();

    return () => {
      cancelled = true;
    };
  }, [resolvedSourceKey, resolvedSourceUri]);

  useEffect(() => {
    setPresetKey(frameDefaults.presetKey);
    setPhotoScale(frameDefaults.photoScale);
    setPhotoOffsetY(frameDefaults.photoOffsetY);
  }, [frameDefaults.photoOffsetY, frameDefaults.photoScale, frameDefaults.presetKey]);

  // Shared values for live gesture feedback on source image
  const gBaseScale = useSharedValue(1);
  const gActiveScale = useSharedValue(1);
  const gBaseOffsetPx = useSharedValue(0);
  const gActiveOffsetPx = useSharedValue(0);

  // Keep gesture shared values in sync when buttons reset state
  useEffect(() => {
    gBaseScale.value = photoScale;
    gActiveScale.value = photoScale;
  }, [photoScale]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    gBaseOffsetPx.value = photoOffsetY * FRAME_OFFSET_PX;
    gActiveOffsetPx.value = photoOffsetY * FRAME_OFFSET_PX;
  }, [photoOffsetY]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tBaseX.value = textOffsetX;
    tActiveX.value = textOffsetX;
  }, [textOffsetX]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    tBaseY.value = textOffsetY;
    tActiveY.value = textOffsetY;
  }, [textOffsetY]); // eslint-disable-line react-hooks/exhaustive-deps

  const sourceGestureStyle = useAnimatedStyle(() => ({
    transform: [{ scale: gActiveScale.value }, { translateY: gActiveOffsetPx.value }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    opacity: 0.22 + haloPulse.value * 0.2,
    transform: [{ scale: 1 + haloPulse.value * 0.06 }],
  }));

  const scanlineStyle = useAnimatedStyle(() => ({
    opacity: 0.08 + haloPulse.value * 0.12,
    transform: [{ translateY: -180 + scanProgress.value * 420 }, { rotate: '-7deg' }],
  }));

  const textDragStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tActiveX.value * 68 }, { translateY: tActiveY.value * 86 }],
  }));

  const frameGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        Gesture.Pinch()
          .onUpdate((e) => {
            gActiveScale.value = clamp(gBaseScale.value * e.scale, 1, 1.8);
          })
          .onEnd((e) => {
            const momentumScale = clamp(gActiveScale.value + e.velocity * 0.04, 1, 1.8);
            gActiveScale.value = withTiming(momentumScale, { duration: 180, easing: Easing.out(Easing.cubic) });
            gBaseScale.value = momentumScale;
            runOnJS(setPhotoScale)(Math.round(momentumScale * 100) / 100);
          }),
        Gesture.Pan()
          .minPointers(2)
          .onUpdate((e) => {
            gActiveOffsetPx.value = clamp(gBaseOffsetPx.value + e.translationY, -FRAME_OFFSET_PX, FRAME_OFFSET_PX);
          })
          .onEnd((e) => {
            const momentumOffset = clamp(gActiveOffsetPx.value + e.velocityY * 0.035, -FRAME_OFFSET_PX, FRAME_OFFSET_PX);
            gActiveOffsetPx.value = withTiming(momentumOffset, { duration: 220, easing: Easing.out(Easing.cubic) });
            gBaseOffsetPx.value = momentumOffset;
            runOnJS(setPhotoOffsetY)(Math.round((momentumOffset / FRAME_OFFSET_PX) * 100) / 100);
          }),
      ),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const textGesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(4)
        .maxPointers(1)
        .activateAfterLongPress(90)
        .onUpdate((e) => {
          tActiveX.value = clamp(tBaseX.value + e.translationX / 68, -1, 1);
          tActiveY.value = clamp(tBaseY.value + e.translationY / 86, -1, 1);
        })
        .onEnd(() => {
          const momentumX = clamp(tActiveX.value, -1, 1);
          const momentumY = clamp(tActiveY.value, -1, 1);
          tActiveX.value = withTiming(momentumX, { duration: 150, easing: Easing.out(Easing.cubic) });
          tActiveY.value = withTiming(momentumY, { duration: 150, easing: Easing.out(Easing.cubic) });
          tBaseX.value = momentumX;
          tBaseY.value = momentumY;
          runOnJS(setTextOffsetX)(Math.round(momentumX * 100) / 100);
          runOnJS(setTextOffsetY)(Math.round(momentumY * 100) / 100);
        }),
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    haloPulse.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.cubic) }), -1, true);
    scanProgress.value = withRepeat(withTiming(1, { duration: 3600, easing: Easing.inOut(Easing.quad) }), -1, false);
  }, [haloPulse, scanProgress]);

  const selectedPreset = useMemo(() => PRESETS.find((preset) => preset.key === presetKey) || PRESETS[1], [presetKey]);
  const textOverlayPlacement = useMemo(() => {
    if (selectedPreset.width >= selectedPreset.height) {
      return { bottom: '11%' as const };
    }

    if (selectedPreset.width === selectedPreset.height) {
      return { bottom: '13%' as const };
    }

    return { bottom: '15%' as const };
  }, [selectedPreset.height, selectedPreset.width]);

  const hasUnsavedChanges = useMemo(() => {
    return (
      presetKey !== frameDefaults.presetKey ||
      bgA !== (seededLook?.bgA || '#FBCFE8') ||
      bgB !== (seededLook?.bgB || '#BFDBFE') ||
      showTextOverlay !== defaultShowTextOverlay ||
      showTitle !== true ||
      showSubtitle !== true ||
      textStyleKey !== 'impact' ||
      textOffsetX !== 0 ||
      textOffsetY !== 0 ||
      title !== defaultTitle ||
      subtitle !== defaultSubtitle ||
      altText !== defaultAltText ||
      applyTextClarityWash !== true ||
      textClarityWashOpacity !== DEFAULT_TEXT_CLARITY_WASH_OPACITY ||
      (hasSourceImage && (photoScale !== frameDefaults.photoScale || photoOffsetY !== frameDefaults.photoOffsetY))
    );
  }, [
    altText,
    applyTextClarityWash,
    bgA,
    bgB,
    defaultAltText,
    defaultShowTextOverlay,
    defaultSubtitle,
    defaultTitle,
    seededLook?.bgA,
    seededLook?.bgB,
    hasSourceImage,
    frameDefaults.photoOffsetY,
    frameDefaults.photoScale,
    frameDefaults.presetKey,
    photoOffsetY,
    photoScale,
    presetKey,
    showTextOverlay,
    showTitle,
    showSubtitle,
    subtitle,
    textOffsetX,
    textOffsetY,
    textClarityWashOpacity,
    textStyleKey,
    title,
  ]);

  usePreventRemove(hasUnsavedChanges, (event) => {
    if (suppressPreventRemoveRef.current) {
      suppressPreventRemoveRef.current = false;
      navigation.dispatch(event.data.action);
      return;
    }

    Alert.alert('Return to Media Studio?', 'Save and replace this slot preview now, or discard these composer edits.', [
      { text: 'Stay Here', style: 'cancel' },
      {
        text: 'Apply & Return',
        onPress: () => {
          void applyToMediaStudio();
        },
      },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(event.data.action),
      },
    ]);
  });

  const applyToMediaStudio = useCallback(async () => {
    if (!compositionRef.current) {
      Alert.alert('Could not apply', 'Canvas not ready. Try again in a moment.');
      return;
    }
    const key = `markket-media-composer-draft:${Date.now()}`;
    const derivedAltText = altText.trim() || `${title} ${subtitle}`.trim() || getSourceBaseName(sourceImageUri) || 'composer image';
    const exportSettings = COMPOSER_EXPORT_SETTINGS[resolvedSlot];
    try {
      const pngUri = await captureViewRef(compositionRef, {
        format: 'png',
        quality: 1,
        width: selectedPreset.width,
        height: selectedPreset.height,
      });

      let compressed = await ImageManipulator.manipulateAsync(
        pngUri,
        [{ resize: { width: selectedPreset.width, height: selectedPreset.height } }],
        {
          compress: exportSettings.compress,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );

      const compressedInfo = new FileSystem.File(compressed.uri).info();
      const compressedSize = typeof compressedInfo.size === 'number' ? compressedInfo.size : undefined;

      if (typeof compressedSize === 'number' && compressedSize > exportSettings.maxBytes) {
        compressed = await ImageManipulator.manipulateAsync(
          compressed.uri,
          [{ resize: { width: selectedPreset.width, height: selectedPreset.height } }],
          {
            compress: exportSettings.fallbackCompress,
            format: ImageManipulator.SaveFormat.JPEG,
          }
        );
      }

      try {
        const tempPng = new FileSystem.File(pngUri);
        tempPng.delete();
      } catch {
        // Ignore temp cleanup failures.
      }

      const payload = {
        key: `composer-${Date.now()}`,
        uri: compressed.uri,
        width: selectedPreset.width,
        height: selectedPreset.height,
        fileName: `composer-${selectedPreset.key}.jpg`,
        mime: 'image/jpeg',
        altText: derivedAltText,
        sourceLabel: 'composer',
        colorSeed: normalizeHexColor(bgA),
      };
      await AsyncStorage.setItem(key, JSON.stringify(payload));
      suppressPreventRemoveRef.current = true;
      router.replace({
        pathname: '/store/[storeSlug]/media',
        params: { storeSlug: resolvedStoreSlug, draftKey: key, draftSlot: resolvedSlot },
      } as never);
    } catch (err) {
      Alert.alert('Could not apply', err instanceof Error ? err.message : 'Try again in a moment.');
    }
  }, [altText, bgA, compositionRef, resolvedSlot, resolvedStoreSlug, router, selectedPreset.key, selectedPreset.height, selectedPreset.width, sourceImageUri, subtitle, title]);

  const resetDraft = useCallback(() => {
    setPresetKey(frameDefaults.presetKey);
    setBgA(seededLook?.bgA || '#FBCFE8');
    setBgB(seededLook?.bgB || '#BFDBFE');
    setShowTextOverlay(defaultShowTextOverlay);
    setShowTitle(true);
    setShowSubtitle(true);
    setTitle(defaultTitle);
    setSubtitle(defaultSubtitle);
    setAltText(defaultAltText);
    setPhotoScale(frameDefaults.photoScale);
    setPhotoOffsetY(frameDefaults.photoOffsetY);
    setApplyTextClarityWash(true);
    setTextClarityWashOpacity(DEFAULT_TEXT_CLARITY_WASH_OPACITY);
    setTextStyleKey('impact');
    setTextOffsetX(0);
    setTextOffsetY(0);
    setActivePanel('none');
  }, [defaultAltText, defaultShowTextOverlay, defaultSubtitle, defaultTitle, frameDefaults.photoOffsetY, frameDefaults.photoScale, frameDefaults.presetKey, seededLook?.bgA, seededLook?.bgB]);

  const confirmDiscardDraft = useCallback(() => {
    Alert.alert('Reset this draft?', 'This will clear your current composer edits and keep you in Composer.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Reset Draft',
        style: 'destructive',
        onPress: resetDraft,
      },
    ]);
  }, [resetDraft]);

  const togglePanel = useCallback((panel: ToolPanel) => {
    setActivePanel((prev) => (prev === panel ? 'none' : panel));
  }, []);

  const supportsText = resolvedSlot === 'seoSocial' || resolvedSlot === 'slides';

  const canvasHint = supportsText && showTextOverlay
    ? 'Hold + drag to move the text block.'
    : supportsText
      ? 'Text is off. Use the Text panel to toggle it on.'
      : '';

  return (
    <ThemedView style={styles.flex}>
      <View style={[styles.screenShell, { paddingTop: 24 }]}>
        <ScrollView
          style={styles.mainScroll}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: insets.bottom + 150 }]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          alwaysBounceVertical
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <View style={styles.headingWrap}>
              <ThemedText style={styles.title}>Composer</ThemedText>
              <ThemedText style={styles.subtitle}>Adjust text and image, then apply this PNG draft back to Media Studio.</ThemedText>
            </View>
            <View style={styles.headerActionRow}>
              {hasUnsavedChanges ? (
                <Pressable style={styles.headerResetButton} onPress={confirmDiscardDraft}>
                  <ThemedText style={styles.headerResetButtonText}>Reset</ThemedText>
                </Pressable>
              ) : null}
              <Pressable style={styles.headerSaveButton} onPress={() => void applyToMediaStudio()}>
                <ThemedText style={styles.headerSaveButtonText}>Back to Studio</ThemedText>
              </Pressable>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaPill}>
              <ThemedText style={styles.metaPillText}>{selectedPreset.label}</ThemedText>
            </View>
            <View style={styles.metaPill}>
              <ThemedText style={styles.metaPillText}>{modeLabel}</ThemedText>
            </View>
            {sourceMeta?.width && sourceMeta?.height ? (
              <View style={styles.metaPill}>
                <ThemedText style={styles.metaPillText}>
                  {sourceMeta.width}x{sourceMeta.height}
                </ThemedText>
              </View>
            ) : null}
          </View>

          {sourceNormalizationWarning ? (
            <View style={styles.normalizationWarningPill}>
              <ThemedText style={styles.normalizationWarningText}>{sourceNormalizationWarning}</ThemedText>
            </View>
          ) : null}

          <Animated.View entering={FadeInDown.duration(260).delay(20)} style={styles.canvasStage}>
            <View style={{ width: '100%', aspectRatio: selectedPreset.width / selectedPreset.height }}>
              <View style={styles.canvasCard} renderToHardwareTextureAndroid shouldRasterizeIOS>
                {/* ── composition layers (captured as PNG) ── */}
                <View ref={compositionRef} style={StyleSheet.absoluteFill} collapsable={false}>
                  {/* gradient background */}
                  <Svg style={StyleSheet.absoluteFill}>
                    <Defs>
                      <SvgLinearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                        <Stop offset="0" stopColor={bgA} stopOpacity="1" />
                        <Stop offset="1" stopColor={bgB} stopOpacity="1" />
                      </SvgLinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
                  </Svg>
                  {/* source photo */}
                  {canUseImageComposition ? (
                    <GestureDetector gesture={frameGesture}>
                      <Animated.View style={[StyleSheet.absoluteFill, sourceGestureStyle]}>
                        <Image source={{ uri: sourceImageUri }} style={styles.previewFill} contentFit="cover" />
                      </Animated.View>
                    </GestureDetector>
                  ) : null}
                  {/* clarity wash */}
                  {applyTextClarityWash && hasSourceImage && supportsText ? (
                    <View style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(255,255,255,${Math.min(0.55, textClarityWashOpacity * 6)})` }]} pointerEvents="none" />
                  ) : null}
                  {/* text overlay */}
                  {supportsText && showTextOverlay ? (
                    <GestureDetector gesture={textGesture}>
                      <Animated.View style={[styles.textOverlayBlock, textOverlayPlacement, textDragStyle]}>
                        <View style={styles.textOverlayBacking} pointerEvents="none" />
                        {showTitle && title ? (
                          <Text style={[styles.composerTitleText, textStyleKey === 'elegant' && styles.composerTitleElegant, textStyleKey === 'mono' && styles.composerTitleMono]}>{title}</Text>
                        ) : null}
                        {showSubtitle && subtitle ? (
                          <Text style={[styles.composerSubtitleText, textStyleKey === 'elegant' && styles.composerSubtitleElegant, textStyleKey === 'mono' && styles.composerSubtitleMono]}>{subtitle}</Text>
                        ) : null}
                        <ThemedText style={styles.dragHint}>Hold + drag to reposition</ThemedText>
                      </Animated.View>
                    </GestureDetector>
                  ) : null}
                </View>
                {/* ── UI chrome (NOT captured) ── */}
                <Animated.View pointerEvents="none" style={[styles.canvasHalo, haloStyle]} />
                <Animated.View pointerEvents="none" style={[styles.canvasScanline, scanlineStyle]} />
                {!hasSourceImage && resolvedMode !== 'from-scratch' ? (
                  <View style={styles.canvasSourceMissingPill}>
                    <ThemedText style={styles.canvasSourceMissingText}>Source image unavailable, using gradient + text only.</ThemedText>
                  </View>
                ) : null}

                <View style={styles.previewTopRail}>
                  <View style={styles.previewFormatRow}>
                    {PRESETS.map((preset) => {
                      const active = preset.key === presetKey;
                      return (
                        <Pressable
                          key={preset.key}
                          style={[styles.previewChip, active && styles.previewChipActive]}
                          onPress={() => setPresetKey(preset.key)}>
                          <ThemedText style={[styles.previewChipText, active && styles.previewChipTextActive]}>{preset.key}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                {supportsText ? (
                  <View style={styles.previewOverlay}>
                    <ThemedText style={styles.previewOverlayText}>{canvasHint}</ThemedText>
                  </View>
                ) : null}
              </View>
            </View>
          </Animated.View>
        </ScrollView>

        <Animated.View pointerEvents="box-none" entering={FadeIn.duration(260).delay(120)} style={styles.floatingRail} renderToHardwareTextureAndroid shouldRasterizeIOS>
          <Pressable style={[styles.toolFab, activePanel === 'look' && styles.toolFabActive]} onPress={() => togglePanel('look')}>
            <MaterialIcons name="palette" size={18} color="#ECFEFF" />
            <ThemedText style={styles.toolFabText}>Color</ThemedText>
            {activePanel === 'look' ? <View style={styles.toolFabDot} /> : null}
          </Pressable>
          {supportsText ? (
            <Pressable style={[styles.toolFab, activePanel === 'text' && styles.toolFabActive]} onPress={() => togglePanel('text')}>
              <MaterialIcons name="text-fields" size={18} color="#ECFEFF" />
              <ThemedText style={styles.toolFabText}>Text</ThemedText>
              {activePanel === 'text' ? <View style={styles.toolFabDot} /> : null}
            </Pressable>
          ) : null}
          <Pressable style={[styles.toolFab, activePanel === 'details' && styles.toolFabActive]} onPress={() => togglePanel('details')}>
            <MaterialIcons name="accessibility-new" size={18} color="#ECFEFF" />
            <ThemedText style={styles.toolFabText}>Alt</ThemedText>
            {activePanel === 'details' ? <View style={styles.toolFabDot} /> : null}
          </Pressable>
          <Pressable style={[styles.toolFab, activePanel === 'frame' && styles.toolFabActive]} onPress={() => togglePanel('frame')}>
            <MaterialIcons name="crop" size={18} color="#ECFEFF" />
            <ThemedText style={styles.toolFabText}>Frame</ThemedText>
            {activePanel === 'frame' ? <View style={styles.toolFabDot} /> : null}
          </Pressable>
          <Pressable style={[styles.toolFab, activePanel === 'format' && styles.toolFabActive]} onPress={() => togglePanel('format')}>
            <MaterialIcons name="aspect-ratio" size={18} color="#ECFEFF" />
            <ThemedText style={styles.toolFabText}>Size</ThemedText>
            {activePanel === 'format' ? <View style={styles.toolFabDot} /> : null}
          </Pressable>
        </Animated.View>

        {activePanel !== 'none' ? (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutDown.duration(180)} style={[styles.panelSheet, { bottom: insets.bottom + 86 }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.panelContent}>
              {activePanel === 'format' ? (
                <>
                  <ThemedText type="defaultSemiBold">Canvas Size</ThemedText>
                  <View style={styles.rowWrap}>
                    {PRESETS.map((preset) => {
                      const active = preset.key === presetKey;
                      return (
                        <Pressable key={`sheet-${preset.key}`} style={[styles.pill, active && styles.pillActive]} onPress={() => setPresetKey(preset.key)}>
                          <ThemedText style={[styles.pillText, active && styles.pillTextActive]}>{preset.label}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                </>
              ) : null}

              {activePanel === 'look' ? (
                <>
                  <ThemedText type="defaultSemiBold">Color Looks</ThemedText>
                  {hasSourceImage ? (
                    <View style={styles.suggestionGroup}>
                      <ThemedText style={styles.suggestionLabel}>Image / text clarity</ThemedText>
                      <View style={styles.rowWrap}>
                        <Pressable
                          style={[styles.pill, applyTextClarityWash && styles.pillActive]}
                          onPress={() => setApplyTextClarityWash((prev) => !prev)}>
                          <ThemedText style={[styles.pillText, applyTextClarityWash && styles.pillTextActive]}>
                            {applyTextClarityWash ? 'Wash On' : 'Wash Off'}
                          </ThemedText>
                        </Pressable>
                        <Pressable
                          style={styles.pill}
                          onPress={() => setTextClarityWashOpacity((prev) => clamp(prev - 0.08, 0, 0.75))}>
                          <ThemedText style={styles.pillText}>Wash -</ThemedText>
                        </Pressable>
                        <Pressable
                          style={styles.pill}
                          onPress={() => setTextClarityWashOpacity((prev) => clamp(prev + 0.08, 0, 0.75))}>
                          <ThemedText style={styles.pillText}>Wash +</ThemedText>
                        </Pressable>
                        <Pressable style={styles.pill} onPress={() => setTextClarityWashOpacity(DEFAULT_TEXT_CLARITY_WASH_OPACITY)}>
                          <ThemedText style={styles.pillText}>Reset Wash</ThemedText>
                        </Pressable>
                      </View>
                      <ThemedText style={styles.info}>Wash strength: {textClarityWashOpacity.toFixed(2)}</ThemedText>
                    </View>
                  ) : null}
                  {autoLooks.length ? (
                    <View style={styles.suggestionGroup}>
                      <ThemedText style={styles.suggestionLabel}>Auto from image</ThemedText>
                      <View style={styles.rowWrap}>
                        {autoLooks.map((look) => {
                          const active = bgA === look.bgA && bgB === look.bgB;
                          return (
                            <Pressable
                              key={`auto-${look.label}`}
                              style={[styles.pill, active && styles.pillActive]}
                              onPress={() => {
                                setBgA(look.bgA);
                                setBgB(look.bgB);
                              }}>
                              <ThemedText style={[styles.pillText, active && styles.pillTextActive]}>{look.label}</ThemedText>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>
                  ) : null}
                  <View style={styles.suggestionGroup}>
                    <ThemedText style={styles.suggestionLabel}>Quick looks</ThemedText>
                    <View style={styles.rowWrap}>
                      {QUICK_LOOKS.map((look) => {
                        const active = bgA === look.bgA && bgB === look.bgB;
                        return (
                          <Pressable
                            key={`quick-${look.label}`}
                            style={[styles.pill, active && styles.pillActive]}
                            onPress={() => {
                              setBgA(look.bgA);
                              setBgB(look.bgB);
                            }}>
                            <ThemedText style={[styles.pillText, active && styles.pillTextActive]}>{look.label}</ThemedText>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                  <ThemedText style={styles.info}>Color A</ThemedText>
                  <View style={styles.rowWrap}>
                    {COLOR_SWATCHES.map((color) => (
                      <Pressable key={`a-${color}`} style={[styles.swatch, { backgroundColor: color }, bgA === color && styles.swatchActive]} onPress={() => setBgA(color)} />
                    ))}
                  </View>
                  <ThemedText style={styles.info}>Color B</ThemedText>
                  <View style={styles.rowWrap}>
                    {COLOR_SWATCHES.map((color) => (
                      <Pressable key={`b-${color}`} style={[styles.swatch, { backgroundColor: color }, bgB === color && styles.swatchActive]} onPress={() => setBgB(color)} />
                    ))}
                  </View>
                </>
              ) : null}

              {activePanel === 'text' ? (
                <>
                  <ThemedText type="defaultSemiBold">Text</ThemedText>
                  <View style={styles.rowWrap}>
                    <Pressable
                      style={[styles.pill, showTextOverlay && styles.pillActive]}
                      onPress={() => setShowTextOverlay((p) => !p)}>
                      <ThemedText style={[styles.pillText, showTextOverlay && styles.pillTextActive]}>
                        {showTextOverlay ? 'Text On' : 'Text Off'}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={[styles.pill, showTextOverlay && showTitle && styles.pillActive]}
                      onPress={() => setShowTitle((p) => !p)}>
                      <ThemedText style={[styles.pillText, showTextOverlay && showTitle && styles.pillTextActive]}>
                        {showTitle ? 'Title On' : 'Title Off'}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={[styles.pill, showTextOverlay && showSubtitle && styles.pillActive]}
                      onPress={() => setShowSubtitle((p) => !p)}>
                      <ThemedText style={[styles.pillText, showTextOverlay && showSubtitle && styles.pillTextActive]}>
                        {showSubtitle ? 'Subtitle On' : 'Subtitle Off'}
                      </ThemedText>
                    </Pressable>
                    <Pressable
                      style={styles.pill}
                      onPress={() => { setTextOffsetX(0); setTextOffsetY(0); }}>
                      <ThemedText style={styles.pillText}>Center</ThemedText>
                    </Pressable>
                  </View>
                  {showTextOverlay && showTitle ? (
                    <TextInput
                      ref={titleInputRef}
                      value={title}
                      onChangeText={setTitle}
                      placeholder={titlePlaceholder}
                      placeholderTextColor="rgba(226,232,240,0.55)"
                      returnKeyType="next"
                      onSubmitEditing={() => subtitleInputRef.current?.focus()}
                      style={styles.onCanvasTitleInput}
                    />
                  ) : null}
                  {showTextOverlay && showSubtitle ? (
                    <TextInput
                      ref={subtitleInputRef}
                      value={subtitle}
                      onChangeText={setSubtitle}
                      placeholder={subtitlePlaceholder}
                      placeholderTextColor="rgba(226,232,240,0.5)"
                      returnKeyType="done"
                      style={styles.onCanvasSubtitleInput}
                    />
                  ) : null}
                  <View style={styles.rowWrap}>
                    {TEXT_STYLES.map((textStyle) => {
                      const active = textStyleKey === textStyle.key;
                      return (
                        <Pressable key={textStyle.key} style={[styles.pill, active && styles.pillActive]} onPress={() => setTextStyleKey(textStyle.key)}>
                          <ThemedText style={[styles.pillText, active && styles.pillTextActive]}>{textStyle.label}</ThemedText>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.suggestionGroup}>
                    <ThemedText style={styles.suggestionLabel}>Headline ideas</ThemedText>
                    <View style={styles.rowWrap}>
                      {QUICK_HEADLINES.map((idea) => (
                        <Pressable key={`h-${idea}`} style={styles.pill} onPress={() => setTitle(idea)}>
                          <ThemedText style={styles.pillText}>{idea}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                  <View style={styles.suggestionGroup}>
                    <ThemedText style={styles.suggestionLabel}>Support lines</ThemedText>
                    <View style={styles.rowWrap}>
                      {QUICK_SUBTITLES.map((idea) => (
                        <Pressable key={`s-${idea}`} style={styles.pill} onPress={() => setSubtitle(idea)}>
                          <ThemedText style={styles.pillText}>{idea}</ThemedText>
                        </Pressable>
                      ))}
                    </View>
                  </View>
                </>
              ) : null}

              {activePanel === 'details' ? (
                <>
                  <ThemedText type="defaultSemiBold">Accessibility</ThemedText>
                  <ThemedText style={styles.info}>Alt text stays separate from headline/subtitle so the editing flow is cleaner.</ThemedText>
                  <Input
                    value={altText}
                    onChangeText={setAltText}
                    placeholder="Describe the image for accessibility"
                    autoCapitalize="sentences"
                    autoCorrect
                  />
                </>
              ) : null}

              {activePanel === 'frame' ? (
                <>
                  <ThemedText type="defaultSemiBold">Frame Controls</ThemedText>
                  {canUseImageComposition ? (
                    <>
                      <ThemedText style={styles.info}>Image is full-bleed by default. Pinch to set crop factor and two-finger drag to reframe.</ThemedText>
                      <ThemedText style={styles.info}>Crop factor: {photoScale.toFixed(2)}x</ThemedText>
                      <View style={styles.rowWrap}>
                        <Pressable style={styles.pill} onPress={() => setPhotoScale((prev) => clamp(prev - 0.1, 1, 2.4))}>
                          <ThemedText style={styles.pillText}>Crop -</ThemedText>
                        </Pressable>
                        <Pressable style={styles.pill} onPress={() => setPhotoScale((prev) => clamp(prev + 0.1, 1, 2.4))}>
                          <ThemedText style={styles.pillText}>Crop +</ThemedText>
                        </Pressable>
                        <Pressable style={styles.pill} onPress={() => setPhotoScale(frameDefaults.photoScale)}>
                          <ThemedText style={styles.pillText}>Reset Crop</ThemedText>
                        </Pressable>
                      </View>
                      <ThemedText style={styles.info}>Vertical Shift: {photoOffsetY.toFixed(2)}</ThemedText>
                      <View style={styles.rowWrap}>
                        <Pressable style={styles.pill} onPress={() => setPhotoOffsetY((prev) => clamp(prev - 0.15, -1, 1))}>
                          <ThemedText style={styles.pillText}>Move Up</ThemedText>
                        </Pressable>
                        <Pressable style={styles.pill} onPress={() => setPhotoOffsetY((prev) => clamp(prev + 0.15, -1, 1))}>
                          <ThemedText style={styles.pillText}>Move Down</ThemedText>
                        </Pressable>
                        <Pressable style={styles.pill} onPress={() => setPhotoOffsetY(0)}>
                          <ThemedText style={styles.pillText}>Reset Position</ThemedText>
                        </Pressable>
                      </View>
                    </>
                  ) : (
                    <ThemedText style={styles.info}>Image composition is paused for now. TODO: restore this panel after image-sizing fixes.</ThemedText>
                  )}
                </>
              ) : null}
            </ScrollView>
          </Animated.View>
        ) : null}

        <Animated.View entering={FadeInDown.duration(220)} style={[styles.unsavedDock, { paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.dockTopRow}>
            <View style={styles.dockDot} />
            <ThemedText style={styles.dockLabel}>{hasUnsavedChanges ? 'Changes ready' : 'Default ready'}</ThemedText>
            <View style={styles.dockDot} />
          </View>
          <View style={styles.dockActionRow}>
            {hasUnsavedChanges ? (
              <Pressable style={styles.dockDiscardButton} onPress={confirmDiscardDraft}>
                <ThemedText style={styles.dockDiscardButtonText}>Reset</ThemedText>
              </Pressable>
            ) : null}
            <Pressable style={styles.dockSaveButton} onPress={() => void applyToMediaStudio()}>
              <ThemedText style={styles.dockSaveButtonText}>{hasUnsavedChanges ? 'Apply' : 'Save Default'}</ThemedText>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  screenShell: {
    flex: 1,
    paddingHorizontal: 12,
    backgroundColor: '#030712',
  },
  mainScroll: {
    flex: 1,
  },
  mainScrollContent: {
    gap: 10,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  headingWrap: { flex: 1, gap: 4 },
  title: { fontSize: 25, lineHeight: 29, fontFamily: 'GilroyBlack', letterSpacing: 0.2, color: '#F8FAFC' },
  subtitle: { fontSize: 12, lineHeight: 18, opacity: 0.86, fontFamily: 'Manrope', color: '#CBD5E1' },
  headerActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerSaveButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.66)',
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerSaveButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F0FDFA',
    fontFamily: 'SpaceGrotesk',
    letterSpacing: 0.12,
  },
  headerResetButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(153,27,27,0.45)',
    backgroundColor: 'rgba(69,10,10,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerResetButtonText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FCA5A5',
    fontFamily: 'SpaceGrotesk',
    letterSpacing: 0.12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.32)',
    backgroundColor: 'rgba(15,23,42,0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaPillText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.25,
    color: '#5EEAD4',
    fontFamily: 'RobotoMono',
  },
  normalizationWarningPill: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(69,10,10,0.58)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  normalizationWarningText: {
    color: '#FCA5A5',
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Manrope',
  },
  canvasStage: {
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 2,
    paddingBottom: 8,
  },
  canvasCard: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#020617',
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.28)',
  },
  canvasHalo: {
    position: 'absolute',
    width: '130%',
    height: '130%',
    left: '-15%',
    top: '-15%',
    borderRadius: 999,
    backgroundColor: 'rgba(20,184,166,0.18)',
    zIndex: 1,
  },
  canvasScanline: {
    position: 'absolute',
    left: '-20%',
    right: '-20%',
    height: 120,
    backgroundColor: 'rgba(56,189,248,0.3)',
    zIndex: 2,
  },
  panelSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.45)',
    backgroundColor: 'rgba(2,6,23,0.94)',
    maxHeight: 300,
  },
  panelContent: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  previewFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOverlay: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.35)',
    backgroundColor: 'rgba(2,6,23,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  previewOverlayText: { color: '#CCFBF1', fontSize: 11, fontWeight: '700' },
  canvasSourceMissingPill: {
    position: 'absolute',
    top: 46,
    left: 12,
    right: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.5)',
    backgroundColor: 'rgba(69,10,10,0.66)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  canvasSourceMissingText: {
    color: '#FCA5A5',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Manrope',
  },
  previewTopRail: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  previewFormatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  previewChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(94,234,212,0.3)',
    backgroundColor: 'rgba(2,6,23,0.64)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    minHeight: 28,
    justifyContent: 'center',
  },
  previewChipActive: {
    borderColor: 'rgba(45,212,191,0.95)',
    backgroundColor: 'rgba(15,118,110,0.95)',
  },
  previewChipText: {
    color: '#E2E8F0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
    fontFamily: 'RobotoMono',
    textTransform: 'uppercase',
  },
  previewChipTextActive: {
    color: '#F0FDFA',
  },
  onCanvasEditor: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 56,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.45)',
    backgroundColor: 'rgba(2,6,23,0.6)',
    padding: 10,
    gap: 8,
  },
  dragHint: {
    fontSize: 11,
    lineHeight: 14,
    color: '#99F6E4',
    opacity: 0.9,
    fontFamily: 'RobotoMono',
  },
  textOverlayBlock: {
    position: 'absolute',
    left: '7%',
    width: '86%',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 18,
    overflow: 'hidden',
    gap: 4,
  },
  textOverlayBacking: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.28)',
  },
  composerTitleText: {
    color: '#F8FAFC',
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
    fontFamily: 'SpaceGrotesk',
  },
  composerSubtitleText: {
    color: '#E2E8F0',
    fontSize: 16,
    lineHeight: 21,
    fontFamily: 'SpaceGrotesk',
    opacity: 0.98,
  },
  composerTitleElegant: {
    fontFamily: 'Lora',
    fontWeight: '700',
  },
  composerSubtitleElegant: {
    fontFamily: 'Lora',
  },
  composerTitleMono: {
    fontFamily: 'RobotoMono',
    fontWeight: '700',
  },
  composerSubtitleMono: {
    fontFamily: 'RobotoMono',
  },
  onCanvasTitleInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.45)',
    backgroundColor: 'rgba(15,23,42,0.64)',
    color: '#F8FAFC',
    fontFamily: 'GilroyBlack',
    fontSize: 20,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  onCanvasSubtitleInput: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.4)',
    backgroundColor: 'rgba(15,23,42,0.52)',
    color: '#E2E8F0',
    fontFamily: 'Manrope',
    fontSize: 15,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  floatingRail: {
    position: 'absolute',
    left: 14,
    top: '40%',
    gap: 6,
  },
  toolFab: {
    width: 48,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(125,211,252,0.4)',
    backgroundColor: 'rgba(2,6,23,0.78)',
    paddingHorizontal: 6,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  toolFabActive: {
    borderColor: 'rgba(45,212,191,0.95)',
    backgroundColor: 'rgba(13,148,136,0.95)',
  },
  toolFabText: {
    fontSize: 9,
    fontFamily: 'SpaceGrotesk',
    fontWeight: '700',
    color: '#ECFEFF',
    letterSpacing: 0.1,
  },
  toolFabDot: {
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#CCFBF1',
  },
  suggestionGroup: {
    gap: 8,
  },
  suggestionLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'RobotoMono',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: '#93C5FD',
    opacity: 0.86,
  },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(56,189,248,0.36)',
    backgroundColor: 'rgba(15,23,42,0.84)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    justifyContent: 'center',
  },
  pillActive: {
    borderColor: 'rgba(45,212,191,1)',
    backgroundColor: 'rgba(13,148,136,0.96)',
  },
  pillText: { fontSize: 11, fontWeight: '700', color: '#BAE6FD', fontFamily: 'SpaceGrotesk' },
  pillTextActive: { color: '#ECFEFF' },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  swatchActive: {
    borderColor: '#F8FAFC',
  },
  info: { fontSize: 12, lineHeight: 18, opacity: 0.9, fontFamily: 'Manrope', color: '#CBD5E1' },
  unsavedDock: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 24,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.45)',
    backgroundColor: 'rgba(2,6,23,0.95)',
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 12,
    shadowColor: '#14B8A6',
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
    backgroundColor: '#14B8A6',
    opacity: 0.7,
  },
  dockLabel: {
    fontSize: 12,
    lineHeight: 16,
    color: '#CCFBF1',
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
    borderColor: 'rgba(153,27,27,0.6)',
    backgroundColor: 'rgba(69,10,10,0.64)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockDiscardButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FCA5A5',
    fontFamily: 'SpaceGrotesk',
  },
  dockSaveButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(45,212,191,0.88)',
    backgroundColor: '#0F766E',
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dockSaveButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F0FDFA',
    fontFamily: 'SpaceGrotesk',
    letterSpacing: 0.15,
  },
});
