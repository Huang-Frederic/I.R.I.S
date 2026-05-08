import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  storage: { from: vi.fn() },
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function makeFormData(over: Partial<Record<string, string | File[]>> = {}): FormData {
  const fd = new FormData();
  fd.set('name', over.name as string ?? 'Lot Test');
  fd.set('price', (over.price as string) ?? '25');
  fd.set('language', (over.language as string) ?? 'JP');
  fd.set('condition', (over.condition as string) ?? 'NM');
  if (over.extra_description !== undefined) fd.set('extra_description', over.extra_description as string);
  const photos = (over.photos as File[]) ?? [
    new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' }),
  ];
  for (const p of photos) fd.append('photos', p);
  return fd;
}

function makeRequest(fd: FormData): Request {
  return new Request('http://localhost/api/lots', {
    method: 'POST',
    body: fd,
  });
}

describe('POST /api/lots', () => {
  it('returns 401 when not authenticated', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: null } });
    const res = await POST(makeRequest(makeFormData()));
    expect(res.status).toBe(401);
  });

  it('returns 400 when name is missing or empty', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest(makeFormData({ name: '' })));
    expect(res.status).toBe(400);
    const json = await res.json();
    // Error code is 'validation'; the descriptive text lives in `message`.
    expect(json.message).toMatch(/name/i);
  });

  it('returns 400 when no photos are provided', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest(makeFormData({ photos: [] })));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toMatch(/photo/i);
  });

  it('returns 400 when price is missing or invalid', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });
    const res = await POST(makeRequest(makeFormData({ price: 'not-a-number' })));
    expect(res.status).toBe(400);
  });

  it('inserts a lot row, uploads photos, returns the created lot', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({ data: { user: { id: 'u' } } });

    // Step 1 mock: insert a row, get back the id
    const insertSingle = vi.fn().mockResolvedValue({
      data: { id: 'new-lot-id' },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));

    // Step 2 mock: upload each photo to Storage
    const uploadFn = vi.fn().mockResolvedValue({ data: {}, error: null });
    supabaseMock.storage.from.mockReturnValue({ upload: uploadFn });

    // Step 3 mock: update the row with photo_urls and return the full lot
    const updateSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'new-lot-id',
        name: 'Lot Test',
        language: 'JP',
        condition: 'NM',
        price: 25,
        photo_urls: ['new-lot-id/0.jpg', 'new-lot-id/1.jpg'],
        status: 'for_sale',
      },
      error: null,
    });
    const updateEq = vi.fn(() => ({ select: vi.fn(() => ({ single: updateSingle })) }));
    const update = vi.fn(() => ({ eq: updateEq }));

    supabaseMock.from.mockImplementation((table: string) => {
      if (table === 'lots') return { insert, update };
      throw new Error(`unmocked table: ${table}`);
    });

    const photos = [
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'a.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array([0xff, 0xd8, 0xff])], 'b.jpg', { type: 'image/jpeg' }),
    ];
    const res = await POST(makeRequest(makeFormData({ photos })));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.lot.id).toBe('new-lot-id');
    expect(json.lot.photo_urls).toHaveLength(2);
    expect(uploadFn).toHaveBeenCalledTimes(2);
  });
});
