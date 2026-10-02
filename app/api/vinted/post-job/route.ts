import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';
import { FRED_USER_ID } from '@/lib/vinted/other-item-queue-sync';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  let body: { card_id?: string; lot_id?: string; other_item_id?: string; job_type?: 'post' | 'repost' };
  try {
    body = await request.json();
  } catch {
    return validationResponse('Invalid JSON');
  }

  const { card_id, lot_id, other_item_id } = body;
  const jobType = body.job_type === 'repost' ? 'repost' : 'post';
  const isLot = !!lot_id;
  const isCard = !!card_id;
  const isOtherItem = !!other_item_id;
  const targetCount = [isCard, isLot, isOtherItem].filter(Boolean).length;

  if (targetCount === 0) {
    return validationResponse('card_id, lot_id or other_item_id is required');
  }
  if (targetCount > 1) {
    return validationResponse('Provide exactly one of card_id, lot_id or other_item_id');
  }
  if (isCard && typeof card_id !== 'string') {
    return validationResponse('card_id must be a string');
  }
  if (isLot && typeof lot_id !== 'string') {
    return validationResponse('lot_id must be a string');
  }
  if (isOtherItem && typeof other_item_id !== 'string') {
    return validationResponse('other_item_id must be a string');
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return unauthorizedResponse();

  const allowedIds = (process.env.VINTED_USER_IDS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowedIds.includes(auth.user.id)) {
    return apiError('forbidden', { status: 403, message: 'Vinted posting not enabled for this account' });
  }

  // other_items is Fred-only by design (lib/vinted/other-item-queue-sync.ts)
  // — the generic VINTED_USER_IDS allowlist above also includes Gilly (she's
  // a valid Vinted-enabled account), so it alone can't gate this branch. She
  // never sees the "other item" option in the UI, but without this check she
  // could still call this route directly with an other_item_id and have it
  // succeed server-side.
  if (isOtherItem && auth.user.id !== FRED_USER_ID) {
    return apiError('forbidden', { status: 403, message: 'This feature is not available on this account' });
  }

  if (isCard) {
    const { data: card, error: cardError } = await supabase
      .from('cards')
      .select('id, status, suggested_price, cm_price_low, cm_price_avg, card_name, card_id_tcg, set_code, set_name, language, condition, variant, pokemon_name, pokemon_number')
      .eq('id', card_id!)
      .single();

    if (cardError || !card) return apiError('card_not_found', { status: 404 });
    if (card.status !== 'for_sale') {
      return apiError('invalid_status', { status: 400, message: 'La carte doit être en vente' });
    }
    if (card.suggested_price === null) {
      return apiError('no_price', { status: 400, message: 'Aucun prix Vinted défini pour cette carte' });
    }

    const { data: myListing } = await supabase
      .from('card_listings')
      .select('vinted_listing_id')
      .eq('card_id', card_id!)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (jobType === 'post') {
      if (myListing?.vinted_listing_id) {
        return apiError('already_posted', { status: 409, message: 'Vous avez déjà une annonce Vinted pour cette carte' });
      }
    } else if (!myListing?.vinted_listing_id) {
      return apiError('not_posted_yet', { status: 400, message: 'Aucune annonce Vinted existante à reposter pour cette carte' });
    }

    const { data: activeJob } = await supabase
      .from('vinted_post_jobs')
      .select('id')
      .eq('card_id', card_id!)
      .eq('user_id', auth.user.id)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle();

    if (activeJob) {
      return apiError('job_already_queued', { status: 409, message: 'Un job de publication est déjà en cours pour cette carte' });
    }

    const { data: job, error: jobError } = await supabase
      .from('vinted_post_jobs')
      .insert({ card_id, user_id: auth.user.id, job_type: jobType, triggered_by: 'manual' })
      .select()
      .single();

    if (jobError) {
      console.error('[vinted/post-job] insert failed:', jobError.message, jobError.code);
      return apiError('job_create_failed', { status: 500, message: jobError.message });
    }
    void auditLog({
      actor_type: 'user',
      actor_user_id: auth.user.id,
      action: 'job.created',
      entity_type: 'card',
      entity_id: card_id,
      details: {
        job_id: job.id,
        job_type: jobType,
        card_name: card.card_name,
        card_id_tcg: card.card_id_tcg,
        set_name: card.set_name,
        set_code: card.set_code,
        language: card.language,
        condition: card.condition,
        variant: card.variant ?? null,
        pokemon_name: card.pokemon_name,
        suggested_price: card.suggested_price,
      },
    });
    if (jobType === 'post') {
      void supabase.from('vinted_queue').delete().eq('user_id', auth.user.id).eq('card_id', card_id!)
        .then(({ error }) => {
          if (error) console.error('[vinted/post-job] vinted_queue cleanup failed:', error.message);
        });
    }
    return NextResponse.json({ job_id: job.id }, { status: 201 });
  }

  if (isOtherItem) {
    const { data: otherItem, error: otherItemError } = await supabase
      .from('other_items')
      .select('id, status, price, name, vinted_catalog_id')
      .eq('id', other_item_id!)
      .single();

    if (otherItemError || !otherItem) return apiError('other_item_not_found', { status: 404 });
    if (otherItem.status !== 'for_sale') {
      return apiError('invalid_status', { status: 400, message: 'Cet objet doit être en vente' });
    }
    if (otherItem.price === null) {
      return apiError('no_price', { status: 400, message: 'Aucun prix défini pour cet objet' });
    }

    const { data: myOtherItemListing } = await supabase
      .from('other_item_listings')
      .select('vinted_listing_id')
      .eq('other_item_id', other_item_id!)
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (jobType === 'post') {
      if (myOtherItemListing?.vinted_listing_id) {
        return apiError('already_posted', { status: 409, message: 'Vous avez déjà une annonce Vinted pour cet objet' });
      }
    } else if (!myOtherItemListing?.vinted_listing_id) {
      return apiError('not_posted_yet', { status: 400, message: 'Aucune annonce Vinted existante à reposter pour cet objet' });
    }

    const { data: activeOtherItemJob } = await supabase
      .from('vinted_post_jobs')
      .select('id')
      .eq('other_item_id', other_item_id!)
      .eq('user_id', auth.user.id)
      .in('status', ['pending', 'processing'])
      .limit(1)
      .maybeSingle();

    if (activeOtherItemJob) {
      return apiError('job_already_queued', { status: 409, message: 'Un job de publication est déjà en cours pour cet objet' });
    }

    const { data: job, error: jobError } = await supabase
      .from('vinted_post_jobs')
      .insert({ other_item_id, user_id: auth.user.id, job_type: jobType, triggered_by: 'manual' })
      .select()
      .single();

    if (jobError) {
      console.error('[vinted/post-job] insert failed:', jobError.message, jobError.code);
      return apiError('job_create_failed', { status: 500, message: jobError.message });
    }
    void auditLog({
      actor_type: 'user',
      actor_user_id: auth.user.id,
      action: 'job.created',
      entity_type: 'other_item',
      entity_id: other_item_id,
      details: {
        job_id: job.id,
        job_type: jobType,
        other_item_name: otherItem.name,
        price: otherItem.price,
        vinted_catalog_id: otherItem.vinted_catalog_id,
      },
    });
    if (jobType === 'post') {
      void supabase.from('vinted_queue').delete().eq('user_id', auth.user.id).eq('other_item_id', other_item_id!)
        .then(({ error }) => {
          if (error) console.error('[vinted/post-job] vinted_queue cleanup failed:', error.message);
        });
    }
    return NextResponse.json({ job_id: job.id }, { status: 201 });
  }

  // Lot path
  const { data: lot, error: lotError } = await supabase
    .from('lots')
    .select('id, status, price, name, language, condition')
    .eq('id', lot_id!)
    .single();

  if (lotError || !lot) return apiError('lot_not_found', { status: 404 });
  if (lot.status !== 'for_sale') {
    return apiError('invalid_status', { status: 400, message: 'Le lot doit être en vente' });
  }
  if (lot.price === null) {
    return apiError('no_price', { status: 400, message: 'Aucun prix défini pour ce lot' });
  }

  const { data: myLotListing } = await supabase
    .from('lot_listings')
    .select('vinted_listing_id')
    .eq('lot_id', lot_id!)
    .eq('user_id', auth.user.id)
    .maybeSingle();

  if (jobType === 'post') {
    if (myLotListing?.vinted_listing_id) {
      return apiError('already_posted', { status: 409, message: 'Vous avez déjà une annonce Vinted pour ce lot' });
    }
  } else if (!myLotListing?.vinted_listing_id) {
    return apiError('not_posted_yet', { status: 400, message: 'Aucune annonce Vinted existante à reposter pour ce lot' });
  }

  const { data: activeLotJob } = await supabase
    .from('vinted_post_jobs')
    .select('id')
    .eq('lot_id', lot_id!)
    .eq('user_id', auth.user.id)
    .in('status', ['pending', 'processing'])
    .limit(1)
    .maybeSingle();

  if (activeLotJob) {
    return apiError('job_already_queued', { status: 409, message: 'Un job de publication est déjà en cours pour ce lot' });
  }

  const { data: job, error: jobError } = await supabase
    .from('vinted_post_jobs')
    .insert({ lot_id, user_id: auth.user.id, job_type: jobType, triggered_by: 'manual' })
    .select()
    .single();

  if (jobError) {
    console.error('[vinted/post-job] insert failed:', jobError.message, jobError.code);
    return apiError('job_create_failed', { status: 500, message: jobError.message });
  }
  void auditLog({
    actor_type: 'user',
    actor_user_id: auth.user.id,
    action: 'job.created',
    entity_type: 'lot',
    entity_id: lot_id,
    details: {
      job_id: job.id,
      job_type: jobType,
      lot_name: lot.name,
      price: lot.price,
      language: lot.language,
      condition: lot.condition,
    },
  });
  if (jobType === 'post') {
    void supabase.from('vinted_queue').delete().eq('user_id', auth.user.id).eq('lot_id', lot_id!)
      .then(({ error }) => {
        if (error) console.error('[vinted/post-job] vinted_queue cleanup failed:', error.message);
      });
  }
  return NextResponse.json({ job_id: job.id }, { status: 201 });
}
