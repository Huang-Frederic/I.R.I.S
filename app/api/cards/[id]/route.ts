// app/api/cards/[id]/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { detectRestock } from '@/lib/utils/restock-detection';
import { detectPromotable, type PromoteCandidate } from '@/lib/utils/promote-detection';
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
  vinted_listed_at?: string | null;
}

const ALLOWED_STATUSES: ReadonlySet<CardStatus> = new Set(['for_sale', 'collection', 'sold']);

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
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Build the update payload
  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!ALLOWED_STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: 'status invalide (utiliser /api/pokedex/replace pour pokedex)' },
        { status: 400 },
      );
    }
    update.status = body.status;
    if (body.status === 'sold') {
      update.date_sold = body.date_sold ?? new Date().toISOString();
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
    return NextResponse.json({ error: 'champ numérique invalide' }, { status: 400 });
  }

  if (body.notes !== undefined) update.notes = body.notes;

  // vinted_listed_at: validated as ISO timestamp string or explicit null.
  if (body.vinted_listed_at !== undefined) {
    if (body.vinted_listed_at === null) {
      update.vinted_listed_at = null;
    } else if (typeof body.vinted_listed_at === 'string') {
      const parsed = new Date(body.vinted_listed_at);
      if (isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'vinted_listed_at invalide' }, { status: 400 });
      }
      update.vinted_listed_at = parsed.toISOString();
    } else {
      return NextResponse.json({ error: 'vinted_listed_at invalide' }, { status: 400 });
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'aucun champ à mettre à jour' }, { status: 400 });
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
      return NextResponse.json({ error: 'carte introuvable' }, { status: 404 });
    }
    // Skip check if already for_sale (no transition) or card_id_tcg is null (uncatalogued card)
    if (target.status !== 'for_sale' && target.card_id_tcg) {
      const { data: conflicts } = await supabase
        .from('cards')
        .select('id, variant')
        .eq('card_id_tcg', target.card_id_tcg)
        .eq('language', target.language)
        .eq('condition', target.condition)
        .eq('status', 'for_sale')
        .neq('id', id);
      const targetVariant = target.variant ?? null;
      const hasConflict = (conflicts ?? []).some((c) => (c.variant ?? null) === targetVariant);
      if (hasConflict) {
        return NextResponse.json(
          { error: 'for_sale_conflict', message: 'Un exemplaire de cette carte est déjà en vente sur Vinted.' },
          { status: 409 },
        );
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
      return NextResponse.json({ error: 'carte introuvable' }, { status: 404 });
    }
    // Postgres unique violation fallback (in case pre-check missed a race)
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'for_sale_conflict', message: 'Un exemplaire de cette carte est déjà en vente sur Vinted.' },
        { status: 409 },
      );
    }
    console.error('PATCH cards failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Restock check only when this update marked the card sold
  let restock = null;
  if (update.status === 'sold' && updated.pokemon_number) {
    const [{ data: stillForSale }, { data: pokedex }] = await Promise.all([
      supabase
        .from('cards')
        .select('id')
        .eq('pokemon_number', updated.pokemon_number)
        .eq('status', 'for_sale'),
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
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Try to delete the photo from Storage first (best-effort, don't fail if missing).
  await supabase.storage.from('card-photos').remove([`${id}.jpg`]).catch(() => {});

  const { error } = await supabase.from('cards').delete().eq('id', id);
  if (error) {
    console.error('DELETE cards failed:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
