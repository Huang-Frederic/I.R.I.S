import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { assertVintedAccess } from '@/lib/vinted/monitoring-auth';
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
