import type { CardCondition, CardLanguage } from '@/lib/types';
import { LANGUAGE_FEMALE, LANGUAGE_FLAGS, CONDITION_LABEL } from './vinted-template';

export interface LotForTemplate {
  name: string;
  language: CardLanguage | null;
  condition: CardCondition;
  extra_description: string | null;
  /** Brand label used in the title/description (e.g. "One Piece", "Pokémon"). Defaults to "Pokémon". */
  brandLabel?: string;
  /** true = lot of cards (catalog 4879), false = single card (catalog 4875). Defaults to true. */
  isLot?: boolean;
}

export interface LotAnnonce {
  title: string;
  description: string;
}

const LANGUAGE_TITLE_CODE: Record<CardLanguage, string> = {
  JP: 'JP', EN: 'EN', FR: 'FR', DE: 'DE', IT: 'IT',
  ES: 'ES', KO: 'KO', PT: 'PT', ZH: 'CN', CN: 'CN',
};

export function composeLotTitle(
  name: string,
  language: CardLanguage | null,
  brandLabel = 'Pokémon',
  isLot = true,
): string {
  const code = LANGUAGE_TITLE_CODE[language ?? 'JP'];
  const typePrefix = isLot ? 'Lot de Cartes' : 'Carte';
  const brandPart = brandLabel ? ` ${brandLabel}` : '';
  const full = `${typePrefix}${brandPart} ${name} [${code}]`;
  if (full.length <= 80) return full;
  // fallback: drop brand from prefix
  const short = `${typePrefix} ${name} [${code}]`;
  if (short.length <= 80) return short;
  // last resort: bare name + lang
  return `${name} [${code}]`.slice(0, 80);
}

const DESCRIPTION_TEMPLATE = `✨ {{title}}
📘 {{lang_line}}
✅ État : {{condition_label}}, carte en excellent état (voir photos).
{{extra_block}}
🛡️ Chaque carte est envoyée sous sleeve + toploader !
🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦
🤝 Remise en main propre possible sur Paris / 92 / 95
📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !

🃏 Plein d'autres cartes sont disponibles sur mon profil !
📦 Possibilité de créer des lots personnalisés avec réduction sur les frais de port 🤑`;

export function buildLotAnnonce(lot: LotForTemplate): LotAnnonce {
  const langKey: CardLanguage = lot.language ?? 'JP';
  const langName = LANGUAGE_FEMALE[langKey];
  const langFlag = LANGUAGE_FLAGS[langKey];
  const condLabel = CONDITION_LABEL[lot.condition];
  const brandLabel = lot.brandLabel ?? 'Pokémon';
  const isLot = lot.isLot ?? true;

  const title = composeLotTitle(lot.name, lot.language, brandLabel, isLot);

  const langLine = isLot
    ? `Cartes officielles ${langName} ${langFlag}`
    : `Version ${langName} ${langFlag}`;

  const trimmedExtra = lot.extra_description?.trim() ?? '';
  const extraBlock = trimmedExtra === '' ? '' : `\n📝 ${trimmedExtra}\n`;

  const description = DESCRIPTION_TEMPLATE
    .replace('{{title}}', title)
    .replace('{{lang_line}}', langLine)
    .replace('{{condition_label}}', condLabel)
    .replace('{{extra_block}}', extraBlock);

  return { title, description };
}
