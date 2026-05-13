import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, validationResponse } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

interface ReplaceBody {
  old_card_id?: string;
  /** Where the demoted Pokédex card should land. */
  old_new_status?: 'for_sale' | 'collection';
  new_card_id?: string;
}

export async function POST(request: Request) {
  let body: ReplaceBody;
  try {
    body = (await request.json()) as ReplaceBody;
  } catch {
    return validationResponse('Invalid JSON body');
  }

  const { old_card_id, old_new_status, new_card_id } = body;
  if (!old_card_id || !new_card_id) {
    return validationResponse('old_card_id and new_card_id are required');
  }
  if (old_new_status !== 'for_sale' && old_new_status !== 'collection') {
    return validationResponse("old_new_status must be 'for_sale' or 'collection'");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('replace_pokedex_card', {
    old_card_id,
    old_new_status,
    new_card_id,
  });

  if (error) {
    console.error('replace_pokedex_card RPC failed:', error);
    // The 3-step swap RPC handles the common collision (candidate occupies the
    // for_sale slot the displaced card needs). The remaining failure mode is a
    // *third* card of the same group already in for_sale — that's real data
    // corruption and the user must resolve it manually.
    if (/one_for_sale_per_group|duplicate key|unique constraint/i.test(error.message ?? '')) {
      return apiError('for_sale_conflict', {
        status: 409,
        message:
          'Another copy is already listed on Vinted for this group. ' +
          'Choose "To Stock" instead, or first remove the conflicting card.',
      });
    }
    return apiError('rpc_failed', { status: 500, message: error.message });
  }

  return NextResponse.json({ ok: true });
}
