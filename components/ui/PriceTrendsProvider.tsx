'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchHistoryForCardIds } from '@/lib/api/price-history';
import type { PriceHistoryPoint } from '@/lib/types/price-history';

interface ContextValue {
  /** Register a card_id this render needs trend data for. Idempotent. */
  register: (cardId: string) => void;
  /** Lookup history points (90d window). Returns empty array if not yet fetched. */
  getPoints: (cardId: string) => PriceHistoryPoint[];
  /** True while a batched fetch is in flight. */
  loading: boolean;
}

const PriceTrendsContext = createContext<ContextValue | null>(null);

const FETCH_DEBOUNCE_MS = 50;
const WINDOW_DAYS = 90;

/**
 * Page-level provider that batches `register()` calls within a 50ms window
 * into a single bulk fetch. Avoids N+1 when ~200 stock rows each render a
 * <PriceWithTrend>.
 */
export function PriceTrendsProvider({ children }: { children: React.ReactNode }) {
  const [pointsMap, setPointsMap] = useState<Map<string, PriceHistoryPoint[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const pendingRef = useRef<Set<string>>(new Set());
  const fetchedRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushFetch = useCallback(async () => {
    timerRef.current = null;
    const toFetch = Array.from(pendingRef.current).filter((id) => !fetchedRef.current.has(id));
    pendingRef.current.clear();
    if (toFetch.length === 0) return;

    toFetch.forEach((id) => fetchedRef.current.add(id));
    setLoading(true);
    try {
      const supabase = createClient();
      const newMap = await fetchHistoryForCardIds(supabase, toFetch, WINDOW_DAYS);
      setPointsMap((prev) => {
        const next = new Map(prev);
        for (const [k, v] of newMap.entries()) next.set(k, v);
        // Cards with no history rows still need an empty entry so getPoints
        // returns [] rather than retriggering register() on every render.
        for (const id of toFetch) if (!next.has(id)) next.set(id, []);
        return next;
      });
    } catch (err) {
      console.warn('[PriceTrendsProvider] bulk fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(
    (cardId: string) => {
      if (fetchedRef.current.has(cardId)) return;
      pendingRef.current.add(cardId);
      if (timerRef.current == null) {
        timerRef.current = setTimeout(flushFetch, FETCH_DEBOUNCE_MS);
      }
    },
    [flushFetch],
  );

  const getPoints = useCallback(
    (cardId: string) => pointsMap.get(cardId) ?? [],
    [pointsMap],
  );

  useEffect(
    () => () => {
      if (timerRef.current != null) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <PriceTrendsContext.Provider value={{ register, getPoints, loading }}>
      {children}
    </PriceTrendsContext.Provider>
  );
}

/** Optional context — components render without arrow if no provider mounted. */
export function usePriceTrendsContext(): ContextValue | null {
  return useContext(PriceTrendsContext);
}
