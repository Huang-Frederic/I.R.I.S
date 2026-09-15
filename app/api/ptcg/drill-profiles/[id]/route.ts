import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveDrillImages } from '@/lib/ptcg/drill-resolve';
import {
  unauthorizedResponse,
  validationResponse,
  notFoundResponse,
  serverErrorResponse,
} from '@/lib/utils/api-response';
import { validateProfileBody } from '../route';
import type { DrillProfileRow } from '@/lib/types';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const { data: profile, error } = await supabase
    .from('ptcg_drill_profiles')
    .select('id, user_id, name, cards, target_ids, pokemon_number, created_at, updated_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) return serverErrorResponse(error.message);
  if (!profile) return notFoundResponse('drill_profile');

  const cardIds = (profile as DrillProfileRow).cards.map((c) => c.id);
  const images = await resolveDrillImages(supabase, cardIds);

  return NextResponse.json({ profile, images });
}

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

  const check = validateProfileBody(body);
  if (!check.ok) return validationResponse(check.message);

  const { data, error } = await supabase
    .from('ptcg_drill_profiles')
    .update({
      name: check.name,
      cards: check.cards,
      target_ids: check.target_ids,
      pokemon_number: check.pokemon_number,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, user_id, name, cards, target_ids, pokemon_number, created_at, updated_at')
    .single();
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ profile: data });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const { error } = await supabase
    .from('ptcg_drill_profiles')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return serverErrorResponse(error.message);

  return NextResponse.json({ ok: true });
}
