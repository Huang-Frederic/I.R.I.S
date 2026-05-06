import { NextResponse } from 'next/server';
import { parseVintedListing } from '@/lib/utils/parse-vinted-listing';
import type { VintedItem } from '@/lib/types/vinted-import';
import type { EnrichResult } from '@/lib/types';

export const runtime = 'nodejs';

const ENRICH_CONCURRENCY = 5;
const ENRICH_TIMEOUT_MS = 12_000;

interface EnrichBody {
  setCode: string;
  localId: string;
  language: string;
}

async function enrichOne(body: EnrichBody, baseUrl: string): Promise<EnrichResult | null> {
  try {
    const res = await fetch(`${baseUrl}/api/enrich`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ENRICH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as EnrichResult;
  } catch (e) {
    console.warn('[import-vinted/preview] enrich failed', e);
    return null;
  }
}

/** Run promises with bounded concurrency. Order of `inputs` preserved in output. */
async function mapWithConcurrency<I, O>(
  inputs: I[],
  limit: number,
  fn: (i: I) => Promise<O>,
): Promise<O[]> {
  const out: O[] = new Array(inputs.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, inputs.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= inputs.length) return;
      out[idx] = await fn(inputs[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(request: Request) {
  let body: { items?: VintedItem[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  const items = body.items;
  if (!Array.isArray(items)) {
    return NextResponse.json({ error: 'items_required' }, { status: 400 });
  }

  const url = new URL(request.url);
  const baseUrl = `${url.protocol}//${url.host}`;

  const enriched = await mapWithConcurrency(items, ENRICH_CONCURRENCY, async (item) => {
    const parsed = parseVintedListing({ title: item.title, description: item.description });
    if (!parsed) return [String(item.id), null] as const;
    const enrichBody: EnrichBody = {
      setCode: parsed.setCode,
      localId: parsed.setNumber,
      language: parsed.language,
    };
    const result = await enrichOne(enrichBody, baseUrl);
    return [String(item.id), result?.bestMatch ?? null] as const;
  });

  const map: Record<string, EnrichResult['bestMatch']> = {};
  for (const [id, val] of enriched) map[id] = val;

  return NextResponse.json({ enriched: map });
}
