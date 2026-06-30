// Duplicate a Stock card so the user can track having multiple physical copies
// of the same card in their collection. The clone shares the source card's
// image_url and metadata — they're indistinguishable as data, only the row
// id and date_added differ. The clone always lands in 'collection' and clears
// sold fields so it starts in a clean state. Per-user listings live in
// card_listings — clone never copies those rows, the new card starts unlisted.
//
// We do NOT copy 'pokedex' or 'for_sale' status: those are guarded by partial
// unique indexes, and the user almost certainly wants the new copy in Stock.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  apiError,
  unauthorizedResponse,
  validationResponse,
  notFoundResponse,
} from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return validationResponse('missing id');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const { data: source, error: fetchErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr || !source) {
    return notFoundResponse('card');
  }

  // Strip identity + transient state. Keep image_url so duplicates share the
  // same photo until the user re-scans the new copy individually.
  const {
    id: _id,
    date_added: _date,
    date_sold: _sold,
    sold_price: _price,
    lot_id: _lot,
    ...rest
  } = source;
  void _id; void _date; void _sold; void _price; void _lot;

  const insertRow = {
    ...rest,
    status: 'collection' as const,
    date_added: new Date().toISOString(),
    date_sold: null,
    sold_price: null,
    lot_id: null,
  };

  const { data: inserted, error: insertErr } = await supabase
    .from('cards')
    .insert(insertRow)
    .select()
    .single();
  if (insertErr) {
    console.error('Clone insert failed:', insertErr);
    return apiError('insert_failed', { status: 500, message: insertErr.message });
  }

  void auditLog({
    actor_type: 'user',
    actor_user_id: user.id,
    action: 'card.cloned',
    entity_type: 'card',
    entity_id: (inserted as Record<string, unknown>).id as string,
    details: {
      source_card_id: id,
      card_name: (inserted as Record<string, unknown>).card_name,
      card_id_tcg: (inserted as Record<string, unknown>).card_id_tcg,
      set_name: (inserted as Record<string, unknown>).set_name,
      set_code: (inserted as Record<string, unknown>).set_code,
      language: (inserted as Record<string, unknown>).language,
      condition: (inserted as Record<string, unknown>).condition,
      variant: (inserted as Record<string, unknown>).variant ?? null,
    },
  });

  return NextResponse.json({ card: inserted });
}
