'use client';

import { useState } from 'react';
import { RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

interface BatchSummary {
  ok: boolean;
  total: number;
  updated: number;
  skipped: number;
  errors: { card_id: string; message: string }[];
}

type State =
  | { kind: 'idle' }
  | { kind: 'running'; processed: number; updated: number; skipped: number }
  | { kind: 'done'; processed: number; updated: number; skipped: number; errors: number }
  | { kind: 'error'; message: string };

/**
 * Manual full-collection price refresh. The cron only handles 200 cards per
 * run (Vercel function timeout cap), so a one-shot "refresh everything" via
 * the cron schedule alone takes multiple days for large stocks. This button
 * loops the bulk endpoint client-side, passing a session-start `?since`
 * timestamp so each iteration only picks cards still stale relative to that
 * start — the loop terminates when total drops to 0.
 */
export default function RefreshAllPricesSection() {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function refreshAll() {
    const since = new Date().toISOString();
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    setState({ kind: 'running', processed: 0, updated: 0, skipped: 0 });

    try {
      // Loop until the endpoint returns total === 0. Each iteration processes
      // up to 200 cards (server-side BATCH_SIZE). 50-iter safety cap to avoid
      // a runaway loop if something keeps marking cards as stale.
      for (let iter = 0; iter < 50; iter += 1) {
        const res = await fetch(
          `/api/prices/update?since=${encodeURIComponent(since)}`,
          { method: 'POST' },
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const summary = (await res.json()) as BatchSummary;
        processed += summary.total;
        updated += summary.updated;
        skipped += summary.skipped;
        errors += summary.errors.length;
        setState({ kind: 'running', processed, updated, skipped });
        if (summary.total === 0) break;
      }
      setState({ kind: 'done', processed, updated, skipped, errors });
    } catch (err) {
      setState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <div className="bg-surface border-border rounded-lg border p-5">
      <h2 className="text-text-muted mb-3 text-xs font-semibold uppercase tracking-wide">
        Prix Cardmarket
      </h2>

      <p className="text-text-muted mb-3 text-sm">
        Force le rafraîchissement de toutes les cartes (for_sale + Pokédex + collection)
        d&apos;un coup, sans attendre le cron quotidien.
      </p>

      <button
        type="button"
        onClick={refreshAll}
        disabled={state.kind === 'running'}
        className="bg-red text-white inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw
          className={`h-4 w-4 ${state.kind === 'running' ? 'animate-spin' : ''}`}
          aria-hidden
        />
        {state.kind === 'running' ? 'En cours…' : 'Rafraîchir tous les prix'}
      </button>

      {state.kind === 'running' && (
        <p className="text-text-muted mt-3 font-mono text-xs">
          Traité {state.processed} · Mis à jour {state.updated} · Skipped {state.skipped}
        </p>
      )}

      {state.kind === 'done' && (
        <div className="text-staleness-fresh mt-3 flex items-start gap-2 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            Terminé — <strong>{state.processed}</strong> cartes traitées
            {' ('}
            <span className="text-text">{state.updated} mises à jour</span>
            {', '}
            <span className="text-text-muted">{state.skipped} skipped</span>
            {state.errors > 0 ? `, ${state.errors} erreurs` : ''}
            {')'}.
          </span>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="text-red mt-3 flex items-start gap-2 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Erreur : {state.message}</span>
        </div>
      )}
    </div>
  );
}
