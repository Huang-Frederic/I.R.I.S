/**
 * Imports one game bundle (see lib/ptcg/bundle.ts).
 *
 * The bundle is produced outside the app — parser, card resolution and analysis
 * — so this route never parses a log and never calls TCGdex. It validates, then
 * writes. A file is accepted whole or rejected whole.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { validateBundle } from '@/lib/ptcg/bundle';
import { keyPokemon } from '@/lib/ptcg/protagonists';
import { playScore } from '@/lib/ptcg/score';
import {
  apiError,
  serverErrorResponse,
  unauthorizedResponse,
  validationResponse,
} from '@/lib/utils/api-response';
import type { PtcgBundle } from '@/lib/types';

export const runtime = 'nodejs';

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

  // The gate. Anchors are checked against the reconstruction, so a fluent but
  // invented finding cannot be stored — see lib/ptcg/bundle.ts.
  const check = validateBundle(body);
  if (!check.ok) {
    return apiError('ptcg_invalid_bundle', {
      status: 400,
      message: 'The game file did not pass validation.',
      details: { errors: check.errors, warnings: check.warnings },
    });
  }
  const bundle = body as PtcgBundle;

  // Gameplay reference data is shared, so cards are upserted rather than owned.
  if (bundle.cards.length) {
    const { error } = await supabase
      .from('ptcg_cards')
      .upsert(bundle.cards, { onConflict: 'ptcgl_id,language' });
    if (error) return serverErrorResponse(error.message);
  }

  // Derived once here rather than at read time: the history list would
  // otherwise have to load `state` — about a megabyte per game — just to show
  // which Pokémon carried each side.
  const snapshots = bundle.game.state.snapshots;
  const mine = keyPokemon(snapshots, bundle.game.me);
  const theirs = keyPokemon(snapshots, bundle.game.opponent);

  // Only the player's own turns count — the turn list alternates, and scoring
  // the opponent's would halve every penalty.
  const myTurns = bundle.game.state.turns
    .filter((t) => t.player === bundle.game.me)
    .map((t) => t.number);
  const score = playScore(bundle.analysis.moments ?? [], myTurns);

  const { data: game, error: gameError } = await supabase
    .from('ptcg_games')
    .insert({
      ...bundle.game,
      user_id: user.id,
      my_key_card: mine?.cardId ?? null,
      opponent_key_card: theirs?.cardId ?? null,
      play_score: score?.score ?? null,
      // A bundle may carry its own archetype; otherwise name it after the
      // protagonist, since the player's handle says nothing about the matchup.
      my_archetype: bundle.game.my_archetype ?? mine?.name ?? null,
      opponent_archetype: bundle.game.opponent_archetype ?? theirs?.name ?? null,
    })
    .select('id, played_at, me, opponent, result, prizes_me, prizes_opponent, turns')
    .single();

  // Unique (user_id, log_hash). A second bundle for the same log is not a
  // mistake to refuse — it is the coach having improved. Re-importing attaches
  // the new analysis to the existing game and refreshes the derived columns;
  // the previous analysis row is kept, since the read side takes the most
  // recent and history is worth more than the row it costs.
  const duplicate = gameError?.code === '23505';
  if (gameError && !duplicate) return serverErrorResponse(gameError.message);

  let target = game;
  if (duplicate) {
    const { data: existing, error } = await supabase
      .from('ptcg_games')
      .update({
        my_key_card: mine?.cardId ?? null,
        opponent_key_card: theirs?.cardId ?? null,
        play_score: score?.score ?? null,
        my_archetype: bundle.game.my_archetype ?? mine?.name ?? null,
        opponent_archetype: bundle.game.opponent_archetype ?? theirs?.name ?? null,
      })
      .eq('user_id', user.id)
      .eq('log_hash', bundle.game.log_hash)
      .select('id, played_at, me, opponent, result, prizes_me, prizes_opponent, turns')
      .single();
    if (error || !existing) return serverErrorResponse(error?.message ?? 'game not found');
    target = existing;
  }
  if (!target) return serverErrorResponse('insert returned no row');

  const { error: analysisError } = await supabase
    .from('ptcg_analyses')
    .insert({ ...bundle.analysis, game_id: target.id });

  if (analysisError) {
    // Leaving a game without its analysis would look like a silent success and
    // block re-import on the hash. Roll back so the file can simply be retried
    // — but only the game this request created, never one that already existed.
    if (!duplicate) await supabase.from('ptcg_games').delete().eq('id', target.id);
    return serverErrorResponse(analysisError.message);
  }

  return NextResponse.json(
    { game: target, reanalysed: duplicate, warnings: check.warnings },
    { status: duplicate ? 200 : 201 },
  );
}
