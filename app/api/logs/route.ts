import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { unauthorizedResponse, apiError } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '100', 10), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);
  const actorType = searchParams.get('actor_type') ?? '';
  const action = searchParams.get('action') ?? '';

  let query = supabase
    .from('audit_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (actorType) query = query.eq('actor_type', actorType);
  if (action) query = query.ilike('action', `${action}%`);

  const { data, error, count } = await query;

  if (error) {
    return apiError('fetch_failed', { status: 500, message: error.message });
  }

  return NextResponse.json({ logs: data ?? [], total: count ?? 0 });
}
