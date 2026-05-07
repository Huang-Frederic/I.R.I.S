// app/api/cards/batch/route.ts
//
// Bulk variant of POST /api/cards. Same shape (multipart form + image),
// plus a `count` field. Uploads the photo ONCE, runs ONE bulk INSERT for
// all N rows. Massive speedup for count>1 (no N HTTP round-trips, no N
// uploads of the same photo, no N TLS handshakes).
//
// Status fallback follows the existing CardScanForm convention: the FIRST
// row keeps the requested status (for_sale / pokedex / collection); copies
// 2..N silently fall back to 'collection' when the requested status is
// constrained by a partial unique index.
//
// Pre-checks (pokedex slot, for_sale conflict) run ONCE before the insert
// and return 409 with the existing card payload — same shape as POST
// /api/cards so the existing PokedexReplaceModal + DuplicateForSaleModal
// flows work unchanged.
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildBatchRows, type BatchRowBase } from '@/lib/utils/build-batch-rows';
import { PRICE_COEFFICIENT } from '@/lib/constants/pricing';
import { validateCardForm } from '@/lib/utils/validate-card-form';

export const runtime = 'nodejs';

const MAX_COUNT = 50;

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

  // --- Field validation (same rules as POST /api/cards) ---
  const validation = validateCardForm(formData);
  if (!validation.valid) {
    return NextResponse.json({ error: validation.error }, { status: validation.status });
  }
  const { card_name, pokemon_name, pokemon_number, language, rarity, condition, status } = validation.parsed;
  const variant = str(formData, 'variant');
  const count_raw = num(formData, 'count');
  const count = count_raw && count_raw >= 1 ? Math.min(Math.floor(count_raw), MAX_COUNT) : 1;

  const card_id_tcg = str(formData, 'card_id_tcg');

  // --- Pre-check 1: Pokédex slot taken ---
  // Same query + 409 payload as POST /api/cards so PokedexReplaceModal works.
  if (status === 'pokedex' && pokemon_number) {
    const { data: existing } = await supabase
      .from('cards')
      .select('id, image_url, tcg_image_url, card_name, pokemon_name, set_name, set_code, set_number, language, rarity, condition, variant, card_id_tcg')
      .eq('pokemon_number', pokemon_number)
      .eq('status', 'pokedex')
      .maybeSingle();
    if (existing) {
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

  // --- Pre-check 2: for_sale slot taken ---
  // Same payload shape as POST /api/cards's catch-block 23505 → DuplicateForSaleModal.
  if (status === 'for_sale' && card_id_tcg) {
    const { data: existingForSale } = await supabase
      .from('cards')
      .select('id, card_name, image_url, tcg_image_url, suggested_price, date_added, language, condition, variant, set_name, set_code')
      .eq('card_id_tcg', card_id_tcg)
      .eq('language', language)
      .eq('condition', condition)
      .eq('status', 'for_sale')
      .maybeSingle();
    if (existingForSale && (existingForSale.variant ?? null) === (variant ?? null)) {
      return NextResponse.json(
        { error: 'for_sale_conflict', message: 'Cette carte est déjà en vente sur Vinted.', existingCard: existingForSale },
        { status: 409 },
      );
    }
  }

  // --- Pre-check 3: exact duplicate (collection only) ---
  // Triggers DuplicatePhotoModal on the client, letting the user choose which photo to keep.
  // Skip when card_id_tcg is null (un-enriched card — no reliable identity key).
  // Only check for status='collection' (pokedex & for_sale have their own conflict modals).
  if (status === 'collection' && card_id_tcg) {
    const variantValue = variant ?? null;
    const { data: dupCandidates } = await supabase
      .from('cards')
      .select('id, image_url, tcg_image_url, card_name, pokemon_name, set_name, set_code, set_number, language, condition, variant, status, rarity')
      .eq('card_id_tcg', card_id_tcg)
      .eq('language', language)
      .eq('condition', condition)
      .eq('status', status);
    const dup = (dupCandidates ?? []).find((c) => (c.variant ?? null) === variantValue);
    if (dup) {
      return NextResponse.json(
        { error: 'exact_duplicate', existingCard: dup },
        { status: 409 },
      );
    }
  }

  // --- Upload photo ONCE ---
  let image_url: string | null = null;
  const image = formData.get('image');
  if (image instanceof File && image.size > 0) {
    const buffer = Buffer.from(await image.arrayBuffer());
    // Use a single shared photo path; all N rows reference the same image_url.
    // The path uses a fresh UUID so concurrent imports don't collide.
    const path = `${crypto.randomUUID()}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('card-photos')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
    if (uploadError) {
      console.error('[cards/batch] photo upload failed:', uploadError);
      // Insert anyway — user can re-upload via the drawer later.
    } else {
      image_url = supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
    }
  }

  // --- Pricing (same formula as POST /api/cards) ---
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

  // --- Build N rows ---
  const base: BatchRowBase = {
    pokemon_name,
    pokemon_number,
    card_name,
    card_id_tcg,
    set_name: str(formData, 'set_name'),
    set_code: str(formData, 'set_code'),
    set_number: str(formData, 'set_number'),
    language,
    rarity,
    condition,
    image_url,
    tcg_image_url: str(formData, 'tcg_image_url'),
    notes: str(formData, 'notes'),
    variant,
    cardmarket_id,
    cm_price_low,
    cm_price_trend,
    cm_price_avg,
    suggested_price,
    cm_updated_at,
  };
  const rows = buildBatchRows(base, status, count);

  // --- One bulk INSERT (atomic) ---
  const { data, error } = await supabase
    .from('cards')
    .insert(rows)
    .select('id, status');
  if (error) {
    console.error('[cards/batch] bulk insert failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ created: data ?? [] });
}
