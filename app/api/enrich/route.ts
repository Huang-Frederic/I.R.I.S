import { NextResponse } from 'next/server';
import { searchBySetNumber } from '@/lib/api/tcgapi';
import { parseSetNumber } from '@/lib/utils/parse-set-number';

export const runtime = 'nodejs';

interface EnrichBody {
  text?: string;
}

export async function POST(request: Request) {
  let body: EnrichBody;
  try {
    body = (await request.json()) as EnrichBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ error: 'Missing "text"' }, { status: 400 });
  }

  const parsed = parseSetNumber(text);
  if (!parsed) {
    return NextResponse.json({ bestMatch: null, candidates: [] });
  }

  try {
    const result = await searchBySetNumber({ cardNumber: parsed.card, setSize: parsed.total });
    return NextResponse.json(result);
  } catch (error) {
    console.error('Enrich failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Enrich failed' },
      { status: 502 },
    );
  }
}
