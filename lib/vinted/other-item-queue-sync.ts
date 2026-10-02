// lib/vinted/other-item-queue-sync.ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** Hardcoded, not env-configurable — other_items is Fred-only by design
 *  (see docs/superpowers/specs/2026-10-02-vinted-other-items-design.md),
 *  unlike cards/lots which loop over every Vinted-enabled user. */
export const FRED_USER_ID = '35385d3c-5966-4a10-8568-8d92d1be47e7';

/**
 * Keeps vinted_queue in sync with one other_item's current status, the same
 * way lib/vinted/queue-sync.ts does for cards — except scoped to Fred only
 * (no loop over vintedEnabledUserIds()) and with a simpler eligibility rule
 * (status === 'for_sale'; other_items has no price_confirmed_at gate since
 * Fred sets the price by hand at creation, nothing to auto-confirm later).
 */
export async function syncOtherItemQueueMembership(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  otherItemId: string,
): Promise<void> {
  const { data: item } = await supabase.from('other_items').select('status').eq('id', otherItemId).single();
  if (!item) return;
  const eligible = item.status === 'for_sale';

  const { data: activeListing } = await supabase
    .from('other_item_listings')
    .select('vinted_listing_id')
    .eq('other_item_id', otherItemId)
    .eq('user_id', FRED_USER_ID)
    .maybeSingle();
  const alreadyListed = !!activeListing?.vinted_listing_id;

  const { data: existingQueueRow } = await supabase
    .from('vinted_queue')
    .select('id')
    .eq('user_id', FRED_USER_ID)
    .eq('other_item_id', otherItemId)
    .maybeSingle();

  const shouldBeQueued = eligible && !alreadyListed;
  const isQueued = !!existingQueueRow;

  if (shouldBeQueued && !isQueued) {
    const { data: maxRows } = await supabase
      .from('vinted_queue')
      .select('position')
      .eq('user_id', FRED_USER_ID)
      .order('position', { ascending: false })
      .limit(1);
    const nextPosition = (maxRows?.[0]?.position ?? 0) + 1;
    await supabase.from('vinted_queue').insert({ user_id: FRED_USER_ID, other_item_id: otherItemId, position: nextPosition });
  } else if (!shouldBeQueued && isQueued) {
    await supabase.from('vinted_queue').delete().eq('user_id', FRED_USER_ID).eq('other_item_id', otherItemId);
  }
}
