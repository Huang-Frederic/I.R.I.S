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

  const { data: card, error: cardError } = await supabase
    .from('cards')
    .select('id, status, vinted_listing_id')
    .eq('id', card_id)
    .single();

  if (cardError || !card) {
    return apiError('card_not_found', { status: 404 });
  }
  if (card.vinted_listing_id) {
    return apiError('already_posted', { status: 409, message: 'Card already has a Vinted listing' });
  }
  if (card.status !== 'for_sale') {
    return apiError('invalid_status', { status: 400, message: 'Card must be for_sale' });
  }

  const { data: job, error: jobError } = await supabase
    .from('vinted_post_jobs')
    .insert({ card_id })
    .select()
    .single();

  if (jobError) {
    return apiError('job_create_failed', { status: 500, message: jobError.message });
  }

  return NextResponse.json({ job_id: job.id }, { status: 201 });
}
