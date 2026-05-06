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

  const { userId, cookie, csrfToken, endpoint } = parsedCurl;
  console.info(
    `[import-vinted] start — userId=${userId} endpoint=/${endpoint}/ cookie.len=${cookie.length} csrfToken=${csrfToken ? 'present' : 'absent'}`,
  );

  const items: VintedItem[] = [];
  let page = 1;
  let totalPages = 1;
  const headers: HeadersInit = {
    Cookie: cookie,
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'fr-FR,fr;q=0.9',
    Referer: `https://www.vinted.fr/member/${userId}`,
  };
  if (csrfToken) (headers as Record<string, string>)['x-csrf-token'] = csrfToken;

  while (page <= totalPages) {
    const url = `https://www.vinted.fr/api/v2/${endpoint}/${userId}/items?per_page=${PER_PAGE}&page=${page}`;
    let retryCount = 0;
    let res: Response;
    console.info(`[import-vinted] → fetch ${url}`);
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    } catch (e) {
      console.error('[import-vinted] fetch threw', e);
      return NextResponse.json({ error: 'fetch_failed', detail: String(e) }, { status: 503 });
    }

    console.info(
      `[import-vinted] ← ${res.status} ${res.statusText} content-type=${res.headers.get('content-type')}`,
    );

    if (res.status === 401) {
      const bodySnippet = await res.text().catch(() => '');
      console.warn('[import-vinted] 401 cookie expired. body snippet:', bodySnippet.slice(0, 300));
      return NextResponse.json({ error: 'cookie_expired', detail: bodySnippet.slice(0, 200) }, { status: 401 });
    }
    if (res.status === 403) {
      const bodySnippet = await res.text().catch(() => '');
      console.warn('[import-vinted] 403 cloudflare/datadome. body snippet:', bodySnippet.slice(0, 300));
      return NextResponse.json(
        { error: 'cloudflare_blocked', detail: bodySnippet.slice(0, 200) },
        { status: 503 },
      );
    }
    while (res.status === 429 && retryCount < MAX_RETRIES_429) {
      const waitMs = 1000 * Math.pow(2, retryCount);
      console.warn(`[import-vinted] 429 rate-limited, retry ${retryCount + 1}/${MAX_RETRIES_429} in ${waitMs}ms`);
      await sleep(waitMs);
      retryCount++;
      res = await fetch(url, { headers, signal: AbortSignal.timeout(PAGE_TIMEOUT_MS) });
    }
    if (res.status === 429) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 503 });
    }
    if (!res.ok) {
      // Don't swallow non-2xx — read the body, log it, surface it back.
      const bodyText = await res.text().catch((e) => `<body read failed: ${String(e)}>`);
      console.error(
        `[import-vinted] !ok status=${res.status} statusText=${res.statusText} url=${url}\nbody:\n${bodyText.slice(0, 1500)}`,
      );
      return NextResponse.json(
        {
          error: 'vinted_error',
          status: res.status,
          statusText: res.statusText,
          url,
          bodySnippet: bodyText.slice(0, 500),
        },
        { status: 503 },
      );
    }

    let data: { items?: VintedItem[]; pagination?: { total_pages?: number } };
    try {
      data = (await res.json()) as { items?: VintedItem[]; pagination?: { total_pages?: number } };
    } catch (e) {
      console.error('[import-vinted] JSON parse failed', e);
      return NextResponse.json(
        { error: 'json_parse_failed', detail: String(e) },
        { status: 503 },
      );
    }
    if (Array.isArray(data.items)) items.push(...data.items);
    totalPages = data.pagination?.total_pages ?? page;
    console.info(`[import-vinted] page ${page}/${totalPages} → ${data.items?.length ?? 0} items`);
    if (page === 1 && data.items?.length) {
      // Debug: dump the keys + key fields of the first item so we can see
      // what wardrobe actually returns. Also log the shape of photos[0] —
      // that's where the timestamp lives.
      const first = data.items[0] as unknown as Record<string, unknown>;
      console.info('[import-vinted] sample item keys:', Object.keys(first).join(', '));
      console.info('[import-vinted] sample item title:', JSON.stringify(first.title));
      const firstPhoto = (first.photos as Array<Record<string, unknown>> | undefined)?.[0];
      if (firstPhoto) {
        console.info('[import-vinted] sample photos[0] keys:', Object.keys(firstPhoto).join(', '));
        console.info(
          '[import-vinted] sample photos[0].high_resolution:',
          JSON.stringify(firstPhoto.high_resolution).slice(0, 200),
        );
      }
      // Distribution of the wardrobe boolean flags so we know how many are
      // closed/hidden/draft/reserved (this is what filters real activity).
      const flagCounts = { is_closed: 0, is_hidden: 0, is_draft: 0, is_reserved: 0 };
      for (const it of data.items as unknown as Array<Record<string, unknown>>) {
        if (it.is_closed) flagCounts.is_closed++;
        if (it.is_hidden) flagCounts.is_hidden++;
        if (it.is_draft) flagCounts.is_draft++;
        if (it.is_reserved) flagCounts.is_reserved++;
      }
      console.info('[import-vinted] wardrobe flag distribution:', flagCounts);
    }
    page++;
  }

  // Normalize each item: synthesize created_at_ts from whichever date field
  // wardrobe actually returns + filter out sold/hidden/draft items.
  const normalized: VintedItem[] = [];
  let droppedClosed = 0;
  let droppedHidden = 0;
  let droppedDraft = 0;
  for (const raw of items) {
    const r = raw as VintedItem & {
      is_closed?: boolean;
      is_hidden?: boolean;
      is_draft?: boolean;
      is_reserved?: boolean;
      created_at?: string | number;
      photos?: Array<{ high_resolution?: { timestamp?: number }; full_size_url?: string }>;
    };

    if (r.is_closed) {
      droppedClosed++;
      continue;
    }
    if (r.is_hidden) {
      droppedHidden++;
      continue;
    }
    if (r.is_draft) {
      droppedDraft++;
      continue;
    }
    // Note: is_reserved kept on purpose — réservé = vente en cours, l'annonce
    // est encore visible sur Vinted donc on l'importe.

    // Date fallback chain.
    let ts: number | undefined = r.created_at_ts;
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
      ts = r.photos?.[0]?.high_resolution?.timestamp;
    }
    if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
      const ca = r.created_at;
      if (typeof ca === 'number' && Number.isFinite(ca) && ca > 0) ts = ca;
      else if (typeof ca === 'string') {
        const parsed = Date.parse(ca);
        if (!Number.isNaN(parsed)) ts = Math.floor(parsed / 1000);
      }
    }
    const finalTs: number =
      typeof ts === 'number' && Number.isFinite(ts) && ts > 0 ? ts : 0;

    normalized.push({ ...r, created_at_ts: finalTs });
  }
  console.info(
    `[import-vinted] normalized: ${normalized.length} active (closed=${droppedClosed} hidden=${droppedHidden} draft=${droppedDraft} dropped)`,
  );

  const filtered = normalized.filter((i) => parseVintedListing({ title: i.title, description: i.description }) !== null);
  console.info(`[import-vinted] filtered ${normalized.length} → ${filtered.length} cards (${normalized.length - filtered.length} non-cards skipped)`);

  return NextResponse.json({ items: filtered, skipped: normalized.length - filtered.length });
}
