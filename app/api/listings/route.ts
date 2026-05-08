import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

interface PostBody {
  kind?: 'card' | 'lot';
  id?: string;
}

export async function POST(request: Request) {
  let body: PostBody;
  try {
    body = (await request.json()) as PostBody;
  } catch {
    return validationResponse('Invalid JSON');
  }

  const { kind, id } = body;
  if (kind !== 'card' && kind !== 'lot') {
    return validationResponse('kind must be "card" or "lot"');
  }
  if (!id || typeof id !== 'string') {
    return validationResponse('id is required');
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return unauthorizedResponse();
  }

  const table = kind === 'card' ? 'card_listings' : 'lot_listings';
  const fkColumn = kind === 'card' ? 'card_id' : 'lot_id';

  const { data, error } = await supabase
    .from(table)
    .upsert(
      { [fkColumn]: id, user_id: auth.user.id, listed_at: new Date().toISOString() },
      { onConflict: `${fkColumn},user_id`, ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) {
    return apiError('upsert_failed', { status: 500, message: error.message });
  }
  return NextResponse.json(data);
}
