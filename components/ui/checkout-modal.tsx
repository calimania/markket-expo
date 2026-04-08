import { useState, useEffect, useCallback } from 'react';
import {
  Modal,
  View,
  Pressable,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Linking,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { apiPost } from '@/lib/api';
import { useAppConfig } from '@/hooks/use-app-config';

export type Price = {
  id?: number;
  STRIPE_ID?: string;
  Price?: number;
  price?: number;
  Name?: string;
  Currency?: string;
  currency?: string;
  Description?: string;
  inventory?: number | null;
  hidden?: boolean;
  ships_to?: string[];
};

export type CheckoutProduct = {
  id?: number;
  documentId?: string;
  slug?: string;
  Name?: string;
  name?: string;
  SKU?: string;
  PRICES?: Price[];
};

interface Props {
  product: CheckoutProduct;
  storeSlug: string;
  storeDocumentId: string;
  visible: boolean;
  onClose: () => void;
}

function extractCheckoutUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;

  const data = payload as {
    url?: unknown;
    link?: unknown;
    checkout_url?: unknown;
    data?: unknown;
  };

  const directCandidates = [data.url, data.checkout_url];
  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }

  if (typeof data.link === 'string' && data.link.trim()) return data.link.trim();

  if (data.link && typeof data.link === 'object') {
    const linkObject = data.link as {
      url?: unknown;
      checkout_url?: unknown;
      link?: unknown;
      response?: { url?: unknown };
    };

    const nestedCandidates = [linkObject.url, linkObject.checkout_url, linkObject.link, linkObject.response?.url];
    for (const candidate of nestedCandidates) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    }
  }

  return extractCheckoutUrl(data.data);
}

function containsKeyword(value: string | undefined, pattern: RegExp): boolean {
  if (!value) return false;
  return pattern.test(value.toLowerCase());
}

function isTestModeProduct(product: CheckoutProduct, price: Price): boolean {
  return (
    containsKeyword(product.Name, /\btest\b/) ||
    containsKeyword(product.name, /\btest\b/) ||
    containsKeyword(product.SKU, /\btest\b/) ||
    containsKeyword(price.Name, /\btest\b/)
  );
}

function isDigitalProduct(product: CheckoutProduct, price: Price): boolean {
  return (
    containsKeyword(price.Name, /\bdigital\b|\bdownload\b|\bvirtual\b|\be-book\b|\bebook\b/) ||
    containsKeyword(product.Name, /\bdigital\b|\bdownload\b|\bvirtual\b|\be-book\b|\bebook\b/) ||
    containsKeyword(product.name, /\bdigital\b|\bdownload\b|\bvirtual\b|\be-book\b|\bebook\b/)
  );
}

