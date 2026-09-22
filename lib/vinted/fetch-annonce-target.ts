import type { SupabaseClient } from '@supabase/supabase-js';
import type { Card, CardListing, Lot } from '@/lib/types';

/**
 * On-demand fetch for the "view listing" button on /vinted/bot: the bot
 * page's queue/repost rows only carry id/name/price/imageUrl, not enough for
 * AnnonceModal — this loads the full row + listings, same columns
 * app/(app)/vinted/page.tsx already selects for the main Vinted list.
 */
export async function fetchCardAnnonceTarget(
  supabase: SupabaseClient,
  cardId: string,
): Promise<{ card: Card; listings: CardListing[] } | null> {
  const [cardRes, listingsRes] = await Promise.all([
    supabase.from('cards').select('*').eq('id', cardId).single(),
    supabase
      .from('card_listings')
      .select('card_id, user_id, listed_at, vinted_listing_id, vinted_posted_at')
      .eq('card_id', cardId),
  ]);
  if (cardRes.error || !cardRes.data) return null;
  return { card: cardRes.data as Card, listings: (listingsRes.data ?? []) as CardListing[] };
}

/** LotAnnonceModal doesn't take a `listings` prop, so no second query needed. */
export async function fetchLotAnnonceTarget(
  supabase: SupabaseClient,
  lotId: string,
): Promise<{ lot: Lot } | null> {
  const { data, error } = await supabase.from('lots').select('*').eq('id', lotId).single();
  if (error || !data) return null;
  return { lot: data as Lot };
}
