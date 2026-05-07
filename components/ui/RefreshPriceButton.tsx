'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, Check, AlertCircle } from 'lucide-react';
import type { Card } from '@/lib/types';

interface Props {
  cardId: string;
  /** Called with the freshly updated row when the cron returns it. */
  onRefreshed: (card: Card) => void;
}

type State = 'idle' | 'loading' | 'success' | 'error';

/**
 * Manual refresh trigger for a single card's Cardmarket pricing. Calls
 * POST /api/prices/update?card_id=X (single-card mode, behind the normal
 * Supabase auth — no CRON_SECRET).
 */
export default function RefreshPriceButton({ cardId, onRefreshed }: Props) {
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (state === 'success') {
      const timer = setTimeout(() => setState('idle'), 1000);
      return () => clearTimeout(timer);
    }
    if (state === 'error') {
      const timer = setTimeout(() => setState('idle'), 2500);
      return () => clearTimeout(timer);
    }
  }, [state]);

  async function refresh() {
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/prices/update?card_id=${encodeURIComponent(cardId)}`, {
        method: 'POST',
      });
      const json = (await res.json()) as { ok: boolean; card?: Card; error?: string; message?: string };
      if (!res.ok || !json.ok || !json.card) {
        // Surface the server's `message` (more user-friendly) when present,
        // fall back to the error code or HTTP status.
        throw new Error(json.message ?? json.error ?? `HTTP ${res.status}`);
      }
      onRefreshed(json.card);
      setState('success');
    } catch (err) {
      const msg = (err as Error).message;
      // console.warn (not .error) so Next.js dev overlay doesn't flag it as
      // an unhandled error — the popup IS the user-facing channel; this log
      // is just for paste-able debugging.
      console.warn(`[RefreshPriceButton] card=${cardId}: ${msg}`);
      setErrorMsg(msg);
      setState('error');
    }
  }

  const icon =
    state === 'loading' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> :
    state === 'success' ? <Check className="text-staleness-fresh h-3.5 w-3.5" /> :
    state === 'error'   ? <AlertCircle className="text-red h-3.5 w-3.5" /> :
                          <RefreshCw className="h-3.5 w-3.5" />;

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={refresh}
        disabled={state === 'loading'}
        title={state === 'error' && errorMsg ? errorMsg : 'Rafraîchir le prix Cardmarket'}
        aria-label="Rafraîchir le prix"
        className="text-text-muted hover:text-text inline-flex items-center justify-center rounded p-1 transition-colors disabled:cursor-default"
      >
        {icon}
      </button>
      {state === 'error' && errorMsg && (
        <div
          role="alert"
          className="bg-red text-white absolute right-0 top-full z-50 mt-1 w-[360px] max-w-[90vw] rounded-md px-3 py-2 text-xs leading-relaxed shadow-lg"
        >
          {errorMsg}
        </div>
      )}
    </div>
  );
}
