import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ScrapedCard } from './types.js';

export function createServiceClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as Apify secrets',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function expansionAlreadyIndexed(
  client: SupabaseClient,
  idExpansion: number,
): Promise<boolean> {
  const { count, error } = await client
    .from('cardmarket_card_index')
    .select('*', { count: 'exact', head: true })
    .eq('id_expansion', idExpansion);

  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }
  return (count ?? 0) > 0;
}

export interface UpsertRow {
  id_product: number;
  id_expansion: number;
  set_number: string;
  url_variant: string | null;
  language: string;
  url_path: string | null;
}

const BATCH_SIZE = 50;

export async function upsertCards(
  client: SupabaseClient,
  idExpansion: number,
  language: string,
  cards: ScrapedCard[],
): Promise<number> {
  if (cards.length === 0) return 0;

  const rows: UpsertRow[] = cards.map((c) => ({
    id_product: c.idProduct,
    id_expansion: idExpansion,
    set_number: c.setNumber,
    url_variant: c.urlVariant,
    language,
    url_path: c.urlPath || null,
  }));

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from('cardmarket_card_index')
      .upsert(batch, {
        onConflict: 'id_product',
        ignoreDuplicates: false,
      });
    if (error) {
      throw new Error(
        `Supabase upsert failed (expansion ${idExpansion}, batch ${i}): ${error.message}`,
      );
    }
    inserted += batch.length;
  }
  return inserted;
}
