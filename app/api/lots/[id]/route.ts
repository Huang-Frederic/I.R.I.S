import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  apiError,
  unauthorizedResponse,
  validationResponse,
  notFoundResponse,
} from '@/lib/utils/api-response';
import type { CardCondition, CardLanguage } from '@/lib/types';

export const runtime = 'nodejs';

interface PatchBody {
  name?: string;
  language?: CardLanguage;
  condition?: CardCondition;
  extra_description?: string | null;
  price?: number | null;
  status?: 'for_sale' | 'sold';
  date_sold?: string | null;
  sold_price?: number | null;
}

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

  if (body.status !== undefined) {
    if (body.status !== 'for_sale' && body.status !== 'sold') {
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

  // Read the lot to get photo_urls
  const { data: lot } = await supabase
    .from('lots')
    .select('photo_urls')
    .eq('id', id)
    .maybeSingle();

  // Best-effort photo deletion (don't block if it fails)
  if (lot && Array.isArray((lot as { photo_urls: unknown }).photo_urls)) {
    const paths = (lot as { photo_urls: string[] }).photo_urls;
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from('lot-photos').remove(paths);
      if (rmErr) console.warn('lot photo delete failed', rmErr);
    }
  }

  const { error } = await supabase.from('lots').delete().eq('id', id);
  if (error) {
    return apiError('delete_failed', { status: 500, message: error.message });
  }
  return new NextResponse(null, { status: 204 });
}
