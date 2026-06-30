import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PRICE_COEFFICIENT } from '@/lib/constants/pricing';
import { validateCardForm } from '@/lib/utils/validate-card-form';
import { syncSiblingPhotos } from '@/lib/utils/sibling-photos';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { auditLog } from '@/lib/utils/audit-log';

export const runtime = 'nodejs';

function str(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function num(form: FormData, key: string): number | null {
  const raw = str(form, key);
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

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
  if (!user) {
    return unauthorizedResponse();
  }

  const validation = validateCardForm(formData);
  if (!validation.valid) {
    return apiError('validation', { status: validation.status, message: validation.error });
  }
  const { card_name, pokemon_name, pokemon_number, language, rarity, condition, status } = validation.parsed;

  const cardId = crypto.randomUUID();

  // Upload the photo first (if present) so the row carries its image_url from
  // the start. If no image is uploaded, fall back to a sibling's image_url
  // (DuplicatePhotoModal's "garder l'ancienne" path sends no image so the
  // existing photo is reused).
  let image_url: string | null = null;
  const image = formData.get('image');
  const cardIdTcgEarly = str(formData, 'card_id_tcg');
  const variantEarly = str(formData, 'variant') || null;
  const languageEarly = str(formData, 'language');
  const conditionEarly = (str(formData, 'condition') as string | null) ?? 'NM';
  if (image instanceof File && image.size > 0) {
    const buffer = Buffer.from(await image.arrayBuffer());
    const path = `${cardId}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('card-photos')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      console.error('Photo upload failed:', uploadError);
      // Spec section 12: insert anyway, user can re-upload via the drawer later.
    } else {
      image_url = supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
    }
  } else if (str(formData, 'accept_duplicates') === '1' && cardIdTcgEarly && languageEarly) {
    // Photo-modal "garder l'ancienne" path: re-submit comes with no image,
    // borrow the URL from a sibling so the new row inherits the existing
    // photo. Gated on accept_duplicates=1 to avoid a sibling lookup on
    // every regular insert (and to keep tests simple).
    const { data: siblings } = await supabase
      .from('cards')
      .select('image_url, variant')
      .eq('card_id_tcg', cardIdTcgEarly)
      .eq('language', languageEarly)
      .eq('condition', conditionEarly);
    const sibling = (siblings ?? []).find(
      (s) => (s.variant ?? null) === variantEarly && s.image_url != null,
    );
    if (sibling?.image_url) image_url = sibling.image_url;
  }

  // Pricing — populated upstream (e.g. by TCGdex when re-research succeeds).
  // suggested_price is normally derived by the cron job; we mirror the same
  // formula here so the form-saved row already carries it.
  const cardmarket_id = str(formData, 'cardmarket_id');
  const cm_price_low = num(formData, 'cm_price_low');
  const cm_price_trend = num(formData, 'cm_price_trend');
  const cm_price_avg = num(formData, 'cm_price_avg');
  const suggested_price =
    cm_price_trend !== null
      ? Math.round(cm_price_trend * PRICE_COEFFICIENT * 100) / 100
      : null;
  const cm_updated_at =
    cm_price_low !== null || cm_price_trend !== null || cm_price_avg !== null
      ? new Date().toISOString()
      : null;

  // Pre-check 1: exact duplicate (cross-status — match on identifying fields,
  // ignoring status). Fires BEFORE pokedex_slot_taken / for_sale_conflict.
  //
  // When multiple copies exist, pick the one most relevant to the user's
  // intended status:
  //   - intent=for_sale + match in for_sale → pick the for_sale match (it's
  //     what would block the insert via the unique constraint)
  //   - intent=pokedex + match in pokedex with same pokemon_number → pick that
  //   - otherwise → fall back to general visibility priority
  //     (pokedex > for_sale > collection > sold)
  //
  // Picking the BLOCKING match means the modal's status-aware text matches
  // the actual conflict, and the targetStatus fallback ('collection') is
  // computed correctly. Without this, the modal could say "déjà dans ton
  // Pokédex" while the real blocker is in for_sale → user clicks Confirmer
  // and the Stock fallback never triggers, hitting for_sale_conflict.
  //
  // Bypassed by accept_duplicates=1 (DuplicatePhotoModal's follow-up insert).
  const acceptDuplicates = str(formData, 'accept_duplicates') === '1';
  const cardIdTcgForDup = str(formData, 'card_id_tcg');
  if (cardIdTcgForDup && !acceptDuplicates) {
    const variantValue = str(formData, 'variant') || null;
    const { data: dupCandidates } = await supabase
      .from('cards')
      .select('id, image_url, tcg_image_url, card_name, pokemon_name, set_name, set_code, set_number, language, condition, variant, status, rarity, pokemon_number')
      .eq('card_id_tcg', cardIdTcgForDup)
      .eq('language', language)
      .eq('condition', condition);
    const matches = (dupCandidates ?? []).filter((c) => (c.variant ?? null) === variantValue);
    if (matches.length > 0) {
      // 1. Prefer the match that would block the user's intended insert.
      let dup = null;
      if (status === 'for_sale') {
        dup = matches.find((c) => c.status === 'for_sale') ?? null;
      } else if (status === 'pokedex' && pokemon_number) {
        dup = matches.find((c) => c.status === 'pokedex' && c.pokemon_number === pokemon_number) ?? null;
      }
      // 2. Fall back to visibility priority.
      if (!dup) {
        const priority: Record<string, number> = { pokedex: 0, for_sale: 1, collection: 2, sold: 3 };
        const sorted = [...matches].sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
        dup = sorted[0];
      }
      return apiError('exact_duplicate', { status: 409, extra: { existingCard: dup } });
    }
  }

  // Pre-check 2: if status='pokedex' and the slot is already taken by a DIFFERENT card,
  // return 409 with the existing card details so the client can prompt for replacement.
  // This only fires when the card at the slot is NOT an exact match (different set,
  // condition, or variant) — exact matches are caught by pre-check 1 above.
  if (status === 'pokedex' && pokemon_number) {
    const { data: existing } = await supabase
      .from('cards')
      .select('id, image_url, tcg_image_url, card_name, pokemon_name, set_name, set_code, set_number, language, rarity, condition, variant, card_id_tcg')
      .eq('pokemon_number', pokemon_number)
      .eq('status', 'pokedex')
      .maybeSingle();

    if (existing) {
      // Check if a for_sale card of the same group already exists,
      // which would block "displace to Vinted" (one-for-sale unique index).
      let hasForSaleConflict = false;
      if (existing.card_id_tcg) {
        const { data: forSaleCandidates } = await supabase
          .from('cards')
          .select('id, variant')
          .eq('card_id_tcg', existing.card_id_tcg)
          .eq('language', existing.language)
          .eq('condition', existing.condition)
          .eq('status', 'for_sale');
        const existingVariant = existing.variant ?? null;
        hasForSaleConflict = (forSaleCandidates ?? []).some((c) => (c.variant ?? null) === existingVariant);
      }

      return apiError('pokedex_slot_taken', {
        status: 409,
        extra: { existingCard: existing, hasForSaleConflict },
      });
    }
  }

  const row = {
    id: cardId,
    pokemon_name,
    pokemon_number,
    card_name,
    card_id_tcg: str(formData, 'card_id_tcg'),
    set_name: str(formData, 'set_name'),
    set_code: str(formData, 'set_code'),
    set_number: str(formData, 'set_number'),
    language,
    rarity,
    condition,
    status,
    image_url,
    tcg_image_url: str(formData, 'tcg_image_url'),
    notes: str(formData, 'notes'),
    variant: str(formData, 'variant') || null,
    cardmarket_id,
    cm_price_low,
    cm_price_trend,
    cm_price_avg,
    suggested_price,
    cm_updated_at,
  };

  const { data, error } = await supabase
    .from('cards')
    .insert(row)
    .select()
    .single();

  if (error) {
    const isUniqueViolation =
      error.code === '23505' ||
      /one_for_sale_per_group|duplicate key|unique constraint/i.test(error.message ?? '');

    // Pre-check 3 (post-insert fallback): for_sale_conflict — handles edge cases like
    // card_id_tcg null on existing (un-enriched) or race conditions where the pre-check
    // missed a concurrent insert. The for_sale unique constraint catches it here.
    if (isUniqueViolation && status === 'for_sale') {
      // Fetch the existing for_sale card so the frontend can display it in the modal.
      const { data: existingCard } = await supabase
        .from('cards')
        .select('id, card_name, image_url, tcg_image_url, suggested_price, date_added, language, condition, variant, set_name, set_code')
        .eq('card_id_tcg', row.card_id_tcg)
        .eq('language', row.language)
        .eq('condition', row.condition)
        .eq('status', 'for_sale')
        .maybeSingle();

      return apiError('for_sale_conflict', {
        status: 409,
        message: 'This card is already for sale on Vinted.',
        extra: { existingCard },
      });
    }

    if (isUniqueViolation) {
      // Conflict on a constraint we can't auto-resolve (e.g., user requested status='collection' and somehow conflicted).
      return apiError('unique_constraint_conflict', {
        status: 409,
        message: 'Unresolvable unique-constraint conflict.',
      });
    }
    console.error('Card insert failed:', error);
    return apiError('insert_failed', { status: 500, message: error.message });
  }

  void auditLog({
    actor_type: 'user',
    actor_user_id: user.id,
    action: 'card.created',
    entity_type: 'card',
    entity_id: data?.id,
    details: {
      card_name: row.card_name,
      card_id_tcg: row.card_id_tcg,
      language: row.language,
      condition: row.condition,
      status: row.status,
    },
  });

  // Propagate the photo to all sibling rows (same card identity) if we uploaded one.
  if (data && image_url) {
    await syncSiblingPhotos(
      supabase,
      {
        card_id_tcg: row.card_id_tcg,
        language: row.language,
        condition: row.condition,
        variant: row.variant,
      },
      image_url,
      data.id,
    );
  }

  return NextResponse.json({ card: data });
}
