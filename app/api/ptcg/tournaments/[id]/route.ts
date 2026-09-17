import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { serverErrorResponse, unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';
import { validateTournamentBody } from '../route';

type RouteContext = { params: Promise<{ id: string }> };

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

  const check = validateTournamentBody(body);
  if (!check.ok) return validationResponse(check.message);

  const { data, error } = await supabase
    .from('ptcg_tournaments')
    .update({
      name: check.name,
      played_at: check.playedAt,
      category: check.category,
      best_of: check.bestOf,
      placement: check.placement,
      my_archetype_dex: check.myArchetypeDex,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, name, played_at, category, best_of, placement, my_archetype_dex, created_at, updated_at')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ tournament: data });
}
