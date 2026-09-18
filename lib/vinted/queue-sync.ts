// lib/vinted/queue-sync.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { isEligibleForQueue } from './queue-eligibility';

function vintedEnabledUserIds(): string[] {
  return (process.env.VINTED_USER_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
}

/**
 * Keeps `vinted_queue` in sync with one card's current status/price after a
 * mutation (see app/api/cards/[id]/route.ts). A card enters EVERY
 * Vinted-enabled user's own queue independently once eligible — the app
 * already lets both users list the same physical card on separate
 * accounts (card_listings has no such restriction) — except a user who
 * already has an active listing for it doesn't need a redundant queue
 * entry. Ineligible (or already-listed) users get their queue entry
 * removed, if one exists.
 */
export async function syncVintedQueueMembership(supabase: SupabaseClient, cardId: string): Promise<void> {
  const { data: card, error: cardError } = await supabase
    .from('cards')
    .select('status, price_confirmed_at')
    .eq('id', cardId)
    .single();
  if (cardError) {
    console.error('syncVintedQueueMembership: failed to fetch card:', cardError);
  }
  if (!card) return;

  const eligible = isEligibleForQueue(card);
  const userIds = vintedEnabledUserIds();

  const { data: activeListings, error: activeListingsError } = await supabase
    .from('card_listings')
    .select('user_id')
    .eq('card_id', cardId)
    .not('vinted_listing_id', 'is', null);
  if (activeListingsError) {
    console.error('syncVintedQueueMembership: failed to fetch active listings:', activeListingsError);
  }
  const activeUserIds = new Set((activeListings ?? []).map((l: { user_id: string }) => l.user_id));

  const { data: existingQueueRows, error: existingQueueError } = await supabase
    .from('vinted_queue')
    .select('user_id')
    .eq('card_id', cardId);
  if (existingQueueError) {
    console.error('syncVintedQueueMembership: failed to fetch existing queue rows:', existingQueueError);
  }
  const existingUserIds = new Set((existingQueueRows ?? []).map((r: { user_id: string }) => r.user_id));

  for (const userId of userIds) {
    const shouldBeQueued = eligible && !activeUserIds.has(userId);
    const isQueued = existingUserIds.has(userId);

    if (shouldBeQueued && !isQueued) {
      const { data: maxRows, error: maxRowsError } = await supabase
        .from('vinted_queue')
        .select('position')
        .eq('user_id', userId)
        .order('position', { ascending: false })
        .limit(1);
      if (maxRowsError) {
        console.error('syncVintedQueueMembership: failed to fetch max position:', maxRowsError);
      }
      const nextPosition = (maxRows?.[0]?.position ?? 0) + 1;
      const { error: insertError } = await supabase
        .from('vinted_queue')
        .insert({ user_id: userId, card_id: cardId, position: nextPosition });
      if (insertError) {
        console.error('syncVintedQueueMembership: failed to insert queue row:', insertError);
      }
    } else if (!shouldBeQueued && isQueued) {
      const { error: deleteError } = await supabase
        .from('vinted_queue')
        .delete()
        .eq('user_id', userId)
        .eq('card_id', cardId);
      if (deleteError) {
        console.error('syncVintedQueueMembership: failed to delete queue row:', deleteError);
      }
    }
  }
}
