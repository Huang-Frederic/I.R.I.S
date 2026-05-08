import { describe, expect, it } from 'vitest';
import { validateCardForm } from './validate-card-form';

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, v);
  return fd;
}

describe('validateCardForm', () => {
  it('returns valid result for a complete for_sale card', () => {
    const result = validateCardForm(
      form({
        card_name: 'Pikachu',
        pokemon_number: '25',
        language: 'JP',
        rarity: 'AR',
        condition: 'NM',
        status: 'for_sale',
      }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsed.card_name).toBe('Pikachu');
      expect(result.parsed.pokemon_number).toBe(25);
      expect(result.parsed.language).toBe('JP');
      expect(result.parsed.status).toBe('for_sale');
    }
  });

  it('rejects when card_name is missing', () => {
    const result = validateCardForm(
      form({ language: 'JP', rarity: 'AR' }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/card_name/);
      expect(result.status).toBe(400);
    }
  });

  it('rejects pokemon_number out of range', () => {
    const result = validateCardForm(
      form({
        card_name: 'X',
        pokemon_number: '9999',
        language: 'JP',
        rarity: 'AR',
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/pokemon_number/);
    }
  });

  it('accepts null pokemon_number for non-Pokémon cards (Trainers)', () => {
    const result = validateCardForm(
      form({
        card_name: "N's Plan",
        language: 'JP',
        rarity: 'UC',
      }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsed.pokemon_number).toBeNull();
    }
  });

  it('rejects status=pokedex when pokemon_number is null', () => {
    const result = validateCardForm(
      form({
        card_name: 'Trainer',
        language: 'JP',
        rarity: 'C',
        status: 'pokedex',
      }),
    );
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toMatch(/pokedex/);
    }
  });

  it('defaults condition=NM and status=for_sale when omitted', () => {
    const result = validateCardForm(
      form({ card_name: 'X', language: 'JP', rarity: 'C' }),
    );
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.parsed.condition).toBe('NM');
      expect(result.parsed.status).toBe('for_sale');
    }
  });

  it('rejects status=sold (only set internally on sale)', () => {
    const result = validateCardForm(
      form({
        card_name: 'X',
        language: 'JP',
        rarity: 'C',
        status: 'sold',
      }),
    );
    expect(result.valid).toBe(false);
  });
});
