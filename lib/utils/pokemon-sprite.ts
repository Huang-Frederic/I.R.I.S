import { POKEMON_NAMES } from '@/lib/data/pokemon-names';
import { normalizeForSearch } from './text-normalize';

// LimitlessTCG's own tiny (~20x20) pixel-art Pokémon icons — the same source
// already trusted elsewhere in this repo for card data (scrape-limitlesstcg.ts).
// Verified against every non-alphanumeric English name in POKEMON_NAMES (9
// entries: gender symbols, periods, apostrophes, a colon, an accent) plus a
// broad sample, before picking this over PokeAPI's community sprite sets.
const SPRITE_BASE = 'https://r2.limitlesstcg.net/pokemon/gen9';

/** Converts an English Pokémon name to LimitlessTCG's sprite slug: lowercase,
 *  accents stripped, ♀/♂ spelled out, apostrophes/periods dropped, any other
 *  run of non-alphanumeric characters collapsed to a single hyphen. */
export function slugifyPokemonName(en: string): string {
  const withGender = en.replace(/♀/g, '-f').replace(/♂/g, '-m');
  const withoutAccents = withGender.normalize('NFD').replace(/\p{Diacritic}/gu, '');
  const lower = withoutAccents.toLowerCase().replace(/['’.]/g, '');
  return lower.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** Full sprite URL for a national dex number, or null when it's out of range. */
export function pokemonSpriteUrl(pokemonNumber: number): string | null {
  const entry = POKEMON_NAMES[pokemonNumber];
  if (!entry) return null;
  return `${SPRITE_BASE}/${slugifyPokemonName(entry.en)}.png`;
}

/** Reverse-looks-up a Pokémon's national dex number from a card's printed
 *  name. The species name can be a suffix ("Carchacrok-ex", "Typhlosion de
 *  Luth") or, for this project's Mega-era cards, a PREFIX ("Méga-Amphinobi-ex")
 *  — so this checks for the species name anywhere in the normalized card
 *  name, picking the longest match when more than one candidate applies.
 *  Returns null when nothing matches (in practice this usually — not
 *  always — includes Trainer/Energy cards, since the substring match can
 *  coincidentally hit a short species name inside an unrelated card name). */
export function dexNumberFromCardName(name: string): number | null {
  const normalized = normalizeForSearch(name);
  let best: { number: number; length: number } | null = null;
  for (const [numStr, entry] of Object.entries(POKEMON_NAMES)) {
    const candidate = normalizeForSearch(entry.fr);
    if (normalized.includes(candidate) && (!best || candidate.length > best.length)) {
      best = { number: Number(numStr), length: candidate.length };
    }
  }
  return best?.number ?? null;
}
