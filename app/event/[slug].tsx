import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { apiGet } from '@/lib/api';

type EventRecord = {
  id?: number;
  slug?: string;
  Name?: string;
  Description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  usd_price?: number | null;
  maxCapacity?: number | null;
  amountSold?: number | null;
  active?: boolean;
  PRICES?: { price?: number; currency?: string }[] | null;
  Thumbnail?: {
    url?: string;
    formats?: {
      medium?: { url?: string };
      small?: { url?: string };
      thumbnail?: { url?: string };
    };
  } | null;
  SEO?: {
    metaUrl?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
    socialImage?: {
      url?: string;
      formats?: {
        medium?: { url?: string };
        small?: { url?: string };
        thumbnail?: { url?: string };
      };
    } | null;
  } | null;
  stores?: { slug?: string; title?: string }[] | null;
};

type EventsApiResponse = {
  data: EventRecord[];
};

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function formatDate(dateStr?: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString(undefined, opts ?? {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getThumbnailUrl(image: { url?: string; formats?: { medium?: { url?: string }; small?: { url?: string }; thumbnail?: { url?: string } } } | null | undefined): string | null {
  if (!image) return null;
  return image.formats?.medium?.url ?? image.formats?.small?.url ?? image.formats?.thumbnail?.url ?? image.url ?? null;
}

export default function EventScreen() {
  const router = useRouter();
  const { apiBaseUrl, displayBaseUrl, linkOpenMode, ready } = useAppConfig();
  const { slug, title } = useLocalSearchParams<{ slug?: string | string[]; title?: string | string[] }>();

  const eventSlug = normalizeParam(slug).trim();
  const titleFallback = normalizeParam(title) || 'Event';

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [event, setEvent] = useState<EventRecord | null>(null);

  useEffect(() => {
    if (!ready || !eventSlug) return;
    setLoading(true);
    setError(null);
    const url = `/api/events?filters[slug][$eq]=${encodeURIComponent(eventSlug)}&populate[]=PRICES&populate[]=SEO&populate[]=stores&populate[]=Thumbnail&pagination[pageSize]=1`;
    apiGet<EventsApiResponse>(url, { baseUrl: apiBaseUrl })
      .then((result) => {
        if (result.ok && result.data?.data?.length) {
          setEvent(result.data.data[0]);
        } else {
          setError('Event not found');
        }
      })
      .catch(() => setError('Could not load event'))
      .finally(() => setLoading(false));
  }, [apiBaseUrl, eventSlug, ready]);

  const openUrl = useCallback((url: string, label: string) => {
    const embedUrl = url.includes('?') ? `${url}&embed=true` : `${url}?embed=true`;
    if (linkOpenMode === 'browser') {
      Linking.openURL(url).catch(() => {});
      return;
    }
    router.push({ pathname: '/web', params: { url: embedUrl, title: label } } as never);
  }, [linkOpenMode, router]);

  const coverUrl = getThumbnailUrl(event?.Thumbnail) ?? getThumbnailUrl(event?.SEO?.socialImage);
  const firstPrice = event?.PRICES?.[0];
  const isFree = event && !event.usd_price && (!firstPrice?.price || firstPrice.price === 0);
  const firstStore = event?.stores?.[0];
  const storeUrl = firstStore?.slug ? `${displayBaseUrl}${firstStore.slug}` : null;

  const eventTitle = event?.Name || titleFallback;

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: eventTitle, headerBackTitle: 'Back' }} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <ThemedText type="subtitle">{error}</ThemedText>
        </View>
      ) : event ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {coverUrl ? (
            <Image source={{ uri: coverUrl }} style={styles.cover} contentFit="cover" transition={300} />
          ) : null}

          <View style={styles.body}>
            <ThemedText type="display" style={styles.title}>{event.Name ?? 'Event'}</ThemedText>

            {/* Date row */}
            {event.startDate ? (
              <View style={styles.dateRow}>
                <ThemedText style={styles.dateLabel}>📅 Starts</ThemedText>
                <ThemedText style={styles.dateValue}>{formatDate(event.startDate)}</ThemedText>
              </View>
            ) : null}
            {event.endDate ? (
              <View style={styles.dateRow}>
                <ThemedText style={styles.dateLabel}>🏁 Ends</ThemedText>
                <ThemedText style={styles.dateValue}>{formatDate(event.endDate)}</ThemedText>
              </View>
            ) : null}

            {/* Price / capacity */}
            <View style={styles.metaRow}>
              {isFree ? (
                <View style={styles.freeBadge}>
                  <ThemedText style={styles.freeBadgeText}>Free</ThemedText>
                </View>
              ) : event.usd_price ? (
                <View style={styles.priceBadge}>
                  <ThemedText style={styles.priceText}>${event.usd_price}</ThemedText>
                </View>
              ) : firstPrice?.price != null ? (
                <View style={styles.priceBadge}>
                  <ThemedText style={styles.priceText}>
                    ${firstPrice.price.toFixed(2)}{firstPrice.currency ? ` ${firstPrice.currency.toUpperCase()}` : ''}
                  </ThemedText>
                </View>
              ) : null}
              {event.maxCapacity ? (
                <ThemedText style={styles.capacity}>
                  {event.amountSold ?? 0} / {event.maxCapacity} spots
                </ThemedText>
              ) : null}
            </View>

            {/* Store link */}
            {firstStore ? (
              <Pressable
                style={({ pressed }) => [styles.storePill, pressed && { opacity: 0.7 }]}
                onPress={() => storeUrl ? openUrl(storeUrl, firstStore.title ?? 'Store') : null}>
                <ThemedText style={styles.storePillText} numberOfLines={1}>
                  🏪 {firstStore.title}
                </ThemedText>
              </Pressable>
            ) : null}

            {/* Description */}
            {event.Description ? (
              <ThemedText style={styles.description}>{event.Description}</ThemedText>
            ) : null}

            {/* CTA buttons */}
            <View style={styles.ctaRow}>
              {event.SEO?.metaUrl ? (
                <Pressable
                  style={({ pressed }) => [styles.ctaButton, styles.ctaPrimary, pressed && { opacity: 0.8 }]}
                  onPress={() => openUrl(event.SEO!.metaUrl!, event.Name || 'Event')}>
                  <ThemedText style={styles.ctaPrimaryText}>More Info →</ThemedText>
                </Pressable>
              ) : null}
              {firstStore?.slug && event.slug ? (
                <Pressable
                  style={({ pressed }) => [styles.ctaButton, styles.ctaSecondary, pressed && { opacity: 0.8 }]}
                  onPress={() => openUrl(`${displayBaseUrl}${firstStore.slug}/events/${event.slug}`, event.Name || 'Event')}>
                  <ThemedText style={styles.ctaSecondaryText}>View on Markket</ThemedText>
                </Pressable>
              ) : null}
            </View>
          </View>
        </ScrollView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  scroll: {
    paddingBottom: 48,
  },
  cover: {
    width: '100%',
    height: 240,
  },
  body: {
    padding: 20,
    gap: 12,
  },
  title: {
    marginBottom: 4,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateLabel: {
    fontSize: 13,
    opacity: 0.6,
    width: 70,
  },
  dateValue: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  freeBadge: {
    backgroundColor: '#e6f9ee',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  freeBadgeText: {
    color: '#2a9d4e',
    fontWeight: '700',
    fontSize: 13,
  },
  priceBadge: {
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  priceText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 13,
  },
  capacity: {
    fontSize: 13,
    opacity: 0.6,
  },
  storePill: {
    alignSelf: 'flex-start',
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  storePillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    opacity: 0.85,
    marginTop: 8,
  },
  ctaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  ctaButton: {
    borderRadius: 14,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  ctaPrimary: {
    backgroundColor: '#4F46E5',
  },
  ctaPrimaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  ctaSecondary: {
    backgroundColor: '#F3F4F6',
  },
  ctaSecondaryText: {
    fontWeight: '600',
    fontSize: 14,
  },
});
