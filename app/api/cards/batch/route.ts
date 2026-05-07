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
import { syncSiblingPhotos } from '@/lib/utils/sibling-photos';

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

  // --- Pre-check 1: exact duplicate (cross-status — match ignoring status) ---
  // Pick the match that would BLOCK the user's intended insert first (so the
  // modal's text + Stock fallback line up with the actual conflict). Otherwise
  // fall back to visibility priority. See app/api/cards/route.ts for rationale.
  const acceptDuplicates = str(formData, 'accept_duplicates') === '1';
  if (card_id_tcg && !acceptDuplicates) {
    const variantValue = variant ?? null;
    const { data: dupCandidates } = await supabase
      .from('cards')
      .select('id, image_url, tcg_image_url, card_name, pokemon_name, set_name, set_code, set_number, language, condition, variant, status, rarity, pokemon_number')
      .eq('card_id_tcg', card_id_tcg)
      .eq('language', language)
      .eq('condition', condition);
    const matches = (dupCandidates ?? []).filter((c) => (c.variant ?? null) === variantValue);
    if (matches.length > 0) {
      let dup = null;
      if (status === 'for_sale') {
        dup = matches.find((c) => c.status === 'for_sale') ?? null;
      } else if (status === 'pokedex' && pokemon_number) {
        dup = matches.find((c) => c.status === 'pokedex' && c.pokemon_number === pokemon_number) ?? null;
      }
      if (!dup) {
        const priority: Record<string, number> = { pokedex: 0, for_sale: 1, collection: 2, sold: 3 };
        const sorted = [...matches].sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
        dup = sorted[0];
      }
      return NextResponse.json(
        { error: 'exact_duplicate', existingCard: dup },
        { status: 409 },
      );
    }
  }

  // --- Pre-check 2: Pokédex slot taken by a DIFFERENT card ---
  // Same query + 409 payload as POST /api/cards so PokedexReplaceModal works.
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

  // --- Pre-check 3: for_sale slot taken (fallback for edge cases) ---
  // Same payload shape as POST /api/cards's catch-block 23505 → DuplicateForSaleModal.
  // Handles edge cases like card_id_tcg null on existing (un-enriched) or race conditions.
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

  // Propagate the photo to all sibling rows (same card identity) if we uploaded one.
  // Use the first inserted row as reference; siblings query excludes it.
  // The other newly-inserted rows already have the same image_url so the
  // UPDATE query against them is harmless (no change).
  if (image_url && data && data.length > 0 && card_id_tcg) {
    await syncSiblingPhotos(
      supabase,
      {
        card_id_tcg,
        language,
        condition,
        variant,
      },
      image_url,
      data[0].id,
    );
  }

  return NextResponse.json({ created: data ?? [] });
}
