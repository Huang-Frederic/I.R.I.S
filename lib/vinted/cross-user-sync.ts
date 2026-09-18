import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * When a card is sold by one user, any OTHER user's active Vinted listing
 * for the same physical card is now for a card that no longer exists to
 * sell — enqueue a 'delete' job for each one. 'delete' jobs are excluded
 * from the daily posting quota (see vinted_bot's scheduling loop): this
 * must never eat into the other user's own posting budget.
 */
export async function enqueueCrossUserDeleteJobs(
  supabase: SupabaseClient,
  cardId: string,
  soldByUserId: string,
): Promise<void> {
  const { data: siblingListings } = await supabase
    .from('card_listings')
    .select('user_id, vinted_listing_id')
    .eq('card_id', cardId)
    .neq('user_id', soldByUserId)
    .not('vinted_listing_id', 'is', null);

  for (const listing of siblingListings ?? []) {
    await supabase.from('vinted_post_jobs').insert({
      card_id: cardId,
      user_id: listing.user_id,
      job_type: 'delete',
      status: 'pending',
    });
  }
}
