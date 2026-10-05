import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONDITION_IDS,
  VINTED_COLORS,
  conditionIdsFor,
  findSizeOption,
  missingAttributes,
  parseColorIds,
  type CatalogAttributes,
} from './other-item-attributes';

const PUFFER: CatalogAttributes = {
  catalog_id: 2614,
  status: 'ready',
  size_options: [
    { title: 'S/M/L', options: [{ id: 1739, title: 'M' }, { id: 1740, title: 'L' }] },
    { title: 'EU', options: [{ id: 1944, title: 'EU 38' }] },
  ],
  size_required: true,
  condition_options: [
    { id: 6, title: 'Neuf avec étiquette' },
    { id: 2, title: 'Très bon état' },
  ],
  has_color: true,
  error: null,
};

const PERFUME: CatalogAttributes = {
  catalog_id: 145,
  status: 'ready',
  size_options: null,
  size_required: false,
  condition_options: [{ id: 6, title: 'Neuf avec étiquette' }],
  has_color: false,
  error: null,
};

describe('VINTED_COLORS', () => {
  it("holds Vinted's 29 colors with their hex swatch", () => {
    expect(VINTED_COLORS).toHaveLength(29);
    expect(VINTED_COLORS[0]).toEqual({ id: 1, title: 'Noir', hex: '000000', code: 'BLACK' });
  });
});

describe('parseColorIds', () => {
  it('accepts up to two known color ids, as numbers or numeric strings', () => {
    expect(parseColorIds([])).toEqual([]);
    expect(parseColorIds([1, 3])).toEqual([1, 3]);
    expect(parseColorIds(['1', '12'])).toEqual([1, 12]);
  });

  it('rejects more than two colors, duplicates, unknown ids and non-arrays', () => {
    expect(parseColorIds([1, 3, 12])).toBeNull();
    expect(parseColorIds([1, 1])).toBeNull();
    expect(parseColorIds([99])).toBeNull();
    expect(parseColorIds(['noir'])).toBeNull();
    expect(parseColorIds('1')).toBeNull();
    expect(parseColorIds(null)).toBeNull();
  });
});

describe('findSizeOption', () => {
  it('finds a size option across groups', () => {
    expect(findSizeOption(PUFFER, 1944)).toEqual({ id: 1944, title: 'EU 38' });
  });

  it('returns null for an unknown id, a null id or a category without sizes', () => {
    expect(findSizeOption(PUFFER, 209)).toBeNull();
    expect(findSizeOption(PUFFER, null)).toBeNull();
    expect(findSizeOption(PERFUME, 1740)).toBeNull();
  });
});

describe('conditionIdsFor', () => {
  it("lists the category's own accepted conditions once known", () => {
    expect(conditionIdsFor(PERFUME)).toEqual([6]);
  });

  it("falls back to Vinted's general-item conditions while the category is unknown", () => {
    expect(conditionIdsFor(null)).toEqual(DEFAULT_CONDITION_IDS);
    expect(DEFAULT_CONDITION_IDS).toEqual([6, 1, 2, 3, 4]);
  });
});

describe('missingAttributes', () => {
  const complete = { sizeId: 1740, colorIds: [1], conditionId: 2 };

  it('reports nothing for a complete item', () => {
    expect(missingAttributes(PUFFER, complete)).toEqual([]);
  });

  it('reports nothing while the category is unknown — the bot checks again before posting', () => {
    expect(missingAttributes(null, { sizeId: null, colorIds: [], conditionId: 2 })).toEqual([]);
  });

  it('reports a missing or foreign size, a missing color and a refused condition', () => {
    expect(missingAttributes(PUFFER, { ...complete, sizeId: null })).toEqual(['size']);
    expect(missingAttributes(PUFFER, { ...complete, sizeId: 209 })).toEqual(['size']);
    expect(missingAttributes(PUFFER, { ...complete, colorIds: [] })).toEqual(['color']);
    expect(missingAttributes(PUFFER, { ...complete, conditionId: 4 })).toEqual(['condition']);
  });

  it('asks for neither size nor color where the category has neither', () => {
    expect(missingAttributes(PERFUME, { sizeId: null, colorIds: [], conditionId: 6 })).toEqual([]);
  });
});
