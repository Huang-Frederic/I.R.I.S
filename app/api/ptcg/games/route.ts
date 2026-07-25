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

  const { data: game, error: gameError } = await supabase
    .from('ptcg_games')
    .insert({ ...bundle.game, user_id: user.id })
    .select('id, played_at, me, opponent, result, prizes_me, prizes_opponent, turns')
    .single();

  if (gameError) {
    // Unique (user_id, log_hash): the same export cannot be imported twice.
    if (gameError.code === '23505') {
      return apiError('ptcg_already_imported', {
        status: 409,
        message: 'This game has already been imported.',
      });
    }
    return serverErrorResponse(gameError.message);
  }

  const { error: analysisError } = await supabase
    .from('ptcg_analyses')
    .insert({ ...bundle.analysis, game_id: game.id });

  if (analysisError) {
    // Leaving a game without its analysis would look like a silent success and
    // block re-import on the hash. Roll back so the file can simply be retried.
    await supabase.from('ptcg_games').delete().eq('id', game.id);
    return serverErrorResponse(analysisError.message);
  }

  return NextResponse.json({ game, warnings: check.warnings }, { status: 201 });
}
