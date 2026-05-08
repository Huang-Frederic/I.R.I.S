import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

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

  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq(fkColumn, id)
    .eq('user_id', auth.user.id);

  if (error) {
    return apiError('delete_failed', { status: 500, message: error.message });
  }
  return NextResponse.json({ deleted: count ?? 0 });
}
