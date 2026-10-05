import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';
import { FRED_USER_ID, syncOtherItemQueueMembership } from '@/lib/vinted/other-item-queue-sync';
import { parseColorIds } from '@/lib/vinted/other-item-attributes';

export const runtime = 'nodejs';

const TITLE_MAX = 80;

export async function POST(request: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return validationResponse('Invalid form data');
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();
  if (user.id !== FRED_USER_ID) {
    return apiError('forbidden', { status: 403, message: 'This feature is not available on this account' });
  }

  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name === '') return validationResponse('Field "name" is required');
  if (name.length > TITLE_MAX) return validationResponse(`Field "name" must be ${TITLE_MAX} characters or fewer`);

  const description = (formData.get('description') as string | null)?.trim() ?? '';

  const priceRaw = formData.get('price') as string | null;
  const price = priceRaw ? Number(priceRaw.replace(',', '.')) : null;
  if (price !== null && (!Number.isFinite(price) || price < 0)) {
    return validationResponse('Field "price" must be a positive number');
  }

  const catalogIdRaw = formData.get('vinted_catalog_id') as string | null;
  const vinted_catalog_id = catalogIdRaw ? parseInt(catalogIdRaw, 10) : NaN;
  if (!Number.isInteger(vinted_catalog_id)) return validationResponse('Field "vinted_catalog_id" is required');

  const vinted_catalog_path = (formData.get('vinted_catalog_path') as string | null)?.trim() ?? '';
  if (vinted_catalog_path === '') return validationResponse('Field "vinted_catalog_path" is required');

  // Vinted's own condition id — which ones a category accepts varies (6, 1,
  // 2, 3, 4 for most, only 6 for perfume, + 7 for appliances), and the bot
  // checks it against the live category before posting.
  const conditionRaw = formData.get('vinted_condition_id') as string | null;
  const vinted_condition_id = conditionRaw && /^\d+$/.test(conditionRaw) ? Number(conditionRaw) : NaN;
  if (!Number.isInteger(vinted_condition_id) || vinted_condition_id < 1) {
    return validationResponse('Field "vinted_condition_id" must be a positive integer');
  }

  const brand_name = (formData.get('brand_name') as string | null)?.trim() || null;
  // `size` is the chosen size option's label (description text), `vinted_size_id` its Vinted id.
  const size = (formData.get('size') as string | null)?.trim() || null;
  const sizeIdRaw = (formData.get('vinted_size_id') as string | null)?.trim() || null;
  const vinted_size_id = sizeIdRaw === null ? null : /^\d+$/.test(sizeIdRaw) ? Number(sizeIdRaw) : NaN;
  if (vinted_size_id !== null && (!Number.isInteger(vinted_size_id) || vinted_size_id < 1)) {
    return validationResponse('Field "vinted_size_id" must be a positive integer');
  }
  const vinted_color_ids = parseColorIds(formData.getAll('vinted_color_ids'));
  if (vinted_color_ids === null) {
    return validationResponse('Field "vinted_color_ids" must hold at most 2 known Vinted color ids');
  }

  const statusRaw = (formData.get('status') as string | null) ?? 'for_sale';
  if (statusRaw !== 'for_sale' && statusRaw !== 'collection') {
    return validationResponse('Field "status" must be for_sale or collection');
  }

  const photos = formData.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);
  if (photos.length === 0) return validationResponse('At least one photo is required');

  const { data: inserted, error: insertErr } = await supabase
    .from('other_items')
    .insert({
      user_id: FRED_USER_ID,
      name,
      description,
      price,
      vinted_catalog_id,
      vinted_catalog_path,
      vinted_condition_id,
      brand_name,
      size,
      vinted_size_id,
      vinted_color_ids,
      status: statusRaw,
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return apiError('insert_failed', { status: 500, message: insertErr?.message ?? 'no data' });
  }
  const itemId = (inserted as { id: string }).id;

  const uploadedPaths: string[] = [];
  const uploadErrors: string[] = [];
  for (let i = 0; i < photos.length; i += 1) {
    const path = `${itemId}/${i}.jpg`;
    const buffer = await photos[i].arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from('other-item-photos')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      uploadErrors.push(`${path}: ${upErr.message}`);
    } else {
      uploadedPaths.push(path);
    }
  }

  if (uploadedPaths.length === 0) {
    await supabase.from('other_items').delete().eq('id', itemId);
    return apiError('upload_failed', { status: 500, message: 'all photo uploads failed', details: uploadErrors });
  }

  const { data: updated, error: updErr } = await supabase
    .from('other_items')
    .update({ photo_urls: uploadedPaths })
    .eq('id', itemId)
    .select('*')
    .single();
  if (updErr || !updated) {
    return apiError('update_failed', { status: 500, message: updErr?.message ?? 'no data' });
  }

  await syncOtherItemQueueMembership(supabase, itemId);

  void auditLog({
    actor_type: 'user',
    actor_user_id: user.id,
    action: 'other_item.created',
    entity_type: 'other_item',
    entity_id: itemId,
    details: { name, price, vinted_catalog_id },
  });

  return NextResponse.json({
    item: updated,
    upload_warnings: uploadErrors.length > 0 ? uploadErrors : undefined,
  });
}
