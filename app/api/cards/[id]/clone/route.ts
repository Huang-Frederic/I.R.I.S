// app/api/cards/[id]/clone/route.ts
//
// Duplicate a Stock card so the user can track having multiple physical copies
// of the same card in their collection. The clone shares the source card's
// image_url and metadata — they're indistinguishable as data, only the row
// id and date_added differ. The clone always lands in 'collection' and clears
// vinted_listed_at + sold fields so it starts in a clean state.
//
// We do NOT copy 'pokedex' or 'for_sale' status: those are guarded by partial
// unique indexes, and the user almost certainly wants the new copy in Stock.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: source, error: fetchErr } = await supabase
    .from('cards')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr || !source) {
    return NextResponse.json({ error: 'carte introuvable' }, { status: 404 });
  }

  // Strip identity + transient state. Keep image_url so duplicates share the
  // same photo until the user re-scans the new copy individually.
  const {
    id: _id,
    date_added: _date,
    vinted_listed_at: _listed,
    date_sold: _sold,
    sold_price: _price,
    lot_id: _lot,
    ...rest
  } = source;
  void _id; void _date; void _listed; void _sold; void _price; void _lot;

  const insertRow = {
    ...rest,
    status: 'collection' as const,
    date_added: new Date().toISOString(),
    vinted_listed_at: null,
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
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ card: inserted });
}
