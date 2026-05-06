import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapVintedToCardInsert } from '@/lib/utils/map-vinted-to-card';
import type { EnrichedCard, EnrichResult } from '@/lib/types';
import type { ImportFailure, ToImport } from '@/lib/types/vinted-import';

export const runtime = 'nodejs';

const PHOTO_TIMEOUT_MS = 8_000;

// Defense-in-depth: reject photos from any host that's NOT a Vinted CDN.
// We accept any subdomain of vinted.net / vinted.fr / vinted.com so we don't
// have to maintain a list of numbered shards (images1, images2, ...).
const ALLOWED_PHOTO_HOST_RE = /(^|\.)vinted\.(net|fr|com|de|es|it|pl|cz|sk|nl|be|lt|lv|ee|at|hu|pt|fi|ro|se|gr|lu)$/i;

const PHOTO_FETCH_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
  Referer: 'https://www.vinted.fr/',
};

async function downloadAndUpload(
  photos: ToImport['vintedItem']['photos'],
  supabase: Awaited<ReturnType<typeof createClient>>,
  vintedItemId: number,
): Promise<string | null | 'upload_failed'> {
  for (const photo of photos) {
    try {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(photo.full_size_url);
      } catch {
        console.warn(`[commit] item=${vintedItemId} malformed photo URL`, photo.full_size_url);
        continue;
      }
      if (!ALLOWED_PHOTO_HOST_RE.test(parsedUrl.hostname)) {
        console.warn(`[commit] item=${vintedItemId} blocked untrusted host`, parsedUrl.hostname);
        continue;
      }
      const t0 = Date.now();
      const res = await fetch(photo.full_size_url, {
        headers: PHOTO_FETCH_HEADERS,
        signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
      });
      if (!res.ok) {
        console.warn(`[commit] item=${vintedItemId} photo ${res.status} ${parsedUrl.hostname} (${Date.now() - t0}ms)`);
        continue;
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      const path = `vinted-import-${vintedItemId}-${photo.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('card-photos')
        .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) {
        console.warn(`[commit] item=${vintedItemId} storage upload failed`, uploadError);
        return 'upload_failed';
      }
      console.info(`[commit] item=${vintedItemId} photo ok (${Date.now() - t0}ms, ${buffer.length} bytes)`);
      return supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
    } catch (e) {
      console.warn(`[commit] item=${vintedItemId} photo fetch error`, e);
    }
  }
  return null;
}

export async function POST(request: Request) {
  let body: { items?: ToImport[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }
  if (!Array.isArray(body.items)) {
    return NextResponse.json({ error: 'items_required' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const created: string[] = [];
  const failed: ImportFailure[] = [];

  // Diagnostic: how many items came in already enriched? Common reason for
  // 100% skip is the user clicking "Importer" before /preview finished its
  // background concurrency-5 enrichment loop.
  const initialEnrichedCount = body.items.filter((i) => i.enriched != null).length;
  console.info(
    `[commit] received ${body.items.length} items, ${initialEnrichedCount} already enriched, ${body.items.length - initialEnrichedCount} need re-enrich`,
  );

  // Internal base URL for re-enrichment fallback.
  const reqUrl = new URL(request.url);
  const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;

  for (const item of body.items) {
    const vintedItemId = item.vintedItem.id;
    try {
      // 0. Re-enrich on the fly if the frontend gave us a null enriched (e.g.
      // user clicked Importer before /preview finished, or /preview timed out
      // for this item). Best-effort: a 6s timeout, falls through to skip if
      // it still fails. Cheap (catalog DB hit, no external API in most cases).
      let enriched: EnrichedCard | null = item.enriched;
      if (enriched == null) {
        try {
          const r = await fetch(`${baseUrl}/api/enrich`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              setCode: item.parsed.setCode,
              localId: item.parsed.setNumber,
              language: item.parsed.language,
            }),
            signal: AbortSignal.timeout(6_000),
          });
          if (r.ok) {
            const er = (await r.json()) as EnrichResult;
            enriched = er.bestMatch ?? null;
            if (enriched) console.info(`[commit] item=${vintedItemId} enriched on-the-fly (pokemon_number=${enriched.pokemon_number})`);
          }
        } catch (e) {
          console.warn(`[commit] item=${vintedItemId} on-the-fly enrich failed`, e);
        }
      }

      // 1. Photo: string URL = success, null = all 404, 'upload_failed' = bucket error
      const uploadResult = await downloadAndUpload(item.vintedItem.photos, supabase, vintedItemId);
      if (uploadResult === 'upload_failed') {
        failed.push({ vintedItemId, reason: 'storage_upload_failed' });
        continue;
      }
      const imageUrl = uploadResult; // string | null

      // 2. Build card row. Helper returns { skipReason } when required fields
      // (pokemon_number 1..1025, enforced by NOT NULL + CHECK) can't be derived.
      const mapped = mapVintedToCardInsert(item.vintedItem, item.parsed, enriched, imageUrl ?? '');
      if ('skipReason' in mapped) {
        console.warn(`[commit] item=${vintedItemId} skip reason=${mapped.skipReason} (parsed=${item.parsed.setCode}-${item.parsed.setNumber}/${item.parsed.language}, enriched=${enriched ? 'yes' : 'no'})`);
        failed.push({
          vintedItemId,
          reason: mapped.skipReason as ImportFailure['reason'],
        });
        continue;
      }
      const cardRow = mapped;
      const { data: card, error: cardErr } = await supabase
        .from('cards')
        .insert(cardRow)
        .select('id')
        .single();
      if (cardErr) {
        if (cardErr.code === '23505') {
          failed.push({ vintedItemId, reason: 'duplicate_for_sale' });
          continue;
        }
        failed.push({ vintedItemId, reason: 'unknown', detail: cardErr.message });
        continue;
      }

      // 3. INSERT card_listings.
      // listed_at = Vinted's created_at_ts when available (preserves stale signal).
      // Fall back to NOW() when the wardrobe API didn't expose a date — better
      // than stamping 1970-01-01 which would mark every card as "stale forever".
      const ts = item.vintedItem.created_at_ts;
      const listedAt =
        typeof ts === 'number' && Number.isFinite(ts) && ts > 0
          ? new Date(ts * 1000).toISOString()
          : new Date().toISOString();
      const { error: listingErr } = await supabase.from('card_listings').insert({
        card_id: card.id,
        user_id: user.id,
        listed_at: listedAt,
      });
      if (listingErr && listingErr.code !== '23505') {
        failed.push({ vintedItemId, reason: 'unknown', detail: listingErr.message });
        continue;
      }
      if (listingErr?.code === '23505') {
        failed.push({ vintedItemId, reason: 'listing_already_exists' });
      }

      // Dual-state semantics (intentional, per design spec):
      // The card IS created with all metadata, but if the photo couldn't be
      // fetched from Vinted's CDN we ALSO push photo_unavailable to failed[]
      // as a warning. The frontend can dedupe by vintedItemId to display
      // "imported with warning" rather than "imported AND failed".
      created.push(card.id);
      if (imageUrl === null) {
        failed.push({ vintedItemId, reason: 'photo_unavailable' });
      }
    } catch (e) {
      failed.push({ vintedItemId, reason: 'unknown', detail: String(e) });
    }
  }

  console.info(`[import-vinted/commit] created ${created.length}, failed ${failed.length}`);
  return NextResponse.json({ created: created.length, failed });
}
