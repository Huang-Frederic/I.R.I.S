// app/api/cards/[id]/photo/route.ts
//
// POST endpoint to replace the photo of an existing card.
// Used by DuplicatePhotoModal when the user scans a duplicate card and chooses
// to swap the photo (keeps DB row, overwrites storage image).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncSiblingPhotos } from '@/lib/utils/sibling-photos';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'Missing image file' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Verify the card exists (RLS handles the user-level check via server client).
  const { data: existing } = await supabase
    .from('cards')
    .select('id, image_url')
    .eq('id', id)
    .single();
  if (!existing) return NextResponse.json({ error: 'card_not_found' }, { status: 404 });

  // Upload (overwrites the same path).
  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${id}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('card-photos')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 },
    );
  }

  // The public URL doesn't change (same path), but if image_url was null we set it now.
  const newImageUrl = supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
  const { error: updErr } = await supabase
    .from('cards')
    .update({ image_url: newImageUrl })
    .eq('id', id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // Propagate the new photo to all sibling rows (same card identity).
  const { data: row } = await supabase
    .from('cards')
    .select('card_id_tcg, language, condition, variant')
    .eq('id', id)
    .single();
  if (row) {
    await syncSiblingPhotos(
      supabase,
      {
        card_id_tcg: row.card_id_tcg,
        language: row.language,
        condition: row.condition,
        variant: row.variant,
      },
      newImageUrl,
      id,
    );
  }

  return NextResponse.json({ ok: true, image_url: newImageUrl });
}
