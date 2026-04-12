import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { clearApiAuthToken, setApiAuthToken } from '@/lib/api';

const STORAGE_KEY = 'markket-community-app-auth-session';

type AuthSession = {
  token: string;
  source: string;
  updatedAt: string;
  userId?: number | string;
  username?: string;
  email?: string;
  displayName?: string;
};

type AuthIdentity = {
  userId?: number | string;
  username?: string;
  email?: string;
  displayName?: string;
};

type AuthSessionContextValue = {
  session: AuthSession | null;
  ready: boolean;
  saveToken: (token: string, source: string, identity?: AuthIdentity) => Promise<void>;
  clearSession: () => Promise<void>;
};

const AuthSessionContext = createContext<AuthSessionContextValue | null>(null);

function normalizeToken(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function normalizeUserId(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return /^\d+$/.test(trimmed) ? Number(trimmed) : trimmed;
  }
  return undefined;
}

export function AuthSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_KEY);
        if (!raw || cancelled) return;

        const parsed = JSON.parse(raw) as Partial<AuthSession>;
        const token = normalizeToken(parsed.token);
        if (!token) return;

        setSession({
          token,
          source: typeof parsed.source === 'string' ? parsed.source : 'unknown',
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
          userId: normalizeUserId(parsed.userId),
          username: normalizeText(parsed.username),
          email: normalizeText(parsed.email),
          displayName: normalizeText(parsed.displayName),
        });
        setApiAuthToken(token);
      } catch {
        // Ignore malformed persisted session data and start clean.
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const saveToken = useCallback(async (tokenInput: string, source: string, identity?: AuthIdentity) => {
    const token = normalizeToken(tokenInput);
    if (!token) return;

    const next: AuthSession = {
      token,
      source: source || 'unknown',
      updatedAt: new Date().toISOString(),
      userId: normalizeUserId(identity?.userId),
      username: normalizeText(identity?.username),
      email: normalizeText(identity?.email),
      displayName: normalizeText(identity?.displayName),
    };

    setSession(next);
    setApiAuthToken(token);
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const clearSession = useCallback(async () => {
    setSession(null);
    clearApiAuthToken();
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  }, []);

  const value = useMemo<AuthSessionContextValue>(
    () => ({
      session,
      ready,
      saveToken,
      clearSession,
    }),
    [clearSession, ready, saveToken, session]
  );

  return <AuthSessionContext.Provider value={value}>{children}</AuthSessionContext.Provider>;
}

export function useAuthSession() {
  const context = useContext(AuthSessionContext);
  if (!context) {
    throw new Error('useAuthSession must be used within AuthSessionProvider');
  }

  return context;
}

export function maskToken(token: string): string {
  if (!token) return '';
  if (token.length <= 10) return token;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
