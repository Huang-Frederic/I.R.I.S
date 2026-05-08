import { describe, expect, it } from 'vitest';
import { detectPromotable } from './promote-detection';
import type { Card } from '@/lib/types';

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: 'c1',
    pokemon_name: 'Pikachu',
    pokemon_number: 25,
    card_name: 'Pikachu',
    card_id_tcg: 'sv1-100',
    set_name: null,
    set_code: null,
    set_number: null,
    language: 'JP',
    rarity: 'AR',
    rarity_rank: 8,
    condition: 'NM',
    status: 'collection',
    image_url: null,
    tcg_image_url: null,
    cardmarket_id: null,
    cardmarket_url: null,
    cm_price_low: null,
    cm_price_trend: null,
    cm_price_avg: null,
    suggested_price: null,
    cm_updated_at: null,
    lot_id: null,
    date_added: '2026-01-01T00:00:00Z',
    date_sold: null,
    sold_price: null,
    sold_by_user_id: null,
    notes: null,
    variant: null,
    ...overrides,
  };
}

describe('detectPromotable', () => {
  it('returns null when stock has no matching card', () => {
    const sold = makeCard({ card_id_tcg: 'sv1-100', language: 'JP', condition: 'NM', variant: null });
    const stock = [makeCard({ id: 'a', card_id_tcg: 'sv1-200' })];
    expect(detectPromotable({ soldCard: sold, stockCards: stock })).toBeNull();
  });

  it('returns the oldest matching stock card (FIFO)', () => {
    const sold = makeCard({ card_id_tcg: 'sv1-100', language: 'JP', condition: 'NM', variant: null });
    const stock = [
      makeCard({ id: 'newer', date_added: '2026-03-01T00:00:00Z' }),
      makeCard({ id: 'oldest', date_added: '2026-01-01T00:00:00Z' }),
      makeCard({ id: 'middle', date_added: '2026-02-01T00:00:00Z' }),
    ];
    const result = detectPromotable({ soldCard: sold, stockCards: stock });
    expect(result?.cardId).toBe('oldest');
  });

  it('matches on language + condition + variant strictness', () => {
    const sold = makeCard({
      card_id_tcg: 'sv1-100',
      language: 'JP',
      condition: 'NM',
      variant: 'pokeball',
    });
    // Stock: same id but different variant → no match
    const stock = [makeCard({ id: 'a', variant: null })];
    expect(detectPromotable({ soldCard: sold, stockCards: stock })).toBeNull();
  });

  it('treats null variant as standard', () => {
    const sold = makeCard({ card_id_tcg: 'sv1-100', variant: null });
    const stock = [makeCard({ id: 'a', variant: null })];
    expect(detectPromotable({ soldCard: sold, stockCards: stock })?.cardId).toBe('a');
  });

  it('returns full candidate fields including image urls', () => {
    const sold = makeCard({ card_id_tcg: 'sv1-100' });
    const stock = [
      makeCard({
        id: 'a',
        image_url: 'https://example.com/img.jpg',
        tcg_image_url: 'https://tcg/i.png',
      }),
    ];
    const result = detectPromotable({ soldCard: sold, stockCards: stock });
    expect(result?.imageUrl).toBe('https://example.com/img.jpg');
    expect(result?.tcgImageUrl).toBe('https://tcg/i.png');
  });
});
