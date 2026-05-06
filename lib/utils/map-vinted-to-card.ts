import type { CardRarity, EnrichedCard } from '@/lib/types';
import type { ParsedListing, VintedItem } from '@/lib/types/vinted-import';

/**
 * Plain object cible pour `supabase.from('cards').insert(...)`.
 *
 * Volontairement non-typé via Database['public']['Tables']['cards']['Insert']
 * car ce repo n'a pas de types DB générés. La shape MUST match the actual
 * Postgres schema declared in supabase/migrations/20260425224142_initial_schema.sql.
 *
 * NOT NULL columns (must always be set):
 *   pokemon_name, pokemon_number (1..1025), card_name, language, rarity, condition, status
 * Nullable columns: card_id_tcg, set_name, set_code, set_number, image_url,
 *   tcg_image_url, cardmarket_id, cm_*, suggested_price, date_sold, notes, variant
 *
 * `set_total` does NOT exist on the cards table — don't add it.
 */
export interface CardInsertRow {
  pokemon_name: string;
  pokemon_number: number;
  card_name: string;
  card_id_tcg: string | null;
  set_code: string | null;
  set_number: string | null;
  set_name: string | null;
  language: string;
  condition: string;
  rarity: string;
  status: 'for_sale';
  image_url: string | null;
  tcg_image_url: string | null;
  cardmarket_id: string | null;
  cm_price_low: number | null;
  cm_price_trend: number | null;
  cm_price_avg: number | null;
  cm_updated_at: string | null;
  suggested_price: number | null;
  date_added: string;
  notes: string | null;
  variant: string | null;
}

/**
 * Returns the card row to INSERT, OR a string explaining why the item can't
 * be imported (typically because enrichment failed AND the parsed listing
 * doesn't carry a usable pokemon_number — the schema requires it 1..1025).
 */
export function mapVintedToCardInsert(
  vinted: VintedItem,
  parsed: ParsedListing,
  enriched: EnrichedCard | null,
  uploadedImageUrl: string,
): CardInsertRow | { skipReason: string } {
  // Guard: pokemon_number is NOT NULL with a 1..1025 check on the column.
  // Only enrichment provides it reliably (the description regex doesn't).
  const pokemonNumber = enriched?.pokemon_number;
  if (typeof pokemonNumber !== 'number' || pokemonNumber < 1 || pokemonNumber > 1025) {
    return { skipReason: 'enrich_missing_pokemon_number' };
  }

  const price = Number(vinted.price.amount);
  const now = new Date().toISOString();
  const cmHasAny =
    enriched?.cm_price_low != null ||
    enriched?.cm_price_trend != null ||
    enriched?.cm_price_avg != null;

  // Fallbacks for the other NOT NULL columns. Vinted's title is human-readable,
  // so it's a reasonable backstop when the enriched fields are missing.
  const truncatedTitle = vinted.title.slice(0, 200);
  // `||` not `??`: treat empty strings as missing too (NOT NULL columns).
  const cardName = enriched?.card_name || truncatedTitle;
  const pokemonName = enriched?.pokemon_name || truncatedTitle;
  const rarity: CardRarity = enriched?.rarity ?? 'OTHER';

  return {
    pokemon_name: pokemonName,
    pokemon_number: pokemonNumber,
    card_name: cardName,
    card_id_tcg: enriched?.card_id_tcg ?? null,
    set_code: enriched?.set_code ?? parsed.setCode,
    set_number: enriched?.set_number ?? parsed.setNumber,
    set_name: enriched?.set_name ?? null,
    language: parsed.language,
    condition: parsed.condition,
    rarity,
    status: 'for_sale',
    image_url: uploadedImageUrl || null,
    tcg_image_url: enriched?.tcg_image_url || null,
    cardmarket_id: enriched?.cardmarket_id ?? null,
    cm_price_low: enriched?.cm_price_low ?? null,
    cm_price_trend: enriched?.cm_price_trend ?? null,
    cm_price_avg: enriched?.cm_price_avg ?? null,
    cm_updated_at: cmHasAny ? now : null,
    suggested_price: Number.isFinite(price) ? price : null,
    date_added: now,
    notes: null,
    variant: null,
  };
}
