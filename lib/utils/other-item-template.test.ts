import { describe, expect, it } from 'vitest';
import {
  buildOtherItemTitle,
  buildOtherItemDescription,
  buildOtherItemAnnonce,
  MAX_OTHER_ITEM_TITLE_LENGTH,
  type OtherItemForTemplate,
} from './other-item-template';

const BASE: OtherItemForTemplate = {
  name: 'Doudoune Uniqlo Longue Matelassé - Noir Taille L',
  description: 'Portée un hiver, très bon état.',
  brand_name: 'Uniqlo',
  size: 'L',
  vinted_condition_id: 3,
};

describe('buildOtherItemTitle', () => {
  it('returns the name verbatim when under the limit', () => {
    expect(buildOtherItemTitle(BASE)).toBe(BASE.name);
  });

  it('truncates to 80 characters', () => {
    const long = { ...BASE, name: 'x'.repeat(120) };
    expect(buildOtherItemTitle(long)).toHaveLength(MAX_OTHER_ITEM_TITLE_LENGTH);
  });

  it('treats a missing name as empty', () => {
    expect(buildOtherItemTitle({ ...BASE, name: '' })).toBe('');
  });
});

describe('buildOtherItemDescription', () => {
  it('includes brand, size, condition and the free-text description', () => {
    const desc = buildOtherItemDescription(BASE);
    expect(desc).toContain('📘 Marque : Uniqlo');
    expect(desc).toContain('📏 Taille : L');
    expect(desc).toContain('✅ État : Très bon état.');
    expect(desc).toContain('Portée un hiver, très bon état.');
  });

  it('omits the brand/size lines when absent', () => {
    const desc = buildOtherItemDescription({ ...BASE, brand_name: null, size: null });
    expect(desc).not.toContain('📘 Marque');
    expect(desc).not.toContain('📏 Taille');
  });

  it('falls back to "Très bon état" for an unknown condition id', () => {
    const desc = buildOtherItemDescription({ ...BASE, vinted_condition_id: 99 });
    expect(desc).toContain('✅ État : Très bon état.');
  });

  it('never includes the Vinted Go banner', () => {
    const desc = buildOtherItemDescription(BASE);
    expect(desc).not.toContain('VINTED GO');
  });
});

describe('buildOtherItemAnnonce', () => {
  it('combines title and description', () => {
    const annonce = buildOtherItemAnnonce(BASE);
    expect(annonce.title).toBe(BASE.name);
    expect(annonce.description).toContain('✨ Doudoune Uniqlo');
  });
});
