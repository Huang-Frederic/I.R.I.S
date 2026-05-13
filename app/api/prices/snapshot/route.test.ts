import { describe, it, expect, vi, beforeEach } from 'vitest';

const rpcMock = vi.fn();
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({ rpc: rpcMock }),
}));

import { POST } from './route';

describe('POST /api/prices/snapshot', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    process.env.CRON_SECRET = 'test-secret';
  });

  it('rejects without bearer token', async () => {
    const req = new Request('http://localhost/api/prices/snapshot', { method: 'POST' });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects with wrong bearer token', async () => {
    const req = new Request('http://localhost/api/prices/snapshot', {
      method: 'POST',
      headers: { authorization: 'Bearer wrong' },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('calls insert_daily_price_snapshot RPC and returns count', async () => {
    rpcMock.mockResolvedValue({ data: 142, error: null });
    const req = new Request('http://localhost/api/prices/snapshot', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, snapshot_count: 142 });
    expect(rpcMock).toHaveBeenCalledWith('insert_daily_price_snapshot');
  });

  it('returns 500 when RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const req = new Request('http://localhost/api/prices/snapshot', {
      method: 'POST',
      headers: { authorization: 'Bearer test-secret' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
