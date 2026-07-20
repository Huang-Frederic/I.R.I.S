import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

/**
 * POST /api/trades/photo — upload the (optional) photo of a trade batch.
 *
 * The client resizes the image first (resizeImage, same as the card scanner),
 * posts it once, and stamps the returned public URL on every card of the
 * batch via PATCH /api/cards/[id] { status: 'traded', trade_photo_url }.
 * Stored in the card-photos bucket under a trades/ prefix so backups and
 * bucket policies are shared with card photos.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return validationResponse('Invalid form data');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const image = formData.get('image');
  if (!(image instanceof File) || image.size === 0) {
    return validationResponse('image est requis');
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const path = `trades/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('card-photos')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });
  if (uploadError) {
    console.error('Trade photo upload failed:', uploadError);
    return apiError('upload_failed', { status: 500, message: uploadError.message });
  }

  const url = supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
  return NextResponse.json({ url });
}
