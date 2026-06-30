import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { detectRestock } from '@/lib/utils/restock-detection';
import { detectPromotable, type PromoteCandidate } from '@/lib/utils/promote-detection';
import {
  apiError,
  unauthorizedResponse,
  validationResponse,
  notFoundResponse,
} from '@/lib/utils/api-response';
import type { CardStatus, Card } from '@/lib/types';

export const runtime = 'nodejs';

interface PatchBody {
  status?: CardStatus;
  sold_price?: number | null;
  date_sold?: string | null;
  suggested_price?: number | null;
  cm_price_low?: number | null;
  cm_price_trend?: number | null;
  cm_price_avg?: number | null;
  notes?: string | null;
}

const ALLOWED_STATUSES: ReadonlySet<CardStatus> = new Set([
  'for_sale',
  'collection',
  'sold',
  'pokedex',
]);

function sanitizeNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
    throw new Error('invalid_number');
  }
  return v;
}

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return validationResponse('missing id');

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return validationResponse('Invalid JSON body');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  // Build the update payload
  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return apiError('invalid_status', { status: 400, message: 'Invalid status' });
    }
    update.status = body.status;
    if (body.status === 'sold') {
      update.date_sold = body.date_sold ?? new Date().toISOString();
      update.sold_by_user_id = user.id;
    }
  }

  try {
    const sp = sanitizeNumber(body.sold_price);
    if (sp !== undefined) update.sold_price = sp;
    const sg = sanitizeNumber(body.suggested_price);
    if (sg !== undefined) update.suggested_price = sg;
    const lo = sanitizeNumber(body.cm_price_low);
    if (lo !== undefined) update.cm_price_low = lo;
    const tr = sanitizeNumber(body.cm_price_trend);
    if (tr !== undefined) update.cm_price_trend = tr;
    const av = sanitizeNumber(body.cm_price_avg);
    if (av !== undefined) update.cm_price_avg = av;
  } catch {
    return apiError('invalid_number', { status: 400, message: 'Invalid numeric field' });
  }

  if (body.notes !== undefined) update.notes = body.notes;

  if (Object.keys(update).length === 0) {
    return apiError('no_fields', { status: 400, message: 'No fields to update' });
  }

  // If we're flipping to pokedex, pre-check the per-pokemon unique slot.
  // The partial unique index `one_pokedex_per_pokemon` guarantees only one
  // 'pokedex' card per pokemon_number — so promoting an existing card needs
  // either an empty slot or a swap via /api/pokedex/replace.
  if (body.status === 'pokedex') {
    const { data: target, error: fetchErr } = await supabase
      .from('cards')
      .select('pokemon_number, status')
      .eq('id', id)
      .single();
    if (fetchErr || !target) {
      return notFoundResponse('card');
    }
    // Trainers/Energies (no pokemon_number) cannot occupy a Pokédex slot —
    // refuse the transition explicitly. The existing partial unique index is
    // safe (would let multiple null-numbered rows in), but the slot has no
    // semantic meaning for non-Pokémon cards.
    if (target.pokemon_number == null) {
      return apiError('missing_pokemon_number', {
        status: 400,
        message: 'pokemon_number is required for status=pokedex',
      });
    }
    if (target.status !== 'pokedex' && target.pokemon_number) {
      const { data: existing } = await supabase
        .from('cards')
        .select(
          'id, image_url, tcg_image_url, card_name, set_name, set_code, set_number, language, condition, rarity, variant, pokemon_number, pokemon_name',
        )
        .eq('pokemon_number', target.pokemon_number)
        .eq('status', 'pokedex')
        .neq('id', id)
        .maybeSingle();
      if (existing) {
        return apiError('pokedex_slot_taken', {
          status: 409,
          message:
            'The Pokédex slot for this Pokémon is already taken. Use "Replace" from the Pokédex drawer.',
          extra: { existingCard: existing },
        });
      }
    }
  }

  // If we're flipping to for_sale, pre-check the unique-group constraint
  if (body.status === 'for_sale') {
    // Read the current card's group key
    const { data: target, error: fetchErr } = await supabase
      .from('cards')
      .select('card_id_tcg, language, condition, variant, status')
      .eq('id', id)
      .single();
    if (fetchErr || !target) {
      return notFoundResponse('card');
    }
    // Skip check if already for_sale (no transition) or card_id_tcg is null (uncatalogued card)
    if (target.status !== 'for_sale' && target.card_id_tcg) {
      const { data: conflicts } = await supabase
        .from('cards')
        .select('id, variant, image_url, tcg_image_url, card_name, set_name, set_code, set_number, language, condition, rarity, pokemon_number, pokemon_name')
        .eq('card_id_tcg', target.card_id_tcg)
        .eq('language', target.language)
        .eq('condition', target.condition)
        .eq('status', 'for_sale')
        .neq('id', id);
      const targetVariant = target.variant ?? null;
      const conflict = (conflicts ?? []).find((c) => (c.variant ?? null) === targetVariant);
      if (conflict) {
        return apiError('for_sale_conflict', {
          status: 409,
          message: 'A copy of this card is already for sale on Vinted.',
          extra: { conflictCard: conflict },
        });
      }
    }
  }

  const { data: updated, error } = await supabase
    .from('cards')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return notFoundResponse('card');
    }
    // Postgres unique violation fallback (in case pre-check missed a race)
    const msg = error.message ?? '';
    const isUniqueViolation =
      error.code === '23505' || /duplicate key|unique constraint/i.test(msg);
    if (isUniqueViolation) {
      // Distinguish the two partial-unique indexes by name when surfacing.
      if (/one_pokedex_per_pokemon/i.test(msg) || body.status === 'pokedex') {
        return apiError('pokedex_slot_taken', {
          status: 409,
          message: 'The Pokédex slot for this Pokémon is already taken.',
        });
      }
      return apiError('for_sale_conflict', {
        status: 409,
        message: 'A copy of this card is already for sale on Vinted.',
      });
    }
    console.error('PATCH cards failed:', error);
    return apiError('update_failed', { status: 500, message: error.message });
  }

  // When a card is promoted to for_sale, migrate active partner listings from sold/collection
  // cards of the same group. This ensures partners who still have their own Vinted listing
  // don't see a stale "to_delete" chip on the old sold card.
  // Uses the service client to bypass RLS — the acting user can't modify another user's rows.
  if (body.status === 'for_sale' && updated.card_id_tcg) {
    const { data: oldCards } = await supabase
      .from('cards')
      .select('id, variant, suggested_price')
      .eq('card_id_tcg', updated.card_id_tcg)
      .eq('language', updated.language)
      .eq('condition', updated.condition)
      .neq('status', 'for_sale')
      .neq('id', id);

    const targetVariant = (updated as Record<string, unknown>).variant ?? null;
    const sameGroupOld = (oldCards ?? []).filter(
      (c) => (c.variant ?? null) === targetVariant,
    );

    if (sameGroupOld.length > 0) {
      const svc = createServiceClient();
      let priceToCopy: number | null = null;
      for (const oldCard of sameGroupOld) {
        if (!priceToCopy && typeof oldCard.suggested_price === 'number') {
          priceToCopy = oldCard.suggested_price;
        }

        // Fetch existing listings on this old card so we can decide per-row:
        // - real vinted_listing_id → the partner still has their copy live on Vinted,
        //   migrate the row to the new card so their badge stays correct.
        // - null vinted_listing_id → never actually posted (or already sold),
        //   drop it so the new card shows "put online" cleanly.
        const { data: oldListings } = await svc
          .from('card_listings')
          .select('user_id, vinted_listing_id, vinted_posted_at')
          .eq('card_id', oldCard.id);

        if (!oldListings?.length) continue;

        const toMigrate = oldListings.filter((l) => l.vinted_listing_id);
        if (toMigrate.length) {
          await svc.from('card_listings').upsert(
            toMigrate.map((l) => ({
              card_id: id,
              user_id: l.user_id,
              vinted_listing_id: l.vinted_listing_id,
              vinted_posted_at: l.vinted_posted_at,
              listed_at: new Date().toISOString(),
            })),
            { onConflict: 'card_id,user_id' },
          );
        }

        await svc.from('card_listings').delete().eq('card_id', oldCard.id);
      }

      // Copy suggested_price from old card to the new card if it has none.
      if (!updated.suggested_price && priceToCopy) {
        await svc.from('cards').update({ suggested_price: priceToCopy }).eq('id', id);
      }
    }
  }

  // Restock check only when this update marked the card sold
  let restock = null;
  if (update.status === 'sold' && updated.pokemon_number) {
    const [{ data: stillForSale }, { data: stillInStock }, { data: pokedex }] = await Promise.all([
      supabase
        .from('cards')
        .select('id')
        .eq('pokemon_number', updated.pokemon_number)
        .eq('status', 'for_sale'),
      supabase
        .from('cards')
        .select('id')
        .eq('pokemon_number', updated.pokemon_number)
        .eq('status', 'collection'),
      supabase
        .from('cards')
        .select('pokemon_name')
        .eq('pokemon_number', updated.pokemon_number)
        .eq('status', 'pokedex')
        .maybeSingle(),
    ]);

    restock = detectRestock({
      pokemonNumber: updated.pokemon_number,
      pokedexCard: pokedex,
      remainingForSaleCount: stillForSale?.length ?? 0,
      remainingStockCount: stillInStock?.length ?? 0,
    });
  }

  // Promote check: if just sold AND a stock copy of the same group exists, suggest promotion.
  let promote: PromoteCandidate | null = null;
  if (update.status === 'sold' && updated.card_id_tcg) {
    const { data: stockCandidates } = await supabase
      .from('cards')
      .select('*')
      .eq('card_id_tcg', updated.card_id_tcg)
      .eq('language', updated.language)
      .eq('condition', updated.condition)
      .eq('status', 'collection');

    promote = detectPromotable({
      soldCard: updated,
      stockCards: (stockCandidates ?? []) as Card[],
    });
  }

  return NextResponse.json({ card: updated, restock, promote });
}

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!id) return validationResponse('missing id');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  // Try to delete the photo from Storage first (best-effort, don't fail if missing).
  await supabase.storage.from('card-photos').remove([`${id}.jpg`]).catch(() => {});

  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) {
    console.error('DELETE cards failed:', error);
    return apiError('delete_failed', { status: 500, message: error.message });
  }

  return NextResponse.json({ ok: true });
}
