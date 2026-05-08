#!/usr/bin/env tsx
/**
 * Seed the I.R.I.S DB with realistic test data based on cards_assets/.
 * Wipes the cards table first, uploads photos to Supabase Storage,
 * fetches metadata from TCGdex, then inserts ~30 cards spread across
 * statuses (for_sale / pokedex / collection / sold) with date_added
 * spread over the last 30 days.
 *
 * Usage:
 *   npx tsx scripts/seed/seed.ts
 *
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

loadEnv({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const CARDS_DIR = join(process.cwd(), 'cards_assets');

// Rarity mapping from filename codes to DB enum values
const RARITY_MAP: Record<string, string> = {
  c: 'C',
  r: 'R',
  rr: 'RR',
  rrr: 'RR',
  sr: 'SR',
  ar: 'AR',
  cr: 'CHR',
  a: 'AR',
  h: 'R_HOLO',
  k: 'OTHER',
  p: 'OTHER',
};

// Variant mapping from filename codes to DB values
const VARIANT_MAP: Record<string, string | null> = {
  mb: 'masterball',
  pb: 'pokeball',
  rh: 'reverse_holo',
  p: 'promo',
};

interface ParsedFilename {
  setCode: string;
  setNumber: string;
  rarityRaw: string | null;
  variantRaw: string | null;
}

function parseFilename(filename: string): ParsedFilename | null {
  const base = basename(filename, '.jpg').toLowerCase();
  const parts = base.split('_');

  // Possible patterns:
  //   set_number          → 2 parts (e.g. "xy_087")
  //   set_number_rarity   → 3 parts (e.g. "bw4_044_r")
  //   set_number_rar_var  → 4 parts (e.g. "sv11w_012_c_mb")
  if (parts.length < 2) return null;

  const setCode = parts[0].toUpperCase();
  const setNumber = String(parseInt(parts[1], 10));
  let rarityRaw: string | null = null;
  let variantRaw: string | null = null;

  if (parts.length === 3) {
    // Check if it's a variant (like "_p" for promo) or a rarity
    if (VARIANT_MAP[parts[2]]) {
      variantRaw = parts[2];
    } else {
      rarityRaw = parts[2];
    }
  } else if (parts.length >= 4) {
    rarityRaw = parts[2];
    variantRaw = parts[3];
  }

  return { setCode, setNumber, rarityRaw, variantRaw };
}

interface TcgdexCard {
  id: string;
  name: string;
  image?: string;
  rarity?: string;
  set?: {
    name?: string;
    cardCount?: { official?: number; total?: number }
  };
  dexId?: number[];
}

async function fetchTcgdex(
  setCode: string,
  setNumber: string,
  language = 'ja'
): Promise<TcgdexCard | null> {
  // TCGdex uses lowercase set codes
  const url = `https://api.tcgdex.net/v2/${language}/sets/${setCode.toLowerCase()}/${setNumber}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as TcgdexCard;
  } catch {
    return null;
  }
}

async function uploadPhoto(filename: string): Promise<string | null> {
  const filePath = join(CARDS_DIR, filename);
  const buffer = readFileSync(filePath);
  const cardId = randomUUID();
  const storagePath = `${cardId}.jpg`;

  const { error } = await supabase.storage
    .from('card-photos')
    .upload(storagePath, buffer, { contentType: 'image/jpeg', upsert: true });

  if (error) {
    console.error(`Upload failed for ${filename}:`, error.message);
    return null;
  }

  const { data } = supabase.storage.from('card-photos').getPublicUrl(storagePath);
  return data.publicUrl;
}

function randomChoice<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(d: number): string {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return date.toISOString();
}

interface StatusMeta {
  status: string;
  /** When non-null, the seeder INSERTs a card_listings row for HISSHIDEN_USER_ID with this timestamp post-insert. Listings are per-user, not per-card. */
  listed_at: string | null;
  date_sold: string | null;
  sold_price: number | null;
}

/** Hisshiden's user_id — owns all seeded listings. */
const HISSHIDEN_USER_ID = '35385d3c-5966-4a10-8568-8d92d1be47e7';

function pickStatus(idx: number): StatusMeta {
  // Spread cards across statuses to look "lived in" + cover all UI states:
  //   0..1   = sold (~7%)                                  [2 cards]
  //   2..6   = pokedex (~17%)                              [5 cards]
  //   7..11  = collection / Stock (~17%)                    [5 cards]
  //   12..14 = for_sale STALE (>21j → "À rafraîchir" UI)    [3 cards]
  //   15..17 = for_sale online recent                       [3 cards]
  //   18+    = for_sale offline                             [~12 cards]
  if (idx < 2) {
    return {
      status: 'sold',
      listed_at: null,
      date_sold: daysAgo(Math.floor(Math.random() * 14) + 1),
      sold_price: Math.floor(Math.random() * 30) + 5,
    };
  }
  if (idx < 7) {
    return {
      status: 'pokedex',
      listed_at: null,
      date_sold: null,
      sold_price: null,
    };
  }
  if (idx < 12) {
    return {
      status: 'collection',
      listed_at: null,
      date_sold: null,
      sold_price: null,
    };
  }
  // 3 stale cards (>21d) — they show as "À rafraîchir"
  if (idx < 15) {
    return {
      status: 'for_sale',
      listed_at: daysAgo(25 + Math.floor(Math.random() * 10)),  // 25-34 days ago
      date_sold: null,
      sold_price: null,
    };
  }
  // 3 fresh online
  if (idx < 18) {
    return {
      status: 'for_sale',
      listed_at: daysAgo(Math.floor(Math.random() * 14)),
      date_sold: null,
      sold_price: null,
    };
  }
  // The rest: for_sale offline (no card_listings row inserted)
  return {
    status: 'for_sale',
    listed_at: null,
    date_sold: null,
    sold_price: null,
  };
}

