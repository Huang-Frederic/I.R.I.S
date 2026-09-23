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
  'id' | 'me' | 'opponent' | 'raw_log' | 'state' | 'my_archetype_dex' | 'opponent_archetype_dex' | 'result'
>;

const asDexArray = (v: unknown): number[] | undefined =>
  Array.isArray(v) && v.every((n) => typeof n === 'number') ? v : undefined;

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  // getSession() reads the already-verified session from cookies with no
  // network round trip, unlike getUser() (a real request to Supabase Auth
  // every time). Safe here specifically because proxy.ts's middleware has
  // already called the network-verified getUser() for every /api/ request
  // and 401s before this handler ever runs — re-verifying the same token a
  // second time on the hot path this row's expand-click hits was adding a
  // full extra round trip for zero additional security.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return unauthorizedResponse();
  const user = session.user;

  const { data: game, error } = await supabase
    .from('ptcg_games')
    .select('id, me, opponent, raw_log, state, my_archetype_dex, opponent_archetype_dex, result')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle<GameFields>();
  if (error) return serverErrorResponse(error.message);
  if (!game) return notFoundResponse('ptcg_game');

  const myArchetypeDex = resolveArchetypeDex(game.state.snapshots, game.me, game.my_archetype_dex);
  const opponentArchetypeDex = resolveArchetypeDex(
    game.state.snapshots,
    game.opponent,
    game.opponent_archetype_dex,
  );

  return NextResponse.json({
    game: {
      ...game,
      // The turn-log viewer only ever reads `line`/`turnNumber` per snapshot —
      // each snapshot's own `event`/`state` is a full per-turn board
      // reconstruction and the actual bulk of a game's ~1MB payload. Trimming
      // it here (never in the DB read above, which resolveArchetypeDex still
      // needs in full) is what makes expanding a row feel instant instead of
      // downloading the whole game every time.
      state: {
        turns: game.state.turns,
        snapshots: game.state.snapshots.map((s) => ({ line: s.line, turnNumber: s.turnNumber })),
      },
    },
    myArchetypeDex,
    opponentArchetypeDex,
  });
}

/** Corrects a game's archetype after the fact — never touches raw_log/state,
 *  which are immutable once imported. */
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  // See the comment on GET above — same reasoning applies here.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return unauthorizedResponse();
  const user = session.user;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return validationResponse('Body is not valid JSON.');
  }

  const asBody = body as { myArchetypeDex?: unknown; opponentArchetypeDex?: unknown; result?: unknown };
  const myArchetypeDex = asDexArray(asBody.myArchetypeDex);
  const opponentArchetypeDex = asDexArray(asBody.opponentArchetypeDex);
  const result =
    asBody.result === 'win' || asBody.result === 'loss' || asBody.result === 'tie' ? asBody.result : undefined;
  if (myArchetypeDex === undefined && opponentArchetypeDex === undefined && result === undefined) {
    return validationResponse(
      'Provide myArchetypeDex, opponentArchetypeDex, and/or result.',
    );
  }

  const update: Record<string, number[] | string> = {};
  if (myArchetypeDex !== undefined) update.my_archetype_dex = myArchetypeDex;
  if (opponentArchetypeDex !== undefined) update.opponent_archetype_dex = opponentArchetypeDex;
  if (result !== undefined) update.result = result;

  const { data, error } = await supabase
    .from('ptcg_games')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, my_archetype_dex, opponent_archetype_dex, result')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ game: data });
}
