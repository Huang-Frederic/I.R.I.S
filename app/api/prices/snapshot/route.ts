// Daily snapshot cron: calls insert_daily_price_snapshot() SQL function.
// Single round-trip; idempotent within the same day via ON CONFLICT.
//
//   POST /api/prices/snapshot   → cron (auth: Bearer CRON_SECRET)
//
// Schedule: 23:55 UTC, after the day's last refresh of /api/prices/update.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data, error } = await service.rpc('insert_daily_price_snapshot');
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true, snapshot_count: data ?? 0 });
}

// Vercel cron daemon issues GET — accept it too with the same handler.
export const GET = POST;
