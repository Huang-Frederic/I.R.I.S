'use client';

import { X, Tag } from 'lucide-react';
import { useState } from 'react';
import type { PromoteCandidate } from '@/lib/utils/promote-detection';
import { VARIANT_LABEL } from '@/lib/utils/labels';
import CardZoomModal from '@/components/vinted/CardZoomModal';
import ExchangeOnConflictModal, { type ExchangeConflictCard } from '@/components/vinted/ExchangeOnConflictModal';

interface Props {
  candidate: PromoteCandidate;
  onClose: () => void;
  onPromoted: () => void;
}

export default function PromoteAfterSoldModal({ candidate, onClose, onPromoted }: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoomSrc, setZoomSrc] = useState<string | null>(null);
  const [exchangeMode, setExchangeMode] = useState<{
    newCard: { id: string; cardName: string };
    conflictCard: ExchangeConflictCard;
  } | null>(null);

  const thumb = candidate.imageUrl ?? candidate.tcgImageUrl;
  const variantLabel = candidate.variant ? (VARIANT_LABEL[candidate.variant] ?? candidate.variant) : null;

  const promote = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/cards/${candidate.cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'for_sale' }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
          conflictCard?: ExchangeConflictCard;
        };
        if (res.status === 409 && body.error === 'for_sale_conflict' && body.conflictCard) {
          setExchangeMode({
            newCard: { id: candidate.cardId, cardName: candidate.cardName },
            conflictCard: body.conflictCard,
          });
          setSubmitting(false);
          return;
        }
        // For for_sale conflict, surface a friendly message
        const friendly = body.message ?? body.error ?? `Promotion échouée (${res.status})`;
        throw new Error(friendly);
      }
      onPromoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Mettre l&apos;exemplaire Stock en vente ?</h2>
            <p className="text-text-muted mt-1 text-sm">Tu as un autre exemplaire de cette carte en Stock.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="my-4 flex items-center gap-4">
          {thumb ? (
            <button
              type="button"
              onClick={() => setZoomSrc(thumb)}
              className="hover:ring-red shrink-0 rounded transition-shadow hover:ring-2"
              aria-label="Voir en grand"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumb}
                alt={candidate.cardName}
                className="bg-surface-off h-[140px] w-[100px] rounded object-cover"
              />
            </button>
          ) : (
            <div className="bg-surface-off flex h-[140px] w-[100px] shrink-0 items-center justify-center rounded text-xs text-text-faint">
              Pas d&apos;image
            </div>
          )}
          <div className="flex flex-col gap-1 text-sm">
            <p className="font-medium">{candidate.cardName}</p>
            {candidate.setName && (
              <p className="text-text-muted text-xs">
                {candidate.setName}
                {candidate.setCode ? ` (${candidate.setCode})` : ''}
              </p>
            )}
            <p className="text-text-muted text-xs">
              {candidate.language} · {candidate.rarity} · {candidate.condition}
              {variantLabel ? ` · ${variantLabel}` : ''}
            </p>
          </div>
        </div>

        {error && <p className="text-red mb-3 text-xs">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-2 text-sm disabled:opacity-50"
          >
            Garder en Stock
          </button>
          <button
            type="button"
            onClick={promote}
            disabled={submitting}
            className="bg-red text-bg inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5" />
            {submitting ? 'Patientez…' : 'Mettre en vente'}
          </button>
        </div>

        {zoomSrc && (
          <CardZoomModal src={zoomSrc} alt={candidate.cardName} onClose={() => setZoomSrc(null)} />
        )}
      </div>

      {exchangeMode && (
        <ExchangeOnConflictModal
          newCard={exchangeMode.newCard}
          conflictCard={exchangeMode.conflictCard}
          onClose={() => setExchangeMode(null)}
          onExchanged={() => {
            setExchangeMode(null);
            onPromoted();
          }}
        />
      )}
    </div>
  );
}
