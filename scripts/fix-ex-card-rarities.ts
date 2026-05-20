/**
 * Fix rarity tags for XY/BW/SM era cards stored as 'OTHER'.
 *
 * Uses card_name suffix as a heuristic — we can't re-enrich from TCGdex
 * since the original rarity string isn't stored on the row.
 * Defaults EX to 'RR' (standard EX); Full Art EX (SR) must be fixed manually.
 *
 * Run: npx tsx scripts/fix-ex-card-rarities.ts [--dry-run]
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const DRY = process.argv.includes('--dry-run');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const supabase = createClient(url, key);

  const { data, error } = await supabase
    .from('cards')
    .select('id, card_name, rarity')
    .eq('rarity', 'OTHER');

  if (error) throw error;
  if (!data?.length) { console.log('No OTHER-rarity cards found.'); return; }

  console.log(`Found ${data.length} cards with rarity=OTHER. Analysing...`);

  const updates: Array<{ id: string; card_name: string; inferred: string }> = [];

  for (const card of data) {
    const name = (card.card_name as string) ?? '';
    let inferred: string | null = null;

    if (/[\s-]EX\s*$/i.test(name)) {
      inferred = 'RR';
    } else if (/[\s-]GX\s*$/i.test(name)) {
      inferred = 'RR';
    } else if (/BREAK\s*$/i.test(name)) {
      inferred = 'R_HOLO';
    } else if (/\sLEGEND\s*$/i.test(name)) {
      inferred = 'RR';
    } else if (/\sPRIME\s*$/i.test(name)) {
      inferred = 'R_HOLO';
    } else if (/[\s-]VMAX\s*$/i.test(name)) {
      inferred = 'RR';
    } else if (/[\s-]VSTAR\s*$/i.test(name)) {
      inferred = 'RR';
    } else if (/[\s-]V\s*$/i.test(name)) {
      inferred = 'RR';
    }

    if (inferred) {
      updates.push({ id: card.id as string, card_name: name, inferred });
    }
  }

  if (!updates.length) { console.log('No cards matched any suffix pattern.'); return; }

  console.log(`\n${updates.length} cards to update:`);
  for (const u of updates) {
    console.log(`  [${u.id}] "${u.card_name}" OTHER → ${u.inferred}`);
  }

  if (DRY) {
    console.log('\n-- DRY RUN: no changes made --');
    return;
  }

  let patched = 0;
  for (const u of updates) {
    const { error: pErr } = await supabase
      .from('cards')
      .update({ rarity: u.inferred })
      .eq('id', u.id);
    if (pErr) {
      console.error(`Failed to patch ${u.id}:`, pErr.message);
    } else {
      patched++;
    }
  }

  console.log(`\nPatched ${patched}/${updates.length} cards.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
