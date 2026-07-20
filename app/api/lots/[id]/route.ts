import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  apiError,
  unauthorizedResponse,
  validationResponse,
  notFoundResponse,
} from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';
import type { CardCondition, CardLanguage } from '@/lib/types';

export const runtime = 'nodejs';

interface PatchBody {
  name?: string;
  language?: CardLanguage;
  condition?: CardCondition;
  extra_description?: string | null;
  price?: number | null;
  status?: 'for_sale' | 'collection' | 'sold';
  quantity?: number;
  date_sold?: string | null;
  sold_price?: number | null;
}

const ALLOWED_LOT_STATUSES: ReadonlySet<string> = new Set(['for_sale', 'collection', 'sold']);

function sanitizeNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error('invalid_number');
  }
  return v;
}

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

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) update.name = String(body.name);
  if (body.language !== undefined) update.language = body.language;
  if (body.condition !== undefined) update.condition = body.condition;
  if (body.extra_description !== undefined) update.extra_description = body.extra_description;

  try {
    const price = sanitizeNumber(body.price);
    if (price !== undefined) update.price = price;
    const sold_price = sanitizeNumber(body.sold_price);
    if (sold_price !== undefined) update.sold_price = sold_price;
  } catch {
    return apiError('invalid_number', { status: 400, message: 'invalid number' });
  }

  if (body.quantity !== undefined) {
    if (!Number.isInteger(body.quantity) || body.quantity < 1) {
      return apiError('invalid_number', { status: 400, message: 'quantity must be an integer >= 1' });
    }
    update.quantity = body.quantity;
  }

  if (body.status !== undefined) {
    if (!ALLOWED_LOT_STATUSES.has(body.status)) {
      return apiError('invalid_status', { status: 400, message: 'invalid status' });
    }
    update.status = body.status;
    if (body.status === 'sold') {
      if (body.date_sold === undefined) {
        update.date_sold = new Date().toISOString();
      }
      update.sold_by_user_id = user.id;
    }
  }
  if (body.date_sold !== undefined) update.date_sold = body.date_sold;

  if (Object.keys(update).length === 0) {
    return apiError('no_fields', { status: 400, message: 'no fields to update' });
  }

  // Selling ONE copy of a quantity>1 lot splits the row: a quantity-1 sold
  // clone keeps the sale history, the original decrements and stays for_sale
  // with its listings intact (the partner's ad is still live; mine gets
  // deleted by the client as usual since that ad was consumed by the sale).
  if (body.status === 'sold') {
    const { data: current, error: curErr } = await supabase
      .from('lots')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (curErr) return apiError('update_failed', { status: 500, message: curErr.message });
    if (!current) return notFoundResponse('lot');

    const currentQty = (current as { quantity?: number | null }).quantity ?? 1;
    if (currentQty > 1) {
      const c = current as Record<string, unknown>;
      const soldClone = {
        name: c.name,
        language: c.language,
        condition: c.condition,
        extra_description: c.extra_description,
        price: c.price,
        status: 'sold',
        quantity: 1,
        date_sold: (update.date_sold as string | undefined) ?? body.date_sold ?? new Date().toISOString(),
        sold_price: (update.sold_price as number | null | undefined) ?? null,
        sold_by_user_id: user.id,
        // Shared storage paths — DELETE guards against removing files still
        // referenced by another row (see below).
        photo_url: c.photo_url,
        photo_urls: c.photo_urls,
        date_added: c.date_added,
        catalog_id: c.catalog_id,
        brand_id: c.brand_id,
        brand_name: c.brand_name,
        brand_label: c.brand_label,
        is_lot: c.is_lot,
      };
      const { data: soldLot, error: cloneErr } = await supabase
        .from('lots')
        .insert(soldClone)
        .select('*')
        .single();
      if (cloneErr || !soldLot) {
        return apiError('update_failed', { status: 500, message: cloneErr?.message ?? 'clone failed' });
      }
      const { data: remaining, error: decErr } = await supabase
        .from('lots')
        .update({ quantity: currentQty - 1 })
        .eq('id', id)
        .select('*')
        .single();
      if (decErr || !remaining) {
        return apiError('update_failed', { status: 500, message: decErr?.message ?? 'decrement failed' });
      }

      void auditLog({
        actor_type: 'user',
        actor_user_id: user.id,
        action: 'lot.status_changed',
        entity_type: 'lot',
        entity_id: (soldLot as { id: string }).id,
        details: {
          to: 'sold',
          name: c.name,
          language: c.language,
          condition: c.condition,
          price: c.price,
          ...(body.sold_price !== undefined && { sold_price: body.sold_price }),
          split_from: id,
          remaining_quantity: currentQty - 1,
        },
      });

      return NextResponse.json({ lot: remaining, soldLot, split: true });
    }
  }

  const { data: updated, error } = await supabase
    .from('lots')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) {
    if (error.code === 'PGRST116') return notFoundResponse('lot');
    return apiError('update_failed', { status: 500, message: error.message });
  }

  if (body.status !== undefined) {
    void auditLog({
      actor_type: 'user',
      actor_user_id: user.id,
      action: 'lot.status_changed',
      entity_type: 'lot',
      entity_id: id,
      details: {
        to: body.status,
        name: (updated as Record<string, unknown>).name,
        language: (updated as Record<string, unknown>).language,
        condition: (updated as Record<string, unknown>).condition,
        price: (updated as Record<string, unknown>).price,
        ...(body.sold_price !== undefined && { sold_price: body.sold_price }),
      },
    });
  } else {
    void auditLog({
      actor_type: 'user',
      actor_user_id: user.id,
      action: 'lot.updated',
      entity_type: 'lot',
      entity_id: id,
      details: {
        name: (updated as Record<string, unknown>).name,
        language: (updated as Record<string, unknown>).language,
        condition: (updated as Record<string, unknown>).condition,
        price: (updated as Record<string, unknown>).price,
        updated_fields: Object.keys(update),
      },
    });
  }

  return NextResponse.json({ lot: updated });
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

  // Read the lot to get photo_urls and name for audit log
  const { data: lot } = await supabase
    .from('lots')
    .select('photo_urls, name, language, condition, price')
    .eq('id', id)
    .maybeSingle();

  // Best-effort photo deletion (don't block if it fails). Split-sold clones
  // share the original row's storage paths — skip the removal when another
  // lot row still references the same first path, otherwise deleting the
  // sold history row would strip the photos off the live lot (or vice versa).
  if (lot && Array.isArray((lot as { photo_urls: unknown }).photo_urls)) {
    const paths = (lot as { photo_urls: string[] }).photo_urls;
    if (paths.length > 0) {
      const { data: sharers } = await supabase
        .from('lots')
        .select('id')
        .neq('id', id)
        .contains('photo_urls', JSON.stringify([paths[0]]))
        .limit(1);
      if (sharers && sharers.length > 0) {
        console.log(`lot ${id}: photos shared with ${sharers[0].id}, skipping storage removal`);
      } else {
        const { error: rmErr } = await supabase.storage.from('lot-photos').remove(paths);
        if (rmErr) console.warn('lot photo delete failed', rmErr);
      }
    }
  }

  const { error } = await supabase.from('lots').delete().eq('id', id);
  if (error) {
    return apiError('delete_failed', { status: 500, message: error.message });
  }

  void auditLog({
    actor_type: 'user',
    actor_user_id: user.id,
    action: 'lot.deleted',
    entity_type: 'lot',
    entity_id: id,
    details: {
      name: (lot as Record<string, unknown> | null)?.name,
      language: (lot as Record<string, unknown> | null)?.language,
      condition: (lot as Record<string, unknown> | null)?.condition,
      price: (lot as Record<string, unknown> | null)?.price,
    },
  });

  return new NextResponse(null, { status: 204 });
}
