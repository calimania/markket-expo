import AsyncStorage from '@react-native-async-storage/async-storage';

const RECEIPT_HISTORY_PREFIX = 'markket-receipt-history-v1:';
const MAX_RECEIPTS_PER_VIEWER = 30;

export type ReceiptViewerIdentity = {
  userId?: number | string;
  email?: string;
  token?: string;
};

export type LocalReceiptSummary = {
  sessionId: string;
  storeSlug?: string;
  amountTotalCents?: number;
  customerEmail?: string;
  createdAt: string;
};

function normalizeText(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function getReceiptViewerKey(identity?: ReceiptViewerIdentity | null): string {
  const userId = identity?.userId;
  if (typeof userId === 'number' && Number.isFinite(userId)) return `user:${userId}`;
  if (typeof userId === 'string' && userId.trim()) return `user:${userId.trim()}`;

  const email = normalizeText(identity?.email).toLowerCase();
  if (email) return `email:${email}`;

  const token = normalizeText(identity?.token);
  if (token.length >= 12) return `token:${token.slice(0, 6)}:${token.slice(-6)}`;

  return 'guest';
}

function storageKeyForViewer(viewerKey: string): string {
  return `${RECEIPT_HISTORY_PREFIX}${viewerKey}`;
}

export async function getLocalReceipts(viewerKey: string): Promise<LocalReceiptSummary[]> {
  try {
    const raw = await AsyncStorage.getItem(storageKeyForViewer(viewerKey));
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const normalized: LocalReceiptSummary[] = [];

    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const entry = item as Partial<LocalReceiptSummary>;
      const sessionId = normalizeText(entry.sessionId);
      const createdAt = normalizeText(entry.createdAt) || new Date().toISOString();
      if (!sessionId) continue;

      normalized.push({
        sessionId,
        storeSlug: normalizeText(entry.storeSlug) || undefined,
        amountTotalCents: typeof entry.amountTotalCents === 'number' ? entry.amountTotalCents : undefined,
        customerEmail: normalizeText(entry.customerEmail) || undefined,
        createdAt,
      });
    }

    return normalized.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function saveLocalReceipt(viewerKey: string, receipt: LocalReceiptSummary): Promise<void> {
  const normalized: LocalReceiptSummary = {
    sessionId: normalizeText(receipt.sessionId),
    storeSlug: normalizeText(receipt.storeSlug) || undefined,
    amountTotalCents: typeof receipt.amountTotalCents === 'number' ? receipt.amountTotalCents : undefined,
    customerEmail: normalizeText(receipt.customerEmail) || undefined,
    createdAt: normalizeText(receipt.createdAt) || new Date().toISOString(),
  };

  if (!normalized.sessionId) return;

  const existing = await getLocalReceipts(viewerKey);
  const deduped = existing.filter((item) => item.sessionId !== normalized.sessionId);
  const next = [normalized, ...deduped].slice(0, MAX_RECEIPTS_PER_VIEWER);

  try {
    await AsyncStorage.setItem(storageKeyForViewer(viewerKey), JSON.stringify(next));
  } catch {
    // Non-fatal cache write failure.
  }
}

export async function clearLocalReceipts(viewerKey: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(storageKeyForViewer(viewerKey));
  } catch {
    // Non-fatal cache clear failure.
  }
}