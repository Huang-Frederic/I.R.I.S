import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const ORIG_FETCH = global.fetch;

const insertCardMock = vi.fn();
const insertListingMock = vi.fn();
const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn(() => ({ data: { publicUrl: 'https://supabase.co/storage/img.jpg' } }));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-uuid-1' } } }) },
    from: (table: string) => {
      if (table === 'cards') {
        return {
          insert: (row: Record<string, unknown>) => insertCardMock(row),
        };
      }
      if (table === 'card_listings') {
        return {
          insert: (row: Record<string, unknown>) => insertListingMock(row),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    storage: {
      from: () => ({
        upload: uploadMock,
        getPublicUrl: getPublicUrlMock,
      }),
    },
  }),
}));

import { POST } from './route';
import type { ToImport } from '@/lib/types/vinted-import';

const SAMPLE_ITEM: ToImport = {
  vintedItem: {
    id: 999,
    title: '(jpn_s8b-208)',
    description: 'Near Mint',
    price: { amount: '5.5', currency_code: 'EUR' },
    created_at_ts: 1_704_067_200,
    photos: [{ id: 1, full_size_url: 'https://images.vinted.net/full.jpg', url: 'https://images.vinted.net/thumb.jpg' }],
  },
  parsed: { language: 'JP', setCode: 's8b', setNumber: '208', condition: 'NM' },
  enriched: null,
};

function makeReq(items: ToImport[]): Request {
  return new Request('http://localhost/api/import/vinted/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items }),
  });
}

describe('POST /api/import/vinted/commit', () => {
  beforeEach(() => {
    insertCardMock.mockReset();
    insertListingMock.mockReset();
    uploadMock.mockReset();
    getPublicUrlMock.mockClear();
    global.fetch = vi.fn();
  });
  afterEach(() => {
    global.fetch = ORIG_FETCH;
  });

  it('happy path: downloads photo, uploads to storage, inserts card + listing', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    uploadMock.mockResolvedValueOnce({ error: null });
    insertCardMock.mockReturnValueOnce({
      select: () => ({ single: async () => ({ data: { id: 'card-uuid-1' }, error: null }) }),
    });
    insertListingMock.mockResolvedValueOnce({ error: null });

    const res = await POST(makeReq([SAMPLE_ITEM]));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.failed).toEqual([]);
    expect(insertCardMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'for_sale', set_code: 's8b', set_number: '208' }),
    );
    expect(insertListingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        card_id: 'card-uuid-1',
        user_id: 'user-uuid-1',
        listed_at: '2024-01-01T00:00:00.000Z',
      }),
    );
  });

  it('records duplicate_for_sale failure when INSERT cards conflicts on unique index', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    uploadMock.mockResolvedValueOnce({ error: null });
    insertCardMock.mockReturnValueOnce({
      select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate' } }) }),
    });

    const res = await POST(makeReq([SAMPLE_ITEM]));
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.failed).toEqual([{ vintedItemId: 999, reason: 'duplicate_for_sale' }]);
    expect(insertListingMock).not.toHaveBeenCalled();
  });

  it('falls back to next photo when first 404s, then null if all fail', async () => {
    const item: ToImport = {
      ...SAMPLE_ITEM,
      vintedItem: {
        ...SAMPLE_ITEM.vintedItem,
        photos: [
          { id: 1, full_size_url: 'https://x/a.jpg', url: 'thumb' },
          { id: 2, full_size_url: 'https://x/b.jpg', url: 'thumb' },
        ],
      },
    };
    (global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response)
      .mockResolvedValueOnce({ ok: false, status: 404 } as Response);
    insertCardMock.mockReturnValueOnce({
      select: () => ({ single: async () => ({ data: { id: 'card-uuid-2' }, error: null }) }),
    });
    insertListingMock.mockResolvedValueOnce({ error: null });

    const res = await POST(makeReq([item]));
    const body = await res.json();
    expect(body.created).toBe(1);
    expect(body.failed).toEqual([{ vintedItemId: 999, reason: 'photo_unavailable' }]);
    expect(insertCardMock).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }));
  });

  it('records storage_upload_failed and skips INSERT when bucket upload errors', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8),
    } as Response);
    uploadMock.mockResolvedValueOnce({ error: { message: 'storage err' } });

    const res = await POST(makeReq([SAMPLE_ITEM]));
    const body = await res.json();
    expect(body.created).toBe(0);
    expect(body.failed).toEqual([{ vintedItemId: 999, reason: 'storage_upload_failed' }]);
    expect(insertCardMock).not.toHaveBeenCalled();
  });

  it('rejects photos from non-Vinted CDN hosts (SSRF defense)', async () => {
    const item: ToImport = {
      ...SAMPLE_ITEM,
      vintedItem: {
        ...SAMPLE_ITEM.vintedItem,
        photos: [
          { id: 1, full_size_url: 'http://169.254.169.254/latest/meta-data/', url: 'thumb' },
          { id: 2, full_size_url: 'https://evil.example.com/photo.jpg', url: 'thumb' },
        ],
      },
    };
    insertCardMock.mockReturnValueOnce({
      select: () => ({ single: async () => ({ data: { id: 'card-uuid-3' }, error: null }) }),
    });
    insertListingMock.mockResolvedValueOnce({ error: null });

    const res = await POST(makeReq([item]));
    const body = await res.json();
    // No fetch should be called for either photo (both blocked)
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
    // Card still created with image_url=null (treated as photo_unavailable)
    expect(body.created).toBe(1);
    expect(body.failed).toEqual([{ vintedItemId: 999, reason: 'photo_unavailable' }]);
    expect(insertCardMock).toHaveBeenCalledWith(expect.objectContaining({ image_url: null }));
  });
});
