/**
 * Imports one game (see lib/ptcg/bundle.ts).
 *
 * Accepts either a complete .bundle.json — what the CLI produces and what the
 * dropzone has always taken — or `{ raw, analysis }`, which it assembles first.
 * The second form exists because a conversation can return an analysis but not
 * a bundle: assembling one needs the reconstruction, which lives here.
 *
 * Either way the same gate runs, and a game is accepted whole or rejected
 * whole. Only the assembling path parses a log or reaches TCGdex.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildBundle, validateBundle } from '@/lib/ptcg/bundle';
import { parseGame } from '@/lib/ptcg';
import { collectCardRefs, resolveCards } from '@/lib/ptcg/cards';
import { keyPokemon } from '@/lib/ptcg/protagonists';
import { playScore } from '@/lib/ptcg/score';
import {
  apiError,
  serverErrorResponse,
  unauthorizedResponse,
  validationResponse,
} from '@/lib/utils/api-response';
import type { PtcgBundle, PtcgCardRow } from '@/lib/types';

export const runtime = 'nodejs';
/** Assembling from a raw log re-resolves any card not already in ptcg_cards. */
export const maxDuration = 60;

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

  // Two ways in. A complete .bundle.json is the file the CLI produces and the
  // dropzone has always accepted. `{ raw, analysis }` is the browser path: the
  // analysis comes back from a conversation as plain JSON, and the bundle can
  // only be assembled where the reconstruction lives — which is here.
  const asPair = body as { raw?: unknown; analysis?: unknown; playedAt?: unknown };
  if (typeof asPair?.raw === 'string' && asPair.analysis && typeof asPair.analysis === 'object') {
    try {
      const parsed = parseGame(asPair.raw);
      const refs = collectCardRefs(parsed.state);
      const ids = [...new Set(refs.map((r) => r.id))];
      const { data: rows } = await supabase.from('ptcg_cards').select('*').in('ptcgl_id', ids);
      const known = Object.fromEntries(
        ((rows ?? []) as PtcgCardRow[]).map((c) => [c.ptcgl_id, c]),
      ) as Record<string, PtcgCardRow>;
      const { cards } = await resolveCards(refs, { known });

      const playedAt =
        typeof asPair.playedAt === 'string' && !Number.isNaN(Date.parse(asPair.playedAt))
          ? new Date(asPair.playedAt).toISOString()
          : undefined;

      body = buildBundle(asPair.raw, parsed, cards, asPair.analysis as PtcgBundle['analysis'], {
        playedAt,
      });
    } catch (e) {
      return apiError('ptcg_unparsable_log', {
        message: 'The log could not be re-parsed to assemble the bundle.',
        details: { underlying: e instanceof Error ? e.message : String(e) },
      });
    }
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
