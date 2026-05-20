'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { X, Tag } from 'lucide-react';
import type { PromoteCandidate } from '@/lib/utils/promote-detection';
import { VARIANT_LABEL } from '@/lib/utils/labels';
import { translateErrorCode } from '@/lib/utils/translate-error';

interface Props {
  candidates: PromoteCandidate[];
  onClose: () => void;
  /** Called with array of card IDs that were successfully promoted. */
  onPromoted: (promotedIds: string[]) => void;
}

export default function BulkPromoteModal({ candidates, onClose, onPromoted }: Props) {
  const t = useTranslations('vintedPromote');
  const tCommon = useTranslations('common');
  const tErrors = useTranslations('errors');
  const [checked, setChecked] = useState<Set<string>>(() => new Set(candidates.map((c) => c.cardId)));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  useEffect(() => {
    if (submitting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [submitting, onClose]);

  async function submit() {
    setSubmitting(true);
    setError(null);
    const toPromote = candidates.filter((c) => checked.has(c.cardId));
    const promoted: string[] = [];
    const errors: string[] = [];

    for (const c of toPromote) {
      const res = await fetch(`/api/cards/${c.cardId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'for_sale' }),
      });
      if (res.ok) {
        promoted.push(c.cardId);
      } else {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const localized = translateErrorCode(tErrors, body.error);
        errors.push(`${c.cardName}: ${localized ?? body.error ?? tCommon('errorUnknown')}`);
      }
    }

    if (errors.length > 0) {
      setError(errors.join('\n'));
      setSubmitting(false);
    } else {
      onPromoted(promoted);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={submitting ? undefined : onClose}
    >
      <div
        className="bg-surface border-border w-full max-w-lg rounded-lg border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t('bulkPromoteTitle')}</h2>
            <p className="text-text-muted mt-1 text-sm">
              {t('bulkPromoteSubtitle', { count: candidates.length })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted hover:text-text disabled:opacity-50"
            aria-label={tCommon('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <ul className="mb-4 max-h-60 space-y-1.5 overflow-y-auto pr-1">
          {candidates.map((c) => {
            const variantLabel = c.variant ? (VARIANT_LABEL[c.variant] ?? c.variant) : null;
            const thumb = c.imageUrl ?? c.tcgImageUrl;
            return (
              <li
                key={c.cardId}
                className="bg-surface-2 flex cursor-pointer items-center gap-3 rounded p-2 text-sm"
                onClick={() => toggle(c.cardId)}
              >
                <input
                  type="checkbox"
                  readOnly
                  checked={checked.has(c.cardId)}
                  className="h-4 w-4 shrink-0 accent-red-500"
                />
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="bg-surface-off h-10 w-7 shrink-0 rounded object-cover" />
                ) : (
                  <div className="bg-surface-off h-10 w-7 shrink-0 rounded" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.cardName}</p>
                  <p className="text-text-muted text-xs">
                    {c.language} · {c.rarity} · {c.condition}
                    {variantLabel ? ` · ${variantLabel}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        {error && <p className="text-red mb-3 whitespace-pre-wrap text-xs">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="bg-surface-2 hover:bg-surface-off border-border rounded border px-4 py-1.5 text-sm disabled:opacity-50"
          >
            {t('keep')}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || checked.size === 0}
            className="bg-red text-bg inline-flex items-center gap-1.5 rounded px-4 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            <Tag className="h-3.5 w-3.5" />
            {submitting ? t('submitting') : t('bulkPromoteConfirm', { count: checked.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
