import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, validationResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';

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

  const [
    { data: { user } },
    { data: newCard },
    { data: oldCard },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('cards').select('card_name, card_id_tcg, set_code, set_name, pokemon_name, pokemon_number, language, condition').eq('id', new_card_id).maybeSingle(),
    supabase.from('cards').select('card_name, card_id_tcg').eq('id', old_card_id).maybeSingle(),
  ]);

  void auditLog({
    actor_type: 'user',
    actor_user_id: user?.id ?? null,
    action: 'card.pokedex_replaced',
    entity_type: 'card',
    entity_id: new_card_id,
    details: {
      old_card_id,
      old_card_name: oldCard?.card_name ?? null,
      old_card_id_tcg: oldCard?.card_id_tcg ?? null,
      old_new_status,
      new_card_id,
      new_card_name: newCard?.card_name ?? null,
      new_card_id_tcg: newCard?.card_id_tcg ?? null,
      set_name: newCard?.set_name ?? null,
      set_code: newCard?.set_code ?? null,
      pokemon_name: newCard?.pokemon_name ?? null,
      pokemon_number: newCard?.pokemon_number ?? null,
      language: newCard?.language ?? null,
      condition: newCard?.condition ?? null,
    },
  });

  return NextResponse.json({ ok: true });
}
