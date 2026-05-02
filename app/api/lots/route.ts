import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { CardLanguage, CardCondition } from '@/lib/types';

export const runtime = 'nodejs';

const ALLOWED_LANGUAGES: ReadonlySet<string> = new Set([
  'JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH',
]);
const ALLOWED_CONDITIONS: ReadonlySet<string> = new Set(['NM', 'EX', 'GD', 'PL', 'PO']);

function bad(msg: string, status = 400): NextResponse {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return bad('Invalid form data', 400);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return bad('Unauthorized', 401);

  // Validate fields
  const name = (formData.get('name') as string | null)?.trim() ?? '';
  if (name === '') return bad('Field "name" is required');

  const priceRaw = formData.get('price') as string | null;
  const price = priceRaw ? Number(priceRaw.replace(',', '.')) : NaN;
  if (!Number.isFinite(price) || price < 0) return bad('Field "price" must be a positive number');

  const language = formData.get('language') as string | null;
  if (!language || !ALLOWED_LANGUAGES.has(language)) return bad('Field "language" is invalid');

  const condition = (formData.get('condition') as string | null) ?? 'NM';
  if (!ALLOWED_CONDITIONS.has(condition)) return bad('Field "condition" is invalid');

  const extra_description = (formData.get('extra_description') as string | null) ?? null;

  const photos = formData.getAll('photos').filter((p): p is File => p instanceof File && p.size > 0);
  if (photos.length === 0) return bad('At least one photo is required');

  // Step 1: insert the lot row to get an id
  const { data: inserted, error: insertErr } = await supabase
    .from('lots')
    .insert({
      name,
      language: language as CardLanguage,
      condition: condition as CardCondition,
      extra_description,
      price,
      status: 'for_sale',
    })
    .select('id')
    .single();
  if (insertErr || !inserted) {
    return NextResponse.json(
      { error: `insert failed: ${insertErr?.message ?? 'no data'}` },
      { status: 500 },
    );
  }

  const lotId = (inserted as { id: string }).id;

  // Step 2: upload photos
  const uploadedPaths: string[] = [];
  const uploadErrors: string[] = [];
  for (let i = 0; i < photos.length; i += 1) {
    const path = `${lotId}/${i}.jpg`;
    const buffer = await photos[i].arrayBuffer();
    const { error: upErr } = await supabase.storage
      .from('lot-photos')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      uploadErrors.push(`${path}: ${upErr.message}`);
      console.warn(`lot upload failed: ${path}`, upErr);
    } else {
      uploadedPaths.push(path);
    }
  }

  // If ALL uploads failed, rollback the row
  if (uploadedPaths.length === 0) {
    await supabase.from('lots').delete().eq('id', lotId);
    return NextResponse.json(
      { error: 'all photo uploads failed', details: uploadErrors },
      { status: 500 },
    );
  }

  // Step 3: update with photo_urls and return the full row
  const { data: updated, error: updErr } = await supabase
    .from('lots')
    .update({ photo_urls: uploadedPaths })
    .eq('id', lotId)
    .select('*')
    .single();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: `update failed: ${updErr?.message ?? 'no data'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    lot: updated,
    upload_warnings: uploadErrors.length > 0 ? uploadErrors : undefined,
  });
}
