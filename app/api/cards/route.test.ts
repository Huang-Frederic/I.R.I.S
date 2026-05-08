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

describe('POST /api/cards — for_sale conflict handling', () => {
  it('returns 409 with existingCard when for_sale unique violation', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // Insert fails with 23505
    const insertSingle = vi.fn().mockResolvedValue({
      data: null,
      error: { code: '23505', message: 'one_for_sale_per_group' },
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    // Select for existingCard succeeds
    const selectSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'existing-card-id',
        card_name: 'Pikachu',
        image_url: 'https://example.com/pikachu.jpg',
        tcg_image_url: null,
        suggested_price: 5.0,
        date_added: '2024-01-01',
        language: 'JP',
        condition: 'NM',
        variant: null,
        set_name: 'Base Set',
        set_code: 'BS',
      },
      error: null,
    });
    const select = vi.fn(() => ({
      eq: vi.fn().mockReturnThis(),
      maybeSingle: selectSingle,
    }));

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'cards') return { insert, select };
      throw new Error(`unmocked table: ${table}`);
    });

    const fd = new FormData();
    fd.set('pokemon_name', 'Pikachu');
    fd.set('pokemon_number', '25');
    fd.set('card_name', 'Pikachu');
    fd.set('card_id_tcg', 'xyz-123');
    fd.set('language', 'JP');
    fd.set('rarity', 'C');
    fd.set('condition', 'NM');
    fd.set('status', 'for_sale');

    const req = new Request('http://localhost/api/cards', { method: 'POST', body: fd });
    const res = await POST(req);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error).toBe('for_sale_conflict');
    expect(json.existingCard).toBeDefined();
    expect(json.existingCard.id).toBe('existing-card-id');
    expect(insert).toHaveBeenCalledTimes(1); // no retry
  });

  it('returns 409 when status is not for_sale and conflicts', async () => {
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
