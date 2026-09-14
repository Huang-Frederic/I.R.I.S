import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseDecklist } from '@/lib/ptcg/decklist';
import { resolveDecklistCards } from '@/lib/ptcg/drill-resolve';
import { unauthorizedResponse, validationResponse } from '@/lib/utils/api-response';

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

  const text = (body as { text?: unknown })?.text;
  if (typeof text !== 'string' || !text.trim()) {
    return validationResponse('Paste a decklist first.');
  }

  const lines = parseDecklist(text);
  if (lines.length === 0) {
    return validationResponse('No card lines were recognised in that decklist.');
  }

  const { cards, unresolved } = await resolveDecklistCards(supabase, lines);
  return NextResponse.json({ cards, unresolved });
}
