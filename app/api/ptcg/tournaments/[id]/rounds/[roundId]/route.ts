import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { validateRoundBody } from '../route';

type RouteContext = { params: Promise<{ id: string; roundId: string }> };

export async function PATCH(request: Request, { params }: RouteContext) {
  const { roundId } = await params;
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

  const { data, error } = await supabase
    .from('ptcg_tournament_rounds')
    .update({
      opponent_archetype_dex: check.opponentArchetypeDex,
      games: check.games,
      outcome: check.outcome,
    })
    .eq('id', roundId)
    .select('id, tournament_id, round_number, opponent_archetype_dex, games, outcome, created_at')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ round: data });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { roundId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const { error } = await supabase.from('ptcg_tournament_rounds').delete().eq('id', roundId);
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ ok: true });
}
