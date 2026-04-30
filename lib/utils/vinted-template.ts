// lib/utils/vinted-template.ts
import type { Card, CardCondition, CardLanguage, CardRarity } from '@/lib/types';

export const MAX_TITLE_LENGTH = 80;

const LANGUAGE_FLAGS: Record<CardLanguage, string> = {
  JP: '🇯🇵', EN: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪', IT: '🇮🇹',
  ES: '🇪🇸', KO: '🇰🇷', PT: '🇵🇹', ZH: '🇨🇳',
};

const LANGUAGE_FULL: Record<CardLanguage, string> = {
  JP: 'Japonais', EN: 'Anglais', FR: 'Français', DE: 'Allemand',
  IT: 'Italien', ES: 'Espagnol', KO: 'Coréen', PT: 'Portugais', ZH: 'Chinois',
};

const CONDITION_FULL: Record<CardCondition, string> = {
  NM: 'Near Mint', EX: 'Excellent', GD: 'Good', PL: 'Played', PO: 'Poor',
};

const RARITY_LABEL: Record<CardRarity, string> = {
  SAR: 'Special Art Rare', AR: 'Art Rare', SR: 'Super Rare',
  CHR: 'Character Rare', RR: 'Double Rare', R_HOLO: 'Rare Holo',
  R: 'Rare', UC: 'Uncommon', C: 'Common', OTHER: 'Other',
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

/**
 * Compose the Vinted ad title (≤ 80 chars). Smart truncate ladder:
 *   1. Full bilingual format
 *   2. Drop bilingual paren in card_name + set_name
 *   3. Drop condition when it is the implicit default NM
 *   4. Replace set_name with set_code
 *   5. Drop the set segment entirely
 *
 * Invariants: card_name (truncated form), rarity, language, and variant
 * (when present) are always retained.
 */
export function buildTitle(card: Card): string {
  const variant = variantLabel(card.variant);

  const compose = (
    cardName: string,
    setSegment: string | null,
    includeCondition: boolean,
  ): string => {
    const parts = [cardName];
    if (setSegment) parts.push(setSegment);
    parts.push(card.rarity);
    parts.push(card.language);
    if (variant) parts.push(variant);
    if (includeCondition) parts.push(card.condition);
    return parts.join(' — ');
  };

  const fullCardName = card.card_name;
  const strippedCardName = stripParen(fullCardName);
  const fullSet = card.set_name ?? null;
  const strippedSet = fullSet ? stripParen(fullSet) : null;
  const setCode = card.set_code ?? null;
  const conditionIsDefault = card.condition === 'NM';
  const keepCondition = !conditionIsDefault;

  const ladder: string[] = [];
  // 1. Full bilingual + condition
  ladder.push(compose(fullCardName, fullSet, true));
  // 2. Drop bilingual paren in card_name + set_name
  ladder.push(compose(strippedCardName, strippedSet, true));
  // 3. Drop the implicit-default NM (only when condition is NM)
  if (conditionIsDefault) {
    ladder.push(compose(strippedCardName, strippedSet, false));
  }
  // 4. set_name → set_code (keep condition only if not default)
  ladder.push(compose(strippedCardName, setCode, keepCondition));
  // 5. Drop set entirely
  ladder.push(compose(strippedCardName, null, keepCondition));

  for (const candidate of ladder) {
    if (candidate.length <= MAX_TITLE_LENGTH) return candidate;
  }

  // Last resort: hard-truncate the card name. Keeps card_name + rarity + lang + variant.
  const tail = compose('', null, keepCondition).replace(/^\s*—\s*/, '');
  const budget = MAX_TITLE_LENGTH - tail.length - ' — '.length;

  // For Pokemon cards, preserve the suffix (ex, V, VMAX, etc.) which is more identifying
  // than the prefix. Try to keep the last few words if possible.
  const words = strippedCardName.split(' ');
  let truncatedName = strippedCardName.slice(0, Math.max(1, budget));

  // If we're truncating, try to preserve at least the last 2 words (e.g., "Pikachu ex")
  if (truncatedName.length < strippedCardName.length && words.length >= 2) {
    const lastTwoWords = words.slice(-2).join(' ');
    const ellipsis = '…';
    const budgetForSuffix = budget - ellipsis.length - lastTwoWords.length - 1; // -1 for space

    if (budgetForSuffix > 3) {
      // We have room for at least a few chars + ellipsis + suffix
      const prefix = strippedCardName.slice(0, budgetForSuffix).trimEnd();
      truncatedName = `${prefix}${ellipsis} ${lastTwoWords}`;
    }
  }

  return `${truncatedName} — ${tail}`;
}

export interface VintedConfig {
  vinted_shipping_note: string;
  vinted_seller_note: string;
}

/**
 * Compose the Vinted ad description. Multi-line, includes shop notes from config.
 */
export function buildDescription(card: Card, config: VintedConfig): string {
  const lines: string[] = [
    `✨ ${card.card_name} — ${RARITY_LABEL[card.rarity]}`,
  ];

  const setBits: string[] = [];
  if (card.set_name) setBits.push(card.set_name);
  if (card.set_code) setBits.push(`(${card.set_code})`);
  let setLine = setBits.length > 0 ? `📦 Set : ${setBits.join(' ')}` : null;
  if (setLine && card.set_number) setLine += ` — N° ${card.set_number}`;
  if (setLine) lines.push(setLine);

  lines.push(`${LANGUAGE_FLAGS[card.language]} Langue : ${LANGUAGE_FULL[card.language]}`);
  lines.push(`⭐ État : ${CONDITION_FULL[card.condition]}`);

  const variant = variantLabel(card.variant);
  if (variant) lines.push(`🎨 Variant : ${variant}`);

  lines.push('');
  lines.push(config.vinted_shipping_note);
  lines.push(config.vinted_seller_note);

  return lines.join('\n');
}
