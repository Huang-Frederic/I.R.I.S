import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseGame } from '@/lib/ptcg';
import { resolveArchetypeDex } from '@/lib/ptcg/archetype-dex';
import { apiError, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

/**
 * Previews a pasted battle log's two decks — parses it and derives each
 * side's sprites, but writes nothing. The Battle Logs page's "Add Log"
 * button calls this to pre-fill the Create Log modal; the modal's own
 * "Save" then calls the real `POST /api/ptcg/games` (see lib/ptcg/bundle.ts).
 */
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

  const raw = (body as { raw?: unknown })?.raw;
  if (typeof raw !== 'string' || !raw.trim()) {
    return apiError('ptcg_empty_log', { message: 'Paste the exported battle log first.' });
  }

  let parsed: ReturnType<typeof parseGame>;
  try {
    parsed = parseGame(raw);
  } catch (e) {
    return apiError('ptcg_unparsable_log', {
      message: 'That does not look like a PTCG Live battle log.',
      details: { underlying: e instanceof Error ? e.message : String(e) },
    });
  }

  return NextResponse.json({
    me: parsed.me,
    opponent: parsed.opponent,
    myArchetypeDex: resolveArchetypeDex(parsed.state.snapshots, parsed.me, null),
    opponentArchetypeDex: resolveArchetypeDex(parsed.state.snapshots, parsed.opponent, null),
  });
}
