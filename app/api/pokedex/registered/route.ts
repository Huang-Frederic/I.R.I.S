// app/api/pokedex/registered/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('cards')
    .select('pokemon_number')
    .eq('status', 'pokedex');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const numbers = (data ?? []).map((row) => row.pokemon_number).filter((n): n is number => typeof n === 'number');
  return NextResponse.json({ numbers });
}
