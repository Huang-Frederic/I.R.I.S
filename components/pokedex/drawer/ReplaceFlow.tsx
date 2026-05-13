'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { X, Sparkles, Package, Tag } from 'lucide-react';
import type { Card } from '@/lib/types';
import { RARITY_COLOR } from '@/lib/utils/labels';
import { displayCardName } from '@/lib/utils/format-name';
import { translateErrorCode } from '@/lib/utils/translate-error';
import Modal from '@/components/ui/Modal';

/** Candidate picker + 2-step swap confirmation flow. The replace RPC is
 *  3-step on the server (move existing card to temp status, move new card
 *  to pokedex, move existing to final destination) — see migration
 *  `fix_replace_pokedex_card_3step`. */
export default function ReplaceFlow({
  currentCard,
  candidates,
  onCancel,
}: {
  currentCard: Card;
  candidates: Card[];
  onCancel: () => void;
}) {
  const t = useTranslations('pokedex');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // After picking a candidate, surface a confirm modal so the user explicitly
  // chooses where the DISPLACED Pokédex card goes (Stock vs Vinted). Both
  // destinations are valid — the unique constraint on for_sale is freed when
  // the candidate vacates its slot in the swap RPC.
  const [confirmCandidate, setConfirmCandidate] = useState<Card | null>(null);

  async function performReplace(candidate: Card, displaceTo: 'collection' | 'for_sale') {
    setPending(candidate.id);
    setError(null);
    try {
      const res = await fetch('/api/pokedex/replace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          old_card_id: currentCard.id,
          old_new_status: displaceTo,
          new_card_id: candidate.id,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
        const localized = translateErrorCode(tErrors, body.error);
        throw new Error(localized ?? body.message ?? t('replaceFailed', { status: res.status }));
      }
      router.refresh();
      setConfirmCandidate(null);
      onCancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('errorUnknown'));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-text-muted text-xs">{t('replaceChoosePrompt')}</p>
        <button
          type="button"
          onClick={onCancel}
          className="text-text-muted hover:text-text text-xs underline"
        >
          {tCommon('cancel')}
        </button>
      </div>
      {candidates.map((c) => (
        <button
          key={c.id}
          type="button"
          disabled={pending !== null}
          onClick={() => setConfirmCandidate(c)}
          className="bg-surface-2 hover:border-red border-border flex items-center gap-3 rounded border p-2 text-left text-sm transition-colors disabled:opacity-50"
        >
          <Sparkles className="text-rarity-ar h-4 w-4 shrink-0" />
          <div className="flex-1 truncate">
            <p className="truncate">
              <span className={RARITY_COLOR[c.rarity]}>{c.rarity}</span> · {c.language} · {c.condition}
            </p>
            <p className="text-text-faint truncate font-mono text-xs">
              {c.set_code ?? '—'} {c.set_number ?? ''} ·{' '}
              {c.status === 'for_sale' ? t('candidateLocationVinted') : t('candidateLocationStock')}
            </p>
          </div>
          {pending === c.id && (
            <div className="border-text-muted border-t-transparent h-4 w-4 animate-spin rounded-full border-2" />
          )}
        </button>
      ))}
      {error && <p className="text-red text-xs">{error}</p>}

      {confirmCandidate && (
        <ReplaceConfirm
          currentCard={currentCard}
          candidate={confirmCandidate}
          submitting={pending === confirmCandidate.id}
          error={error}
          onConfirm={(displaceTo) => void performReplace(confirmCandidate, displaceTo)}
          onCancel={() => {
            setConfirmCandidate(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}

function ReplaceConfirm({
  currentCard,
  candidate,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  currentCard: Card;
  candidate: Card;
  submitting: boolean;
  error: string | null;
  onConfirm: (displaceTo: 'collection' | 'for_sale') => void;
  onCancel: () => void;
}) {
  const t = useTranslations('pokedex');
  const tCommon = useTranslations('common');
  return (
    <Modal
      open={true}
      onClose={onCancel}
      ariaLabel={t('replaceConfirmAria')}
      closeOnBackdrop={!submitting}
      closeOnEscape={!submitting}
      className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl"
    >
      <div className="mb-3 flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t('replaceConfirmTitle')}</h2>
          <p className="text-text-muted mt-1 text-sm">
            {t.rich('replaceConfirmBody', {
              name: displayCardName(candidate),
              rarity: candidate.rarity,
              condition: candidate.condition,
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="text-text-muted hover:text-text disabled:opacity-50"
          aria-label={t('drawerCloseInnerAria')}
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <p className="text-text-muted mb-3 text-xs">
        {t('replaceConfirmDestPrompt', { rarity: currentCard.rarity, condition: currentCard.condition })}
      </p>

      {error && <p className="text-red mb-3 text-xs">{error}</p>}

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-2 text-sm disabled:opacity-50"
        >
          {tCommon('cancel')}
        </button>
        <button
          type="button"
          onClick={() => onConfirm('collection')}
          disabled={submitting}
          className="bg-surface-2 hover:bg-surface-off border-border inline-flex items-center justify-center gap-1.5 rounded border px-4 py-2 text-sm disabled:opacity-50"
        >
          <Package className="h-3.5 w-3.5" />
          {t('replaceConfirmDestStock')}
        </button>
        <button
          type="button"
          onClick={() => onConfirm('for_sale')}
          disabled={submitting}
          className="bg-red text-bg inline-flex items-center justify-center gap-1.5 rounded px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          <Tag className="h-3.5 w-3.5" />
          {t('replaceConfirmDestVinted')}
        </button>
      </div>
    </Modal>
  );
}
