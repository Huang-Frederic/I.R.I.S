import 'server-only';
import type { CardRarity, EnrichResult, EnrichedCard } from '@/lib/types';

const ENDPOINT = 'https://api.pokemontcg.io/v2/cards';

interface TCGApiCard {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  set: {
    id: string;
    name: string;
    series?: string;
    printedTotal?: number;
    total?: number;
    releaseDate?: string;
  };
  images: { small: string; large: string };
  nationalPokedexNumbers?: number[];
}

interface TCGApiResponse {
  data?: TCGApiCard[];
}

/**
 * Maps the TCG API `rarity` string to our `card_rarity` enum.
 * Defaults to 'OTHER' if the string is unknown — the user can override
 * the rarity manually in the review form.
 */
const RARITY_MAP: Record<string, CardRarity> = {
  'Special Illustration Rare': 'SAR',
  'Illustration Rare': 'AR',
  'Hyper Rare': 'SAR',
  'Ultra Rare': 'SR',
  'Shiny Rare': 'SR',
  'Shiny Ultra Rare': 'SR',
  'Double Rare': 'RR',
  'Rare Holo': 'R_HOLO',
  'Rare Holo V': 'R_HOLO',
  'Rare Holo VMAX': 'R_HOLO',
  'Rare Holo VSTAR': 'R_HOLO',
  'Rare Holo EX': 'R_HOLO',
  'Rare Holo GX': 'R_HOLO',
  'Trainer Gallery Rare Holo': 'R_HOLO',
  'Rare BREAK': 'R_HOLO',
  'Rare ACE': 'R_HOLO',
  Rare: 'R',
  Uncommon: 'UC',
  Common: 'C',
};

export function mapRarity(tcgRarity: string | undefined): CardRarity {
  if (!tcgRarity) return 'OTHER';
  return RARITY_MAP[tcgRarity] ?? 'OTHER';
}

/**
 * Strips the trainer/EX/V/VMAX suffix to recover a Pokémon name.
 * The TCG API stores the full card name, not the species — for the Pokédex
 * grid (1 entry per pokemon_number) we need just the species. Imperfect; the
 * user can edit the field in the review form.
 */
export function extractPokemonName(cardName: string): string {
  return cardName
    .replace(/\s*(ex|EX|GX|V|VMAX|VSTAR|V-UNION|VUNION|BREAK|LEGEND)\s*$/i, '')
    .trim();
}

function toEnrichedCard(card: TCGApiCard): EnrichedCard {
  const total = card.set.printedTotal ?? card.set.total ?? '';
  return {
    card_id_tcg: card.id,
    card_name: card.name,
    pokemon_name: extractPokemonName(card.name),
    pokemon_number: card.nationalPokedexNumbers?.[0] ?? null,
    set_name: card.set.name,
    set_code: card.set.id,
    set_number: `${card.number}/${total}`,
    rarity: mapRarity(card.rarity),
    tcg_image_url: card.images.large,
  };
}

interface SearchOptions {
  /** OCR'd "<card>/<total>" — total is used to disambiguate same-number cards across sets. */
  cardNumber: string;
  setSize: string;
}

/**
 * Look up TCG API cards by set number, narrowing by total set size when possible.
 * Returns up to 10 candidates sorted by release date (newest first), since the
 * user is far more likely to be scanning a recent print than a 2003 reprint.
 */
export async function searchBySetNumber(opts: SearchOptions): Promise<EnrichResult> {
  const apiKey = process.env.POKEMON_TCG_API_KEY;
  const url = `${ENDPOINT}?q=number:${encodeURIComponent(opts.cardNumber)}&pageSize=50`;
  const response = await fetch(url, {
    headers: apiKey ? { 'X-Api-Key': apiKey } : {},
  });

  if (!response.ok) {
    throw new Error(`TCG API ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as TCGApiResponse;
  const all = data.data ?? [];

  const wantedSize = Number(opts.setSize);
  const sized = Number.isFinite(wantedSize)
    ? all.filter((c) => c.set.printedTotal === wantedSize || c.set.total === wantedSize)
    : [];
  const filtered = sized.length > 0 ? sized : all;

  filtered.sort((a, b) => {
    const aDate = a.set.releaseDate ? new Date(a.set.releaseDate).getTime() : 0;
    const bDate = b.set.releaseDate ? new Date(b.set.releaseDate).getTime() : 0;
    return bDate - aDate;
  });

  const candidates = filtered.slice(0, 10).map(toEnrichedCard);
  return {
    bestMatch: candidates[0] ?? null,
    candidates,
  };
}
