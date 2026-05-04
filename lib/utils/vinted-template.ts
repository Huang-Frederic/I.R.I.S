// lib/utils/vinted-template.ts
import type { Card, CardCondition, CardLanguage } from '@/lib/types';

export const MAX_TITLE_LENGTH = 80;

export const LANGUAGE_FLAGS: Record<CardLanguage, string> = {
  JP: '🇯🇵', EN: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹',
  ES: '🇪🇸', KO: '🇰🇷', PT: '🇵🇹', ZH: '🇨🇳', CN: '🇨🇳',
};

export const LANGUAGE_FEMALE: Record<CardLanguage, string> = {
  JP: 'Japonaise', EN: 'Anglaise', FR: 'Française', DE: 'Allemande',
  IT: 'Italienne', ES: 'Espagnole', KO: 'Coréenne', PT: 'Portugaise', ZH: 'Chinoise', CN: 'Chinoise',
};

export const CONDITION_LABEL: Record<CardCondition, string> = {
  NM: 'Très bon état (Near Mint)',
  EX: 'Excellent (EX)',
  GD: 'Bon état (Good)',
  PL: 'Joué (Played)',
  PO: 'Mauvais état (Poor)',
};

const VARIANT_LABEL: Record<string, string> = {
  pokeball: 'Poké Ball',
  masterball: 'Master Ball',
  reverse_holo: 'Reverse Holo',
  promo: 'Promo',
};

function variantLabel(variant: string | null): string | null {
  if (!variant) return null;
  return VARIANT_LABEL[variant] ?? variant;
}

/** Strip the bilingual `(オリジナル)` parenthesis from a name. */
function stripParen(name: string): string {
  return name.replace(/\s*\([^)]+\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/** "70/167" → "70". Returns the original if no slash. */
function stripDenominator(setNumber: string | null): string | null {
  if (!setNumber) return null;
  const slash = setNumber.indexOf('/');
  return slash >= 0 ? setNumber.slice(0, slash).trim() : setNumber.trim();
}

interface TitleParts {
  carteSuffix: string; // "Carte Pokémon "
  cardName: string;     // "Simiabraz (ゴウカザル)" or just "Simiabraz"
  variant: string;      // " Poké Ball" or "" — leading space when present
  setSegment: string;   // " - Mascarade Crépusculaire (SV5A 70)" or "" — leading " - " when present
  language: string;     // " [JP]"
}

function composeTitle(parts: TitleParts): string {
  return `${parts.carteSuffix}${parts.cardName}${parts.variant}${parts.setSegment}${parts.language}`;
}

/**
 * Compose the Vinted ad title (≤ 80 chars). Smart truncate ladder:
 *   1. Full bilingual format
 *   2. Drop bilingual paren in card_name + set_name
 *   3. Drop variant
 *   4. Drop "Carte Pokémon " prefix
 *   5. set_name → set_code only
 *   6. Drop set entirely
 *
 * Invariants: card_name, set_code, language ALWAYS retained.
 */
export function buildTitle(card: Card): string {
  const variant = variantLabel(card.variant);
  const fullName = card.card_name;
  const strippedName = stripParen(fullName);
  const setNumberShort = stripDenominator(card.set_number);
  const setCode = card.set_code ?? null;
  const setName = card.set_name ?? null;
  const lang = card.language;

  // Set segment helpers
  const setSegFull = (() => {
    if (!setName) return setCode ? ` - (${setCode}${setNumberShort ? ` ${setNumberShort}` : ''})` : '';
    return ` - ${setName}${setCode || setNumberShort ? ` (${[setCode, setNumberShort].filter(Boolean).join(' ')})` : ''}`;
  })();
  const setSegCodeOnly = setCode ? ` - (${setCode}${setNumberShort ? ` ${setNumberShort}` : ''})` : '';
  const variantSeg = variant ? ` ${variant}` : '';
  const langSeg = ` [${lang}]`;

  const ladder: string[] = [
    // 1. Full bilingual + variant + full set
    composeTitle({ carteSuffix: 'Carte Pokémon ', cardName: fullName, variant: variantSeg, setSegment: setSegFull, language: langSeg }),
    // 2. Drop bilingual paren
    composeTitle({ carteSuffix: 'Carte Pokémon ', cardName: strippedName, variant: variantSeg, setSegment: setSegFull, language: langSeg }),
    // 3. Drop variant
    composeTitle({ carteSuffix: 'Carte Pokémon ', cardName: strippedName, variant: '', setSegment: setSegFull, language: langSeg }),
    // 4. Drop "Carte Pokémon " prefix
    composeTitle({ carteSuffix: '', cardName: strippedName, variant: '', setSegment: setSegFull, language: langSeg }),
    // 5. set_name → set_code only
    composeTitle({ carteSuffix: '', cardName: strippedName, variant: '', setSegment: setSegCodeOnly, language: langSeg }),
    // 6. Drop set entirely
    composeTitle({ carteSuffix: '', cardName: strippedName, variant: '', setSegment: '', language: langSeg }),
  ];

  for (const candidate of ladder) {
    if (candidate.length <= MAX_TITLE_LENGTH) return candidate;
  }

  // Last resort: hard-truncate the card name. Keeps card_name + language.
  const tail = ` [${lang}]`;
  const budget = MAX_TITLE_LENGTH - tail.length;
  const truncatedName = strippedName.slice(0, Math.max(1, budget));
  return `${truncatedName}${tail}`;
}

export interface VintedConfig {
  vinted_shipping_note?: string;
  vinted_seller_note?: string;
}

const DEFAULT_FOOTER_LINES = [
  '🛡️ Carte envoyée sous sleeve + toploader !',
  '🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦',
  '🤝 Remise en main propre possible sur Paris / 92 / 95',
  '📸 Besoin de photos supplémentaires ? N\'hésitez pas à me demander !',
  '',
  '🃏 Plein d\'autres cartes sont disponibles sur mon profil !',
  '📦 Possibilité de créer des lots personnalisés avec réduction sur les frais de port 🤑',
];

/**
 * Compose the Vinted ad description. Multi-line, fixed footer lines.
 */
export function buildDescription(card: Card): string {
  const variant = variantLabel(card.variant);
  const fullName = card.card_name;
  const setNumberShort = stripDenominator(card.set_number);
  const setBits = [card.set_code, setNumberShort].filter(Boolean).join(' ');
  const setSegment = card.set_name
    ? `${card.set_name}${setBits ? ` (${setBits})` : ''}`
    : (setBits ? `(${setBits})` : '');

  // First line mirrors the title format, but always includes the full bilingual name + variant
  const firstLineParts = ['✨ Carte Pokémon ', fullName];
  if (variant) firstLineParts.push(` ${variant}`);
  if (setSegment) firstLineParts.push(` - ${setSegment}`);
  firstLineParts.push(` [${card.language}]`);
  const firstLine = firstLineParts.join('').replace(/\s+(?=-)/g, ' '); // tidy up spaces

  const flag = LANGUAGE_FLAGS[card.language];
  const langName = LANGUAGE_FEMALE[card.language];
  const conditionLabel = CONDITION_LABEL[card.condition];

  const lines: string[] = [
    firstLine,
    `📘 Version ${langName} ${flag}`,
    `✅ État : ${conditionLabel}.`,
  ];

  if (card.notes && card.notes.trim()) {
    lines.push('');
    lines.push(`[Notes : ${card.notes.trim()}]`);
  }

  lines.push('');
  for (const f of DEFAULT_FOOTER_LINES) lines.push(f);

  return lines.join('\n');
}
