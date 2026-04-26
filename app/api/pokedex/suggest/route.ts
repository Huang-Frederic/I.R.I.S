import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computePokedexSuggestion } from '@/lib/utils/pokedex-suggestion';
import type { Card, CardLanguage, CardRarity } from '@/lib/types';

export const runtime = 'nodejs';

interface SuggestBody {
  pokemon_number?: number;
  pokemon_name?: string;
  rarity?: CardRarity;
  language?: CardLanguage;
}

export async function POST(request: Request) {
  let body: SuggestBody;
  try {
    body = (await request.json()) as SuggestBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const pokemon_number = Number(body.pokemon_number);
  const rarity = body.rarity ?? 'OTHER';

  // Resolve rarity_rank from the lookup table — same source the DB trigger uses,
  // so the suggestion is consistent with what the row will get on insert.
  const { data: rankData } = await supabase
    .from('rarity_ranks')
    .select('rank')
    .eq('rarity', rarity)
    .maybeSingle();
  const rarity_rank = rankData?.rank ?? 0;

  let existing: Card | null = null;
  if (Number.isFinite(pokemon_number) && pokemon_number >= 1 && pokemon_number <= 1025) {
    const { data } = await supabase
      .from('cards')
      .select('*')
      .eq('pokemon_number', pokemon_number)
      .eq('status', 'pokedex')
      .maybeSingle();
    existing = data;
  }

  const suggestion = computePokedexSuggestion(
    {
      pokemon_number: Number.isFinite(pokemon_number) ? pokemon_number : null,
      pokemon_name: body.pokemon_name,
      rarity,
      rarity_rank,
      language: body.language,
    },
    existing,
  );

  return NextResponse.json(suggestion);
}
