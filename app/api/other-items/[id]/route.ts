import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse, notFoundResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';
import { clearOtherItemQueueFailure, FRED_USER_ID, syncOtherItemQueueMembership } from '@/lib/vinted/other-item-queue-sync';
import { parseColorIds, parseExtraAttributes } from '@/lib/vinted/other-item-attributes';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueOtherItemCrossUserDeleteJobs } from '@/lib/vinted/cross-user-sync';

export const runtime = 'nodejs';

interface PatchBody {
  name?: string;
  description?: string;
  price?: number | null;
  status?: 'for_sale' | 'collection' | 'sold';
  vinted_condition_id?: number;
  /** A size option id of the item's category; `size` carries its label. */
  vinted_size_id?: number | null;
  size?: string | null;
  vinted_color_ids?: number[];
  /** {code: [ids]} for the category's extra attributes (platform, storage…). */
  vinted_extra_attributes?: Record<string, unknown>;
  sold_price?: number | null;
  date_sold?: string | null;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
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
    if (body.status === 'sold' && body.date_sold === undefined) update.date_sold = new Date().toISOString();
  }

  if (body.sold_price !== undefined) {
    if (body.sold_price !== null && (typeof body.sold_price !== 'number' || !Number.isFinite(body.sold_price) || body.sold_price < 0)) {
      return apiError('invalid_number', { status: 400, message: 'sold_price must be a positive number' });
    }
    update.sold_price = body.sold_price;
  }
  if (body.date_sold !== undefined) update.date_sold = body.date_sold;

  if (body.vinted_condition_id !== undefined) {
    if (!isPositiveInteger(body.vinted_condition_id)) {
      return apiError('invalid_number', { status: 400, message: 'vinted_condition_id must be a positive integer' });
    }
    update.vinted_condition_id = body.vinted_condition_id;
  }

  if (body.vinted_size_id !== undefined) {
    if (body.vinted_size_id !== null && !isPositiveInteger(body.vinted_size_id)) {
      return apiError('invalid_number', { status: 400, message: 'vinted_size_id must be a positive integer or null' });
    }
    update.vinted_size_id = body.vinted_size_id;
  }
  if (body.size !== undefined) update.size = body.size === null ? null : String(body.size).trim() || null;

  if (body.vinted_color_ids !== undefined) {
    const colorIds = parseColorIds(body.vinted_color_ids);
    if (colorIds === null) {
      return apiError('invalid_colors', { status: 400, message: 'vinted_color_ids must hold at most 2 known Vinted color ids' });
    }
    update.vinted_color_ids = colorIds;
  }

  if (body.vinted_extra_attributes !== undefined) {
    const extras = parseExtraAttributes(body.vinted_extra_attributes);
    if (extras === null) {
      return apiError('invalid_attributes', { status: 400, message: 'vinted_extra_attributes must be {code: [ids]}' });
    }
    update.vinted_extra_attributes = extras;
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

  await clearOtherItemQueueFailure(supabase, id);
  await syncOtherItemQueueMembership(supabase, id);

  if (body.status === 'sold') {
    // My ad was the one bought: drop its listing row (the cards' sold flow
    // does the same client-side), and have the bot take down any other
    // account's ad for the same item. Awaited — on Vercel nothing runs after
    // the response — and caught so it never changes the response.
    try {
      await supabase.from('other_item_listings').delete().eq('other_item_id', id).eq('user_id', user.id);
      await enqueueOtherItemCrossUserDeleteJobs(createServiceClient(), id, user.id);
    } catch (err) {
      console.error('Sold item listing cleanup / cross-user delete failed:', err);
    }
  }

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
