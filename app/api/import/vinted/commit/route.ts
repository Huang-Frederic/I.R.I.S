import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { mapVintedToCardInsert } from '@/lib/utils/map-vinted-to-card';
import type { ImportFailure, ToImport } from '@/lib/types/vinted-import';

export const runtime = 'nodejs';

const PHOTO_TIMEOUT_MS = 10_000;

// Defense-in-depth: reject photos from any host that's not the Vinted CDN.
// Mitigates SSRF if a malicious Vinted listing somehow returns an internal URL.
const ALLOWED_PHOTO_HOSTS = new Set([
  'images.vinted.net',
  'photos.vinted.net',
  'images1.vinted.net',
  'images2.vinted.net',
  'images3.vinted.net',
  'images4.vinted.net',
  'images5.vinted.net',
]);

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
        console.warn('[import-vinted/commit] malformed photo URL', photo.full_size_url);
        continue;
      }
      if (!ALLOWED_PHOTO_HOSTS.has(parsedUrl.hostname)) {
        console.warn('[import-vinted/commit] blocked untrusted photo host', parsedUrl.hostname);
        continue;
      }
      const res = await fetch(photo.full_size_url, {
        signal: AbortSignal.timeout(PHOTO_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const buffer = Buffer.from(await res.arrayBuffer());
      const path = `vinted-import-${vintedItemId}-${photo.id}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('card-photos')
        .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
      if (uploadError) {
        console.warn('[import-vinted/commit] storage upload failed', uploadError);
        return 'upload_failed';
      }
      return supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl;
    } catch (e) {
      console.warn('[import-vinted/commit] photo fetch error', e);
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

  for (const item of body.items) {
    const vintedItemId = item.vintedItem.id;
    try {
      // 1. Photo: string URL = success, null = all 404, 'upload_failed' = bucket error
      const uploadResult = await downloadAndUpload(item.vintedItem.photos, supabase, vintedItemId);
      if (uploadResult === 'upload_failed') {
        failed.push({ vintedItemId, reason: 'storage_upload_failed' });
        continue;
      }
      const imageUrl = uploadResult; // string | null

      // 2. INSERT card
      const cardRow = mapVintedToCardInsert(item.vintedItem, item.parsed, item.enriched, imageUrl ?? '');
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
