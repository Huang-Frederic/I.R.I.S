import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { assertVintedAccess } from '@/lib/vinted/monitoring-auth';
import { decodeJwtExpiry } from '@/lib/vinted/jwt';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

interface PostBody {
  userId?: string;
  cookies?: Record<string, unknown>;
}

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = await request.json();
  } catch {
    return validationResponse('Invalid JSON body');
  }

  if (typeof body.userId !== 'string' || !body.userId) {
    return validationResponse('userId is required');
  }
  if (typeof body.cookies !== 'object' || body.cookies === null || Array.isArray(body.cookies)) {
    return validationResponse('cookies must be a JSON object');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  try {
    assertVintedAccess(user.id, body.userId);
  } catch {
    return apiError('forbidden', { status: 403, message: 'Vinted monitoring not enabled for this account' });
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from('vinted_sessions')
    .upsert({ user_id: body.userId, cookies: body.cookies, updated_at: new Date().toISOString() });

  if (error) {
    return apiError('update_failed', { status: 500, message: error.message });
  }
  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');
  if (!userId) return validationResponse('userId is required');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  try {
    assertVintedAccess(user.id, userId);
  } catch {
    return apiError('forbidden', { status: 403, message: 'Vinted monitoring not enabled for this account' });
  }

  const svc = createServiceClient();
  const { data } = await svc.from('vinted_sessions').select('cookies').eq('user_id', userId).maybeSingle();

  const refreshToken = (data?.cookies as Record<string, unknown> | undefined)?.refresh_token_web;
  if (typeof refreshToken !== 'string') {
    return NextResponse.json({ hasSession: !!data, expired: true, expiresWithin48h: true });
  }

  const exp = decodeJwtExpiry(refreshToken);
  if (exp === null) {
    return NextResponse.json({ hasSession: true, expired: true, expiresWithin48h: true });
  }
  const nowSec = Date.now() / 1000;
  return NextResponse.json({
    hasSession: true,
    expired: exp <= nowSec,
    expiresWithin48h: exp <= nowSec + 48 * 60 * 60,
  });
}
