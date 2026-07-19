import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Supabase's Data API caps EVERY response at the project's max-rows setting
 * (1000 by default) — even an explicit `.range(0, 1999)` comes back clamped
 * to 1000 rows. Any query that can grow past that cap silently truncates,
 * which is how Pokédex slots went missing while Stock/Vinted still saw them.
 *
 * This helper pages through `.range()` windows of PAGE_SIZE until a short
 * page signals the end, and returns the concatenated rows in the same
 * `{ data, error }` shape as a plain supabase query.
 *
 * IMPORTANT: the `page` callback MUST apply a fully deterministic `.order()`
 * (unique column, or tiebreak on one — e.g. `.order('id')`) before
 * `.range(from, to)`. Postgres gives no stable ordering without it, so pages
 * could overlap or skip rows.
 */
const PAGE_SIZE = 1000;

type PageResult<Row> = { data: Row[] | null; error: PostgrestError | null };

export async function fetchAllRows<Row>(
  page: (from: number, to: number) => PromiseLike<PageResult<Row>>,
): Promise<{ data: Row[] | null; error: PostgrestError | null }> {
  const all: Row[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) return { data: all, error: null };
  }
}

/**
 * Split a list into chunks of `size`. Used to keep `.in('col', ids)` filters
 * small: Supabase encodes the id list in the request URL, so a thousand UUIDs
 * in one filter blows past proxy URL-length limits.
 */
export function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
