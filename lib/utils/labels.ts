// lib/utils/labels.ts
//
// Single source of truth for the per-row visual labels (variant, rarity).
// Previously copy-pasted in 9+ components — the divergence was already
// starting (PokedexDrawer omitted the OTHER fallback). Centralized here so
// adding a new variant ('stamp') or tweaking a rarity color is a one-file
// change.
//
// vinted-template.ts intentionally keeps its own VARIANT_LABEL because it
// also uses LANGUAGE_FEMALE / CONDITION_LABEL nearby; consolidating those
// here would require pulling in template-only constants. Keep the duplicate
// there — it's already test-covered.

/** Human-readable French label for a card variant. Add new variants here. */
export const VARIANT_LABEL: Record<string, string> = {
  pokeball: 'Poké Ball',
  masterball: 'Master Ball',
  reverse_holo: 'Reverse Holo',
  stamp: 'Stamp',
  promo: 'Promo',
};

/** Helper: variant code → display label, falling back to the raw code. */
export function variantLabel(variant: string | null | undefined): string | null {
  if (!variant) return null;
  return VARIANT_LABEL[variant] ?? variant;
}

/** Tailwind text-color class per rarity tier. Matches @theme tokens in globals.css. */
export const RARITY_COLOR: Record<string, string> = {
  SAR: 'text-rarity-sar',
  AR: 'text-rarity-ar',
  SR: 'text-rarity-sr',
  CHR: 'text-rarity-chr',
  RR: 'text-rarity-rr',
  R_HOLO: 'text-rarity-r-holo',
  R: 'text-rarity-r',
  UC: 'text-rarity-uc',
  C: 'text-rarity-c',
  OTHER: 'text-text-muted',
};
