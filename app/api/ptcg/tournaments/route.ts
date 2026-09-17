import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import type { PtcgTournamentCategory, PtcgTournamentPlacement } from '@/lib/types';

const CATEGORIES: PtcgTournamentCategory[] = [
  'online', 'locals', 'challenge', 'cup', 'regionals', 'internationals', 'worlds',
];
const PLACEMENTS: PtcgTournamentPlacement[] = [
  'no_placement', 'dropped', 'winner', 'top_2', 'top_4', 'top_8', 'top_16',
  'top_32', 'top_64', 'top_128', 'top_256', 'top_512', 'top_1024',
];

export function validateTournamentBody(body: unknown) {
  const b = body as {
    name?: unknown;
    playedAt?: unknown;
    category?: unknown;
    bestOf?: unknown;
    placement?: unknown;
    myArchetypeDex?: unknown;
  };
  if (typeof b.name !== 'string' || !b.name.trim()) {
    return { ok: false as const, message: 'A tournament name is required.' };
  }
  if (typeof b.playedAt !== 'string' || Number.isNaN(Date.parse(b.playedAt))) {
    return { ok: false as const, message: 'A valid date is required.' };
  }
  if (typeof b.category !== 'string' || !CATEGORIES.includes(b.category as PtcgTournamentCategory)) {
    return { ok: false as const, message: 'A valid category is required.' };
  }
  if (b.bestOf !== 1 && b.bestOf !== 3) {
    return { ok: false as const, message: 'bestOf must be 1 or 3.' };
  }
  const placement =
    typeof b.placement === 'string' && PLACEMENTS.includes(b.placement as PtcgTournamentPlacement)
      ? (b.placement as PtcgTournamentPlacement)
      : 'no_placement';
  const myArchetypeDex =
    Array.isArray(b.myArchetypeDex) && b.myArchetypeDex.every((n) => typeof n === 'number')
      ? (b.myArchetypeDex as number[])
      : [];
  return {
    ok: true as const,
    name: b.name.trim(),
    playedAt: b.playedAt,
    category: b.category as PtcgTournamentCategory,
    bestOf: b.bestOf as 1 | 3,
    placement,
    myArchetypeDex,
  };
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

  const check = validateTournamentBody(body);
  if (!check.ok) return validationResponse(check.message);

  const { data, error } = await supabase
    .from('ptcg_tournaments')
    .insert({
      user_id: user.id,
      name: check.name,
      played_at: check.playedAt,
      category: check.category,
      best_of: check.bestOf,
      placement: check.placement,
      my_archetype_dex: check.myArchetypeDex,
    })
    .select('id, name, played_at, category, best_of, placement, my_archetype_dex, created_at, updated_at')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ tournament: data }, { status: 201 });
}
