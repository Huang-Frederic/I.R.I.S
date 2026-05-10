// Cardmarket image proxy.
//
// Cardmarket's S3/CloudFront flags requests with non-browser Referer + may
// rate-limit Vercel/Next image-optimizer IPs (we've seen 403 from CloudFront).
// This route fetches the image with a browser-like Referer, then streams it
// back. Long-cached at the edge so a given idProduct is fetched once.
//
// Usage from <Image>: src={`/api/cm-img/${cardmarket_id}?prefix=${set_prefix}`}
//   - prefix is required (cardmarket S3 URLs are /51/{prefix}/{id}/{id}.jpg)
//
// The component-side loader sits in lib/utils/cardmarket-image.ts.

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Cache successful fetches at the route level. Cardmarket card images are
// immutable per id_product — once the right URL works for a card, it always
// will. 7-day TTL = 604800 seconds. NB: Next.js requires a literal here, not
// an expression like `60 * 60 * 24 * 7` (build fails with "Invalid segment
// configuration export").
export const revalidate = 604800;

const S3_BASE = 'https://product-images.s3.cardmarket.com/51';
// Browser-like headers — CloudFront returns 403 to fetch's default UA.
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  Referer: 'https://www.cardmarket.com/',
  Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.8',
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }
  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix');
  if (!prefix || !/^[A-Za-z0-9-]+$/.test(prefix)) {
    return NextResponse.json({ error: 'invalid prefix' }, { status: 400 });
  }

  const upstream = `${S3_BASE}/${prefix}/${id}/${id}.jpg`;
  try {
    const res = await fetch(upstream, {
      headers: BROWSER_HEADERS,
      // 10s is generous for a static image fetch.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[cm-img] ${upstream} → ${res.status}`);
      return new NextResponse(null, { status: res.status });
    }
    const body = await res.arrayBuffer();
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': res.headers.get('Content-Type') ?? 'image/jpeg',
        // Browser cache aggressively too — these never change for a given id.
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (e) {
    console.warn(`[cm-img] fetch failed for ${upstream}:`, e);
    return new NextResponse(null, { status: 502 });
  }
}
