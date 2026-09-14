import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  unauthorizedResponse,
  validationResponse,
  serverErrorResponse,
} from '@/lib/utils/api-response';
import type { DrillCard } from '@/lib/types';

function isDrillCard(v: unknown): v is DrillCard {
  if (!v || typeof v !== 'object') return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.count === 'number' &&
    (c.category === 'poke' || c.category === 'trainer' || c.category === 'energy')
  );
}

/** Shared by POST (create) and PATCH (Task 8, update) — both accept the
 *  same { name, cards, target_ids } shape and must pass the same checks. */
export function validateProfileBody(body: unknown):
  | { ok: true; name: string; cards: DrillCard[]; target_ids: string[] }
  | { ok: false; message: string } {
  const b = body as { name?: unknown; cards?: unknown; target_ids?: unknown };
  if (typeof b?.name !== 'string' || !b.name.trim()) {
    return { ok: false, message: 'A profile name is required.' };
  }
  if (!Array.isArray(b.cards) || b.cards.length === 0 || !b.cards.every(isDrillCard)) {
    return { ok: false, message: 'At least one valid card is required.' };
  }
  if (!Array.isArray(b.target_ids) || !b.target_ids.every((id) => typeof id === 'string')) {
    return { ok: false, message: 'target_ids must be an array of strings.' };
  }
  const cardIds = new Set(b.cards.map((c) => c.id));
  if (!b.target_ids.every((id) => cardIds.has(id))) {
    return { ok: false, message: 'Every target id must reference a card in the decklist.' };
  }
  return { ok: true, name: b.name.trim(), cards: b.cards, target_ids: b.target_ids };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const { data, error } = await supabase
    .from('ptcg_drill_profiles')
    .select('id, user_id, name, cards, target_ids, created_at, updated_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ profiles: data ?? [] });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationResponse('Body is not valid JSON.');
  }

  const check = validateProfileBody(body);
  if (!check.ok) return validationResponse(check.message);

  const { data, error } = await supabase
    .from('ptcg_drill_profiles')
    .insert({ user_id: user.id, name: check.name, cards: check.cards, target_ids: check.target_ids })
    .select('id, user_id, name, cards, target_ids, created_at, updated_at')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ profile: data }, { status: 201 });
}
