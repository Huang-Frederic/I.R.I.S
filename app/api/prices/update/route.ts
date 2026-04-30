// app/api/prices/update/route.ts
import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

// Touch unused import to silence linter (needed for Task 5)
void createServiceClient;

interface UpdateSummary {
  ok: boolean;
  total: number;
  updated: number;
  backfilled: number;
  skipped: number;
  errors: Array<{ card_id: string; message: string }>;
}

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const cardId = url.searchParams.get('card_id');

  if (cardId) {
    return handleSingleCard(cardId);
  }

  // Bulk mode: require CRON_SECRET via Bearer.
  const auth = request.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!auth || !secret || auth !== `Bearer ${secret}`) {
    return unauthorized();
  }

  return handleBulk();
}

async function handleBulk(): Promise<NextResponse> {
  const summary: UpdateSummary = {
    ok: true,
    total: 0,
    updated: 0,
    backfilled: 0,
    skipped: 0,
    errors: [],
  };
  return NextResponse.json(summary);
}

async function handleSingleCard(cardId: string): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();
  // Implementation comes in Task 6.
  void cardId; // Touch unused parameter to silence linter
  return NextResponse.json({ ok: false, error: 'not_implemented' }, { status: 501 });
}
