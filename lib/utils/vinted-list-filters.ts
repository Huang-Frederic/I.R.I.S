import type { CardWithListings, LotWithListings } from '@/lib/types';
import type { VintedFilterState } from '@/components/vinted/VintedFilters';

export const CATALOG_SINGLE = 4875;
export const BRAND_IDS = { pokemon: 191646, onepiece: 89766, magic: 399547, lorcana: 287189, riftbound: 509120 } as const;

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

export function matchesSearch(card: CardWithListings, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  const fields = [
    card.set_number, card.card_name, card.pokemon_name,
    card.set_name, card.set_code, card.language, card.rarity,
  ];
  return fields.some((f) => f && normalize(f).includes(q));
}

export function matchesLotSearch(lot: LotWithListings, query: string): boolean {
  if (!query) return true;
  const q = normalize(query);
  const fields = [lot.name, lot.extra_description ?? '', lot.language ?? ''];
  return fields.some((f) => f && normalize(f).includes(q));
}

export function matchesLotFilters(lot: LotWithListings, f: VintedFilterState): boolean {
  if (f.kindFilter === 'single' && lot.catalog_id !== CATALOG_SINGLE) return false;
  if (f.kindFilter === 'lot' && lot.catalog_id === CATALOG_SINGLE) return false;
  if (f.lotBrand !== 'all') {
    const bid = lot.brand_id;
    switch (f.lotBrand) {
      case 'pokemon': if (bid !== null && bid !== BRAND_IDS.pokemon) return false; break;
      case 'onepiece': if (bid !== BRAND_IDS.onepiece) return false; break;
      case 'magic': if (bid !== BRAND_IDS.magic) return false; break;
      case 'lorcana': if (bid !== BRAND_IDS.lorcana) return false; break;
      case 'riftbound': if (bid !== BRAND_IDS.riftbound) return false; break;
      case 'autres':
        if (bid === null || bid === BRAND_IDS.pokemon || bid === BRAND_IDS.onepiece || bid === BRAND_IDS.magic || bid === BRAND_IDS.lorcana || bid === BRAND_IDS.riftbound) return false;
        break;
    }
  }
  return true;
}

export function matchesAttrFilters(card: CardWithListings, f: VintedFilterState): boolean {
  if (f.language !== 'all' && card.language !== f.language) return false;
  if (f.rarity !== 'all' && card.rarity !== f.rarity) return false;
  if (f.variant !== 'all') {
    const variant = card.variant ?? 'standard';
    if (variant !== f.variant) return false;
  }
  return true;
}
