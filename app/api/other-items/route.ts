import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';
import { FRED_USER_ID, syncOtherItemQueueMembership } from '@/lib/vinted/other-item-queue-sync';

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

  const conditionRaw = formData.get('vinted_condition_id') as string | null;
  const vinted_condition_id = conditionRaw ? parseInt(conditionRaw, 10) : NaN;
  if (!Number.isInteger(vinted_condition_id) || vinted_condition_id < 1 || vinted_condition_id > 5) {
    return validationResponse('Field "vinted_condition_id" must be between 1 and 5');
  }

  const brand_name = (formData.get('brand_name') as string | null)?.trim() || null;
  const size = (formData.get('size') as string | null)?.trim() || null;

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
