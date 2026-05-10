/**
 * One-shot script: backfill cardmarket_id + canonical names + image url on
 * existing user cards by querying cardmarket_card_index directly.
 *
 * Logic per card:
 *   1. Resolve set_name (any locale) → id_expansion via cardmarket_expansions
 *      OR-match on (name, name_en, name_ja).
 *   2. Lookup (id_expansion, set_number) in cardmarket_card_index → id_product.
 *   3. Fetch the canonical product display name from cardmarket_products.
 *   4. Update the card with cardmarket_id, card_name, set_name (EN), tcg_image_url.
 *
 * Idempotent — safe to re-run. Only touches cards where cardmarket_id IS NULL.
 *
 * Usage: npm run reenrich-cards
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CM_IMG_BASE = 'https://product-images.s3.cardmarket.com/51';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required in .env.local');
}

interface UserCard {
  id: string;
  set_name: string | null;
  set_number: string | null;
  language: string | null;
  card_name: string | null;
}

interface LookupResult {
  cardmarket_id: string;
  card_name: string;
  set_name: string;
  tcg_image_url: string;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalize(s: string | null | undefined): string {
  if (!s) return '';
  return decodeHtmlEntities(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build candidate normalized forms for matching:
 *  1. Full normalized name
 *  2. Name with parenthesized suffix stripped, e.g. "Twilight Masquerade (変幻の仮面)" → "Twilight Masquerade"
 *  3. Just the parenthesized content, e.g. for cases where the EN part is wrong but the JA is right
 */
function nameVariants(s: string): string[] {
  const decoded = decodeHtmlEntities(s);
  const variants = new Set<string>();
  variants.add(normalize(decoded));
  // Strip "(...)"
  const noParens = decoded.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (noParens) variants.add(normalize(noParens));
  // Just the "(...)" content
  const insideParens = decoded.match(/\(([^)]+)\)\s*$/);
  if (insideParens) variants.add(normalize(insideParens[1]));
  return Array.from(variants).filter(Boolean);
}

interface ExpansionRow {
  id_expansion: number;
  name: string | null;
  name_en: string | null;
  name_ja: string | null;
}

let expansionsCache: ExpansionRow[] | null = null;

async function loadExpansions(supabase: SupabaseClient): Promise<ExpansionRow[]> {
  if (expansionsCache) return expansionsCache;
  const { data } = await supabase
    .from('cardmarket_expansions')
    .select('id_expansion, name, name_en, name_ja');
  expansionsCache = (data ?? []) as ExpansionRow[];
  return expansionsCache;
}

async function lookupCardmarket(
  supabase: SupabaseClient,
  setName: string,
  setNumber: string,
): Promise<LookupResult | null> {
  // Step 1: resolve expansion via in-memory normalize match against cached list.
  // Try multiple normalized variants of the input name (full, no parens, just parens).
  const all = await loadExpansions(supabase);
  const targets = nameVariants(setName);
  const expansion = all.find((e) =>
    [e.name, e.name_en, e.name_ja].some((n) => {
      const candidate = normalize(n);
      return candidate && targets.includes(candidate);
    }),
  );

  if (!expansion) return null;
  const idExpansion: number = expansion.id_expansion;
  const setNameEn: string | null = expansion.name_en ?? expansion.name ?? null;

  // Step 2: lookup index row.
  const { data: indexRow } = await supabase
    .from('cardmarket_card_index')
    .select('id_product')
    .eq('id_expansion', idExpansion)
    .eq('set_number', setNumber)
    .single();

  if (!indexRow) return null;
  const idProduct: number = indexRow.id_product;

  // Step 3: fetch product name.
  const { data: product } = await supabase
    .from('cardmarket_products')
    .select('id_product, name')
    .eq('id_product', idProduct)
    .single();

  return {
    cardmarket_id: String(idProduct),
    card_name: product?.name ?? '',
    set_name: setNameEn ?? '',
    tcg_image_url: `${CM_IMG_BASE}/${idProduct}/${idProduct}.jpg`,
  };
}

async function main(): Promise<void> {
  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log('Fetching cards with missing cardmarket_id...');
  const { data: cards, error } = await supabase
    .from('cards')
    .select('id, set_name, set_number, language, card_name')
    .is('cardmarket_id', null);

  if (error) throw new Error(`Failed to fetch cards: ${error.message}`);
  const userCards = (cards ?? []) as UserCard[];
  console.log(`Found ${userCards.length} cards to re-enrich.`);

  let resolved = 0;
  let skippedNoSetInfo = 0;
  let skippedNotFound = 0;
  let updateFailed = 0;
  const failures: string[] = [];

  for (const card of userCards) {
    if (!card.set_name || !card.set_number) {
      skippedNoSetInfo++;
      continue;
    }

    // Cards table stores set_number as "1/198", cardmarket_card_index as "1".
    // Also strip leading zeros to match the normalized form ("001" → "1").
    const normalizedNumber = String(parseInt(card.set_number.split('/')[0], 10));

    try {
      const hit = await lookupCardmarket(supabase, card.set_name, normalizedNumber);
      if (!hit) {
        skippedNotFound++;
        continue;
      }

      const { error: updErr } = await supabase
        .from('cards')
        .update({
          cardmarket_id: hit.cardmarket_id,
          card_name: hit.card_name || card.card_name,
          set_name: hit.set_name,
          tcg_image_url: hit.tcg_image_url,
        })
        .eq('id', card.id);

      if (updErr) {
        updateFailed++;
        failures.push(`${card.id}: ${updErr.message}`);
      } else {
        resolved++;
      }
    } catch (err) {
      updateFailed++;
      failures.push(`${card.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log('=== Summary ===');
  console.log(JSON.stringify(
    {
      total: userCards.length,
      resolved,
      skippedNoSetInfo,
      skippedNotFound,
      updateFailed,
      failures: failures.slice(0, 10),
    },
    null,
    2,
  ));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
