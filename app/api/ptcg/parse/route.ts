/**
 * Turns a raw battle log into a digest, entirely in code.
 *
 * This is the half of the coaching loop that needs no model: tokenising,
 * reconstructing the board turn by turn, checking the reconstruction against
 * the log's own damage figures, and resolving card text from TCGdex. It is the
 * same pipeline `npm run ptcg-digest` runs — hosting it here is what lets a
 * game be prepared from any machine, with no checkout and no Claude Code.
 *
 * It costs nothing per call beyond TCGdex lookups for cards never seen before,
 * and those are written back to ptcg_cards so the next game skips them.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseGame } from '@/lib/ptcg';
import { collectCardRefs, resolveCards } from '@/lib/ptcg/cards';
import { buildDigest } from '@/lib/ptcg/digest';
import { apiError, unauthorizedResponse } from '@/lib/utils/api-response';
import type { PtcgCardRow } from '@/lib/types';

export const runtime = 'nodejs';
/** Resolving a deck's worth of unseen cards is dozens of sequential fetches. */
export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  let body: { raw?: unknown; playedAt?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError('validation', { message: 'Body is not valid JSON.' });
  }

  const raw = typeof body.raw === 'string' ? body.raw : '';
  if (!raw.trim()) {
    return apiError('ptcg_empty_log', { message: 'Paste the exported battle log first.' });
  }

  let parsed;
  try {
    parsed = parseGame(raw);
  } catch (e) {
    // A paste that is not a battle log at all lands here rather than as a 500.
    return apiError('ptcg_unparsable_log', {
      message: 'That does not look like a PTCG Live battle log.',
      details: { underlying: e instanceof Error ? e.message : String(e) },
    });
  }

  // The gate. A digest built on a state that fails the damage oracle would
  // produce a confident, wrong analysis — worse than no analysis at all.
  const failed = parsed.validation.checks.filter((c) => c.ok === false);
  if (failed.length) {
    return apiError('ptcg_validation_failed', {
      status: 422,
      message: 'The reconstruction disagrees with the log. No digest was produced.',
      details: {
        checks: failed.map((f) => ({
          kind: f.kind,
          detail: f.detail,
          expected: f.expected,
          got: f.got,
        })),
        unknown: parsed.unknown,
      },
    });
  }

  // ptcg_cards is the shared cache the disk cache used to be. Only genuinely
  // new cards reach the network.
  const refs = collectCardRefs(parsed.state);
  const ids = [...new Set(refs.map((r) => r.id))];
  const { data: rows } = await supabase.from('ptcg_cards').select('*').in('ptcgl_id', ids);
  const known = Object.fromEntries(
    ((rows ?? []) as PtcgCardRow[]).map((c) => [c.ptcgl_id, c]),
  ) as Record<string, PtcgCardRow>;

  const { cards, unresolved } = await resolveCards(refs, { known });

  // New cards, plus any cached row whose energy type was just derived from its
  // name — otherwise the repair happens in memory on every single parse.
  const fresh = Object.values(cards).filter(
    (c) => !known[c.ptcgl_id] || known[c.ptcgl_id].types !== c.types,
  );
  if (fresh.length) {
    const { error } = await supabase
      .from('ptcg_cards')
      .upsert(fresh, { onConflict: 'ptcgl_id,language' });
    // A cache write failure must not lose a parse the user already waited for.
    if (error) console.warn('ptcg_cards upsert failed:', error.message);
  }

  const playedAt =
    typeof body.playedAt === 'string' && !Number.isNaN(Date.parse(body.playedAt))
      ? new Date(body.playedAt).toISOString()
      : new Date().toISOString();

  const digest = buildDigest(parsed, cards, { gameId: parsed.logHash.slice(0, 12), playedAt });

  return NextResponse.json({
    digest,
    summary: {
      me: parsed.me,
      opponent: parsed.opponent,
      result: parsed.result,
      prizesMe: parsed.prizesMe,
      prizesOpponent: parsed.prizesOpponent,
      turns: parsed.turns,
      logHash: parsed.logHash,
      checksPassed: parsed.validation.checks.filter((c) => c.ok === true).length,
    },
    // Surfaced rather than swallowed: every unrecognised line is a piece of the
    // game missing from the reconstruction, and the tokeniser needs the report.
    unknown: parsed.unknown,
    unresolved,
  });
}
