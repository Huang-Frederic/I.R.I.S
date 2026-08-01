/**
 * Imports one game (see lib/ptcg/bundle.ts).
 *
 * Three shapes in, one gate, one storage path:
 *  - `{ raw }` — a battle log pasted as-is. The game is stored and displays
 *    without annotations. This path must not be blockable by parser quality:
 *    the reconstruction is best-effort and the raw log is the source of truth.
 *  - `{ raw, analysis }` — the self-contained JSON a coaching conversation
 *    returns. Same assembly, plus the analysis row.
 *  - a complete `.bundle.json` — the legacy CLI format, passed straight through.
 *
 * Re-importing a log that already exists attaches the new analysis to the
 * existing game (the coach having improved is not a mistake to refuse).
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

  const asPair = body as { raw?: unknown; analysis?: unknown; playedAt?: unknown };
  const hasAnalysis = !!asPair?.analysis && typeof asPair.analysis === 'object';
  if (typeof asPair?.raw === 'string') {
    if (!asPair.raw.trim()) {
      return apiError('ptcg_empty_log', { message: 'Paste the exported battle log first.' });
    }
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

      body = buildBundle(
        asPair.raw,
        parsed,
        cards,
        hasAnalysis ? (asPair.analysis as PtcgBundle['analysis']) : null,
        { playedAt },
      );
    } catch (e) {
      // A paste that is not a battle log at all lands here rather than as a 500.
      return apiError('ptcg_unparsable_log', {
        message: 'That does not look like a PTCG Live battle log.',
        details: { underlying: e instanceof Error ? e.message : String(e) },
      });
    }
  }

  // The gate. Identity (hash) and anchors are checked; parser quality is a
  // warning, never a refusal — see lib/ptcg/bundle.ts.
  const isRawOnly = typeof asPair?.raw === 'string' && !hasAnalysis;
  const check = validateBundle(body, { requireAnalysis: !isRawOnly });
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
  const score = bundle.analysis ? playScore(bundle.analysis.moments ?? [], myTurns) : null;

  const derived = {
    my_key_card: mine?.cardId ?? null,
    opponent_key_card: theirs?.cardId ?? null,
    my_archetype: bundle.game.my_archetype ?? mine?.name ?? null,
    opponent_archetype: bundle.game.opponent_archetype ?? theirs?.name ?? null,
  };

  const { data: game, error: gameError } = await supabase
    .from('ptcg_games')
    .insert({
      ...bundle.game,
      user_id: user.id,
      ...derived,
      play_score: score?.score ?? null,
    })
    .select('id, played_at, me, opponent, result, prizes_me, prizes_opponent, turns')
    .single();

  // Unique (user_id, log_hash). A second upload of the same log is not a
  // mistake to refuse — it is either the analysis arriving after a raw-only
  // import, or the coach having improved. Re-importing refreshes the derived
  // columns; a raw-only re-import must NOT erase a score an earlier analysis
  // computed.
  const duplicate = gameError?.code === '23505';
  if (gameError && !duplicate) return serverErrorResponse(gameError.message);

  let target = game;
  if (duplicate) {
    const { data: existing, error } = await supabase
      .from('ptcg_games')
      .update({
        ...derived,
        ...(score ? { play_score: score.score } : {}),
      })
      .eq('user_id', user.id)
      .eq('log_hash', bundle.game.log_hash)
      .select('id, played_at, me, opponent, result, prizes_me, prizes_opponent, turns')
      .single();
    if (error || !existing) return serverErrorResponse(error?.message ?? 'game not found');
    target = existing;
  }
  if (!target) return serverErrorResponse('insert returned no row');

  if (bundle.analysis) {
    const { error: analysisError } = await supabase
      .from('ptcg_analyses')
      .insert({ ...bundle.analysis, game_id: target.id });

    if (analysisError) {
      // Leaving a game without the analysis it was uploaded with would look
      // like a silent success. Roll back so the file can simply be retried —
      // but only the game this request created, never one that already existed.
      if (!duplicate) await supabase.from('ptcg_games').delete().eq('id', target.id);
      return serverErrorResponse(analysisError.message);
    }
  }

  return NextResponse.json(
    { game: target, reanalysed: duplicate, warnings: check.warnings },
    { status: duplicate ? 200 : 201 },
  );
}
