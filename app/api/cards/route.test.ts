// app/api/cards/route.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(),
      getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/photo.jpg' } })),
    })),
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST /api/cards — for_sale fallback to collection', () => {
  it('retries with status=collection when for_sale conflicts and returns fallback flag', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // 1st insert (for_sale) → 23505 conflict
    // 2nd insert (collection) → success with returned row
    let insertCall = 0;
    const insertSingle = vi.fn().mockImplementation(async () => {
      insertCall += 1;
      if (insertCall === 1) {
        return { data: null, error: { code: '23505', message: 'one_for_sale_per_group' } };
      }
      return {
        data: { id: 'new-card-id', status: 'collection', card_name: 'Pikachu' },
        error: null,
      };
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') return { insert };
      throw new Error(`unmocked table: ${table}`);
    });

    const fd = new FormData();
    fd.set('pokemon_name', 'Pikachu');
    fd.set('pokemon_number', '25');
    fd.set('card_name', 'Pikachu');
    fd.set('language', 'JP');
    fd.set('rarity', 'C');
    fd.set('condition', 'NM');
    fd.set('status', 'for_sale');

    const req = new Request('http://localhost/api/cards', { method: 'POST', body: fd });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.card.status).toBe('collection');
    expect(json.fallback).toBe('for_sale_to_collection');
    expect(json.reason).toBe('Une carte identique est déjà en vente, ajoutée à ton Stock');
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry when status was not for_sale (collection conflict bubbles up as 500)', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'some_other_constraint' },
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    supabaseMock.from.mockReturnValue({ insert });

    const fd = new FormData();
    fd.set('pokemon_name', 'Pikachu');
    fd.set('pokemon_number', '25');
    fd.set('card_name', 'Pikachu');
    fd.set('language', 'JP');
    fd.set('rarity', 'C');
    fd.set('condition', 'NM');
    fd.set('status', 'collection');

    const req = new Request('http://localhost/api/cards', { method: 'POST', body: fd });
    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(insert).toHaveBeenCalledTimes(1); // no retry
  });
});
