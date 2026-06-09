import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { card_id?: string };
  try {
    body = await request.json();
  } catch {
    return validationResponse('Invalid JSON');
  }

  const { card_id } = body;
  if (!card_id || typeof card_id !== 'string') {
    return validationResponse('card_id is required');
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return unauthorizedResponse();

  // Only designated Vinted users can post — each has their own Vinted account/cookies
  const allowedIds = (process.env.VINTED_USER_IDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowedIds.includes(auth.user.id)) {
    return apiError('forbidden', { status: 403, message: 'Vinted posting not enabled for this account' });
  }

  const { data: card, error: cardError } = await supabase
    .from('cards')
    .select('id, status, suggested_price, cm_price_low, cm_price_avg')
    .eq('id', card_id)
    .single();

  if (cardError || !card) {
    return apiError('card_not_found', { status: 404 });
  }
  if (card.status !== 'for_sale') {
    return apiError('invalid_status', { status: 400, message: 'Card must be for_sale' });
  }
  if (card.suggested_price === null) {
    return apiError('no_price', { status: 400, message: 'Aucun prix Vinted défini pour cette carte' });
  }

  // Each user has their own Vinted account — check only their own listing
  const { data: myListing } = await supabase
    .from('card_listings')
    .select('vinted_listing_id')
    .eq('card_id', card_id)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (myListing?.vinted_listing_id) {
    return apiError('already_posted', { status: 409, message: 'Vous avez déjà une annonce Vinted pour cette carte' });
  }

  const { data: job, error: jobError } = await supabase
    .from('vinted_post_jobs')
    .insert({ card_id, user_id: auth.user.id })
    .select()
    .single();

  if (jobError) {
    console.error('[vinted/post-job] insert failed:', jobError.message, jobError.code);
    return apiError('job_create_failed', { status: 500, message: jobError.message });
  }

  return NextResponse.json({ job_id: job.id }, { status: 201 });
}