async function main() {
  console.log('🌱 Seeding I.R.I.S DB...');

  // 1. Wipe
  console.log('🗑️  Wiping cards table...');
  const { error: deleteErr } = await supabase.from('cards').delete().not('id', 'is', null);
  if (deleteErr) {
    console.error('Wipe failed:', deleteErr.message);
    process.exit(1);
  }

  // 2. Discover cards_assets
  const filenames = readdirSync(CARDS_DIR).filter((f) => f.endsWith('.jpg')).sort();
  console.log(`📸 Found ${filenames.length} cards in cards_assets/`);

  // 3. Process each card
  const rows: Record<string, unknown>[] = [];
  /** Per-row listing metadata, attached after the bulk insert returns IDs. */
  const listingMeta: Array<string | null> = [];
  const usedDexIds = new Set<number>();

  for (const [idx, filename] of filenames.entries()) {
    const parsed = parseFilename(filename);
    if (!parsed) {
      console.warn(`⚠️  Skipping ${filename} (could not parse)`);
      continue;
    }

    process.stdout.write(`  [${idx + 1}/${filenames.length}] ${filename} → `);

    const tcg = await fetchTcgdex(parsed.setCode, parsed.setNumber);
    const photoUrl = await uploadPhoto(filename);

    // Get a unique dexId for pokedex entries
    let dexId = tcg?.dexId?.[0] ?? Math.floor(Math.random() * 1025) + 1;
    const meta = pickStatus(idx);

    // For pokedex status, ensure unique pokemon_number
    if (meta.status === 'pokedex') {
      while (usedDexIds.has(dexId)) {
        dexId = Math.floor(Math.random() * 1025) + 1;
      }
      usedDexIds.add(dexId);
    }

    const cardName = tcg?.name ?? `${parsed.setCode}-${parsed.setNumber}`;
    const tcgImageUrl = tcg?.image ? `${tcg.image}/high.jpg` : null;
    // When TCGdex doesn't return an ID, generate a unique one so the partial
    // unique index `one_for_sale_per_group` doesn't reject bulk insert.
    const cardIdTcg = tcg?.id ?? `seed-${parsed.setCode.toLowerCase()}-${parsed.setNumber}`;
    const setName = tcg?.set?.name ?? parsed.setCode;
    const setTotal = tcg?.set?.cardCount?.official ?? null;
    const rarity = parsed.rarityRaw ? (RARITY_MAP[parsed.rarityRaw] ?? 'OTHER') : 'OTHER';
    const variant = parsed.variantRaw ? (VARIANT_MAP[parsed.variantRaw] ?? null) : null;
    const condition = randomChoice(['NM', 'NM', 'NM', 'NM', 'EX', 'GD']);
    const dateAdded = daysAgo(Math.floor(Math.random() * 30));

    const row = {
      pokemon_name: cardName.split(' ')[0], // best-effort heuristic — first word of card name
      pokemon_number: dexId,
      card_name: cardName,
      card_id_tcg: cardIdTcg,
      set_name: setName,
      set_code: parsed.setCode,
      set_number: setTotal ? `${parsed.setNumber}/${setTotal}` : parsed.setNumber,
      language: 'JP',
      rarity,
      condition,
      status: meta.status,
      image_url: photoUrl,
      tcg_image_url: tcgImageUrl,
      variant,
      date_added: dateAdded,
      date_sold: meta.date_sold,
      sold_price: meta.sold_price,
      sold_by_user_id: meta.status === 'sold' ? HISSHIDEN_USER_ID : null,
      suggested_price: meta.status === 'sold' ? null : Math.floor(Math.random() * 45) + 5,
      notes: null,
    };

    rows.push(row);
    listingMeta.push(meta.listed_at);
    console.log(`${meta.status} (${rarity}${variant ? ` ${variant}` : ''})`);
  }

  // 4. Bulk insert cards
  console.log(`\n💾 Inserting ${rows.length} rows...`);
  const { data: inserted, error: insertErr } = await supabase
    .from('cards')
    .insert(rows)
    .select('id');
  if (insertErr) {
    console.error('❌ Insert failed:', insertErr.message);
    console.error('Hint: si "duplicate key value violates unique constraint", c\'est probablement la contrainte one_for_sale_per_group. Vérifie que les card_id_tcg sont bien uniques.');
    process.exit(1);
  }
  console.log(`✅ Inserted ${inserted?.length ?? 0} rows.`);

  // 5. Insert per-user listings — Hisshiden owns all seeded listings.
  const listingRows = (inserted ?? [])
    .map((card, i) => {
      const listedAt = listingMeta[i];
      if (!listedAt) return null;
      return { card_id: card.id, user_id: HISSHIDEN_USER_ID, listed_at: listedAt };
    })
    .filter((r): r is { card_id: string; user_id: string; listed_at: string } => r !== null);

  if (listingRows.length > 0) {
    console.log(`\n📌 Inserting ${listingRows.length} card_listings rows...`);
    const { error: listErr } = await supabase.from('card_listings').insert(listingRows);
    if (listErr) {
      console.error('❌ card_listings insert failed:', listErr.message);
      process.exit(1);
    }
    console.log(`✅ Inserted ${listingRows.length} listings.`);
  }

  // 6. Summary
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.status as string] = (counts[r.status as string] ?? 0) + 1;
  }
  console.log('\n✅ Seed complete:');
  for (const [status, n] of Object.entries(counts)) {
    console.log(`   ${status}: ${n}`);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
