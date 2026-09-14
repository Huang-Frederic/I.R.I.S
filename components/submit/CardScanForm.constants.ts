import {
  UI_LANGUAGES,
  type CardCondition,
  type CardLanguage,
  type CardRarity,
  type CardStatus,
} from '@/lib/types';

export const LANGUAGES: readonly CardLanguage[] = UI_LANGUAGES;
export const CONDITIONS: CardCondition[] = ['NM', 'EX', 'GD', 'PL', 'PO'];
export const STATUS_VALUES = ['for_sale', 'pokedex', 'collection'] as const satisfies readonly CardStatus[];
export const RARITY_VALUES = [
  'SAR',
  'AR',
  'SR',
  'CHR',
  'RR',
  'R_HOLO',
  'R',
  'UC',
  'C',
  'OTHER',
] as const satisfies readonly CardRarity[];
export const VARIANT_VALUES = [
  { value: '', key: 'standard' },
  { value: 'pokeball', key: 'pokeball' },
  { value: 'masterball', key: 'masterball' },
  { value: 'reverse_holo', key: 'reverse_holo' },
  { value: 'stamp', key: 'stamp' },
  { value: 'promo', key: 'promo' },
] as const;

/**
 * Status-driven accent palette for the destination select + save button.
 * Mirrors the semantic mapping used elsewhere: blue = Vinted/for_sale,
 * amber = Stock/collection, red = Pokédex. Picked up by both the status
 * <select>'s border and the save <button>'s bg/hover so the user gets
 * instant visual feedback on which bucket the card will land in.
 */
export const STATUS_COLOR_CLASSES: Record<CardStatus, { border: string; button: string }> = {
  for_sale: { border: 'border-blue-500', button: 'bg-blue-600 hover:bg-blue-700' },
  collection: { border: 'border-amber-600', button: 'bg-amber-600 hover:bg-amber-700' },
  pokedex: { border: 'border-red', button: 'bg-red hover:bg-[#c44545]' },
  // 'sold' / 'traded' aren't user-selectable in the scanner, but CardStatus
  // includes them — fall back to the for_sale palette to keep the type total.
  sold: { border: 'border-blue-500', button: 'bg-blue-600 hover:bg-blue-700' },
  traded: { border: 'border-blue-500', button: 'bg-blue-600 hover:bg-blue-700' },
};

export interface FormFields {
  pokemon_name: string;
  pokemon_number: string;
  card_name: string;
  card_id_tcg: string;
  set_name: string;
  set_code: string;
  set_number: string;
  tcg_image_url: string;
  language: CardLanguage;
  rarity: CardRarity;
  condition: CardCondition;
  status: CardStatus;
  notes: string;
  variant: string;
  count: number;
  /* Pricing — hidden from the user, populated by enrichment when available. */
  cardmarket_id: string;
  cm_price_low: string;
  cm_price_trend: string;
  cm_price_avg: string;
}

export const EMPTY: FormFields = {
  pokemon_name: '',
  pokemon_number: '',
  card_name: '',
  card_id_tcg: '',
  set_name: '',
  set_code: '',
  set_number: '',
  tcg_image_url: '',
  language: 'EN',
  rarity: 'OTHER',
  condition: 'NM',
  status: 'for_sale',
  notes: '',
  variant: '',
  count: 1,
  cardmarket_id: '',
  cm_price_low: '',
  cm_price_trend: '',
  cm_price_avg: '',
};

export const CONFIDENCE_THRESHOLD = 0.8;
