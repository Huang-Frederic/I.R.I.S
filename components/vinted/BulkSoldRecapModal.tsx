'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronLeft, ChevronRight, X, AlertTriangle, Check } from 'lucide-react';
import type { BulkSoldItem } from './BulkSoldModal';
import type { RestockAlert } from '@/lib/utils/restock-detection';
import { displayCardName } from '@/lib/utils/format-name';

interface Props {
  items: BulkSoldItem[];
  restocks: RestockAlert[];
  onClose: () => void;
}

function thumbUrl(item: BulkSoldItem): string | null {
  if (item.kind === 'card') {
    if (item.card.image_url) return item.card.image_url;
    if (item.card.tcg_image_url) return item.card.tcg_image_url;
    return `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${item.card.pokemon_number}.png`;
  }
  if (item.lot.photo_urls.length === 0) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${item.lot.photo_urls[0]}`;
}

function displayName(item: BulkSoldItem): string {
  return item.kind === 'card' ? displayCardName(item.card) : item.lot.name;
}

export default function BulkSoldRecapModal({ items, restocks, onClose }: Props) {
  const t = useTranslations('vintedSold');
  const tCommon = useTranslations('common');
  const [index, setIndex] = useState(0);
  const total = items.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, total]);

  const current = items[index];
  const thumb = current ? thumbUrl(current) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border-border w-full max-w-md rounded-lg border p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold inline-flex items-center gap-2">
              <Check className="text-red h-5 w-5" />
              {t('recapItemsSold', { count: total })}
            </h2>
            <p className="text-text-muted mt-1 text-sm">
              {t('recapPosition', { index: index + 1, total, name: current ? displayName(current) : '' })}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-muted hover:text-text"
            aria-label={tCommon('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative my-4 flex items-center justify-center">
          {total > 1 && (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
              aria-label={t('recapPaginationPrev')}
              className="absolute left-0 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}

          {thumb ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={thumb}
              alt={current ? displayName(current) : ''}
              className="bg-surface-off h-[280px] w-[200px] rounded object-cover"
            />
          ) : (
            <div className="bg-surface-off flex h-[280px] w-[200px] items-center justify-center rounded text-text-faint text-xs">
              {tCommon('noImage')}
            </div>
          )}

          {total > 1 && (
            <button
              type="button"
              onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
              disabled={index === total - 1}
              aria-label={t('recapPaginationNext')}
              className="absolute right-0 z-10 rounded-full bg-black/50 p-1.5 text-white hover:bg-black/70 disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          )}
        </div>

        {total > 1 && (
          <div className="mb-4 flex justify-center gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={t('recapPaginationDot', { index: i + 1 })}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? 'bg-red w-6' : 'bg-surface-off w-1.5 hover:bg-text-muted'
                }`}
              />
            ))}
          </div>
        )}

        {restocks.length > 0 && (
          <div className="bg-surface-2 border-red mb-4 rounded border p-3 text-sm">
            <div className="flex items-start gap-2">
              <AlertTriangle className="text-red mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <p className="font-medium">
                  {t('recapRestockTitle', { count: restocks.length })}
                </p>
                <ul className="text-text-muted mt-1 space-y-0.5 text-xs">
                  {restocks.map((r, i) => (
                    <li key={i}>{t('recapRestockExposed', { name: r.pokemon_name })}</li>
                  ))}
                </ul>
                <Link href="/pokedex" className="text-red mt-1 inline-block text-xs underline">
                  {t('recapRestockLink')}
                </Link>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bg-red text-bg rounded px-4 py-1.5 text-sm font-medium hover:opacity-90"
          >
            {t('recapContinue')}
          </button>
        </div>
      </div>
    </div>
  );
}
