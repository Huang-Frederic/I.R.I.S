import { describe, expect, it, vi } from 'vitest';
import { resolveDecklistCards, resolveDrillImages } from './drill-resolve';
import type { ParsedDecklistLine } from './decklist';

function makeSupabase(rows: Record<string, { card_name: string; image_url: string; language: string }[]>) {
  return {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(function (this: { setCode?: string; setNumber?: string }, col: string, val: string) {
          if (col === 'set_code') this.setCode = val;
          if (col === 'set_number') this.setNumber = val;
          return this;
        }),
        in: vi.fn(function (this: { setCode?: string; setNumber?: string }) {
          const key = `${this.setCode}-${this.setNumber}`;
          return Promise.resolve({ data: rows[key] ?? [] });
        }),
      })),
    })),
  };
}

describe('resolveDecklistCards', () => {
  it('prefers the FR row when both FR and EN exist', async () => {
    const supabase = makeSupabase({
      'DRI-32': [
        { card_name: 'Ethan\'s Cyndaquil', image_url: 'http://en.png', language: 'EN' },
        { card_name: 'Héricendre de Luth', image_url: 'http://fr.png', language: 'FR' },
      ],
    });
    const lines: ParsedDecklistLine[] = [
      { name: 'Cyndaquil', setCode: 'DRI', setNumber: '32', count: 4, category: 'poke' },
    ];
    const { cards, unresolved } = await resolveDecklistCards(supabase as never, lines);
    expect(unresolved).toEqual([]);
    expect(cards).toEqual([{ id: 'DRI-32', name: 'Héricendre de Luth', count: 4, category: 'poke' }]);
  });

  it('falls back to EN when no FR row exists', async () => {
    const supabase = makeSupabase({
      'MEE-1': [{ card_name: 'Grass Energy', image_url: 'http://en.png', language: 'EN' }],
    });
    const lines: ParsedDecklistLine[] = [
      { name: 'Basic {G} Energy', setCode: 'MEE', setNumber: '1', count: 5, category: 'energy' },
    ];
    const { cards } = await resolveDecklistCards(supabase as never, lines);
    expect(cards[0].name).toBe('Grass Energy');
  });

  it('keeps the raw parsed name and flags the line unresolved when the catalog has neither row', async () => {
    const supabase = makeSupabase({});
    const lines: ParsedDecklistLine[] = [
      { name: 'Beedrill ex', setCode: 'CRI', setNumber: '3', count: 1, category: 'poke' },
    ];
    const { cards, unresolved } = await resolveDecklistCards(supabase as never, lines);
    expect(cards).toEqual([{ id: 'CRI-3', name: 'Beedrill ex', count: 1, category: 'poke' }]);
    expect(unresolved).toEqual(['Beedrill ex CRI 3']);
  });
});

describe('resolveDrillImages', () => {
  it('returns an image URL keyed by card id, preferring FR', async () => {
    const supabase = makeSupabase({
      'DRI-32': [
        { card_name: 'x', image_url: 'http://en.png', language: 'EN' },
        { card_name: 'x', image_url: 'http://fr.png', language: 'FR' },
      ],
    });
    const images = await resolveDrillImages(supabase as never, ['DRI-32']);
    expect(images).toEqual({ 'DRI-32': 'http://fr.png' });
  });

  it('omits ids that resolve to nothing', async () => {
    const supabase = makeSupabase({});
    const images = await resolveDrillImages(supabase as never, ['CRI-3']);
    expect(images).toEqual({});
  });
});
