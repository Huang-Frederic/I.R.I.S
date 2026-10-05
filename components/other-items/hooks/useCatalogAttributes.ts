'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { CatalogAttributes } from '@/lib/vinted/other-item-attributes';

export const POLL_INTERVAL_MS = 2_000;
/** After this long without an answer, the bot is most likely not running. */
export const WAITING_BOT_AFTER_MS = 15_000;
const GIVE_UP_AFTER_MS = 180_000;

const COLUMNS = 'catalog_id, status, size_options, size_required, condition_options, has_color, error';

export type CatalogAttributesState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'waiting_bot' }
  | { status: 'ready'; attributes: CatalogAttributes }
  | { status: 'error'; message: string };

/**
 * A category's Vinted listing attributes (size options, accepted conditions,
 * whether a color is asked), from the vinted_catalog_attributes cache. Vinted
 * only serves them through an authenticated session, which only the bot has:
 * an unknown category is requested by inserting a 'pending' row, then polled
 * until the bot fills it in (vinted-agent/main.py, _attribute_requests_loop).
 */
export function useCatalogAttributes(catalogId: number | null): {
  state: CatalogAttributesState;
  retry: () => Promise<void>;
} {
  const [state, setState] = useState<CatalogAttributesState>({ status: catalogId === null ? 'idle' : 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (catalogId === null) {
      // Resetting to idle when the category is cleared is the intended
      // synchronization with the prop, not derived state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const supabase = createClient();
    const startedAt = Date.now();
    setState({ status: 'loading' });

    async function poll(first: boolean) {
      const { data } = await supabase
        .from('vinted_catalog_attributes')
        .select(COLUMNS)
        .eq('catalog_id', catalogId)
        .maybeSingle();
      if (cancelled) return;
      const row = data as CatalogAttributes | null;

      if (!row && first) {
        // A concurrent request (another tab) losing the insert race is fine:
        // the row exists either way and the next poll reads it.
        await supabase.from('vinted_catalog_attributes').insert({ catalog_id: catalogId });
        if (cancelled) return;
      } else if (row?.status === 'ready') {
        setState({ status: 'ready', attributes: row });
        return;
      } else if (row?.status === 'error') {
        setState({ status: 'error', message: row.error ?? '' });
        return;
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed >= WAITING_BOT_AFTER_MS) setState({ status: 'waiting_bot' });
      if (elapsed >= GIVE_UP_AFTER_MS) return;
      timer = setTimeout(() => void poll(false), POLL_INTERVAL_MS);
    }

    void poll(true);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [catalogId, attempt]);

  const retry = useCallback(async () => {
    if (catalogId === null) return;
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from('vinted_catalog_attributes')
      .update({ status: 'pending', error: null, requested_by: user?.id ?? null, requested_at: new Date().toISOString() })
      .eq('catalog_id', catalogId);
    setAttempt((n) => n + 1);
  }, [catalogId]);

  return { state, retry };
}
