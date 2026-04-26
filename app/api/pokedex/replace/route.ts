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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
