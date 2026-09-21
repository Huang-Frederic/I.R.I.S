import { BRAND_LABELS } from './brand-labels';

const POKEMON_BRAND_ID = 191646;

export interface GroupKeyInput {
  cardId: string | null;
  /** cards.language enum value (e.g. 'FR', 'JP'). Only meaningful for cards. */
  language: string | null;
  /** lots.brand_id. Only meaningful for lots. */
  brandId: number | null;
}

/**
 * A card always groups by "Pokémon {language}". A lot has no language
 * column, so a Pokémon lot (brand_id null or the explicit Pokémon brand id)
 * groups as plain "Pokémon"; any other lot groups by its brand's label.
 */
export function groupKeyFor(item: GroupKeyInput): string {
  if (item.cardId !== null) {
    return `Pokémon ${item.language ?? '?'}`;
  }
  if (item.brandId === null || item.brandId === POKEMON_BRAND_ID) {
    return 'Pokémon';
  }
  return BRAND_LABELS[item.brandId] ?? 'Autres';
}
