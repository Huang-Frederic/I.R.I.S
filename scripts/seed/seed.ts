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
  vinted_listed_at: string | null;
  date_sold: string | null;
  sold_price: number | null;
}

function pickStatus(idx: number): StatusMeta {
  // Spread cards across statuses to look "lived in":
  // 0..1 = sold (~7%), 2..6 = pokedex (~17%), 7..11 = collection (~17%), rest = for_sale
  if (idx < 2) {
    return {
      status: 'sold',
      vinted_listed_at: null,
      date_sold: daysAgo(Math.floor(Math.random() * 14) + 1),
      sold_price: Math.floor(Math.random() * 30) + 5,
    };
  }
  if (idx < 7) {
    return {
      status: 'pokedex',
      vinted_listed_at: null,
      date_sold: null,
      sold_price: null,
    };
  }
  if (idx < 12) {
    return {
      status: 'collection',
      vinted_listed_at: null,
      date_sold: null,
      sold_price: null,
    };
  }
  // for_sale: ~half are listed
  const isListed = Math.random() < 0.5;
  return {
    status: 'for_sale',
    vinted_listed_at: isListed ? daysAgo(Math.floor(Math.random() * 14)) : null,
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
    const cardIdTcg = tcg?.id ?? null;
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
      vinted_listed_at: meta.vinted_listed_at,
      date_sold: meta.date_sold,
      sold_price: meta.sold_price,
      suggested_price: meta.status === 'sold' ? null : Math.floor(Math.random() * 45) + 5,
      notes: null,
    };

    rows.push(row);
    console.log(`${meta.status} (${rarity}${variant ? ` ${variant}` : ''})`);
  }

  // 4. Bulk insert
  console.log(`\n💾 Inserting ${rows.length} rows...`);
  const { error: insertErr } = await supabase.from('cards').insert(rows);
  if (insertErr) {
    console.error('Insert failed:', insertErr.message);
    process.exit(1);
  }

  // 5. Summary
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
