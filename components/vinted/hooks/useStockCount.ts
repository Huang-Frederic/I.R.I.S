'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { Card } from '@/lib/types';
import { groupKey } from '@/lib/utils/group-cards';
import { translateErrorCode } from '@/lib/utils/translate-error';

/**
 * Manage the per-row "× N en stock" chip on Vinted rows: count by group key
 * + diff-and-apply when the user types a new target. Cloning uses the for_sale
 * head as source (clone always lands in 'collection'); deleting picks the
 * freshest collection rows so the originals stay. target=0 deletes them all.
 *
 * Owns the local `collectionCards` state because every clone/delete updates
 * it optimistically.
 */
export function useStockCount(
  collectionCards: Card[],
  setCollectionCards: React.Dispatch<React.SetStateAction<Card[]>>,
) {
  const tErrors = useTranslations('errors');
  const tCommon = useTranslations('common');
  const tStock = useTranslations('stock');
  /** Set of group keys currently mid-clone/delete — used to disable the chip
   *  during the round-trip and avoid double-clicks. */
  const [stockBusyKeys, setStockBusyKeys] = useState<Set<string>>(new Set());

  const stockCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of collectionCards) {
      const k = groupKey(c);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [collectionCards]);

  async function handleSetStockCount(forSaleHead: Card, target: number) {
    if (target < 0) return;
    const key = groupKey(forSaleHead);
    const matching = collectionCards.filter((c) => groupKey(c) === key);
    const diff = target - matching.length;
    if (diff === 0) return;

    setStockBusyKeys((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      if (diff > 0) {
        const results = await Promise.all(
          Array.from({ length: diff }, async () => {
            const res = await fetch(`/api/cards/${forSaleHead.id}/clone`, { method: 'POST' });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
              const localized = translateErrorCode(tErrors, body.error);
              throw new Error(localized ?? body.message ?? tStock('cloneFailed', { status: res.status }));
            }
            return ((await res.json()) as { card: Card }).card;
          }),
        );
        setCollectionCards((prev) => [...prev, ...results]);
      } else {
        // Drop the |diff| FRESHEST copies (or all if target=0).
        const sorted = [...matching].sort((a, b) => a.date_added.localeCompare(b.date_added));
        const toDelete = sorted.slice(target);
        await Promise.all(
          toDelete.map(async (c) => {
            const res = await fetch(`/api/cards/${c.id}`, { method: 'DELETE' });
            if (!res.ok) {
              const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
              const localized = translateErrorCode(tErrors, body.error);
              throw new Error(localized ?? body.message ?? tStock('deleteFailed', { status: res.status }));
            }
          }),
        );
        const droppedIds = new Set(toDelete.map((c) => c.id));
        setCollectionCards((prev) => prev.filter((c) => !droppedIds.has(c.id)));
      }
    } catch (err) {
      console.error('handleSetStockCount failed:', err);
      alert(err instanceof Error ? err.message : tCommon('errorUnknown'));
    } finally {
      setStockBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }

  return {
    stockCountByGroup,
    stockBusyKeys,
    handleSetStockCount,
  };
}
