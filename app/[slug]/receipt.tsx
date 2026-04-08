import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useAppConfig } from '@/hooks/use-app-config';
import { useAuthSession } from '@/hooks/use-auth-session';
import { apiPost, type ApiResult } from '@/lib/api';
import { getReceiptViewerKey, saveLocalReceipt } from '@/lib/receipt-history';

type ReceiptResponse = {
  data?: {
    link?: {
      response?: {
        amount_total?: number;
        customer_details?: { email?: string };
        shipping_details?: {
          address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            postal_code?: string;
          };
        };
      };
    };
  };
};

function normalizeParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function buildAddress(address?: {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}): string {
  if (!address) return '';

  const parts = [
    address.line1,
    address.line2,
    [address.city, address.state].filter(Boolean).join(' '),
    address.postal_code,
  ]
    .map((value) => (value ?? '').trim())
    .filter(Boolean);

  return parts.join(', ');
}

export default function LegacyReceiptScreen() {
  const { apiBaseUrl } = useAppConfig();
  const { session } = useAuthSession();
  const { slug, session_id } = useLocalSearchParams<{
    slug?: string | string[];
    session_id?: string | string[];
  }>();

  const cleanSlug = normalizeParam(slug).trim();
  const sessionId = normalizeParam(session_id).trim();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');

  useEffect(() => {
    let active = true;

    async function loadReceipt() {
      if (!sessionId) {
        setError('Missing Stripe session ID');
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const result: ApiResult<ReceiptResponse> = await apiPost(
        '/api/markket',
        {
          action: 'stripe.receipt',
          session_id: sessionId,
        },
        { baseUrl: apiBaseUrl }
      );

      if (!active) return;

      if (!result.ok) {
        setError('Could not load receipt details.');
        setLoading(false);
        return;
      }

      const response = result.data?.data?.link?.response;
      const amountTotalCents = typeof response?.amount_total === 'number' ? response.amount_total : undefined;
      const amount = typeof response?.amount_total === 'number' ? (response.amount_total / 100).toFixed(2) : '';
      const email = response?.customer_details?.email ?? '';
      const address = buildAddress(response?.shipping_details?.address);

      const viewerKey = getReceiptViewerKey({
        userId: session?.userId,
        email: session?.email,
        token: session?.token,
      });

      await saveLocalReceipt(viewerKey, {
        sessionId,
        storeSlug: cleanSlug || undefined,
        amountTotalCents,
        customerEmail: email || undefined,
        createdAt: new Date().toISOString(),
      });

      setTotalAmount(amount);
      setCustomerEmail(email);
      setShippingAddress(address);
      setLoading(false);
    }

    loadReceipt();

    return () => {
      active = false;
    };
  }, [apiBaseUrl, cleanSlug, session?.email, session?.token, session?.userId, sessionId]);

  const title = useMemo(() => `Receipt${cleanSlug ? ` · ${cleanSlug}` : ''}`, [cleanSlug]);

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title, headerBackTitle: 'Store' }} />

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" />
          <ThemedText style={styles.loadingText}>Loading receipt...</ThemedText>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <ThemedText type="subtitle">{error}</ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.heroCard}>
            <ThemedText type="title" style={styles.heroTitle}>Thank you for your purchase!</ThemedText>
            <ThemedText style={styles.heroSub}>Your payment was received successfully.</ThemedText>
          </View>

          <View style={styles.section}>
            <ThemedText style={styles.sectionTitle}>Order Summary</ThemedText>
            <View style={styles.row}>
              <ThemedText style={styles.key}>Total Amount</ThemedText>
              <ThemedText style={styles.value}>{totalAmount ? `$${totalAmount}` : '-'}</ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.key}>Customer Email</ThemedText>
              <ThemedText style={styles.value}>{customerEmail || '-'}</ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.key}>Shipping Address</ThemedText>
              <ThemedText style={styles.value}>{shippingAddress || '-'}</ThemedText>
            </View>
            <View style={styles.row}>
              <ThemedText style={styles.key}>Stripe Session ID</ThemedText>
              <ThemedText style={styles.monoValue}>{sessionId || '-'}</ThemedText>
            </View>
          </View>
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 10,
    color: '#64748b',
  },
  content: {
    padding: 16,
    gap: 14,
    paddingBottom: 36,
  },
  heroCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: '#ecfeff',
    borderWidth: 1,
    borderColor: '#a5f3fc',
  },
  heroTitle: {
    marginBottom: 8,
    color: '#155e75',
  },
  heroSub: {
    color: '#0f766e',
  },
  section: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
    color: '#0f172a',
  },
  row: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
    paddingTop: 10,
  },
  key: {
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#64748b',
    marginBottom: 4,
  },
  value: {
    fontSize: 15,
    color: '#0f172a',
  },
  monoValue: {
    fontSize: 13,
    color: '#334155',
    fontFamily: 'Courier',
  },
});
