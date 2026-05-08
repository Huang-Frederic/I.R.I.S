import type { CardCondition, CardLanguage, CardRarity, CardStatus } from '@/lib/types';

const LANGUAGES: ReadonlySet<CardLanguage> = new Set([
  'JP', 'EN', 'FR', 'DE', 'IT', 'ES', 'KO', 'PT', 'ZH', 'CN',
]);
const CONDITIONS: ReadonlySet<CardCondition> = new Set(['NM', 'EX', 'GD', 'PL', 'PO']);
const STATUSES: ReadonlySet<CardStatus> = new Set(['pokedex', 'for_sale', 'collection', 'sold']);
const RARITIES: ReadonlySet<CardRarity> = new Set([
  'SAR', 'AR', 'SR', 'CHR', 'RR', 'R_HOLO', 'R', 'UC', 'C', 'OTHER',
]);

export interface ParsedCardForm {
  card_name: string;
  pokemon_name: string | null;
  pokemon_number: number | null;
  language: CardLanguage;
  rarity: CardRarity;
  condition: CardCondition;
  status: Exclude<CardStatus, 'sold'>;
}

export type ValidateCardFormResult =
  | { valid: true; parsed: ParsedCardForm }
  | { valid: false; error: string; status: number };

function str(form: FormData, key: string): string | null {
  const value = form.get(key);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function validateCardForm(formData: FormData): ValidateCardFormResult {
  const card_name = str(formData, 'card_name');
  if (!card_name) return { valid: false, error: 'card_name est requis', status: 400 };

  const pokemon_name = str(formData, 'pokemon_name');
  const pokemon_number_raw = str(formData, 'pokemon_number');

  let pokemon_number: number | null = null;
  if (pokemon_number_raw !== null && pokemon_number_raw !== '') {
    const parsed = Number(pokemon_number_raw);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 1025) {
      return { valid: false, error: 'pokemon_number doit être entre 1 et 1025', status: 400 };
    }
    pokemon_number = parsed;
  }

  const language = str(formData, 'language') as CardLanguage | null;
  if (!language || !LANGUAGES.has(language)) {
    return { valid: false, error: 'language invalide', status: 400 };
  }

  const rarity = str(formData, 'rarity') as CardRarity | null;
  if (!rarity || !RARITIES.has(rarity)) {
    return { valid: false, error: 'rarity invalide', status: 400 };
  }

  const condition = (str(formData, 'condition') as CardCondition | null) ?? 'NM';
  if (!CONDITIONS.has(condition)) {
    return { valid: false, error: 'condition invalide', status: 400 };
  }

  const status = (str(formData, 'status') as CardStatus | null) ?? 'for_sale';
  if (!STATUSES.has(status) || status === 'sold') {
    return { valid: false, error: 'status invalide', status: 400 };
  }

  if (status === 'pokedex' && pokemon_number === null) {
    return {
      valid: false,
      error: 'pokemon_number requis pour status=pokedex',
      status: 400,
    };
  }

  return {
    valid: true,
    parsed: {
      card_name,
      pokemon_name,
      pokemon_number,
      language,
      rarity,
      condition,
      status: status as Exclude<CardStatus, 'sold'>,
    },
  };
}
