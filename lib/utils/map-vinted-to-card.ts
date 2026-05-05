import type { EnrichedCard } from '@/lib/types';
import type { ParsedListing, VintedItem } from '@/lib/types/vinted-import';

/**
 * Plain object cible pour `supabase.from('cards').insert(...)`.
 * Volontairement non-typé via Database['public']['Tables']['cards']['Insert']
 * car ce repo n'a pas de types DB générés. Vérifier au runtime que la shape
 * matche le schéma actuel via les tests d'intégration (Task 9).
 */
export interface CardInsertRow {
  image_url: string | null;
  card_id_tcg: string | null;
  cardmarket_id: string | null;
  pokemon_name: string | null;
  pokemon_number: number | null;
  card_name: string | null;
  set_code: string;
  set_number: string;
  set_total: number | null;
  set_name: string | null;
  language: string;
  condition: string;
  rarity: string | null;
  variant: string | null;
  tcg_image_url: string | null;
  cm_price_low: number | null;
  cm_price_trend: number | null;
  cm_price_avg: number | null;
  cm_updated_at: string | null;
  suggested_price: number | null;
  status: 'for_sale';
  date_added: string;
  notes: string | null;
}

export function mapVintedToCardInsert(
  vinted: VintedItem,
  parsed: ParsedListing,
  enriched: EnrichedCard | null,
  uploadedImageUrl: string,
): CardInsertRow {
  const price = Number(vinted.price.amount);
  const now = new Date().toISOString();
  const cmHasAny =
    enriched?.cm_price_low != null ||
    enriched?.cm_price_trend != null ||
    enriched?.cm_price_avg != null;

  return {
    image_url: uploadedImageUrl || null,
    card_id_tcg: enriched?.card_id_tcg ?? null,
    cardmarket_id: enriched?.cardmarket_id ?? null,
    pokemon_name: enriched?.pokemon_name ?? null,
    pokemon_number: enriched?.pokemon_number ?? null,
    card_name: enriched?.card_name ?? null,
    set_code: enriched?.set_code ?? parsed.setCode,
    set_number: enriched?.set_number ?? parsed.setNumber,
    set_total: null,
    set_name: enriched?.set_name ?? null,
    language: parsed.language,
    condition: parsed.condition,
    rarity: enriched?.rarity ?? null,
    variant: null,
    tcg_image_url: enriched?.tcg_image_url || null,
    cm_price_low: enriched?.cm_price_low ?? null,
    cm_price_trend: enriched?.cm_price_trend ?? null,
    cm_price_avg: enriched?.cm_price_avg ?? null,
    cm_updated_at: cmHasAny ? now : null,
    suggested_price: Number.isFinite(price) ? price : null,
    status: 'for_sale',
    date_added: now,
    notes: null,
  };
}
