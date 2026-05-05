import { NextResponse } from 'next/server';
import { parseVintedCurl } from '@/lib/utils/parse-vinted-curl';
import { parseVintedListing } from '@/lib/utils/parse-vinted-listing';
import type { VintedItem } from '@/lib/types/vinted-import';

export const runtime = 'nodejs';

const PER_PAGE = 200;
const PAGE_TIMEOUT_MS = 30_000;
const MAX_RETRIES_429 = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function POST(request: Request) {
  let body: { curl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (typeof body.curl !== 'string' || body.curl.length === 0) {
    return NextResponse.json({ error: 'invalid_curl' }, { status: 400 });
  }

  const parsedCurl = parseVintedCurl(body.curl);
  if (!parsedCurl) {
    return NextResponse.json({ error: 'invalid_curl' }, { status: 400 });
  }

  const { userId, cookie, csrfToken } = parsedCurl;
  const items: VintedItem[] = [];
  let page = 1;
  let totalPages = 1;
  const headers: HeadersInit = {
    Cookie: cookie,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  };
  if (csrfToken) (headers as Record<string, string>)['x-csrf-token'] = csrfToken;

  while (page <= totalPages) {
    const url = `https://www.vinted.fr/api/v2/users/${userId}/items?per_page=${PER_PAGE}&page=${page}`;
    let retryCount = 0;
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    } catch (e) {
      console.error('[import-vinted] fetch threw', e);
      return NextResponse.json({ error: 'fetch_failed', detail: String(e) }, { status: 503 });
    }

    if (res.status === 401) {
      return NextResponse.json({ error: 'cookie_expired' }, { status: 401 });
    }
    if (res.status === 403) {
      return NextResponse.json({ error: 'cloudflare_blocked' }, { status: 503 });
    }
    while (res.status === 429 && retryCount < MAX_RETRIES_429) {
      const waitMs = 1000 * Math.pow(2, retryCount);
      await sleep(waitMs);
      retryCount++;
      res = await fetch(url, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    }
    if (res.status === 429) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 503 });
    }
    if (!res.ok) {
      return NextResponse.json(
        { error: 'vinted_error', status: res.status },
        { status: 503 },
      );
    }

    const data = (await res.json()) as { items?: VintedItem[]; pagination?: { total_pages?: number } };
    if (Array.isArray(data.items)) items.push(...data.items);
    totalPages = data.pagination?.total_pages ?? page;
    console.info(`[import-vinted] page ${page}/${totalPages} → ${data.items?.length ?? 0} items`);
    page++;
  }

  const filtered = items.filter((i) => parseVintedListing({ title: i.title, description: i.description }) !== null);
  console.info(`[import-vinted] filtered ${items.length} → ${filtered.length} cards (${items.length - filtered.length} skipped)`);

  return NextResponse.json({ items: filtered, skipped: items.length - filtered.length });
}
