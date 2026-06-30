// POST endpoint to replace the photo of an existing card.
// Used by DuplicatePhotoModal when the user scans a duplicate card and chooses
// to swap the photo (keeps DB row, overwrites storage image).
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { syncSiblingPhotos } from '@/lib/utils/sibling-photos';
import {
  apiError,
  unauthorizedResponse,
  validationResponse,
  notFoundResponse,
} from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';

export const runtime = 'nodejs';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return validationResponse('missing id');

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return validationResponse('Invalid form data');
  }

  const file = formData.get('image');
  if (!(file instanceof File) || file.size === 0) {
    return validationResponse('Missing image file');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  // Verify the card exists (RLS handles the user-level check via server client).
  const { data: existing } = await supabase
    .from('cards')
    .select('id, image_url')
    .eq('id', id)
    .single();
  if (!existing) return notFoundResponse('card');

  // Upload (overwrites the same path).
  const buffer = Buffer.from(await file.arrayBuffer());
  const path = `${id}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('card-photos')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
  if (uploadError) {
    return apiError('upload_failed', {
      status: 500,
      message: `Upload failed: ${uploadError.message}`,
    });
  }

  // The public URL doesn't change (same path), but if image_url was null we set it now.
  const newImageUrl = supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
  const { error: updErr } = await supabase
    .from('cards')
    .update({ image_url: newImageUrl })
    .eq('id', id);
  if (updErr) return apiError('update_failed', { status: 500, message: updErr.message });

  // Propagate the new photo to all sibling rows (same card identity).
  const { data: row } = await supabase
    .from('cards')
    .select('card_name, card_id_tcg, language, condition, variant')
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

  void auditLog({
    actor_type: 'user',
    actor_user_id: user.id,
    action: 'card.photo_updated',
    entity_type: 'card',
    entity_id: id,
    details: {
      card_name: row?.card_name ?? null,
      card_id_tcg: row?.card_id_tcg ?? null,
      language: row?.language ?? null,
      condition: row?.condition ?? null,
      variant: row?.variant ?? null,
      image_url: newImageUrl,
    },
  });

  return NextResponse.json({ ok: true, image_url: newImageUrl });
}
