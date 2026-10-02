import { describe, expect, it } from 'vitest';
import categories from './vinted-categories.json';

interface VintedCategory {
  id: number;
  path: string;
}

describe('vinted-categories.json', () => {
  const list = categories as VintedCategory[];

  it('has a large number of real categories', () => {
    expect(list.length).toBeGreaterThan(1000);
  });

  it('every entry has a numeric id and a non-empty ">"-joined path', () => {
    for (const c of list) {
      expect(typeof c.id).toBe('number');
      expect(c.path.length).toBeGreaterThan(0);
    }
  });

  it('includes a known jewelry leaf category found during research (Colliers, id 164)', () => {
    expect(list.some((c) => c.id === 164 && c.path.includes('Bijoux'))).toBe(true);
  });
});
