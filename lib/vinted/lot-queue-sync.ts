// lib/vinted/lot-queue-sync.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { vintedEnabledUserIds } from './queue-sync';

/** A lot goes in the posting queue once it's for sale with a price. Unlike
 *  cards there's no price_confirmed_at gate: no cron ever prices a lot, the
 *  price is always the one Fred typed. */
export function isLotEligibleForQueue(lot: { status: string; price: number | null }): boolean {
  return lot.status === 'for_sale' && lot.price !== null && lot.price > 0;
}

/**
 * Keeps `vinted_queue` in sync with one lot, the way queue-sync.ts does for
 * cards: an eligible lot enters every Vinted-enabled account's queue unless
 * that account already has it online; an ineligible one leaves every queue.
 * Until 2026-10-07 nothing in the app queued lots at all — they only went
 * online through "Poster maintenant".
 *
 * `consumedListingUserId`: selling one copy of a quantity>1 lot keeps the lot
 * for sale, but the seller's ad was the one bought — the client drops that
 * listing row after the response, so it's counted as gone here and the
 * remaining copies get queued again on the seller's account.
 */
export async function syncLotQueueMembership(
  supabase: SupabaseClient,
  lotId: string,
  { consumedListingUserId }: { consumedListingUserId?: string } = {},
): Promise<void> {
  const { data: lot, error: lotError } = await supabase.from('lots').select('status, price').eq('id', lotId).single();
  if (lotError) console.error('syncLotQueueMembership: failed to fetch lot:', lotError);
  if (!lot) return;
  const eligible = isLotEligibleForQueue(lot);

  const { data: activeListings, error: activeListingsError } = await supabase
    .from('lot_listings')
    .select('user_id')
    .eq('lot_id', lotId)
    .not('vinted_listing_id', 'is', null);
  if (activeListingsError) console.error('syncLotQueueMembership: failed to fetch active listings:', activeListingsError);
  const listedUserIds = new Set(
    (activeListings ?? []).map((l: { user_id: string }) => l.user_id).filter((u) => u !== consumedListingUserId),
  );

  const { data: queueRows, error: queueError } = await supabase.from('vinted_queue').select('user_id').eq('lot_id', lotId);
  if (queueError) console.error('syncLotQueueMembership: failed to fetch queue rows:', queueError);
  const queuedUserIds = new Set((queueRows ?? []).map((r: { user_id: string }) => r.user_id));

  for (const userId of vintedEnabledUserIds()) {
    const shouldBeQueued = eligible && !listedUserIds.has(userId);
    const isQueued = queuedUserIds.has(userId);

    if (shouldBeQueued && !isQueued) {
      const { data: maxRows } = await supabase
        .from('vinted_queue')
        .select('position')
        .eq('user_id', userId)
        .order('position', { ascending: false })
        .limit(1);
      const position = (maxRows?.[0]?.position ?? 0) + 1;
      const { error } = await supabase.from('vinted_queue').insert({ user_id: userId, lot_id: lotId, position });
      if (error) console.error('syncLotQueueMembership: failed to insert queue row:', error);
    } else if (!shouldBeQueued && isQueued) {
      const { error } = await supabase.from('vinted_queue').delete().eq('user_id', userId).eq('lot_id', lotId);
      if (error) console.error('syncLotQueueMembership: failed to delete queue row:', error);
    }
  }
}
