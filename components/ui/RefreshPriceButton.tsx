'use client';

import { useState } from 'react';
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

  async function refresh() {
    setState('loading');
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/prices/update?card_id=${encodeURIComponent(cardId)}`, {
        method: 'POST',
      });
      const json = (await res.json()) as { ok: boolean; card?: Card; error?: string };
      if (!res.ok || !json.ok || !json.card) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      onRefreshed(json.card);
      setState('success');
      setTimeout(() => setState('idle'), 1000);
    } catch (err) {
      setErrorMsg((err as Error).message);
      setState('error');
      setTimeout(() => setState('idle'), 2500);
    }
  }

  const icon =
    state === 'loading' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> :
    state === 'success' ? <Check className="text-staleness-fresh h-3.5 w-3.5" /> :
    state === 'error'   ? <AlertCircle className="text-red h-3.5 w-3.5" /> :
                          <RefreshCw className="h-3.5 w-3.5" />;

  return (
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
  );
}
