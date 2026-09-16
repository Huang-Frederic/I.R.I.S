import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveArchetypeDex } from '@/lib/ptcg/archetype-dex';
import {
  notFoundResponse,
  serverErrorResponse,
  unauthorizedResponse,
  validationResponse,
} from '@/lib/utils/api-response';
import type { PtcgGameRow } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };
type GameFields = Pick<
  PtcgGameRow,
  'id' | 'me' | 'opponent' | 'raw_log' | 'state' | 'my_archetype_dex' | 'opponent_archetype_dex'
>;

const asDexArray = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.every((n) => typeof n === 'number') ? v : undefined;

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const { data: game, error } = await supabase
    .from('ptcg_games')
    .select('id, me, opponent, raw_log, state, my_archetype_dex, opponent_archetype_dex')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<GameFields>();
  if (error) return serverErrorResponse(error.message);
  if (!game) return notFoundResponse('ptcg_game');

  return NextResponse.json({
    game,
    myArchetypeDex: resolveArchetypeDex(game.state.snapshots, game.me, game.my_archetype_dex),
    opponentArchetypeDex: resolveArchetypeDex(
      game.state.snapshots,
      game.opponent,
      game.opponent_archetype_dex,
    ),
  });
}

/** Corrects a game's archetype after the fact — never touches raw_log/state,
 *  which are immutable once imported. */
export async function PATCH(request: Request, { params }: RouteContext) {
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

  const asBody = body as { myArchetypeDex?: unknown; opponentArchetypeDex?: unknown };
  const myArchetypeDex = asDexArray(asBody.myArchetypeDex);
  const opponentArchetypeDex = asDexArray(asBody.opponentArchetypeDex);
  if (myArchetypeDex === undefined && opponentArchetypeDex === undefined) {
    return validationResponse(
      'Provide myArchetypeDex and/or opponentArchetypeDex as arrays of numbers.',
    );
  }

  const update: Record<string, number[]> = {};
  if (myArchetypeDex !== undefined) update.my_archetype_dex = myArchetypeDex;
  if (opponentArchetypeDex !== undefined) update.opponent_archetype_dex = opponentArchetypeDex;

  const { data, error } = await supabase
    .from('ptcg_games')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, my_archetype_dex, opponent_archetype_dex')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ game: data });
}
