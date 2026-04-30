// app/api/prices/update/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const serviceMock = {
  from: vi.fn(),
};
const supabaseMock = {
  auth: { getUser: vi.fn() },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => serviceMock,
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => Promise.resolve(supabaseMock),
}));

const ORIGINAL_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.CRON_SECRET = 'test-secret';
});

afterEach(() => {
  process.env.CRON_SECRET = ORIGINAL_SECRET;
  vi.clearAllMocks();
});

function bulkRequest(authHeader?: string): Request {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (authHeader) headers['authorization'] = authHeader;
  return new Request('http://localhost/api/prices/update', {
    method: 'POST',
    headers,
  });
}

describe('POST /api/prices/update — auth', () => {
  it('returns 401 in bulk mode when no Authorization header is provided', async () => {
    const res = await POST(bulkRequest());
    expect(res.status).toBe(401);
  });

  it('returns 401 in bulk mode with a wrong secret', async () => {
    const res = await POST(bulkRequest('Bearer wrong'));
    expect(res.status).toBe(401);
  });
});
