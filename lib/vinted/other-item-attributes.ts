// lib/vinted/other-item-attributes.ts
import colors from '@/lib/data/vinted-colors.json';

/** One of Vinted's global listing colors (GET /api/v2/item_upload/colors). */
export interface VintedColor {
  id: number;
  title: string;
  hex: string;
  code: string;
}

export const VINTED_COLORS: VintedColor[] = colors;
export const MAX_COLORS = 2;
const KNOWN_COLOR_IDS = new Set(VINTED_COLORS.map((c) => c.id));

export interface SizeOption {
  id: number;
  title: string;
}

export interface SizeGroup {
  /** Vinted's group label ("S/M/L", "EU", "Tailles hommes"…); null for ungrouped options. */
  title: string | null;
  options: SizeOption[];
}

export interface ConditionOption {
  id: number;
  title: string;
}

/** A vinted_catalog_attributes row — a category's listing attributes, filled
 *  by the bot (supabase/migrations/20261005120200_vinted_catalog_attributes.sql). */
export interface CatalogAttributes {
  catalog_id: number;
  status: 'pending' | 'ready' | 'error';
  /** null when the category has no size at all. */
  size_options: SizeGroup[] | null;
  size_required: boolean;
  condition_options: ConditionOption[];
  has_color: boolean;
  error: string | null;
}

/** Vinted's general-item condition ids (6 neuf avec étiquette, 1 neuf sans
 *  étiquette, 2 très bon état, 3 bon état, 4 satisfaisant) — offered until the
 *  category's own list is known. They don't follow the label order. */
export const DEFAULT_CONDITION_IDS: readonly number[] = [6, 1, 2, 3, 4];
/** "Très bon état". */
export const DEFAULT_CONDITION_ID = 2;

/** Up to MAX_COLORS distinct known color ids (numbers or numeric strings, as
 *  they arrive from JSON or FormData), or null when the input is invalid. */
export function parseColorIds(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_COLORS) return null;
  const ids = raw.map((v) => (typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v));
  if (!ids.every((id): id is number => typeof id === 'number' && KNOWN_COLOR_IDS.has(id))) return null;
  if (new Set(ids).size !== ids.length) return null;
  return ids;
}

export function findSizeOption(attributes: CatalogAttributes | null, sizeId: number | null): SizeOption | null {
  if (!attributes?.size_options || sizeId === null) return null;
  for (const group of attributes.size_options) {
    const option = group.options.find((o) => o.id === sizeId);
    if (option) return option;
  }
  return null;
}

export function conditionIdsFor(attributes: CatalogAttributes | null): readonly number[] {
  return attributes ? attributes.condition_options.map((c) => c.id) : DEFAULT_CONDITION_IDS;
}

export type MissingAttribute = 'size' | 'color' | 'condition';

/** What the category asks for that the item lacks — the same checks the bot
 *  runs before posting (vinted-agent/catalog_attributes.py,
 *  listing_attribute_problems). Nothing while the category is unknown: the bot
 *  checks again against live attributes anyway. */
export function missingAttributes(
  attributes: CatalogAttributes | null,
  values: { sizeId: number | null; colorIds: number[]; conditionId: number },
): MissingAttribute[] {
  if (!attributes) return [];
  const missing: MissingAttribute[] = [];
  if (attributes.size_options) {
    const sizeKnown = findSizeOption(attributes, values.sizeId) !== null;
    if (values.sizeId === null ? attributes.size_required : !sizeKnown) missing.push('size');
  }
  if (attributes.has_color && values.colorIds.length === 0) missing.push('color');
  const conditions = conditionIdsFor(attributes);
  if (conditions.length > 0 && !conditions.includes(values.conditionId)) missing.push('condition');
  return missing;
}

function normalizeSizeLabel(label: string): string {
  return label.toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

/** The size option an item should use. Vinted renumbers a category's sizes
 *  from time to time (men's parkas went from L = 209 to L = 2437 on
 *  2026-10-05), so a stored id can go stale: kept while still offered,
 *  otherwise the stored label is found again — exact title, or for a bare
 *  number a single prefixed title ("52" → "EU 52"). Mirrors
 *  vinted-agent/catalog_attributes.py resolve_size_id. */
export function resolveSizeOption(
  attributes: CatalogAttributes | null,
  sizeId: number | null,
  sizeLabel: string | null | undefined,
): SizeOption | null {
  const options = attributes?.size_options?.flatMap((g) => g.options) ?? [];
  if (options.length === 0) return null;
  const current = sizeId === null ? undefined : options.find((o) => o.id === sizeId);
  if (current) return current;

  const label = normalizeSizeLabel(sizeLabel ?? '');
  if (!label) return null;
  const exact = options.filter((o) => normalizeSizeLabel(o.title) === label);
  if (exact.length === 1) return exact[0];
  if (exact.length === 0 && /^\d+$/.test(label.replace(/[.,]/g, ''))) {
    const suffixed = options.filter((o) => normalizeSizeLabel(o.title).split(' ').pop() === label);
    if (suffixed.length === 1) return suffixed[0];
  }
  return null;
}
