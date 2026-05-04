import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await params;
  if (kind !== 'card' && kind !== 'lot') {
    return NextResponse.json({ error: 'kind must be "card" or "lot"' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const table = kind === 'card' ? 'card_listings' : 'lot_listings';
  const fkColumn = kind === 'card' ? 'card_id' : 'lot_id';

  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq(fkColumn, id)
    .eq('user_id', auth.user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ deleted: count ?? 0 });
}
