import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';

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

  // vinted_posted_at drives the 21-day stale calculation (isStaleForListing) —
  // it must be reset alongside listed_at, otherwise clicking "refresh" on an
  // already-stale listing zeroes the displayed day count but the item still
  // reads as stale (vinted_posted_at untouched). Resetting it here doubles as
  // the intended manual bypass: mark a listing fresh for another 21 days
  // without going through the real Vinted repost/bump job.
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from(table)
    .upsert(
      { [fkColumn]: id, user_id: auth.user.id, listed_at: now, vinted_posted_at: now },
      { onConflict: `${fkColumn},user_id`, ignoreDuplicates: false },
    )
    .select()
    .single();

  if (error) {
    return apiError('upsert_failed', { status: 500, message: error.message });
  }

  if (kind === 'card') {
    const { data: card } = await supabase
      .from('cards')
      .select('card_name, card_id_tcg, set_code, set_name, language, condition, variant, suggested_price, status')
      .eq('id', id)
      .maybeSingle();
    void auditLog({
      actor_type: 'user',
      actor_user_id: auth.user.id,
      action: 'listing.created',
      entity_type: 'card',
      entity_id: id,
      details: {
        card_name: card?.card_name,
        card_id_tcg: card?.card_id_tcg,
        set_name: card?.set_name,
        set_code: card?.set_code,
        language: card?.language,
        condition: card?.condition,
        variant: card?.variant ?? null,
        suggested_price: card?.suggested_price,
        status: card?.status,
      },
    });
  } else {
    const { data: lot } = await supabase
      .from('lots')
      .select('name, price, language, condition')
      .eq('id', id)
      .maybeSingle();
    void auditLog({
      actor_type: 'user',
      actor_user_id: auth.user.id,
      action: 'listing.created',
      entity_type: 'lot',
      entity_id: id,
      details: {
        lot_name: lot?.name,
        price: lot?.price,
        language: lot?.language,
        condition: lot?.condition,
      },
    });
  }

  return NextResponse.json(data);
}
