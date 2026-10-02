// TS-side preview of the title/description the bot will actually post for an
// other_item — mirrors vinted-agent/main.py's build_other_item_title /
// build_other_item_description line-for-line so the fiche shows the same
// text the bot sends to Vinted. Deliberately has no NO_VINTED_GO_WARNING
// banner (unlike lib/utils/lot-template.ts) — Fred's explicit call for
// other_items, which aren't offered through Vinted Go in the first place.

export interface OtherItemForTemplate {
  name: string;
  description: string | null;
  brand_name: string | null;
  size: string | null;
  vinted_condition_id: number;
}

export interface OtherItemAnnonce {
  title: string;
  description: string;
}

export const MAX_OTHER_ITEM_TITLE_LENGTH = 80;

// Vinted's own general-item condition wording — distinct from CONDITION_LABEL
// (the trading-card NM/EX/GD/PL/PO grading labels), which would read
// strangely on a hoodie or a robot vacuum. Same underlying 1-5 ids either way.
export const OTHER_ITEM_CONDITION_LABEL: Record<number, string> = {
  1: 'Neuf avec étiquette',
  2: 'Neuf sans étiquette',
  3: 'Très bon état',
  4: 'Bon état',
  5: 'Satisfaisant',
};

export function buildOtherItemTitle(item: OtherItemForTemplate): string {
  return (item.name || '').slice(0, MAX_OTHER_ITEM_TITLE_LENGTH);
}

export function buildOtherItemDescription(item: OtherItemForTemplate): string {
  const lines: string[] = [`✨ ${item.name || ''}`];

  const brand = (item.brand_name || '').trim();
  if (brand) lines.push(`📘 Marque : ${brand}`);

  const size = (item.size || '').trim();
  if (size) lines.push(`📏 Taille : ${size}`);

  const conditionLabel = OTHER_ITEM_CONDITION_LABEL[item.vinted_condition_id] ?? 'Très bon état';
  lines.push(`✅ État : ${conditionLabel}.`);

  const description = (item.description || '').trim();
  if (description) {
    lines.push('');
    lines.push(description);
  }

  lines.push('');
  lines.push('🚀 Expédition rapide sous 1 à 2 jours ouvrés 📦');
  lines.push('🤝 Remise en main propre possible sur Paris / 92 / 95');
  lines.push("📸 Besoin de photos supplémentaires ? N'hésitez pas à me demander !");

  return lines.join('\n');
}

export function buildOtherItemAnnonce(item: OtherItemForTemplate): OtherItemAnnonce {
  return { title: buildOtherItemTitle(item), description: buildOtherItemDescription(item) };
}
