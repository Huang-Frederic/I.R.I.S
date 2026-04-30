import { describe, expect, it } from 'vitest';
import {
  actionToStatus,
  computePokedexSuggestion,
  type NewCardInput,
} from './pokedex-suggestion';
import type { Card } from '@/lib/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'existing-uuid',
    pokemon_name: 'Dracaufeu',
    pokemon_number: 6,
    card_name: 'Dracaufeu ex',
    card_id_tcg: 'sv2a-200',
    set_name: 'Pokémon Card 151',
    set_code: 'sv2a',
    set_number: '200/165',
    language: 'JP',
    rarity: 'AR',
    rarity_rank: 8,
    condition: 'NM',
    status: 'pokedex',
    image_url: null,
    tcg_image_url: null,
    cardmarket_id: null,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
    suggested_price: null,
    cm_updated_at: null,
    vinted_listed_at: null,
    lot_id: null,
    date_added: '2026-01-01T00:00:00Z',
    date_sold: null,
    sold_price: null,
    notes: null,
    variant: null,
    ...overrides,
  };
}

function makeInput(overrides: Partial<NewCardInput> = {}): NewCardInput {
  return {
    pokemon_number: 6,
    pokemon_name: 'Dracaufeu',
    rarity: 'AR',
    rarity_rank: 8,
    language: 'JP',
    cm_price_trend: null,
    ...overrides,
  };
}

describe('computePokedexSuggestion', () => {
  it('returns no_pokemon_number when the input has no pokemon_number', () => {
    const result = computePokedexSuggestion(makeInput({ pokemon_number: null }), null);
    expect(result.type).toBe('no_pokemon_number');
    expect(result.primaryAction).toBe('add_to_vinted');
    expect(result.secondaryActions).toEqual(['add_to_collection']);
  });

  it('returns no_pokemon_number when pokemon_number is 0 (falsy)', () => {
    const result = computePokedexSuggestion(makeInput({ pokemon_number: 0 }), null);
    expect(result.type).toBe('no_pokemon_number');
  });

  it('returns no_entry when nothing is in the Pokédex slot', () => {
    const result = computePokedexSuggestion(makeInput(), null);
    expect(result.type).toBe('no_entry');
    expect(result.primaryAction).toBe('add_to_pokedex');
    expect(result.message).toContain('Dracaufeu');
  });

  it('returns can_replace when the new card has a higher rarity_rank', () => {
    const result = computePokedexSuggestion(
      makeInput({ rarity: 'SAR', rarity_rank: 9 }),
      makeCard({ rarity: 'AR', rarity_rank: 8 }),
    );
    expect(result.type).toBe('can_replace');
    expect(result.primaryAction).toBe('add_to_pokedex');
    expect(result.existingCard).toBeDefined();
    expect(result.existingCard?.id).toBe('existing-uuid');
  });

  it('returns can_replace when ranks are equal but the new price is >10% higher', () => {
    const result = computePokedexSuggestion(
      makeInput({ rarity: 'AR', rarity_rank: 8, cm_price_trend: 50 }),
      makeCard({ rarity: 'AR', rarity_rank: 8, cm_price_trend: 40 }),
    );
    expect(result.type).toBe('can_replace');
  });

  it('returns keep_existing when ranks are equal and the price gap is too small', () => {
    const result = computePokedexSuggestion(
      makeInput({ rarity: 'AR', rarity_rank: 8, cm_price_trend: 42 }),
      makeCard({ rarity: 'AR', rarity_rank: 8, cm_price_trend: 40 }),
    );
    expect(result.type).toBe('keep_existing');
    expect(result.primaryAction).toBe('add_to_vinted');
  });

  it('returns keep_existing when ranks are equal and existing has no price (no breaker possible)', () => {
    const result = computePokedexSuggestion(
      makeInput({ rarity: 'AR', rarity_rank: 8, cm_price_trend: 100 }),
      makeCard({ rarity: 'AR', rarity_rank: 8, cm_price_trend: null }),
    );
    expect(result.type).toBe('keep_existing');
  });

  it('returns keep_existing when the new card has a lower rarity_rank', () => {
    const result = computePokedexSuggestion(
      makeInput({ rarity: 'R', rarity_rank: 3 }),
      makeCard({ rarity: 'AR', rarity_rank: 8 }),
    );
    expect(result.type).toBe('keep_existing');
    expect(result.primaryAction).toBe('add_to_vinted');
    // 'add_to_pokedex' is still offered as a manual override.
    expect(result.secondaryActions).toContain('add_to_pokedex');
  });
});

describe('actionToStatus', () => {
  it('maps every action to the matching card_status', () => {
    expect(actionToStatus('add_to_pokedex')).toBe('pokedex');
    expect(actionToStatus('add_to_vinted')).toBe('for_sale');
    expect(actionToStatus('add_to_collection')).toBe('collection');
  });
});
