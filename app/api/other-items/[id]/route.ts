import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse, notFoundResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';
import { FRED_USER_ID, syncOtherItemQueueMembership } from '@/lib/vinted/other-item-queue-sync';

export const runtime = 'nodejs';

interface PatchBody {
  name?: string;
  description?: string;
  price?: number | null;
  status?: 'for_sale' | 'collection' | 'sold';
}

const ALLOWED_OTHER_ITEM_STATUSES: ReadonlySet<string> = new Set(['for_sale', 'collection', 'sold']);

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!id) return validationResponse('missing id');

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return validationResponse('Invalid JSON body');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();
  if (user.id !== FRED_USER_ID) {
    return apiError('forbidden', { status: 403, message: 'This feature is not available on this account' });
  }

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name);
  if (body.description !== undefined) update.description = String(body.description);

  if (body.price !== undefined) {
    if (body.price !== null && (typeof body.price !== 'number' || !Number.isFinite(body.price) || body.price < 0)) {
      return apiError('invalid_number', { status: 400, message: 'price must be a positive number' });
    }
    update.price = body.price;
  }

  if (body.status !== undefined) {
    if (!ALLOWED_OTHER_ITEM_STATUSES.has(body.status)) {
      return apiError('invalid_status', { status: 400, message: 'invalid status' });
    }
    update.status = body.status;
  }

  if (Object.keys(update).length === 0) {
    return apiError('no_fields', { status: 400, message: 'no fields to update' });
  }

  const { data: updated, error } = await supabase
    .from('other_items')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if (error.code === 'PGRST116') return notFoundResponse('other_item');
    return apiError('update_failed', { status: 500, message: error.message });
  }

  await syncOtherItemQueueMembership(supabase, id);

  void auditLog({
    actor_type: 'user',
    actor_user_id: user.id,
    action: 'other_item.updated',
    entity_type: 'other_item',
    entity_id: id,
    details: {
      name: (updated as Record<string, unknown>).name,
      price: (updated as Record<string, unknown>).price,
      status: (updated as Record<string, unknown>).status,
      updated_fields: Object.keys(update),
    },
  });

  return NextResponse.json({ item: updated });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  if (!id) return validationResponse('missing id');

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();
  if (user.id !== FRED_USER_ID) {
    return apiError('forbidden', { status: 403, message: 'This feature is not available on this account' });
  }

  const { data: item } = await supabase
    .from('other_items')
    .select('photo_urls, name, price')
    .eq('id', id)
    .maybeSingle();

  if (item && Array.isArray((item as { photo_urls: unknown }).photo_urls)) {
    const paths = (item as { photo_urls: string[] }).photo_urls;
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from('other-item-photos').remove(paths);
      if (rmErr) console.warn('other_item photo delete failed', rmErr);
    }
  }

  await supabase.from('vinted_queue').delete().eq('user_id', FRED_USER_ID).eq('other_item_id', id);

  const { error } = await supabase.from('other_items').delete().eq('id', id);
  if (error) {
    return apiError('delete_failed', { status: 500, message: error.message });
  }

  void auditLog({
    actor_type: 'user',
    actor_user_id: user.id,
    action: 'other_item.deleted',
    entity_type: 'other_item',
    entity_id: id,
    details: {
      name: (item as Record<string, unknown> | null)?.name,
      price: (item as Record<string, unknown> | null)?.price,
    },
  });

  return new NextResponse(null, { status: 204 });
}
