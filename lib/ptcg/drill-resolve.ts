/**
 * Resolves Drill decklist lines against tcg_catalog (the 111k-card
 * collection catalogue) — no paper-set-code → PTCG-Live-id mapping needed,
 * because tcg_catalog is already keyed by the same (set_code, set_number)
 * pairs a decklist export uses. Verified directly against the DB while
 * designing this feature: FR and EN rows both exist for every set tried
 * except a brand-new one not yet scraped.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ParsedDecklistLine } from './decklist';
import type { DrillCard } from '@/lib/types';

interface CatalogRow {
  card_name: string;
  image_url: string | null;
  language: 'FR' | 'EN';
}

async function lookupCatalogCard(
  supabase: SupabaseClient,
  setCode: string,
  setNumber: string,
): Promise<CatalogRow | null> {
  const { data } = await supabase
    .from('tcg_catalog')
    .select('card_name, image_url, language')
    .eq('set_code', setCode)
    .eq('set_number', setNumber)
    .in('language', ['FR', 'EN']);
  const rows = (data ?? []) as CatalogRow[];
  return rows.find((r) => r.language === 'FR') ?? rows.find((r) => r.language === 'EN') ?? null;
}

/** Resolves parsed decklist lines into DrillCards. A line with no matching
 *  catalog row keeps its raw parsed name (unresolved — degrades to a text
 *  tile in the UI, never blocks the import). */
export async function resolveDecklistCards(
  supabase: SupabaseClient,
  lines: ParsedDecklistLine[],
): Promise<{ cards: DrillCard[]; unresolved: string[] }> {
  const cards: DrillCard[] = [];
  const unresolved: string[] = [];

  await Promise.all(
    lines.map(async (line) => {
      const row = await lookupCatalogCard(supabase, line.setCode, line.setNumber);
      const id = `${line.setCode}-${line.setNumber}`;
      if (!row) {
        unresolved.push(`${line.name} ${line.setCode} ${line.setNumber}`);
        cards.push({ id, name: line.name, count: line.count, category: line.category });
        return;
      }
      cards.push({ id, name: row.card_name, count: line.count, category: line.category });
    }),
  );

  // Promise.all does not preserve completion order — sort back to input order
  // so the UI list doesn't jump around between identical parses.
  const order = new Map(lines.map((l, i) => [`${l.setCode}-${l.setNumber}`, i]));
  cards.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  return { cards, unresolved };
}

/** Looks up a fresh image URL per card id ("SET-number") — called every
 *  time a profile loads rather than persisted, so a later re-scrape of a
 *  set benefits existing profiles automatically. */
export async function resolveDrillImages(
  supabase: SupabaseClient,
  cardIds: string[],
): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  await Promise.all(
    cardIds.map(async (id) => {
      const [setCode, setNumber] = id.split('-');
      if (!setCode || !setNumber) return;
      const row = await lookupCatalogCard(supabase, setCode, setNumber);
      if (row?.image_url) images[id] = row.image_url;
    }),
  );
  return images;
}
