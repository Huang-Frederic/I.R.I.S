'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { parseVintedListing } from '@/lib/utils/parse-vinted-listing';
import type { EnrichedCard } from '@/lib/types';
import type {
  ImportFailure,
  ToImport,
  VintedItem,
} from '@/lib/types/vinted-import';
import { VintedImportTile } from './VintedImportTile';

type Phase =
  | { kind: 'paste-curl' }
  | {
      kind: 'select-cards';
      items: VintedItem[];
      skipped: number;
      enriched: Record<string, EnrichedCard | null>;
      selected: Set<string>;
    }
  | { kind: 'committing'; total: number; done: number }
  | { kind: 'done'; created: number; failed: ImportFailure[] };

export function VintedImportFlow() {
  const [phase, setPhase] = useState<Phase>({ kind: 'paste-curl' });
  const [curl, setCurl] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleFetch() {
    setError(null);
    const res = await fetch('/api/import/vinted/fetch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ curl }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    const { items, skipped } = (await res.json()) as { items: VintedItem[]; skipped: number };
    setPhase({
      kind: 'select-cards',
      items,
      skipped,
      enriched: {},
      selected: new Set(items.map((i) => String(i.id))),
    });
  }

  // Background enrich on entering select-cards
  useEffect(() => {
    if (phase.kind !== 'select-cards' || phase.items.length === 0) return;
    let cancelled = false;
    (async () => {
      const res = await fetch('/api/import/vinted/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: phase.items }),
      });
      if (!res.ok || cancelled) return;
      const { enriched } = (await res.json()) as { enriched: Record<string, EnrichedCard | null> };
      setPhase((p) => (p.kind === 'select-cards' ? { ...p, enriched } : p));
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind === 'select-cards' ? phase.items : null]);

  async function handleCommit() {
    if (phase.kind !== 'select-cards') return;
    const toImport: ToImport[] = phase.items
      .filter((i) => phase.selected.has(String(i.id)))
      .map((vintedItem) => {
        const parsed = parseVintedListing({ title: vintedItem.title, description: vintedItem.description })!;
        return { vintedItem, parsed, enriched: phase.enriched[String(vintedItem.id)] ?? null };
      });
    setPhase({ kind: 'committing', total: toImport.length, done: 0 });
    const res = await fetch('/api/import/vinted/commit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ items: toImport }),
    });
    const body = (await res.json()) as { created: number; failed: ImportFailure[] };
    setPhase({ kind: 'done', created: body.created, failed: body.failed });
  }

  if (phase.kind === 'paste-curl') {
    return (
      <div className="space-y-4">
        <p className="text-sm text-text-muted">
          Sur vinted.fr, F12 → onglet Network → click droit sur une requête{' '}
          <code className="rounded bg-surface-off px-1">/api/v2/users/&lt;id&gt;/items</code> → Copy as cURL → colle ci-dessous.
        </p>
        <textarea
          value={curl}
          onChange={(e) => setCurl(e.target.value)}
          rows={8}
          placeholder="curl 'https://www.vinted.fr/api/v2/users/.../items?...' -H 'cookie: ...'"
          className="w-full rounded border bg-bg p-2 font-mono text-xs"
        />
        {error && <div className="text-sm text-rarity-ar">Erreur : {error}</div>}
        <button
          type="button"
          onClick={handleFetch}
          disabled={!curl.startsWith('curl ')}
          className="rounded bg-red px-4 py-2 text-bg disabled:opacity-50"
        >
          Récupérer mes annonces
        </button>
      </div>
    );
  }

  if (phase.kind === 'select-cards') {
    const selectedCount = phase.selected.size;
    return (
      <div className="space-y-4 pb-20">
        <div className="sticky top-0 z-10 flex items-center justify-between rounded bg-bg/80 p-3 backdrop-blur">
          <div className="text-sm">
            {phase.items.length} cartes détectées · {phase.skipped} ignorées · <strong>{selectedCount}</strong> sélectionnées
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {phase.items.map((item) => {
            const id = String(item.id);
            const parsed = parseVintedListing({ title: item.title, description: item.description });
            return (
              <VintedImportTile
                key={id}
                item={item}
                parsed={parsed}
                enriched={phase.enriched[id] ?? null}
                selected={phase.selected.has(id)}
                onToggle={() =>
                  setPhase((p) => {
                    if (p.kind !== 'select-cards') return p;
                    const next = new Set(p.selected);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return { ...p, selected: next };
                  })
                }
                onZoom={() => window.open(item.photos[0]?.full_size_url ?? '#', '_blank')}
                onEdit={() => alert('Édit manuel — TODO Task 11')}
              />
            );
          })}
        </div>
        <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-bg p-3 md:left-[220px]">
          <button
            type="button"
            onClick={handleCommit}
            disabled={selectedCount === 0}
            className="w-full rounded bg-red px-4 py-2 text-bg disabled:opacity-50"
          >
            Importer {selectedCount} cartes
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'committing') {
    return (
      <div className="space-y-2">
        <div className="text-sm">Import en cours…</div>
        <div className="h-2 w-full overflow-hidden rounded bg-surface-off">
          <div className="h-full bg-rarity-r" style={{ width: `${(phase.done / phase.total) * 100}%` }} />
        </div>
      </div>
    );
  }

  // phase.kind === 'done'
  return (
    <div className="space-y-4">
      <div className="rounded border border-rarity-r bg-rarity-r/10 p-4">
        ✅ <strong>{phase.created}</strong> cartes importées
        {phase.failed.length > 0 && (
          <span className="text-rarity-ar">
            {' '}
            · <strong>{phase.failed.length}</strong> échecs
          </span>
        )}
      </div>
      {phase.failed.length > 0 && (
        <details className="rounded border p-3">
          <summary className="cursor-pointer text-sm">Détails des échecs</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {phase.failed.map((f) => (
              <li key={f.vintedItemId}>
                <code>#{f.vintedItemId}</code> — {f.reason}
                {f.detail ? ` — ${f.detail}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      <Link href="/vinted" className="text-sm underline">
        Aller dans /vinted →
      </Link>
    </div>
  );
}