export default function CheckoutModal({ product, storeSlug, storeDocumentId, visible, onClose }: Props) {
  const { apiBaseUrl } = useAppConfig();
  const [selectedPrice, setSelectedPrice] = useState<Price | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visiblePrices = (product.PRICES ?? []).filter(
    (p) => !p.hidden && !(typeof p.inventory === 'number' && p.inventory === 0)
  );

  useEffect(() => {
    if (!visible) return;
    setSelectedPrice(null);
    setQuantity(1);
    setError(null);
    if (visiblePrices.length === 1) {
      setSelectedPrice(visiblePrices[0]);
    }
  }, [visible, product.documentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const unitPrice =
    typeof selectedPrice?.Price === 'number'
      ? selectedPrice.Price
      : typeof selectedPrice?.price === 'number'
        ? selectedPrice.price
        : 0;
  const total = unitPrice * quantity;
  const isValid = !!selectedPrice?.STRIPE_ID && total > 0;
  const maxQty = typeof selectedPrice?.inventory === 'number' ? selectedPrice.inventory : 99;

  const handleCheckout = useCallback(async () => {
    if (!isValid || !selectedPrice) return;
    if (!storeDocumentId) {
      setError('Store ID is missing for checkout. Please reopen the product from a store page.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        prices: [{
          quantity,
          price: selectedPrice.STRIPE_ID!,
          currency: 'usd',
          unit_amount: selectedPrice.Price ?? 0,
          Name: selectedPrice.Name ?? '',
        }],
        total,
        product: product.documentId ?? '',
        action: 'stripe.link',
        includes_shipping: !isDigitalProduct(product, selectedPrice),
        stripe_test: isTestModeProduct(product, selectedPrice),
        store_id: storeDocumentId,
        redirect_to_url: `https://markket.place/store/${storeSlug}/receipt`,
        countries: Array.isArray(selectedPrice.ships_to)
          ? selectedPrice.ships_to.filter((c): c is string => typeof c === 'string')
          : ['US'],
      };

      if (__DEV__) {
        console.log('[checkout-debug] request payload', payload);
      }

      const result = await apiPost<{ url?: string; link?: string; checkout_url?: string }>(
        '/api/markket',
        payload,
        { baseUrl: apiBaseUrl }
      );

      if (__DEV__) {
        console.log('[checkout-debug] raw result', result);
      }

      if (!result.ok) {
        if (__DEV__) {
          console.warn('[checkout-debug] request failed', result.error);
        }
        setError('Could not create payment link. Please try again.');
        return;
      }

      const url = extractCheckoutUrl(result.data);
      if (!url) {
        if (__DEV__) {
          console.warn('[checkout-debug] no payment URL found', {
            topLevelKeys: result.data && typeof result.data === 'object' ? Object.keys(result.data as Record<string, unknown>) : [],
            data: result.data,
          });
        }
        setError('No payment URL received. Please try again.');
        return;
      }

      if (__DEV__) {
        console.log('[checkout-debug] opening checkout URL', url);
      }

      onClose();
      await Linking.openURL(url);
    } catch (err) {
      if (__DEV__) {
        console.error('[checkout-debug] unexpected exception', err);
      }
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [isValid, selectedPrice, quantity, total, product, storeDocumentId, storeSlug, apiBaseUrl, onClose]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title} numberOfLines={2}>
            {product.Name ?? product.name ?? 'Product'}
          </ThemedText>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
            <ThemedText style={styles.closeBtnText}>✕</ThemedText>
          </Pressable>
        </View>

        <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
          <ThemedText style={styles.label}>Choose an option</ThemedText>

          {visiblePrices.map((price) => {
            const selected = selectedPrice?.STRIPE_ID === price.STRIPE_ID;
            return (
              <Pressable
                key={price.STRIPE_ID ?? price.id}
                onPress={() => { setSelectedPrice(price); setQuantity(1); }}
                style={[styles.priceOption, selected && styles.priceOptionSelected]}
              >
                <View style={styles.priceOptionRow}>
                  <ThemedText style={[styles.priceName, selected && styles.priceNameSelected]}>
                    {(price.Name ?? '').replace(/_/g, ' ')}
                  </ThemedText>
                  <ThemedText style={[styles.priceAmount, selected && styles.priceAmountSelected]}>
                    ${typeof price.Price === 'number' ? price.Price : price.price ?? 0}{' '}
                    {(price.Currency ?? price.currency ?? 'USD').toUpperCase()}
                  </ThemedText>
                </View>
                {price.Description ? (
                  <ThemedText style={styles.priceDescription}>{price.Description}</ThemedText>
                ) : null}
                {typeof price.inventory === 'number' && price.inventory < 10 ? (
                  <ThemedText style={styles.lowStock}>Only {price.inventory} left</ThemedText>
                ) : null}
              </Pressable>
            );
          })}

          {selectedPrice ? (
            <View style={styles.quantityRow}>
              <ThemedText style={styles.label}>Quantity</ThemedText>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => setQuantity(Math.max(1, quantity - 1))}
                  style={styles.stepBtn}
                  disabled={quantity <= 1}
                >
                  <ThemedText style={[styles.stepBtnText, quantity <= 1 && styles.stepBtnDisabled]}>−</ThemedText>
                </Pressable>
                <ThemedText style={styles.quantityValue}>{quantity}</ThemedText>
                <Pressable
                  onPress={() => setQuantity(Math.min(maxQty, quantity + 1))}
                  style={styles.stepBtn}
                  disabled={quantity >= maxQty}
                >
                  <ThemedText style={[styles.stepBtnText, quantity >= maxQty && styles.stepBtnDisabled]}>+</ThemedText>
                </Pressable>
              </View>
            </View>
          ) : null}

          {selectedPrice ? (
            <View style={styles.summary}>
              <ThemedText style={styles.summaryLabel}>Order Summary</ThemedText>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryItem}>{(selectedPrice.Name ?? '').replace(/_/g, ' ')}</ThemedText>
                <ThemedText style={styles.summaryItem}>${unitPrice.toFixed(2)}</ThemedText>
              </View>
              {quantity > 1 ? (
                <View style={styles.summaryRow}>
                  <ThemedText style={styles.summaryMeta}>Quantity</ThemedText>
                  <ThemedText style={styles.summaryMeta}>× {quantity}</ThemedText>
                </View>
              ) : null}
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <ThemedText style={styles.summaryTotal}>Total</ThemedText>
                <ThemedText style={styles.summaryTotal}>${total.toFixed(2)}</ThemedText>
              </View>
            </View>
          ) : null}

          {error ? <ThemedText style={styles.errorText}>{error}</ThemedText> : null}
        </ScrollView>

        <View style={styles.footer}>
          <View style={styles.noticeCard}>
            <ThemedText style={styles.noticeText}>
              Checkout opens in your browser.
            </ThemedText>
            <ThemedText style={styles.noticeSubtext}>
              Receipt and updates will come by email.
            </ThemedText>
          </View>

          <Pressable
            onPress={handleCheckout}
            disabled={!isValid || loading}
            style={[styles.checkoutBtn, (!isValid || loading) && styles.checkoutBtnDisabled]}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <ThemedText style={styles.checkoutBtnText}>
                {isValid ? `Proceed to Checkout  $${total.toFixed(2)}` : 'Select an option'}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: { flex: 1, marginRight: 12 },
  closeBtn: { padding: 4, marginTop: 2 },
  closeBtnText: { fontSize: 18, color: '#666' },
  body: { flex: 1 },
  bodyContent: { padding: 20, paddingBottom: 8 },
  label: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  priceOption: {
    borderWidth: 1.5,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  priceOptionSelected: { borderColor: '#2563eb', backgroundColor: '#eff6ff' },
  priceOptionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  priceName: { fontSize: 15, fontWeight: '500', color: '#1f2937' },
  priceNameSelected: { color: '#1d4ed8', fontWeight: '600' },
  priceAmount: { fontSize: 15, fontWeight: '600', color: '#374151' },
  priceAmountSelected: { color: '#1d4ed8' },
  priceDescription: { fontSize: 13, color: '#6b7280', marginTop: 4 },
  lowStock: { fontSize: 12, color: '#d97706', marginTop: 4, fontWeight: '500' },
  quantityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 4,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontSize: 20, color: '#1f2937', lineHeight: 24 },
  stepBtnDisabled: { color: '#d1d5db' },
  quantityValue: { fontSize: 18, fontWeight: '600', minWidth: 24, textAlign: 'center' },
  summary: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryLabel: { fontSize: 15, fontWeight: '600', marginBottom: 8, color: '#111827' },
  summaryDivider: { height: 1, backgroundColor: '#e5e7eb', marginVertical: 8 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  summaryItem: { fontSize: 14, color: '#374151' },
  summaryMeta: { fontSize: 13, color: '#6b7280' },
  summaryTotal: { fontSize: 16, fontWeight: '700', color: '#111827' },
  errorText: { color: '#dc2626', fontSize: 14, marginTop: 16, textAlign: 'center' },
  footer: {
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  noticeCard: {
    borderRadius: 12,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  noticeText: {
    fontSize: 13,
    lineHeight: 18,
    color: '#0f172a',
    fontWeight: '600',
  },
  noticeSubtext: {
    fontSize: 12,
    lineHeight: 17,
    color: '#64748b',
  },
  checkoutBtn: {
    backgroundColor: '#2563eb',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkoutBtnDisabled: { backgroundColor: '#93c5fd' },
  checkoutBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
