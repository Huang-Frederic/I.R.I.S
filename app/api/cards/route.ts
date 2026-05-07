import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PRICE_COEFFICIENT } from '@/lib/constants/pricing';
import { validateCardForm } from '@/lib/utils/validate-card-form';

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
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const validation = validateCardForm(formData);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const { card_name, pokemon_name, pokemon_number, language, rarity, condition, status } = validation.parsed;

  const cardId = crypto.randomUUID();

  // Upload the photo first (if present) so the row carries its image_url from the start.
  let image_url: string | null = null;
  const image = formData.get('image');
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
  // ignoring status). Fires BEFORE pokedex_slot_taken / for_sale_conflict so
  // the user always sees the photo-swap proposition when they own this exact
  // card anywhere (Stock, Vinted, or Pokédex).
  //
  // When multiple copies exist (e.g. 1 pokedex + 1 for_sale + 3 collection),
  // pick the most-prominent one to show in the modal: pokedex > for_sale >
  // collection > sold. The frontend uses existingCard.status to adapt the
  // modal copy ("déjà dans ton Pokédex" / "déjà sur Vinted" / etc.).
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
      const priority: Record<string, number> = { pokedex: 0, for_sale: 1, collection: 2, sold: 3 };
      matches.sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
      const dup = matches[0];
      return NextResponse.json(
        { error: 'exact_duplicate', existingCard: dup },
        { status: 409 },
      );
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

      return NextResponse.json(
        { error: 'pokedex_slot_taken', existingCard: existing, hasForSaleConflict },
        { status: 409 },
      );
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

      return NextResponse.json(
        {
          error: 'for_sale_conflict',
          message: 'Cette carte est déjà en vente sur Vinted.',
          existingCard,
        },
        { status: 409 },
      );
    }

    if (isUniqueViolation) {
      // Conflict on a constraint we can't auto-resolve (e.g., user requested status='collection' and somehow conflicted).
      return NextResponse.json(
        { error: 'for_sale_conflict', message: 'Conflit de contrainte unique non résolvable.' },
        { status: 409 },
      );
    }
    console.error('Card insert failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ card: data });
}
