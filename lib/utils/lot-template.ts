// lib/utils/lot-template.ts
import type { CardCondition, CardLanguage } from '@/lib/types';
import { LANGUAGE_FEMALE, LANGUAGE_FLAGS, CONDITION_LABEL } from './vinted-template';

interface LotForTemplate {
  name: string;
  /** When null, defaults to JP for the boilerplate. The form requires a value, so this should rarely happen. */
  language: CardLanguage | null;
  condition: CardCondition;
  extra_description: string | null;
}

export interface LotAnnonce {
  title: string;
  description: string;
}

/**
 * Title suffix code per language. Same as enum value (CN replaced ZH after the
 * 2026-05-04 enum migration). ZH kept as alias for legacy rows.
 */
const LANGUAGE_TITLE_CODE: Record<CardLanguage, string> = {
  JP: 'JP', EN: 'EN', FR: 'FR', DE: 'DE', IT: 'IT',
  ES: 'ES', KO: 'KO', PT: 'PT', ZH: 'CN', CN: 'CN',
};

const TITLE_PREFIX = 'Lot de Cartes Pokémon ';

/**
 * Compose the final Vinted title from the user-typed middle part.
 * Example: name="Art Set SBB1C", language='ZH' → "Lot de Cartes Pokémon Art Set SBB1C [CN]"
 */
export function composeLotTitle(name: string, language: CardLanguage | null): string {
  const code = LANGUAGE_TITLE_CODE[language ?? 'JP'];
  return `${TITLE_PREFIX}${name} [${code}]`;
}

const DESCRIPTION_TEMPLATE = `✨ {{title}}
📘 Cartes officielles {{language_name}} {{language_flag}}
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
  const title = composeLotTitle(lot.name, lot.language);

  const trimmedExtra = lot.extra_description?.trim() ?? '';
  // Add 📝 emoji prefix to match the visual style of the other lines (✨ 📘 ✅ etc.)
  const extraBlock = trimmedExtra === '' ? '' : `\n📝 ${trimmedExtra}\n`;

  const description = DESCRIPTION_TEMPLATE
    .replace('{{title}}', title)
    .replace('{{language_name}}', langName)
    .replace('{{language_flag}}', langFlag)
    .replace('{{condition_label}}', condLabel)
    .replace('{{extra_block}}', extraBlock);

  return { title, description };
}
