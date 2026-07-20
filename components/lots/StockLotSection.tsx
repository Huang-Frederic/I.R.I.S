'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Package, Tag } from 'lucide-react';
import type { Lot } from '@/lib/types';
import { translateErrorCode } from '@/lib/utils/translate-error';
import LotQuantityChip from './LotQuantityChip';

interface Props {
  lots: Lot[];
}

/**
 * "Lots en stock" section on /stock — collection lots waiting to go (back)
 * on sale. Kept separate from the card StockList: lots have no group key,
 * no Pokédex badge, and their own quantity column.
 */
export default function StockLotSection({ lots: initial }: Props) {
  const router = useRouter();
  const t = useTranslations('lots');
  const tErrors = useTranslations('errors');
  const [lots, setLots] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (lots.length === 0) return null;

  const storagePublicUrl = (path: string) =>
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/lot-photos/${path}`;

  async function putOnSale(lot: Lot) {
    setBusyId(lot.id);
    try {
      const res = await fetch(`/api/lots/${lot.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'for_sale' }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(translateErrorCode(tErrors, json.error) ?? json.message ?? tErrors('unexpected'));
        return;
      }
      setLots((prev) => prev.filter((l) => l.id !== lot.id));
      router.refresh();
    } catch (e) {
      console.error('putOnSale failed:', e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-8">
      <h2 className="text-text-muted mb-3 text-sm font-medium">
        {t('stockSectionTitle', { count: lots.length })}
      </h2>
      <ul className="space-y-2">
        {lots.map((lot) => {
          const thumb = lot.photo_urls.length > 0 ? storagePublicUrl(lot.photo_urls[0]) : null;
          return (
            <li
              key={lot.id}
              className="bg-surface border-border flex items-center gap-2 rounded-lg border p-2 text-sm sm:gap-3 sm:p-3"
            >
              {thumb ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={thumb}
                  alt=""
                  loading="lazy"
                  className="bg-surface-off h-[70px] w-[50px] shrink-0 rounded object-cover sm:h-[84px] sm:w-[60px]"
                />
              ) : (
                <div className="bg-surface-off flex h-[70px] w-[50px] shrink-0 items-center justify-center rounded sm:h-[84px] sm:w-[60px]">
                  <Package className="text-text-faint h-6 w-6" />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium sm:text-sm">{lot.name}</p>
                <div className="text-text-muted mt-1 flex flex-wrap items-center gap-1 text-[10px] sm:gap-2 sm:text-xs">
                  {lot.language && <span className="font-mono">{lot.language}</span>}
                  <span>·</span>
                  <span>{lot.condition}</span>
                  {lot.price !== null && (
                    <>
                      <span>·</span>
                      <span className="text-rarity-sr font-mono">{lot.price.toFixed(2)} €</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <LotQuantityChip
                  lotId={lot.id}
                  quantity={lot.quantity ?? 1}
                  onSaved={(lotId, q) =>
                    setLots((prev) => prev.map((l) => (l.id === lotId ? { ...l, quantity: q } : l)))
                  }
                />
                <button
                  type="button"
                  onClick={() => void putOnSale(lot)}
                  disabled={busyId === lot.id}
                  className="bg-red text-bg shrink-0 rounded px-3 py-1.5 text-xs font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <Tag className="mr-1 inline h-3.5 w-3.5" />
                  {t('putOnSaleButton')}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
