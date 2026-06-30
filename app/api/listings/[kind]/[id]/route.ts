import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (kind !== 'card' && kind !== 'lot') {
    return validationResponse('kind must be "card" or "lot"');
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return unauthorizedResponse();
  }

  const table = kind === 'card' ? 'card_listings' : 'lot_listings';
  const fkColumn = kind === 'card' ? 'card_id' : 'lot_id';

  const { data: existing } = await supabase
    .from(table)
    .select('vinted_listing_id')
    .eq(fkColumn, id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  // Fetch entity name for the audit log before deleting
  let entityDetails: Record<string, unknown> = {};
  if (kind === 'card') {
    const { data: card } = await supabase
      .from('cards')
      .select('card_name, card_id_tcg, set_code, language, condition, variant, suggested_price')
      .eq('id', id)
      .maybeSingle();
    entityDetails = {
      card_name: card?.card_name,
      card_id_tcg: card?.card_id_tcg,
      set_code: card?.set_code,
      language: card?.language,
      condition: card?.condition,
      variant: card?.variant ?? null,
      suggested_price: card?.suggested_price,
    };
  } else {
    const { data: lot } = await supabase
      .from('lots')
      .select('name, price, language, condition')
      .eq('id', id)
      .maybeSingle();
    entityDetails = {
      lot_name: lot?.name,
      price: lot?.price,
      language: lot?.language,
      condition: lot?.condition,
    };
  }

  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq(fkColumn, id)
    .eq('user_id', auth.user.id);

  if (error) {
    return apiError('delete_failed', { status: 500, message: error.message });
  }

  void auditLog({
    actor_type: 'user',
    actor_user_id: auth.user.id,
    action: 'listing.deleted',
    entity_type: kind,
    entity_id: id,
    details: {
      vinted_listing_id: existing?.vinted_listing_id ?? null,
      reason: 'manual_remove',
      ...entityDetails,
    },
  });

  return NextResponse.json({ deleted: count ?? 0 });
}
