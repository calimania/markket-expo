import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePreventRemove } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type ComposerMode = 'from-scratch' | 'from-photo' | 'edit-existing';
type MediaSlot = 'cover' | 'seoSocial' | 'logo' | 'slides';
type PresetKey = 'story' | 'feed' | 'link' | 'cover';

type Preset = {
  key: PresetKey;
  label: string;
  width: number;
  height: number;
};

const PRESETS: Preset[] = [
  { key: 'story', label: 'Story 1080x1920', width: 1080, height: 1920 },
  { key: 'feed', label: 'Feed 1080x1350', width: 1080, height: 1350 },
  { key: 'link', label: 'Link 1200x630', width: 1200, height: 630 },
  { key: 'cover', label: 'Cover 1600x900', width: 1600, height: 900 },
];

const COLOR_SWATCHES = ['#0EA5E9', '#F59E0B', '#D946EF', '#10B981', '#0F172A', '#E2E8F0'];

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function parseMode(value: string): ComposerMode {
  if (value === 'from-photo' || value === 'edit-existing') return value;
  return 'from-scratch';
}

function parseSlot(value: string): MediaSlot {
  if (value === 'seoSocial' || value === 'logo' || value === 'slides') return value;
  return 'cover';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildComposerSvgDataUri(options: {
  width: number;
  height: number;
  mode: ComposerMode;
  sourceUri?: string;
  bgA: string;
  bgB: string;
  title: string;
  subtitle: string;
}): string {
  const {
    width,
    height,
    mode,
    sourceUri,
    bgA,
    bgB,
    title,
    subtitle,
  } = options;

  const escapedTitle = escapeXml(title || 'Your Title');
  const escapedSubtitle = escapeXml(subtitle || 'Your subtitle goes here');
  const hasPhoto = (mode === 'from-photo' || mode === 'edit-existing') && sourceUri;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bgA}" />
      <stop offset="100%" stop-color="${bgB}" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)" />
  ${hasPhoto ? `<image href="${escapeXml(sourceUri)}" x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.08)}" width="${Math.round(width * 0.86)}" height="${Math.round(height * 0.56)}" preserveAspectRatio="xMidYMid slice" />` : ''}
  <rect x="${Math.round(width * 0.07)}" y="${Math.round(height * 0.68)}" rx="${Math.round(width * 0.025)}" ry="${Math.round(width * 0.025)}" width="${Math.round(width * 0.86)}" height="${Math.round(height * 0.24)}" fill="rgba(15,23,42,0.52)" />
  <text x="${Math.round(width * 0.11)}" y="${Math.round(height * 0.77)}" fill="#F8FAFC" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.06)}" font-weight="700">${escapedTitle}</text>
  <text x="${Math.round(width * 0.11)}" y="${Math.round(height * 0.85)}" fill="#E2E8F0" font-family="Arial, sans-serif" font-size="${Math.round(width * 0.036)}">${escapedSubtitle}</text>
</svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export default function StoreComposerScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { storeSlug, slot, mode, sourceUri } = useLocalSearchParams<{
    storeSlug?: string | string[];
    slot?: string | string[];
    mode?: string | string[];
    sourceUri?: string | string[];
  }>();

  const resolvedStoreSlug = normalizeParam(storeSlug).trim();
  const resolvedSlot = parseSlot(normalizeParam(slot).trim());
  const resolvedMode = parseMode(normalizeParam(mode).trim());
  const resolvedSourceUri = normalizeParam(sourceUri).trim();

  const [presetKey, setPresetKey] = useState<PresetKey>('feed');
  const [bgA, setBgA] = useState('#0EA5E9');
  const [bgB, setBgB] = useState('#0F172A');
  const [title, setTitle] = useState('New Drop');
  const [subtitle, setSubtitle] = useState('Tonight at 8PM');

  const selectedPreset = useMemo(() => PRESETS.find((preset) => preset.key === presetKey) || PRESETS[1], [presetKey]);
  const previewUri = useMemo(
    () =>
      buildComposerSvgDataUri({
        width: selectedPreset.width,
        height: selectedPreset.height,
        mode: resolvedMode,
        sourceUri: resolvedSourceUri,
        bgA,
        bgB,
        title,
        subtitle,
      }),
    [bgA, bgB, resolvedMode, resolvedSourceUri, selectedPreset.height, selectedPreset.width, subtitle, title]
  );

  const hasUnsavedChanges = useMemo(() => {
    return (
      presetKey !== 'feed' ||
      bgA !== '#0EA5E9' ||
      bgB !== '#0F172A' ||
      title !== 'New Drop' ||
      subtitle !== 'Tonight at 8PM'
    );
  }, [bgA, bgB, presetKey, subtitle, title]);

  const confirmDiscard = useCallback(
    (onConfirm: () => void) => {
      if (!hasUnsavedChanges) {
        onConfirm();
        return;
      }

      Alert.alert('Discard composer draft?', 'You have unsaved edits in the composer.', [
        { text: 'Keep Editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: onConfirm },
      ]);
    },
    [hasUnsavedChanges]
  );

  usePreventRemove(hasUnsavedChanges, (event) => {
    Alert.alert('Discard composer draft?', 'You have unsaved edits in the composer.', [
      { text: 'Keep Editing', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => navigation.dispatch(event.data.action),
      },
    ]);
  });

  const applyToMediaStudio = useCallback(async () => {
    const key = `markket-media-composer-draft:${Date.now()}`;
    const payload = {
      key: `composer-${Date.now()}`,
      uri: previewUri,
      width: selectedPreset.width,
      height: selectedPreset.height,
      fileName: `composer-${selectedPreset.key}.svg`,
      mime: 'image/svg+xml',
      altText: `${title} ${subtitle}`.trim(),
      sourceLabel: 'composer',
    };

    try {
      await AsyncStorage.setItem(key, JSON.stringify(payload));
      router.replace({
        pathname: '/store/[storeSlug]/media',
        params: { storeSlug: resolvedStoreSlug, draftKey: key, draftSlot: resolvedSlot },
      } as never);
    } catch {
      Alert.alert('Could not apply', 'Try again in a moment.');
    }
  }, [previewUri, resolvedSlot, resolvedStoreSlug, router, selectedPreset.key, selectedPreset.height, selectedPreset.width, subtitle, title]);

  return (
    <ThemedView style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => confirmDiscard(() => router.back())}>
            <ThemedText style={styles.backText}>{'<'}</ThemedText>
          </Pressable>
          <View style={styles.headingWrap}>
            <ThemedText type="title" style={styles.title}>Composer</ThemedText>
            <ThemedText style={styles.subtitle}>Create social-ready visuals for {resolvedSlot}</ThemedText>
          </View>
        </View>

        <View style={styles.previewFrame}>
          <View style={{ width: '100%', aspectRatio: selectedPreset.width / selectedPreset.height }}>
            <View style={styles.previewImageWrap}>
              <Image source={{ uri: previewUri }} style={styles.previewFill} contentFit="cover" transition={80} />
              <View style={styles.previewOverlay}>
                <ThemedText style={styles.previewOverlayText}>Preview is exported to draft on Apply</ThemedText>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Preset</ThemedText>
          <View style={styles.rowWrap}>
            {PRESETS.map((preset) => {
              const active = preset.key === presetKey;
              return (
                <Pressable
                  key={preset.key}
                  style={[styles.pill, active && styles.pillActive]}
                  onPress={() => setPresetKey(preset.key)}>
                  <ThemedText style={[styles.pillText, active && styles.pillTextActive]}>{preset.label}</ThemedText>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Background</ThemedText>
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
        </View>

        <View style={styles.card}>
          <ThemedText type="defaultSemiBold">Text</ThemedText>
          <Input value={title} onChangeText={setTitle} placeholder="Title" />
          <Input value={subtitle} onChangeText={setSubtitle} placeholder="Subtitle" />
        </View>

        <View style={styles.card}>
          <Button label="Apply To Media Studio" onPress={() => void applyToMediaStudio()} />
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: 18, gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  backButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.35)',
    backgroundColor: 'rgba(240,249,255,0.96)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: { fontSize: 15, lineHeight: 16, fontWeight: '700', color: '#0E7490' },
  headingWrap: { flex: 1, gap: 2 },
  title: { fontSize: 30, lineHeight: 34 },
  subtitle: { fontSize: 13, lineHeight: 18, opacity: 0.74 },
  previewFrame: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.24)',
    backgroundColor: 'rgba(240,249,255,0.92)',
    padding: 10,
  },
  previewImageWrap: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(15,23,42,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewFill: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOverlay: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(15,23,42,0.58)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignItems: 'center',
  },
  previewOverlayText: { color: '#E2E8F0', fontSize: 11, fontWeight: '700' },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(120,120,120,0.26)',
    backgroundColor: 'rgba(248,250,252,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  pill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(14,116,144,0.28)',
    backgroundColor: 'rgba(240,249,255,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillActive: {
    borderColor: 'rgba(14,116,144,1)',
    backgroundColor: 'rgba(14,116,144,0.95)',
  },
  pillText: { fontSize: 11, fontWeight: '700', color: '#0E7490' },
  pillTextActive: { color: '#E0F2FE' },
  swatch: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.75)',
  },
  swatchActive: {
    borderColor: '#0F172A',
  },
  info: { fontSize: 12, lineHeight: 18, opacity: 0.74 },
});
