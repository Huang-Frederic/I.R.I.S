import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  storageUpload: vi.fn(),
  sync: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: (table: string) => ({
      insert: (payload: unknown) => ({
        select: () => ({
          single: async () => mocks.insert(table, payload),
        }),
      }),
      update: (payload: unknown) => ({
        eq: () => ({
          select: () => ({ single: async () => mocks.update(table, payload) }),
        }),
      }),
      delete: () => ({ eq: async () => { mocks.delete(table); return { error: null }; } }),
    }),
    storage: {
      from: () => ({ upload: mocks.storageUpload }),
    },
  }),
}));
vi.mock('@/lib/utils/audit-log', () => ({ auditLog: vi.fn() }));
vi.mock('@/lib/vinted/other-item-queue-sync', () => ({
  FRED_USER_ID: '35385d3c-5966-4a10-8568-8d92d1be47e7',
  syncOtherItemQueueMembership: mocks.sync,
}));

function formDataWithPhoto(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  fd.append('photos', new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' }));
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: '35385d3c-5966-4a10-8568-8d92d1be47e7' } } });
});

describe('POST /api/other-items', () => {
  it('rejects when not Fred', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'a018a4ef-e02e-4a67-9732-9fafe3167e10' } } });
    const req = new Request('http://x', { method: 'POST', body: formDataWithPhoto({ name: 'Test', vinted_catalog_id: '1', vinted_condition_id: '1' }) });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('rejects a name over 80 characters', async () => {
    const req = new Request('http://x', {
      method: 'POST',
      body: formDataWithPhoto({ name: 'x'.repeat(81), vinted_catalog_id: '1', vinted_condition_id: '1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rejects zero photos', async () => {
    const fd = new FormData();
    fd.set('name', 'Test');
    fd.set('vinted_catalog_id', '1');
    fd.set('vinted_condition_id', '1');
    const req = new Request('http://x', { method: 'POST', body: fd });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('rolls back (deletes the row) when every photo upload fails', async () => {
    mocks.insert.mockResolvedValue({ data: { id: 'item-1' }, error: null });
    mocks.storageUpload.mockResolvedValue({ error: { message: 'storage down' } });
    const req = new Request('http://x', {
      method: 'POST',
      body: formDataWithPhoto({ name: 'Test', vinted_catalog_id: '1', vinted_catalog_path: 'X', vinted_condition_id: '1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(mocks.delete).toHaveBeenCalledWith('other_items');
    expect(mocks.sync).not.toHaveBeenCalled();
  });

  it('creates the row, uploads the photo, and syncs the queue on success', async () => {
    mocks.insert.mockResolvedValue({ data: { id: 'item-1' }, error: null });
    mocks.storageUpload.mockResolvedValue({ error: null });
    mocks.update.mockResolvedValue({ data: { id: 'item-1', photo_urls: ['item-1/0.jpg'] }, error: null });
    const req = new Request('http://x', {
      method: 'POST',
      body: formDataWithPhoto({
        name: 'Robot Aspirateur Midea S8+', vinted_catalog_id: '2994', vinted_catalog_path: 'Électronique > Aspirateurs',
        vinted_condition_id: '1', price: '90',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.sync).toHaveBeenCalledWith(expect.anything(), 'item-1');
  });
});
