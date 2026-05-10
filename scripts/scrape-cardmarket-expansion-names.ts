/**
 * One-shot script: populate cardmarket_expansions.name_en and name_ja by
 * scraping the Cardmarket Pokemon dropdown from the /en/ and /ja/ locale
 * pages via BrightData Web Unlocker.
 *
 * Usage:
 *   BRIGHTDATA_TOKEN=... BRIGHTDATA_ZONE=iris npm run scrape-cm-expansion-names
 *
 * Idempotent — safe to re-run.
 */

import { config as dotenvConfig } from 'dotenv';
import path from 'node:path';
dotenvConfig({ path: path.resolve(__dirname, '..', '.env.local') });
dotenvConfig();

import { JSDOM } from 'jsdom';
import { createClient } from '@supabase/supabase-js';

const BRIGHTDATA_ENDPOINT = 'https://api.brightdata.com/request';
const BRIGHTDATA_TOKEN = process.env.BRIGHTDATA_TOKEN;
const BRIGHTDATA_ZONE = process.env.BRIGHTDATA_ZONE ?? 'iris';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!BRIGHTDATA_TOKEN) throw new Error('BRIGHTDATA_TOKEN required');
if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY required');

async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(BRIGHTDATA_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${BRIGHTDATA_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ zone: BRIGHTDATA_ZONE, url, format: 'raw' }),
  });
  if (!res.ok) throw new Error(`BrightData ${res.status}: ${await res.text()}`);
  return res.text();
}

/**
 * Parse the expansion dropdown options from a CM Pokemon Singles page.
 * Returns an array of { idExpansion, name }.
 */
function parseExpansionDropdown(html: string): Array<{ idExpansion: number; name: string }> {
  const dom = new JSDOM(html);
  const options = dom.window.document.querySelectorAll<HTMLOptionElement>(
    'select[name="idExpansion"] option',
  );
  const out: Array<{ idExpansion: number; name: string }> = [];
  for (const opt of Array.from(options)) {
    const value = opt.getAttribute('value');
    const name = opt.textContent?.trim() ?? '';
    if (!value || value === '0' || !name) continue;
    const id = Number(value);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({ idExpansion: id, name });
  }
  return out;
}

async function main(): Promise<void> {
  console.log('Fetching EN expansion list...');
  const enHtml = await fetchHtml(
    'https://www.cardmarket.com/en/Pokemon/Products/Singles?searchMode=v2&idCategory=51',
  );
  const enExpansions = parseExpansionDropdown(enHtml);
  console.log(`Parsed ${enExpansions.length} EN expansions`);

  console.log('Fetching JA expansion list...');
  const jaHtml = await fetchHtml(
    'https://www.cardmarket.com/ja/Pokemon/Products/Singles?searchMode=v2&idCategory=51',
  );
  const jaExpansions = parseExpansionDropdown(jaHtml);
  console.log(`Parsed ${jaExpansions.length} JA expansions`);

  const enById = new Map(enExpansions.map((e) => [e.idExpansion, e.name]));
  const jaById = new Map(jaExpansions.map((e) => [e.idExpansion, e.name]));

  // Union of all idExpansions seen in either dropdown.
  const allIds = new Set<number>([...enById.keys(), ...jaById.keys()]);
  console.log(`Will upsert ${allIds.size} expansions`);

  const supabase = createClient(SUPABASE_URL!, SUPABASE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let updated = 0;
  let failed = 0;

  for (const id of allIds) {
    const { error } = await supabase
      .from('cardmarket_expansions')
      .update({
        name_en: enById.get(id) ?? null,
        name_ja: jaById.get(id) ?? null,
      })
      .eq('id_expansion', id);

    if (error) {
      console.error(`[${id}] update failed: ${error.message}`);
      failed++;
    } else {
      updated++;
    }
  }

  console.log(`Done. ${updated} updated, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
