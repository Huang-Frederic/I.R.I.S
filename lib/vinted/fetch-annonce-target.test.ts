import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchCardAnnonceTarget, fetchLotAnnonceTarget } from './fetch-annonce-target';

function makeSupabaseMock(opts: {
  card?: Record<string, unknown>;
  cardError?: boolean;
  listings?: Record<string, unknown>[];
  lot?: Record<string, unknown>;
  lotError?: boolean;
}): SupabaseClient {
  const from = vi.fn((table: string) => {
    if (table === 'cards') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                opts.cardError ? { data: null, error: new Error('boom') } : { data: opts.card ?? null, error: null },
              ),
          }),
        }),
      };
    }
    if (table === 'card_listings') {
      return { select: () => ({ eq: () => Promise.resolve({ data: opts.listings ?? [], error: null }) }) };
    }
    if (table === 'lots') {
      return {
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve(
                opts.lotError ? { data: null, error: new Error('boom') } : { data: opts.lot ?? null, error: null },
              ),
          }),
        }),
      };
    }
    throw new Error(`unexpected table: ${table}`);
  });
  return { from } as unknown as SupabaseClient;
}

describe('fetchCardAnnonceTarget', () => {
  it('returns the full card row with its listings', async () => {
    const supabase = makeSupabaseMock({
      card: { id: 'card-1', card_name: 'Pikachu ex' },
      listings: [{ card_id: 'card-1', user_id: 'user-a' }],
    });
    const result = await fetchCardAnnonceTarget(supabase, 'card-1');
    expect(result?.card).toEqual({ id: 'card-1', card_name: 'Pikachu ex' });
    expect(result?.listings).toEqual([{ card_id: 'card-1', user_id: 'user-a' }]);
  });

  it('returns null when the card row is missing or errors', async () => {
    const supabase = makeSupabaseMock({ cardError: true });
    expect(await fetchCardAnnonceTarget(supabase, 'missing')).toBeNull();
  });
});

describe('fetchLotAnnonceTarget', () => {
  it('returns the full lot row', async () => {
    const supabase = makeSupabaseMock({ lot: { id: 'lot-1', name: 'Lot FR' } });
    const result = await fetchLotAnnonceTarget(supabase, 'lot-1');
    expect(result?.lot).toEqual({ id: 'lot-1', name: 'Lot FR' });
  });

  it('returns null when the lot row is missing or errors', async () => {
    const supabase = makeSupabaseMock({ lotError: true });
    expect(await fetchLotAnnonceTarget(supabase, 'missing')).toBeNull();
  });
});
