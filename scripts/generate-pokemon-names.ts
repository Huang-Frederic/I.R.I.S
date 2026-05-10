/**
 * One-shot generator: dumps all Pokémon species names (FR/EN/JP) from PokéAPI
 * into a static JSON file.
 *
 * Run when a new Pokémon generation is released (every 2-3 years):
 *   npx tsx scripts/generate-pokemon-names.ts
 *
 * Output: lib/data/pokemon-names.json — bundled at build time, zero runtime
 * external calls. ~1025 Pokémon × 3 languages = ~50 KB JSON.
 *
 * Format:
 *   { "1": { fr: "Bulbizarre", en: "Bulbasaur", ja: "フシギダネ" }, ... }
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const TOTAL_POKEMON = 1025; // National dex up to Gen 9 (Scarlet/Violet + DLCs)
const CONCURRENCY = 20;
const OUTPUT_PATH = resolve(__dirname, '../lib/data/pokemon-names.json');

interface SpeciesResponse {
  id: number;
  names: Array<{
    language: { name: string };
    name: string;
  }>;
}

interface PokemonEntry {
  fr: string;
  en: string;
  ja: string;
}

async function fetchSpecies(dexId: number): Promise<PokemonEntry | null> {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${dexId}/`);
    if (!res.ok) {
      console.warn(`  dex=${dexId} → HTTP ${res.status}`);
      return null;
    }
    const data = (await res.json()) as SpeciesResponse;
    const byLang = (lang: string) =>
      data.names.find((n) => n.language.name === lang)?.name ?? '';
    return {
      fr: byLang('fr'),
      en: byLang('en'),
      ja: byLang('ja'),
    };
  } catch (e) {
    console.warn(`  dex=${dexId} → fetch error:`, e instanceof Error ? e.message : e);
    return null;
  }
}

async function main() {
  console.log(`Fetching ${TOTAL_POKEMON} Pokémon species from PokéAPI…`);
  const result: Record<string, PokemonEntry> = {};
  let done = 0;
  let failed = 0;

  // Sliding-window concurrency: keep CONCURRENCY in flight.
  const ids = Array.from({ length: TOTAL_POKEMON }, (_, i) => i + 1);
  let cursor = 0;

  async function worker() {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      const entry = await fetchSpecies(id);
      done++;
      if (entry) {
        result[String(id)] = entry;
      } else {
        failed++;
      }
      if (done % 100 === 0) {
        process.stdout.write(`  ${done}/${TOTAL_POKEMON}\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`\n✓ ${done} fetched (${failed} failed)`);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(result, null, 0));
  const sizeKb = (JSON.stringify(result).length / 1024).toFixed(1);
  console.log(`✓ Wrote ${OUTPUT_PATH} (${sizeKb} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
