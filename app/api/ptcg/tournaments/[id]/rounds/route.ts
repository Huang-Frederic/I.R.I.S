import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import type { TournamentGame } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

function isGame(g: unknown): g is TournamentGame {
  if (typeof g !== 'object' || g === null) return false;
  const candidate = g as { result?: unknown; wentFirst?: unknown };
  const validResult = candidate.result === 'win' || candidate.result === 'loss' || candidate.result === 'tie';
  const validWentFirst = typeof candidate.wentFirst === 'boolean' || candidate.wentFirst === null;
  return validResult && validWentFirst;
}

export function validateRoundBody(body: unknown) {
  const b = body as { opponentArchetypeDex?: unknown; games?: unknown; outcome?: unknown };
  const opponentArchetypeDex =
    Array.isArray(b.opponentArchetypeDex) && b.opponentArchetypeDex.every((n) => typeof n === 'number')
      ? (b.opponentArchetypeDex as number[])
      : [];
  const outcome = b.outcome === 'id' || b.outcome === 'no_show' || b.outcome === 'bye' ? b.outcome : null;
  const games = Array.isArray(b.games) ? b.games.filter(isGame) : [];

  if (outcome && games.length > 0) {
    return { ok: false as const, message: 'A round is either played out or a special outcome, never both.' };
  }
  if (!outcome && games.length === 0) {
    return { ok: false as const, message: 'Record at least one game, or pick a special outcome.' };
  }
  return { ok: true as const, opponentArchetypeDex, games: outcome ? [] : games, outcome };
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
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

  const check = validateRoundBody(body);
  if (!check.ok) return validationResponse(check.message);

  const { data: existing, error: countError } = await supabase
    .from('ptcg_tournament_rounds')
    .select('round_number')
    .eq('tournament_id', id)
    .order('round_number', { ascending: false })
    .limit(1);
  if (countError) return serverErrorResponse(countError.message);
  const nextRoundNumber = (existing?.[0]?.round_number ?? 0) + 1;

  const { data, error } = await supabase
    .from('ptcg_tournament_rounds')
    .insert({
      tournament_id: id,
      round_number: nextRoundNumber,
      opponent_archetype_dex: check.opponentArchetypeDex,
      games: check.games,
      outcome: check.outcome,
    })
    .select('id, tournament_id, round_number, opponent_archetype_dex, games, outcome, created_at')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ round: data }, { status: 201 });
}
