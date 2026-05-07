// lib/utils/sibling-photos.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Updates `image_url` on all rows that share the same card identity (card_id_tcg
 * + language + condition + variant) as the reference card. Keeps the photo
 * invariant: same card → same photo.
 *
 * `excludeId` is the row that already has the new URL (so we don't redundantly
 * update it).
 */
export async function syncSiblingPhotos(
  supabase: SupabaseClient,
  reference: {
    card_id_tcg: string | null;
    language: string;
    condition: string;
    variant: string | null;
  },
  newImageUrl: string,
  excludeId: string,
): Promise<void> {
  if (!reference.card_id_tcg) return; // no identity key → can't match siblings
  // Pull all sibling IDs (variant filter is in JS — Supabase doesn't have a
  // good way to express COALESCE(variant, '') = X in the query builder).
  const { data: siblings } = await supabase
    .from('cards')
    .select('id, variant')
    .eq('card_id_tcg', reference.card_id_tcg)
    .eq('language', reference.language)
    .eq('condition', reference.condition)
    .neq('id', excludeId);
  const refVariant = reference.variant ?? null;
  const targetIds = (siblings ?? [])
    .filter((s) => (s.variant ?? null) === refVariant)
    .map((s) => s.id);
  if (targetIds.length === 0) return;
  await supabase.from('cards').update({ image_url: newImageUrl }).in('id', targetIds);
}
