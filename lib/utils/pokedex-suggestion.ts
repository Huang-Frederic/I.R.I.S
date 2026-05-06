import type { Card, CardLanguage, CardRarity } from '@/lib/types';

export type SuggestionAction = 'add_to_pokedex' | 'add_to_vinted' | 'add_to_collection';

export type SuggestionType = 'no_pokemon_number' | 'no_entry' | 'can_replace' | 'keep_existing';

export interface SuggestionResult {
  type: SuggestionType;
  existingCard?: Card;
  message: string;
  primaryAction: SuggestionAction;
  secondaryActions: SuggestionAction[];
}

export interface NewCardInput {
  pokemon_number: number | null | undefined;
  pokemon_name?: string | null;
  rarity?: CardRarity | null;
  rarity_rank: number;
  language?: CardLanguage | null;
  /** Optional — used as a tie-breaker when ranks are equal. */
  cm_price_trend?: number | null;
}

const PRICE_BREAKER_MARGIN = 1.1;

/**
 * Decide where a freshly scanned card should land relative to the user's existing
 * Pokédex slot for the same pokemon_number. Pure function — the caller fetches
 * `existingCard` separately so this stays trivially testable.
 *
 * Spec: context.md section 6.
 */
export function computePokedexSuggestion(
  newCard: NewCardInput,
  existingCard: Card | null,
): SuggestionResult {
  if (!newCard.pokemon_number) {
    return {
      type: 'no_pokemon_number',
      message: 'Carte non-Pokémon (Trainer / Énergie / Stadium) — pas de slot Pokédex.',
      primaryAction: 'add_to_vinted',
      secondaryActions: ['add_to_collection'],
    };
  }

  const name = newCard.pokemon_name ?? `n°${newCard.pokemon_number}`;

  if (!existingCard) {
    return {
      type: 'no_entry',
      message: `Aucune carte pour ${name} dans ton Pokédex.`,
      primaryAction: 'add_to_pokedex',
      secondaryActions: ['add_to_vinted', 'add_to_collection'],
    };
  }

  const newRank = newCard.rarity_rank;
  const existingRank = existingCard.rarity_rank;

  if (newRank > existingRank) {
    return {
      type: 'can_replace',
      existingCard,
      message: `Cette carte (${newCard.rarity ?? '?'} ${newCard.language ?? ''}) est plus rare que celle dans ton classeur (${existingCard.rarity} ${existingCard.language}).`,
      primaryAction: 'add_to_pokedex',
      secondaryActions: ['add_to_vinted', 'add_to_collection'],
    };
  }

  if (newRank === existingRank) {
    const newPrice = newCard.cm_price_trend ?? 0;
    const existingPrice = existingCard.cm_price_trend ?? 0;
    if (existingPrice > 0 && newPrice > existingPrice * PRICE_BREAKER_MARGIN) {
      return {
        type: 'can_replace',
        existingCard,
        message: `Même rareté que ton classeur, mais prix Cardmarket plus élevé (${newPrice.toFixed(2)} € vs ${existingPrice.toFixed(2)} €).`,
        primaryAction: 'add_to_pokedex',
        secondaryActions: ['add_to_vinted', 'add_to_collection'],
      };
    }
  }

  return {
    type: 'keep_existing',
    existingCard,
    message: `Tu as déjà un ${existingCard.rarity} ${existingCard.language} de ${name} dans ton classeur.`,
    primaryAction: 'add_to_vinted',
    secondaryActions: ['add_to_collection', 'add_to_pokedex'],
  };
}

export function actionToStatus(action: SuggestionAction): 'pokedex' | 'for_sale' | 'collection' {
  switch (action) {
    case 'add_to_pokedex':
      return 'pokedex';
    case 'add_to_vinted':
      return 'for_sale';
    case 'add_to_collection':
      return 'collection';
  }
}
