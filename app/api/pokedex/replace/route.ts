import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { old_card_id, old_new_status, new_card_id } = body;
  if (!old_card_id || !new_card_id) {
    return NextResponse.json(
      { error: 'old_card_id et new_card_id sont requis' },
      { status: 400 },
    );
  }
  if (old_new_status !== 'for_sale' && old_new_status !== 'collection') {
    return NextResponse.json(
      { error: "old_new_status doit être 'for_sale' ou 'collection'" },
      { status: 400 },
    );
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
      return NextResponse.json(
        {
          error: 'for_sale_conflict',
          message:
            "Un autre exemplaire est déjà en vente sur Vinted pour ce groupe. " +
            'Choisis « Vers Stock » à la place, ou retire d\'abord la carte conflictuelle.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
